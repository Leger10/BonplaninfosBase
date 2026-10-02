import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useData } from "@/contexts/DataContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, BarChart2, Video, Loader2, Briefcase, Wallet, Megaphone, Calendar, Target, Image as ImageIcon, CreditCard, ShieldCheck, Clock, RefreshCw as RefreshCwIcon, UserCheck, History, BookOpen, DollarSign, MapPin, AreaChart, RotateCcw, AlertTriangle, Database, CheckCircle2, BookmarkMinus, AlertCircle, Smartphone } from 'lucide-react';
import UserManagement from "@/components/admin/UserManagement";
import ConfigTab from "@/components/admin/ConfigTab";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import VideoManager from "@/components/admin/VideoManagementTab";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { supabase } from "@/lib/customSupabaseClient";
import { toast } from "@/components/ui/use-toast";
import PartnersManagement from "@/components/admin/PartnersManagement";
import WithdrawalManagement from "@/components/admin/WithdrawalManagement";
import AnnouncementsManagement from "@/components/admin/AnnouncementsManagement";
import EventsManagement from "@/components/admin/EventsManagement";
import PromotionsManagement from "@/components/admin/PromotionsManagement";
import WelcomePopupManagement from "@/components/admin/WelcomePopupManagement";
import CreditManagement from "@/components/admin/CreditManagement";
import AdminCreditsTab from "@/components/admin/AdminCreditsTab";
import BadgeManagementPanel from "@/components/admin/BadgeManagementPanel";
import SecretaryManagementTab from "@/components/admin/SecretaryManagementTab";
import TransactionsTable from "@/components/admin/TransactionsTable";
import ActivityLogTab from "@/components/admin/ActivityLogTab";
import AdminPaymentsTab from "@/components/admin/AdminPaymentsTab";
import LocationManagementTab from "@/components/admin/LocationManagementTab";
import ZoneResetManager from "@/components/admin/ZoneResetManager";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CreditStatsTab from "@/components/admin/CreditStatsTab";
import ReversedCreditsTab from "@/components/admin/ReversedCreditsTab";
import WithdrawalHistoryTab from "@/components/admin/WithdrawalHistoryTab";
import AdminSalaryDashboard from "@/components/admin/AdminSalaryDashboard";
import SalaryWithdrawalManagement from "@/components/admin/SalaryWithdrawalManagement";
import WithdrawalManagementDashboard from "@/components/admin/withdrawals/WithdrawalManagementDashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";
import { retrySupabaseRequest } from "@/lib/supabaseHelper";
import AdminCreditsGlobalTab from "@/components/admin/AdminCreditsGlobalTab";
import USSDPaymentsTab from "@/components/admin/USSDPaymentsTab";

