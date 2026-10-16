import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import {
  Bell,
  Calendar,
  Tag,
  Settings,
  Coins,
  CheckCircle,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { supabase } from "@/lib/customSupabaseClient";
import { toast } from "@/components/ui/use-toast";

const NotificationIcon = ({ type }) => {
  const icons = {
    new_event: <Calendar className="w-5 h-5 text-blue-400" />,
    promotion: <Tag className="w-5 h-5 text-purple-400" />,
    system: <Settings className="w-5 h-5 text-gray-400" />,
    earning: <Coins className="w-5 h-5 text-yellow-400" />,
    success: <CheckCircle className="w-5 h-5 text-green-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-cyan-400" />,
  };
  const icon = icons[type] || <Bell className="w-5 h-5 text-gray-400" />;
  const colors = {
    new_event: "bg-blue-500/20",
    promotion: "bg-purple-500/20",
    system: "bg-gray-500/20",
    earning: "bg-yellow-500/20",
    success: "bg-green-500/20",
    error: "bg-red-500/20",
    info: "bg-cyan-500/20",
  };
  const bgColor = colors[type] || "bg-gray-500/20";

  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${bgColor}`}
    >
      {icon}
    </div>
  );
};

const NotificationsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) navigate("/auth");
    else {
      const fetchNotifications = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          toast({
            title: t("notifications_page.update_error"),
            description: "Impossible de charger les notifications.",
            variant: "destructive",
          });
        } else {
          setNotifications(data);
        }
        setLoading(false);
      };
      fetchNotifications();
    }
  }, [user, navigate, t]);

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;

      setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
      toast({
        title: t("notifications_page.update_success"),
        description: t("notifications_page.update_success_desc"),
        duration: 5000,
      });
    } catch (error) {
      toast({
        title: t("notifications_page.update_error"),
        description: "Impossible de marquer les notifications comme lues.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notification.id);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true } : n,
          ),
        );
      }
    }

    if (notification.data?.event_id) {
      navigate(`/event/${notification.data.event_id}`);
    } else if (notification.data?.link) {
      navigate(notification.data.link);
    }
  };

  if (!user) return null;

  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const unreadCount = unreadNotifications.length;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{t("notifications_page.title")} - BonPlaninfos</title>
        <meta
          name="description"
          content="Consultez vos dernières notifications et restez informé."
        />
      </Helmet>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-foreground flex items-center">
              <Bell className="w-8 h-8 mr-3 text-primary" />
              {t("notifications_page.title")}
            </h1>
            <Button
              variant="outline"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              title={unreadCount === 0 ? t("common.limits.markAllReadDisabled") : undefined}
            >
              {t("notifications_page.mark_all_read")}
            </Button>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted">
              <TabsTrigger value="all">
                {t("notifications_page.tabs.all")}
              </TabsTrigger>
              <TabsTrigger value="unread" className="relative">
                {t("notifications_page.tabs.unread")}
                {unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 justify-center p-0 gradient-red text-white text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6 space-y-4">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 flex items-start rounded-lg transition-all cursor-pointer hover:bg-muted/80 ${!notif.is_read ? "bg-primary/5 border-l-4 border-primary" : "bg-muted/50"}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <NotificationIcon type={notif.type} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">
                      {notif.title}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {notif.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notif.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="text-center py-16">
                  <Bell className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {t("notifications_page.no_notifications")}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="unread" className="mt-6 space-y-4">
              {unreadNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-4 flex items-start rounded-lg bg-primary/5 border-l-4 border-primary cursor-pointer hover:bg-muted/80"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <NotificationIcon type={notif.type} />
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">
                      {notif.title}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {notif.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notif.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
              {unreadCount === 0 && (
                <div className="text-center py-16">
                  <Bell className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {t("notifications_page.no_unread_notifications")}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
};

export default NotificationsPage;
