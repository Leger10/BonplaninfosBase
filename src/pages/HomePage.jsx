import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import {
  Plus,
  ArrowRight,
  Loader2,
  Coins,
  Info,
  Zap,
  AlertTriangle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";

import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { supabase } from "@/lib/customSupabaseClient";
import { dbService } from "@/services/dbService";
import { toast } from "@/components/ui/use-toast";

import WalletInfoModal from "@/components/WalletInfoModal";
import { CoinService } from "@/services/CoinService";
import WelcomePopup from "@/components/WelcomePopup";
import AnimatedBadgesBanner from "@/components/AnimatedBadgesBanner";
import EventTypeFilters from "@/components/homepage/EventTypeFilters";
import EventCard from "@/components/EventCard";
import NearbyEvents from "@/components/NearbyEvents";

import PWAImageCarousel from "@/components/PWAImageCarousel";
import VideoPlayerModal from "@/components/VideoPlayerModal";

const pwaCarouselImages = [
  "/pwa-preview1.png",
  "/pwa-preview2.png",
  "/pwa-preview3.png",
  "/pwa-preview4.png",
  "/pwa-preview6.png",
  "/pwa-preview.png",
  "/pwa-preview7.png",
];

const HomePage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userProfile, adminConfig, forceRefreshUserProfile, hasFetchError } = useData();
  const { user } = useAuth();

  const [promotedEvents, setPromotedEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlockedEvents, setUnlockedEvents] = useState(new Set());
  const [showWalletInfoModal, setShowWalletInfoModal] = useState(false);
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    event: null,
    cost: 0,
    costFcfa: 0,
    onConfirm: null,
  });

  // --- Vidéo active ---
  const [activeVideo, setActiveVideo] = useState(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false);

  const fetchActiveVideo = useCallback(async () => {
    const { data, error } = await supabase
      .from("mandatory_videos")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();
    if (error) {
      console.error("Error fetching active video:", error);
    } else {
      console.log("Active video fetched:", data);
      setActiveVideo(data);
    }
  }, []);

  useEffect(() => {
    fetchActiveVideo();
    // On ne réinitialise pas videoWatched ici, il est géré par le modal
  }, [fetchActiveVideo]);

  // --- Fetch des events ---
  const fetchInitialData = useCallback(async () => {
    console.log('[PWA] HomePage loading events data...');
    if (hasFetchError) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let eventsRes = null;
      try {
        eventsRes = await dbService.getPromotedEvents(8);
      } catch (dbErr) {
        console.warn("dbService indisponible, fallback Supabase:", dbErr.message);
      }

      if (eventsRes === null || eventsRes.length === 0) {
        const now = new Date().toISOString();
        let { data, error } = await supabase
          .from("events")
          .select(
            "*, organizer:organizer_id(full_name), category:category_id(name, slug)"
          )
          .in("status", ["active", "protected"])
          .eq("is_promoted", true)
          .or(`promoted_until.gt.${now},promotion_end.gt.${now}`)
          .order("created_at", { ascending: false })
          .limit(8);
        if (error) throw error;
        eventsRes = data || [];
      }

      const formattedEvents = (eventsRes || []).map((e) => ({
        ...e,
        category_name: e.category?.name,
        category_slug: e.category?.slug,
        organizer_name: e.organizer?.full_name,
      }));

      setPromotedEvents(formattedEvents || []);

      if (user) {
        let unlockedIds = null;
        try {
          unlockedIds = await dbService.getUnlockedEventIds(user.id);
        } catch (dbErr) {
          console.warn("dbService indisponible, fallback Supabase:", dbErr.message);
        }

        if (unlockedIds) {
          setUnlockedEvents(new Set(unlockedIds));
        } else {
          const { data, error } = await supabase
            .from("protected_event_access")
            .select("event_id")
            .eq("user_id", user.id)
            .eq("status", "active");

          if (!error) setUnlockedEvents(new Set(data.map((item) => item.event_id)));
        }
      }
    } catch (error) {
      console.error("Error fetching homepage data:", error);
      toast({
        title: t("common.error_title"),
        description: t("home_page.loading_error.description"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [hasFetchError, user, t]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Unlock event ---
  const executeUnlock = async (event) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    const cost = 2;
    await CoinService.handleAction({
      userId: user.id,
      requiredCoins: cost,
      onSuccess: async () => {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            "access_protected_event",
            { p_event_id: event.id, p_user_id: user.id },
            { method: "POST" }
          );
          if (rpcError) throw rpcError;
          if (!rpcData.success) throw new Error(rpcData.message);

          setUnlockedEvents((prev) => new Set(prev).add(event.id));
          await forceRefreshUserProfile?.();
          toast({
            title: t("events_page.unlock_modal.success_title"),
            description: t("events_page.unlock_modal.success_desc", {
              title: event.title,
            }),
          });
          navigate(`/event/${event.id}`);
        } catch (error) {
          toast({
            title: t("common.error_title"),
            description: error.message,
            variant: "destructive",
          });
        }
      },
      onInsufficientBalance: () => setShowWalletInfoModal(true),
    });
  };

  const handleEventClick = async (event) => {
    if (!user) {
      navigate("/auth");
      return;
    }
    const isAdmin =
      userProfile &&
      ["super_admin", "admin", "secretary"].includes(userProfile.user_type);
    const isUnlocked =
      unlockedEvents.has(event.id) ||
      event.organizer_id === user.id ||
      isAdmin;

    if (event.event_type === "protected" && !isUnlocked) {
      const cost = 2;
      const costFcfa = cost * (adminConfig?.coin_to_fcfa_rate || 10);
      setConfirmation({
        isOpen: true,
        event,
        cost,
        costFcfa,
        onConfirm: () => executeUnlock(event),
      });
    } else {
      navigate(`/event/${event.id}`);
    }
  };

  const handleWalletModalProceed = () => {
    setShowWalletInfoModal(false);
    navigate("/wallet");
  };

  const handleRetry = () => window.location.reload();

  const canCreateEvent =
    userProfile &&
    ["organizer", "admin", "super_admin"].includes(userProfile.user_type);

  // Gestion du clic sur la vidéo
  const handleVideoClick = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setVideoModalOpen(true);
  };

  const handleVideoWatched = () => {
    setVideoWatched(true);
    // Optionnel : stocker en localStorage si on veut éviter de réafficher la carte après visionnage
    localStorage.setItem("video_watched", "true");
    forceRefreshUserProfile();
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{t("nav.home")} - BonPlanInfos</title>
        <meta name="description" content="Découvrez les meilleurs événements, achetez vos billets et participez aux concours en Afrique." />
      </Helmet>

      {!hasFetchError && <WelcomePopup />}
      {!hasFetchError && <AnimatedBadgesBanner />}

      <div className="max-w-4xl mx-auto my-8 px-4">
         <PWAImageCarousel images={pwaCarouselImages} height={300} speed={4000} />
      </div>

      <main className="container mx-auto px-4 pt-4 pb-28 space-y-12">
        <EventTypeFilters />
        <NearbyEvents />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="my-12"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
            <h2 className="text-3xl font-bold text-foreground flex items-center gap-3 border-b-2 border-primary pb-1">
              <Zap className="text-primary" />
              {t("home_page.sponsored_events")}
            </h2>
            {canCreateEvent && (
              <Button onClick={() => navigate("/boost")} variant="premium">
                <Plus className="w-4 h-4 mr-2" />
                {t("home_page.boost_event")}
              </Button>
            )}
          </div>

          {hasFetchError ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-destructive mb-2">
                {t("home_page.loading_error.title")}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-4">
                {t("home_page.loading_error.description")}
              </p>
              <Button onClick={handleRetry}>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.retry")}
              </Button>
            </div>
          ) : loading ? (
            <div className="text-center text-muted-foreground mt-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              {t("common.loading")}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {promotedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  isUnlocked={
                    unlockedEvents.has(event.id) ||
                    (user && event.organizer_id === user.id) ||
                    (userProfile &&
                      ["super_admin", "admin", "secretary"].includes(
                        userProfile.user_type
                      ))
                  }
                  onClick={() => handleEventClick(event)}
                  className="transition-transform hover:scale-105 hover:shadow-xl"
                />
              ))}

              {/* Carte Vidéo active (si non regardée) */}
              {activeVideo && !videoWatched && (
                <div
                  className="relative group bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden cursor-pointer hover:scale-105 hover:shadow-blue-500/20"
                  onClick={handleVideoClick}
                >
                  <div className="absolute top-4 left-4 z-10">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-500 text-black shadow-lg">
                      🎬 Vidéo récompense
                    </span>
                  </div>
                  <div className="p-6 text-center flex flex-col items-center">
                    <div className="w-20 h-20 mx-auto bg-black/30 rounded-full flex items-center justify-center mb-4">
                      <Play className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{activeVideo.title}</h3>
                    <p className="text-white/80 text-sm line-clamp-2 mb-4">{activeVideo.description}</p>
                    <div className="inline-flex items-center bg-white/20 backdrop-blur-sm rounded-full px-4 py-1 text-white text-sm font-bold">
                      <Coins className="w-4 h-4 mr-1" />
                      +{activeVideo.reward_coins} pièces
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>

        <div className="mt-12 text-center">
          <Button variant="outline" onClick={() => navigate("/events")}>
            {t("home_page.view_all_events")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </main>

      <WalletInfoModal
        isOpen={showWalletInfoModal}
        onClose={() => setShowWalletInfoModal(false)}
        onProceed={handleWalletModalProceed}
      />

      <AlertDialog
        open={confirmation.isOpen}
        onOpenChange={(isOpen) =>
          !isOpen &&
          setConfirmation({
            isOpen: false,
            event: null,
            cost: 0,
            costFcfa: 0,
            onConfirm: null,
          })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("events_page.unlock_modal.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col items-center justify-center text-center p-4">
                <Coins className="w-12 h-12 text-primary mb-4" />
                <p className="text-lg">
                  {t("events_page.unlock_modal.description", {
                    title: confirmation.event?.title,
                    cost: confirmation.cost,
                    costFcfa: confirmation.costFcfa?.toLocaleString("fr-FR"),
                  })}
                </p>
                <div className="mt-4 text-xs text-muted-foreground p-2 bg-muted rounded flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{t("events_page.unlock_modal.info")}</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmation.onConfirm}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {activeVideo && (
        <VideoPlayerModal
          isOpen={videoModalOpen}
          onClose={() => setVideoModalOpen(false)}
          video={activeVideo}
          onWatched={handleVideoWatched}
        />
      )}
    </div>
  );
};

export default HomePage;