// Composant AdminStats
const AdminStats = ({ userProfile, partnerZone }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    credited: 0,
    purchased: 0,
    activeUsers: 0,
    monthlyRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const country = partnerZone?.country || userProfile?.country;
    const city = partnerZone?.cities?.length === 1 ? partnerZone.cities[0] : null;
    if (!country) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      let query = supabase
        .from("transactions")
        .select(`
          amount_pi,
          amount_fcfa,
          user:user_id!inner(country, city)
        `)
        .eq("transaction_type", "platform_fee")
        .gte("created_at", firstDayOfMonth.toISOString())
        .lte("created_at", lastDayOfMonth.toISOString())
        .eq("user.country", country);
      if (city) query = query.eq("user.city", city);

      const { data: feesData, error: feesError } = await retrySupabaseRequest(() => query);
      if (feesError) throw feesError;

      const totalRevenueFcfa = feesData.reduce((sum, item) => sum + Math.abs(item.amount_fcfa || 0), 0);
      const totalCommissionPi = feesData.reduce((sum, item) => sum + Math.abs(item.amount_pi || 0), 0);

      let usersQuery = supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("country", country)
        .eq("is_active", true);
      if (city) usersQuery = usersQuery.eq("city", city);
      const { count: activeUsers, error: usersError } = await retrySupabaseRequest(() => usersQuery);
      if (usersError) throw usersError;

      setStats({
        credited: totalCommissionPi,
        purchased: 0,
        activeUsers: activeUsers || 0,
        monthlyRevenue: totalRevenueFcfa,
      });
    } catch (error) {
      console.error("Failed to fetch admin stats:", error);
    } finally {
      setLoading(false);
    }
  }, [partnerZone, userProfile, t]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="glass-effect shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chargement...</CardTitle>
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const zoneCountry = partnerZone?.country || userProfile?.country;
  const zoneCity = partnerZone?.cities?.length === 1 ? partnerZone.cities[0] : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className="glass-effect shadow-lg border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("admin_dashboard.stats.revenue_title")}</CardTitle>
          <DollarSign className="h-5 w-5 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.monthlyRevenue.toLocaleString("fr-FR")} FCFA
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="block">Chiffres affaires de la Plateforme </span>
            <span className="block">Total π: {stats.credited.toLocaleString("fr-FR")} π</span>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Utilisateurs actifs</CardTitle>
          <Users className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeUsers.toLocaleString("fr-FR")}</div>
          <p className="text-xs text-muted-foreground">dans votre zone</p>
        </CardContent>
      </Card>

      <Card className="glass-effect shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Zone</CardTitle>
          <MapPin className="h-5 w-5 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold">
            {zoneCountry}
            {zoneCity && `, ${zoneCity}`}
          </div>
          <p className="text-xs text-muted-foreground">
            {zoneCity ? "Ville spécifique" : "Tout le pays"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const LicenseStatus = ({ user }) => {
  const { t } = useTranslation();
  const [partner, setPartner] = useState(null);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, totalSeconds: 0 });
  const [loading, setLoading] = useState(true);
  const [renewalLoading, setRenewalLoading] = useState(false);

  const fetchPartnerData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await retrySupabaseRequest(() => supabase.from("partners").select("*, license:license_id(*)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle());
    if (error) { toast({ title: t("admin_dashboard.license.partner_error_title"), variant: "destructive", description: error.message }); } else { setPartner(data); }
    setLoading(false);
  }, [user?.id, t]);

  useEffect(() => { fetchPartnerData(); }, [fetchPartnerData]);

  useEffect(() => {
    if (!partner?.expiration_date) return;
    const calculateTimeLeft = () => {
      const expirationDate = new Date(partner.expiration_date);
      const now = new Date();
      const diff = expirationDate.getTime() - now.getTime();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, totalSeconds: 0 }); return; }
      const totalSeconds = Math.floor(diff / 1000);
      setTimeLeft({ days: Math.floor(totalSeconds / (3600 * 24)), hours: Math.floor((totalSeconds % (3600 * 24)) / 3600), minutes: Math.floor((totalSeconds % 3600) / 60), seconds: Math.floor(totalSeconds % 60), expired: false, totalSeconds });
    };
    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [partner?.expiration_date]);

  const handleRenewalRequest = async () => {
    if (!partner) return;
    setRenewalLoading(true);
    try {
      const { error } = await retrySupabaseRequest(() => supabase.from("licence_renewal_requests").insert({ admin_id: user.id, licence_id: partner.license_id, status: "pending", request_date: new Date().toISOString() }));
      if (error) throw error;
      toast({ title: t("admin_dashboard.license.renewal_sent_title"), description: t("admin_dashboard.license.renewal_sent_desc") });
    } catch (error) { toast({ title: t("common.error_title"), description: t("admin_dashboard.license.renewal_error_desc") + error.message, variant: "destructive" }); } finally { setRenewalLoading(false); }
  };

  if (loading) return (<div className="p-4 mb-6 rounded-lg bg-background/50 flex justify-center items-center"><Loader2 className="animate-spin" /></div>);
  if (!partner) return null;

  const activationDate = new Date(partner.activation_date);
  const expirationDate = new Date(partner.expiration_date);
  const { days, hours, minutes, seconds, expired, totalSeconds } = timeLeft;
  const today = new Date();
  const expirationDateObj = new Date(partner.expiration_date);
  const daysRemaining = Math.ceil((expirationDateObj - today) / (1000 * 60 * 60 * 24));
  let statusColor = "";
  let statusText = "";

  if (expired) { statusColor = "bg-red-500/20 text-red-800 dark:bg-red-900/50 dark:text-red-300"; statusText = t("admin_dashboard.license.status_expired"); } 
  else if (days > 30) { statusColor = "bg-green-500/20 text-green-800 dark:bg-green-900/50 dark:text-green-300"; statusText = t("admin_dashboard.license.status_active"); } 
  else if (days > 7) { statusColor = "bg-yellow-500/20 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"; statusText = t("Licence"); } 
  else { statusColor = "bg-orange-500/20 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300"; statusText = t("admin_dashboard.license.status_critical"); }

  const formatTimeUnit = (value, unit) => (<div className="flex flex-col items-center"><span className="text-2xl font-bold">{value.toString().padStart(2, "0")}</span><span className="text-xs">{unit}</span></div>);

  return (
    <div className={`p-4 mb-6 rounded-lg border ${statusColor} transition-colors duration-300`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">{t("admin_dashboard.license.status_title")}:<span className={`ml-2 px-2 py-1 rounded-md ${daysRemaining > 30 ? "bg-green-500 text-white" : daysRemaining > 7 ? "bg-yellow-500 text-white" : daysRemaining > 0 ? "bg-orange-500 text-white" : "bg-red-500 text-white"}`}>{partner.license.name} - {statusText}</span></p>
            <div className="text-xs mt-2 space-y-1 text-gray-300">
              <p>{t("admin_dashboard.license.activated_on")}: {activationDate.toLocaleDateString("fr-FR")}</p>
               {/* <p>{t("admin_dashboard.license.expires_on")}: {expirationDate.toLocaleDateString("fr-FR")}</p> */}
              {partner.license.commission_rate && (<p>Taux de commission: <strong>{partner.license.commission_rate}%</strong></p>)}
            </div>
          </div>
        </div>
        <div className="text-center">
          {expired ? (<div><p className="font-bold text-lg text-red-600">{t("admin_dashboard.license.expired_since", { count: Math.floor(Math.abs(totalSeconds) / (3600 * 24)) })}</p><p className="text-xs mt-2">Licence expirée</p></div>) : (<div><div className="flex items-center justify-center gap-2 mb-2">{formatTimeUnit(days, "Jours")}<span className="text-xl font-bold">:</span>{formatTimeUnit(hours, "Heures")}<span className="text-xl font-bold">:</span>{formatTimeUnit(minutes, "Minutes")}<span className="text-xl font-bold">:</span>{formatTimeUnit(seconds, "Secondes")}</div><p className="text-xs text-muted-foreground">{t("admin_dashboard.license.days_remaining")}</p></div>)}
        </div>
        <AlertDialog>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>{t("admin_dashboard.license.confirm_renewal_title")}</AlertDialogTitle><AlertDialogDescription>{t("admin_dashboard.license.confirm_renewal_desc")}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction onClick={handleRenewalRequest} disabled={renewalLoading}>{renewalLoading ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (t("common.confirm"))}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {!expired && (<div className="mt-4"><div className="flex justify-between text-xs mb-1"><span>Temps restant</span><span>{days} jours</span></div><div className="h-2 bg-white/30 dark:bg-black/30 rounded-full overflow-hidden"><div className={`h-full transition-all duration-1000 ${days > 30 ? "bg-green-500" : days > 7 ? "bg-yellow-500" : "bg-orange-500"}`} style={{ width: `${Math.min(100, (totalSeconds / (90 * 24 * 3600)) * 100)}%` }} /></div></div>)}
    </div>
  );
};

const AdminStatusBanner = ({ status }) => {
  const { t } = useTranslation();
  if (status === "active") return null;
  let message, colorClass;
  switch (status) { case "pending_verification": case "pending": message = t("admin_dashboard.banner.pending"); colorClass = "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"; break; case "suspended": message = t("admin_dashboard.banner.suspended"); colorClass = "bg-orange-500/20 text-orange-300 border-orange-500/30"; break; case "expired": message = t("admin_dashboard.banner.expired"); colorClass = "bg-red-500/20 text-red-300 border-red-500/30"; break; default: return null; }
  return (<div className={`p-4 mb-6 rounded-lg border flex items-center gap-3 ${colorClass}`}><AlertTriangle className="w-6 h-6 flex-shrink-0" /><p className="font-semibold">{message}</p></div>);
};
const AdminDashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { userProfile, loadingProfile, getPromotions, getEvents } = useData();
  const [allUsers, setAllUsers] = useState([]);
  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [allPromotions, setAllPromotions] = useState([]);
  const [allPopups, setAllPopups] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState("analytics");
  const [partnerStatus, setPartnerStatus] = useState("inactive");
  const [impersonatingUser, setImpersonatingUser] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [partnerZone, setPartnerZone] = useState(null);

  const isSuperAdmin = userProfile?.user_type === "super_admin";
  const isAdmin = userProfile?.user_type === "admin";
  const isSecretaryBySuperAdmin = userProfile?.user_type === "secretary" && userProfile?.appointed_by_super_admin;
  const isFunctionalityActive = isSuperAdmin || partnerStatus === "active";


  useEffect(() => {
    const validateSession = async () => { const { data: { session }, error } = await retrySupabaseRequest(() => supabase.auth.getSession()); if (error || !session) { await supabase.auth.signOut(); window.location.href = "/auth"; } };
    validateSession();
  }, []);

  useEffect(() => {
    const checkImpersonation = async () => { const { data: { user: currentUser } } = await retrySupabaseRequest(() => supabase.auth.getUser()); if (currentUser && currentUser.id !== user?.id) { const { data: impersonatedProfile } = await retrySupabaseRequest(() => supabase.from("profiles").select("*").eq("id", currentUser.id).single()); setImpersonatingUser(impersonatedProfile); } else { setImpersonatingUser(null); } };
    checkImpersonation();
  }, [user?.id]);

  const handleStopImpersonating = async () => { setLoadingData(true); const { error } = await retrySupabaseRequest(() => supabase.auth.revert()); if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setLoadingData(false); } else { toast({ title: "Retour à la normale", description: "Vous êtes revenu à votre compte." }); window.location.reload(); } };

  useEffect(() => {
    if (isAdmin && user) {
      const fetchPartnerStatus = async () => { const { data, error } = await retrySupabaseRequest(() => supabase.from("partners").select("status, expiration_date").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).single()); if (error && error.code !== "PGRST116") { console.error("Error fetching partner status:", error); } else if (data) { const now = new Date(); const expiration = new Date(data.expiration_date); if (expiration < now) { setPartnerStatus("expired"); } else { setPartnerStatus(data.status); } } };
      fetchPartnerStatus();
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (isAdmin && user?.id) {
      const fetchPartnerZone = async () => {
        const { data, error } = await retrySupabaseRequest(() =>
          supabase
            .from('partners')
            .select('coverage_zone')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );
        if (!error && data?.coverage_zone) {
          setPartnerZone(data.coverage_zone);
        } else {
          setPartnerZone({ country: userProfile?.country, cities: userProfile?.city ? [userProfile.city] : [] });
        }
      };
      fetchPartnerZone();
    } else {
      setPartnerZone(null);
    }
  }, [isAdmin, user?.id, userProfile?.country, userProfile?.city]);

  // L'onglet par défaut doit exister dans la liste du rôle, sinon la page
  // s'affiche vide : un admin n'a pas d'onglet "analytics".
  useEffect(() => {
    if (isSuperAdmin) setActiveTab("analytics");
    else if (isAdmin) setActiveTab("salary");
    else if (isSecretaryBySuperAdmin) setActiveTab("credits");
  }, [isSuperAdmin, isAdmin, isSecretaryBySuperAdmin]);
 // Fonction de récupération des données (fetchData) CORRIGÉE pour utiliser partnerZone
  const fetchData = useCallback(async () => {
    if (!userProfile || !user) return;
    setLoadingData(true);
    setFetchError(null);
    
    try {
      // Pour un admin, on utilise la zone du partenaire (sinon pour super admin, pas de filtre)
      const country = isAdmin ? (partnerZone?.country || userProfile.country) : null;
      const city = isAdmin && partnerZone?.cities?.length === 1 ? partnerZone.cities[0] : null;

      const fetchUsers = () => {
        let query = supabase.from("profiles").select("*");
        if (country && !isSuperAdmin) {
          query = query.eq("country", country);
          if (city) query = query.eq("city", city);
        }
        return query;
      };
      
      let transactionsQuery;
      if (isSuperAdmin) {
        transactionsQuery = supabase
          .from("transactions")
          .select(`id, amount_pi, amount_fcfa, description, created_at, transaction_type, user:user_id (full_name, email)`)
          .order("created_at", { ascending: false });
      }
      
      const results = await Promise.all([
          retrySupabaseRequest(fetchUsers), 
          retrySupabaseRequest(() => supabase.from("announcements").select("*").order("created_at", { ascending: false })), 
          getEvents(country ? { country: country } : {}), 
          getPromotions(country ? { country: country } : {}), 
          retrySupabaseRequest(() => supabase.from("welcome_popups").select("*").order("created_at", { ascending: false })), 
          transactionsQuery ? retrySupabaseRequest(() => transactionsQuery) : Promise.resolve({ data: [], error: null })
      ]);

      const [usersRes, announcementsRes, eventsData, promotionsData, popupsRes, transactionsRes] = results;

      if (usersRes.error) console.error("Users fetch error:", usersRes.error);
      setAllUsers(usersRes.data || []);
      if (announcementsRes.error) console.error("Announcements fetch error:", announcementsRes.error);
      setAllAnnouncements(announcementsRes.data || []);
      setAllEvents(eventsData || []);
      setAllPromotions(promotionsData || []);
      if (popupsRes.error) console.error("Popups fetch error:", popupsRes.error);
      setAllPopups(popupsRes.data || []);
      if (transactionsRes.error) console.error("Transactions fetch error:", transactionsRes.error);
      if (transactionsRes.data) { 
        setAllTransactions(transactionsRes.data.map((t) => ({ 
          id: t.id, 
          user_full_name: t.user?.full_name, 
          user_email: t.user?.email, 
          description: t.description, 
          amount: t.amount_pi, 
          amount_fcfa: t.amount_fcfa, 
          created_at: t.created_at, 
          status: "completed", 
          type: t.transaction_type 
        }))); 
      }

    } catch (error) { 
      console.error("Critical error fetching admin data:", error); 
      setFetchError(error.message || "Erreur de chargement");
      toast({ title: t("admin_dashboard.loading_error_title"), description: error.message, variant: "destructive" }); 
    } finally { 
      setLoadingData(false); 
    }
  }, [userProfile?.id, userProfile?.updated_at, isAdmin, isSuperAdmin, user?.id, getPromotions, getEvents, t, partnerZone]);

  // Rechargement des données quand partnerZone change (important pour la mise à jour)
  useEffect(() => { if (userProfile) { fetchData(); } }, [fetchData]);

  // Gestion des écrans de chargement et erreurs
  if (loadingProfile || loadingData) { return (<div className="min-h-screen bg-background text-foreground p-4 md:p-8 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>); }
  if (fetchError) {
    return (
      <div className="min-h-screen bg-background text-foreground p-4 md:p-8 flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-2xl font-bold">Erreur de chargement</h1>
        <p className="text-muted-foreground">{fetchError}</p>
        <Button onClick={() => fetchData()} variant="outline">
          <RefreshCwIcon className="w-4 h-4 mr-2" /> Réessayer
        </Button>
      </div>
    );
  }

  if (!user || (!isSuperAdmin && !isAdmin && !isSecretaryBySuperAdmin)) { return (<div className="min-h-screen bg-background text-foreground p-4 md:p-8"><h1 className="text-2xl text-red-500">{t("admin_dashboard.unauthorized_title")}</h1><p className="text-muted-foreground">{t("admin_dashboard.unauthorized_desc")}</p></div>); }

  const dashboardTitle = isSuperAdmin ? t("admin_dashboard.super_admin_title") : isAdmin ? t("admin_dashboard.admin_title", { country: partnerZone?.country || userProfile.country }) : t("admin_dashboard.secretary_title");

  const displayZoneCountry = partnerZone?.country || userProfile?.country;
  const displayZoneCity = partnerZone?.cities?.length === 1 ? partnerZone.cities[0] : userProfile?.city;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 relative">
      {impersonatingUser && (<ImpersonationBanner user={impersonatingUser} onRevert={handleStopImpersonating} />)}
      <header className="mb-8">
        <h1 className="text-3xl font-bold">{dashboardTitle}</h1>
        <p className="text-muted-foreground">{t("admin_dashboard.welcome", { name: userProfile.full_name || user.email })}</p>
        {isAdmin && displayZoneCountry && (<div className="mt-2"><Badge variant="outline" className="text-sm"><MapPin className="w-3 h-3 mr-1" />Zone: {displayZoneCountry}{displayZoneCity && `, ${displayZoneCity}`}</Badge></div>)}
      </header>
      {isAdmin && isFunctionalityActive && displayZoneCountry && (<AdminStats userProfile={userProfile} partnerZone={partnerZone} />)}
      {isAdmin && isFunctionalityActive && <LicenseStatus user={userProfile} />}
      {isAdmin && <AdminStatusBanner status={partnerStatus} />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
          {isSuperAdmin && (
            <>
              <TabsTrigger value="analytics"><BarChart2 className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.analytics")}</TabsTrigger>
              <TabsTrigger value="credit_stats"><AreaChart className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.credit_stats")}</TabsTrigger>
              <TabsTrigger value="withdrawal_mgmt"><CheckCircle2 className="w-4 h-4 mr-2" />Gestion des Retraits</TabsTrigger>
              <TabsTrigger value="activity_log"><BookOpen className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.activity_log")}</TabsTrigger>
              <TabsTrigger value="transactions"><History className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.transactions")}</TabsTrigger>
              <TabsTrigger value="payments"><DollarSign className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.payments")}</TabsTrigger>
              <TabsTrigger value="users"><Users className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.users")}</TabsTrigger>
              <TabsTrigger value="secretaries"><UserCheck className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.secretaries")}</TabsTrigger>
              <TabsTrigger value="credits"><CreditCard className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.credits")}</TabsTrigger>
              <TabsTrigger value="reversed_credits"><RotateCcw className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.reversed_credits")}</TabsTrigger>
              <TabsTrigger value="withdrawals"><Wallet className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.withdrawals")}</TabsTrigger>
              <TabsTrigger value="salary_withdrawals"><Wallet className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.salary_withdrawals")}</TabsTrigger>
              <TabsTrigger value="withdrawal_history"><History className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.withdrawal_history")}</TabsTrigger>
              <TabsTrigger value="events"><Calendar className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.events")}</TabsTrigger>
              <TabsTrigger value="locations"><MapPin className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.locations")}</TabsTrigger>
              <TabsTrigger value="promotions"><Target className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.promotions")}</TabsTrigger>
              <TabsTrigger value="partners"><Briefcase className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.partners")}</TabsTrigger>
              <TabsTrigger value="badges"><ShieldCheck className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.badges")}</TabsTrigger>
              <TabsTrigger value="announcements"><Megaphone className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.announcements")}</TabsTrigger>
              <TabsTrigger value="popups"><ImageIcon className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.popups")}</TabsTrigger>
              <TabsTrigger value="videos"><Video className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.videos")}</TabsTrigger>
              <TabsTrigger value="config"><Settings className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.config")}</TabsTrigger>
              <TabsTrigger value="zone_reset"><Database className="w-4 h-4 mr-2" />Réinitialisation Zones</TabsTrigger>
              <TabsTrigger value="global-credits"><AreaChart className="w-4 h-4 mr-2" />Crédits Globaux</TabsTrigger>
              <TabsTrigger value="ussd_payments"><Smartphone className="w-4 h-4 mr-2" />Paiements USSD</TabsTrigger>
            </>
          )}

          {isAdmin && isFunctionalityActive && (
            <>
              <TabsTrigger value="salary"><Wallet className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.salary") || "Salaire"}</TabsTrigger>
              <TabsTrigger value="withdrawal_mgmt"><CheckCircle2 className="w-4 h-4 mr-2" />Gestion des Retraits</TabsTrigger>
              <TabsTrigger value="events"><Calendar className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.events")}</TabsTrigger>
              <TabsTrigger value="locations"><MapPin className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.locations")}</TabsTrigger>
              <TabsTrigger value="promotions"><Target className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.promotions")}</TabsTrigger>
              <TabsTrigger value="credits_history"><CreditCard className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.credits_history") || "Historique Crédits"}</TabsTrigger>
              <TabsTrigger value="reversed_credits"><RotateCcw className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.reversed_credits")}</TabsTrigger>
              <TabsTrigger value="withdrawals"><Wallet className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.withdrawals")}</TabsTrigger>
              <TabsTrigger value="users"><Users className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.users")}</TabsTrigger>
              <TabsTrigger value="secretaries"><UserCheck className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.secretaries")}</TabsTrigger>
              <TabsTrigger value="activity_log"><BookOpen className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.activity_log")}</TabsTrigger>
            </>
          )}

          {isSecretaryBySuperAdmin && (
            <>
              <TabsTrigger value="withdrawal_mgmt"><CheckCircle2 className="w-4 h-4 mr-2" />Gestion des Retraits</TabsTrigger>
              <TabsTrigger value="credits"><CreditCard className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.credits")}</TabsTrigger>
              <TabsTrigger value="reversed_credits"><RotateCcw className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.reversed_credits")}</TabsTrigger>
              <TabsTrigger value="withdrawals"><Wallet className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.withdrawals")}</TabsTrigger>
              <TabsTrigger value="withdrawal_history"><History className="w-4 h-4 mr-2" />{t("admin_dashboard.tabs.withdrawal_history")}</TabsTrigger>
              <TabsTrigger value="ussd_payments"><Smartphone className="w-4 h-4 mr-2" />Paiements USSD</TabsTrigger>
            </>
          )}
        </TabsList>

        {isSuperAdmin && (
          <>
            <TabsContent value="analytics"><AnalyticsDashboard /></TabsContent>
            <TabsContent value="credit_stats"><CreditStatsTab /></TabsContent>
            <TabsContent value="withdrawal_mgmt"><WithdrawalManagementDashboard /></TabsContent>
            <TabsContent value="activity_log"><ActivityLogTab /></TabsContent>
            <TabsContent value="transactions"><TransactionsTable transactions={allTransactions} /></TabsContent>
            <TabsContent value="payments"><AdminPaymentsTab /></TabsContent>
            <TabsContent value="users"><UserManagement users={allUsers} onRefresh={fetchData} userProfile={userProfile} /></TabsContent>
            <TabsContent value="secretaries"><SecretaryManagementTab users={allUsers} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="credits"><CreditManagement onRefresh={fetchData} /></TabsContent>
            <TabsContent value="reversed_credits"><ReversedCreditsTab isSuperAdmin={true} /></TabsContent>
            <TabsContent value="withdrawals"><WithdrawalManagement /></TabsContent>
            <TabsContent value="salary_withdrawals"><SalaryWithdrawalManagement /></TabsContent>
            <TabsContent value="withdrawal_history"><WithdrawalHistoryTab /></TabsContent>
            <TabsContent value="events"><EventsManagement events={allEvents} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="locations"><LocationManagementTab /></TabsContent>
            <TabsContent value="promotions"><PromotionsManagement promotions={allPromotions} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="partners"><PartnersManagement /></TabsContent>
            <TabsContent value="badges"><BadgeManagementPanel /></TabsContent>
            <TabsContent value="announcements"><AnnouncementsManagement announcements={allAnnouncements} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="popups"><WelcomePopupManagement popups={allPopups} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="videos"><VideoManager /></TabsContent>
            <TabsContent value="config"><ConfigTab /></TabsContent>
            <TabsContent value="zone_reset"><ZoneResetManager /></TabsContent>
            <TabsContent value="global-credits"><AdminCreditsGlobalTab /></TabsContent>
            <TabsContent value="ussd_payments"><USSDPaymentsTab actorId={userProfile?.id} /></TabsContent>
          </>
        )}

        {isAdmin && isFunctionalityActive && (
          <>
            <TabsContent value="salary"><AdminSalaryDashboard userProfile={userProfile} /></TabsContent>
            <TabsContent value="withdrawal_mgmt"><WithdrawalManagementDashboard /></TabsContent>
            <TabsContent value="events"><EventsManagement events={allEvents} userProfile={userProfile} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="locations"><LocationManagementTab userProfile={userProfile} /></TabsContent>
            <TabsContent value="promotions"><PromotionsManagement promotions={allPromotions} userProfile={userProfile} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="credits_history"><AdminCreditsTab userProfile={userProfile} /></TabsContent>
            <TabsContent value="reversed_credits"><ReversedCreditsTab isSuperAdmin={false} country={userProfile.country} userProfile={userProfile} /></TabsContent>
            <TabsContent value="withdrawals"><WithdrawalManagement userProfile={userProfile} /></TabsContent>
            <TabsContent value="users"><UserManagement users={allUsers} userProfile={userProfile} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="secretaries"><SecretaryManagementTab users={allUsers} userProfile={userProfile} onRefresh={fetchData} /></TabsContent>
            <TabsContent value="activity_log"><ActivityLogTab userProfile={userProfile} /></TabsContent>
          </>
        )}

        {isSecretaryBySuperAdmin && (
          <>
            <TabsContent value="withdrawal_mgmt"><WithdrawalManagementDashboard /></TabsContent>
            <TabsContent value="credits"><CreditManagement onRefresh={fetchData} userProfile={userProfile} /></TabsContent>
            <TabsContent value="reversed_credits"><ReversedCreditsTab isSuperAdmin={false} actorId={userProfile.id} userProfile={userProfile} /></TabsContent>
            <TabsContent value="withdrawals"><WithdrawalManagement userProfile={userProfile} /></TabsContent>
            <TabsContent value="withdrawal_history"><WithdrawalHistoryTab actorId={userProfile.id} userProfile={userProfile} /></TabsContent>
            <TabsContent value="ussd_payments"><USSDPaymentsTab actorId={userProfile?.id} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};

export default AdminDashboard;