import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  CreditCard,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Wallet,
  ArrowUpRight,
  Activity,
  Coins,
  RotateCcw,
  Tag,
  CheckCircle2,
  Eye,
  EyeOff,
  Smartphone,
  Calendar,
  BarChart,
  FileText,
  UserCheck,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "@/lib/customSupabaseClient";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { fetchWithRetry, formatCurrency } from "@/lib/utils";
import { retrySupabaseRequest } from "@/lib/supabaseHelper";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { toast } from "@/components/ui/use-toast";
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
import { motion } from "framer-motion";
import { CouponService } from "@/services/CouponService";
import { COIN_TO_FCFA_RATE } from "@/constants/coinRates";

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
];

const AnalyticsDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [pwaInstalls, setPwaInstalls] = useState([]);
  const [totalPwaInstalls, setTotalPwaInstalls] = useState(0);

  // Contract acceptances state
  const [contractAcceptances, setContractAcceptances] = useState([]);
  const [totalContractAcceptances, setTotalContractAcceptances] = useState(0);

  // Data States
  const [metrics, setMetrics] = useState({
    totalCommissions: 0,
    totalUserBalance: 0,
  });

  const [stats, setStats] = useState({
    totalTransactions: 0,
    pendingWithdrawals: 0,
    totalUsers: 0,
    newUsers: 0,
    activeEvents: 0,
    totalSalesFcfa: 0,
    totalSalesCount: 0,
  });

  const [recentTransactions, setRecentTransactions] = useState([]);
  const [userActivityData, setUserActivityData] = useState([]);
  const [revenueByType, setRevenueByType] = useState([]);

  // Coupons data
  const [couponsData, setCouponsData] = useState([]);
  const [couponUsages, setCouponUsages] = useState([]);
  const [couponOwnerMap, setCouponOwnerMap] = useState({});
  const [actionLoading, setActionLoading] = useState(null);

  // ========== RÉCUPÉRATION DES ACCEPTATIONS DE CONTRAT ==========
// ========== RÉCUPÉRATION DES ACCEPTATIONS DE CONTRAT ==========
const fetchContractAcceptances = async () => {
  try {
    // Récupérer toutes les acceptations
    const { data, error } = await supabase
      .from("user_contract_acceptances")
      .select("id, user_id, event_id, contract_type, accepted_at, contract_version, created_at")
      .order("accepted_at", { ascending: false });

    if (error) {
      if (error.code === "PGRST204" || error.message?.includes("does not exist")) {
        console.warn("⚠️ Table user_contract_acceptances n'existe pas encore");
        setContractAcceptances([]);
        setTotalContractAcceptances(0);
        return;
      }
      throw error;
    }

    if (!data || data.length === 0) {
      setContractAcceptances([]);
      setTotalContractAcceptances(0);
      return;
    }

    // Récupérer les infos utilisateur
    const userIds = [...new Set(data.map(item => item.user_id).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      if (!usersError && usersData) {
        usersMap = usersData.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});
      }
    }

    // Récupérer les événements
    const eventIds = [...new Set(data.map(item => item.event_id).filter(Boolean))];
    let eventsMap = {};
    if (eventIds.length > 0) {
      const { data: eventsData, error: eventsError } = await supabase
        .from("events")
        .select("id, title, event_start_at, event_end_at, city")
        .in("id", eventIds);
      if (!eventsError && eventsData) {
        eventsMap = eventsData.reduce((acc, e) => ({ ...acc, [e.id]: e }), {});
      }
    }

    // Enrichir les données
    const enrichedData = data.map(item => ({
      ...item,
      user: usersMap[item.user_id] || null,
      event: eventsMap[item.event_id] || null
    }));

    setContractAcceptances(enrichedData);
    setTotalContractAcceptances(enrichedData.length);
  } catch (err) {
    console.error("❌ Erreur chargement acceptations contrat:", err);
    setContractAcceptances([]);
    setTotalContractAcceptances(0);
  }
};

  const fetchPwaInstalls = async () => {
    try {
      const { data, error } = await supabase
        .from("pwa_installs")
        .select(
          `
          id,
          installed_at,
          platform,
          device_type,
          source,
          user:user_id(id, full_name, email)
        `,
        )
        .order("installed_at", { ascending: false });

      if (error) throw error;

      setPwaInstalls(data || []);
      setTotalPwaInstalls(data?.length || 0);
    } catch (err) {
      console.error("Erreur chargement installations PWA :", err);
    }
  };

  // ========== CALCUL DES COMMISSIONS (10%) ==========
  const fetchMetrics = async () => {
    try {
      let totalCommissions = 0;

      // 1. Commissions des gains organisateurs (10% des organizer_earnings)
      const { data: earningsData, error: earningsError } = await supabase
        .from("organizer_earnings")
        .select("amount_pi");
      if (!earningsError && earningsData) {
        totalCommissions += earningsData.reduce(
          (sum, item) => sum + (item.amount_pi || 0) * 0.05,
          0,
        );
      }

      // 2. Commissions des retraits (10% des withdrawals_completed)
      const { data: withdrawalData, error: withdrawalError } = await supabase
        .from("withdrawal_requests")
        .select("amount_pi, status")
        .eq("status", "completed");
      if (!withdrawalError && withdrawalData) {
        totalCommissions += withdrawalData.reduce(
          (sum, item) => sum + (item.amount_pi || 0) * 0.1,
          0,
        );
      }

      // 3. Commissions explicites enregistrées dans platform_fees
      const { data: feesData, error: feesError } = await supabase
        .from("platform_fees")
        .select("amount, percentage")
        .eq("percentage", 10);
      if (!feesError && feesData) {
        totalCommissions += feesData.reduce(
          (sum, item) => sum + (item.amount || 0),
          0,
        );
      }

      // 4. Total des soldes utilisateurs
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("coin_balance")
        .eq("user_type", "user");

      let calculatedUserBalance = 0;
      if (!userError && userData) {
        calculatedUserBalance = userData.reduce(
          (sum, item) => sum + (item.coin_balance || 0),
          0,
        );
      }

      setMetrics({
        totalCommissions: Math.floor(totalCommissions),
        totalUserBalance: Math.floor(calculatedUserBalance),
      });
    } catch (err) {
      console.error("Error fetching metrics:", err);
      setMetrics({
        totalCommissions: 0,
        totalUserBalance: 0,
      });
    }
  };

  const fetchCoupons = async () => {
    try {
      const { data: couponsList } = await CouponService.getAllCouponsStats();
      const { data: usagesList } = await CouponService.getAllCouponUsages();

      if (couponsList && couponsList.length > 0) {
        const userIds = [...new Set(couponsList.map((c) => c.user_id))];
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        if (!profilesError && profiles) {
          const map = {};
          profiles.forEach((p) => (map[p.id] = p));
          setCouponOwnerMap(map);
        }
      }

      setCouponsData(couponsList || []);
      setCouponUsages(usagesList || []);
    } catch (err) {
      console.error("Error fetching coupons:", err);
    }
  };

  const fetchDashboardData = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchMetrics(),
        (async () => {
          const { data: rpcData, error: rpcError } = await retrySupabaseRequest(
            () => supabase.rpc("get_super_admin_dashboard_stats"),
          );
          if (rpcError) throw rpcError;

          const { data: transactionsData } = await retrySupabaseRequest(() =>
            supabase
              .from("transactions")
              .select("*, user:user_id(full_name, email)")
              .order("created_at", { ascending: false })
              .limit(5),
          );

          const { data: profilesData } = await retrySupabaseRequest(() =>
            supabase
              .from("profiles")
              .select("created_at")
              .gte("created_at", subDays(new Date(), 30).toISOString()),
          );

          const { data: spendingData } = await retrySupabaseRequest(() =>
            supabase
              .from("coin_spending")
              .select("purpose, amount")
              .gte("created_at", subDays(new Date(), 90).toISOString()),
          );

          // Activity chart
          const activityMap = {};
          const today = new Date();
          for (let i = 29; i >= 0; i--) {
            const dateKey = format(subDays(today, i), "yyyy-MM-dd");
            activityMap[dateKey] = 0;
          }
          (profilesData || []).forEach((profile) => {
            const dateKey = format(new Date(profile.created_at), "yyyy-MM-dd");
            if (activityMap[dateKey] !== undefined) activityMap[dateKey]++;
          });
          const formattedActivityData = Object.entries(activityMap).map(
            ([date, count]) => ({
              date: format(new Date(date), "dd MMM", { locale: fr }),
              users: count,
            }),
          );

          // Revenue breakdown
          const typeMap = {};
          (spendingData || []).forEach((item) => {
            const type = item.purpose || "Autre";
            typeMap[type] = (typeMap[type] || 0) + (item.amount || 0);
          });
          const formattedRevenueType = Object.entries(typeMap)
            .map(([name, value]) => ({
              name:
                name === "ticket_purchase"
                  ? "Billetterie"
                  : name === "vote_participation"
                    ? "Votes"
                    : name === "raffle_participation"
                      ? "Tombola"
                      : name === "stand_rental"
                        ? "Stands"
                        : name === "event_access"
                          ? "Év. Protégés"
                          : name,
              value,
            }))
            .sort((a, b) => b.value - a.value);

          setStats({
            totalTransactions: rpcData?.total_transactions || 0,
            pendingWithdrawals: rpcData?.pending_withdrawals || 0,
            totalUsers: rpcData?.total_users || 0,
            newUsers: rpcData?.new_users || 0,
            activeEvents: rpcData?.active_events || 0,
            totalSalesFcfa: rpcData?.total_sales_fcfa || 0,
            totalSalesCount: rpcData?.total_sales_count || 0,
          });

          setRecentTransactions(transactionsData || []);
          setUserActivityData(formattedActivityData);
          setRevenueByType(formattedRevenueType);
        })(),
        fetchCoupons(),
        fetchPwaInstalls(),
        fetchContractAcceptances(),
      ]);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(
        err.message ||
          "Impossible de charger les données. Vérifiez votre connexion.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Actions pour coupons
  const handleToggleCoupon = async (coupon) => {
    setActionLoading(coupon.code);
    try {
      const action = coupon.active
        ? CouponService.deactivateCoupon
        : CouponService.activateCoupon;
      const { success, error } = await action(coupon.code);
      if (error) throw new Error(error);
      toast({
        title: "Succès",
        description: `Coupon ${coupon.code} ${coupon.active ? "désactivé" : "activé"} avec succès.`,
        variant: "default",
      });
      await fetchCoupons();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de modifier le coupon.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlockCoupon = async (coupon) => {
    if (
      !window.confirm(
        `Êtes-vous sûr de vouloir bloquer définitivement le coupon ${coupon.code} ?`,
      )
    )
      return;
    setActionLoading(`block_${coupon.code}`);
    try {
      const { success, error } = await CouponService.deactivateCoupon(
        coupon.code,
      );
      if (error) throw new Error(error);
      toast({
        title: "Coupon bloqué",
        description: `Le coupon ${coupon.code} a été bloqué.`,
        variant: "destructive",
      });
      await fetchCoupons();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de bloquer le coupon.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Reset data handler
  const handleResetData = async () => {
    if (!user) return;
    setResetLoading(true);
    setResetError(null);
    try {
      const { data, error } = await supabase.rpc("reset_transactional_data", {
        p_admin_id: user.id,
      });
      if (error) throw error;
      if (data && data.success === false)
        throw new Error(data.message || "Échec de la réinitialisation.");
      toast({
        title: "Succès",
        description:
          data?.message || "Toutes les données ont été réinitialisées.",
        className: "bg-green-600 text-white border-none",
      });
      setResetOpen(false);
      fetchDashboardData(true);
    } catch (err) {
      console.error("Erreur reset:", err);
      setResetError(err.message || "Une erreur est survenue.");
      toast({
        title: "Erreur",
        description: "Échec de la réinitialisation.",
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-destructive/20 rounded-xl bg-destructive/5 text-destructive animate-in fade-in">
        <AlertCircle className="w-12 h-12 mb-4" />
        <h3 className="text-xl font-bold">Erreur de chargement</h3>
        <p className="mb-4">{error}</p>
        <Button onClick={() => fetchDashboardData(true)} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" /> Réessayer
        </Button>
      </div>
    );
  }

  const SecondaryStatCard = ({
    title,
    value,
    subtext,
    icon: Icon,
    colorClass,
  }) => (
    <Card className="relative overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className={`h-4 w-4 ${colorClass}`} />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtext && (
          <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Super Admin Dashboard
          </h2>
          <p className="text-muted-foreground">
            Vue d'ensemble et métriques clés de la plateforme.
          </p>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SecondaryStatCard
          title="Chiffre d'Affaires (Ventes)"
          value={formatCurrency(stats.totalSalesFcfa)}
          subtext={`${stats.totalSalesCount || 0} encaissements packs (USSD + mobile money), retraits et dépenses exclus`}
          icon={TrendingUp}
          colorClass="text-emerald-600"
        />
        <SecondaryStatCard
          title="Total Transactions"
          value={stats.totalTransactions.toLocaleString()}
          subtext="Volume global d'opérations"
          icon={CreditCard}
          colorClass="text-purple-500"
        />
        <SecondaryStatCard
          title="Utilisateurs Inscrits"
          value={stats.totalUsers.toLocaleString()}
          subtext={`+${stats.newUsers} nouveaux (30j)`}
          icon={Users}
          colorClass="text-green-500"
        />
        <SecondaryStatCard
          title="Événements Actifs"
          value={stats.activeEvents}
          subtext="En ligne actuellement"
          icon={Activity}
          colorClass="text-indigo-500"
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-7">
        {/* Activity Chart */}
        <Card className="col-span-4 shadow-sm border-muted">
          <CardHeader>
            <CardTitle>Activité Utilisateurs</CardTitle>
            <CardDescription>
              Nouvelles inscriptions sur 30 jours
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={userActivityData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="10%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="90%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUsers)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Type Chart */}
        <Card className="col-span-3 shadow-sm border-muted">
          <CardHeader>
            <CardTitle>Sources de Dépenses</CardTitle>
            <CardDescription>Utilisation des pièces par type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={revenueByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {revenueByType.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground font-bold text-lg"
                >
                  Types
                </text>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {revenueByType.map((entry, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="flex items-center gap-1.5 px-3 py-1 bg-background"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  {entry.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Recent Transactions, Coupons, PWA Installs and Contract Acceptances */}
      <Tabs defaultValue="recent_tx" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="recent_tx">Dernières Transactions</TabsTrigger>
          <TabsTrigger value="coupons">Coupons & Parrainage</TabsTrigger>
          <TabsTrigger value="pwa_installs">Installations PWA</TabsTrigger>
          <TabsTrigger value="contracts">📝 Acceptations Contrat</TabsTrigger>
        </TabsList>

        {/* Onglet Transactions récentes */}
        <TabsContent value="recent_tx">
          <Card className="shadow-sm border-muted">
            <CardHeader>
              <CardTitle>Flux Récent</CardTitle>
              <CardDescription>
                Les 5 dernières opérations financières.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Aucune transaction récente
                  </p>
                ) : (
                  recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-2 rounded-full ${tx.amount_pi > 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}
                        >
                          {tx.amount_pi > 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {tx.description || tx.transaction_type}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <span>{tx.user?.full_name || "Utilisateur"}</span>
                            <span>•</span>
                            <span>
                              {format(new Date(tx.created_at), "dd MMM HH:mm", {
                                locale: fr,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-bold ${tx.amount_pi > 0 ? "text-green-600" : "text-red-500"}`}
                        >
                          {tx.amount_pi > 0 ? "+" : ""}
                          {tx.amount_pi} pièces
                        </div>
                        {tx.amount_fcfa && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {Math.abs(tx.amount_fcfa).toLocaleString()} FCFA
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Coupons */}
        <TabsContent value="coupons">
          <Card className="shadow-sm border-muted">
            <CardHeader>
              <CardTitle>Suivi des coupons</CardTitle>
              <CardDescription>
                Liste de tous les coupons créés et leurs utilisations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Résumé global des coupons */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <SecondaryStatCard
                    title="Coupons créés"
                    value={couponsData.length}
                    subtext="Total codes générés"
                    icon={Tag}
                    colorClass="text-indigo-500"
                  />
                  <SecondaryStatCard
                    title="Coupons utilisés"
                    value={couponsData.filter((c) => c.usage_count > 0).length}
                    subtext="Au moins une utilisation"
                    icon={CheckCircle2}
                    colorClass="text-green-500"
                  />
                  <SecondaryStatCard
                    title="Total généré"
                    value={formatCurrency(
                      couponsData.reduce(
                        (sum, c) => sum + (Number(c.total_amount) || 0),
                        0,
                      ),
                    )}
                    subtext="Cumul des ventes générées"
                    icon={TrendingUp}
                    colorClass="text-blue-500"
                  />
                  <SecondaryStatCard
                    title="Commission totale versée"
                    value={formatCurrency(
                      couponsData.reduce(
                        (sum, c) => sum + (Number(c.commission_earned) || 0),
                        0,
                      ),
                    )}
                    subtext="Cumul des 2% reversés"
                    icon={Coins}
                    colorClass="text-yellow-500"
                  />
                </div>

                {/* Historique des utilisations */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Historique des utilisations
                  </h3>
                  {couponUsages.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      Aucune utilisation enregistrée.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {couponUsages.map((usage) => (
                        <div
                          key={usage.id}
                          className="flex items-center justify-between p-4 border rounded-lg bg-card/50"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {usage.coupon_code}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                par{" "}
                                {usage.user?.full_name ||
                                  usage.user?.email ||
                                  "Utilisateur"}
                              </span>
                            </div>
                            <div className="text-sm mt-1">
                              <span className="text-muted-foreground">
                                Montant :
                              </span>{" "}
                              {usage.amount.toLocaleString()} FCFA
                              <span className="ml-3 text-muted-foreground">
                                Commission :
                              </span>{" "}
                              <span className="text-green-600">
                                {usage.commission.toLocaleString()} FCFA
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(
                                new Date(usage.created_at),
                                "dd MMM yyyy HH:mm",
                                { locale: fr },
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="secondary">Utilisé</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tous les coupons */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Tous les coupons
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-700">
                        <tr className="text-left">
                          <th className="pb-2">Code</th>
                          <th className="pb-2">Propriétaire</th>
                          <th className="pb-2 text-right">Utilisations</th>
                          <th className="pb-2 text-right">Total généré</th>
                          <th className="pb-2 text-right">Commission</th>
                          <th className="pb-2">Dernière utilisation</th>
                          <th className="pb-2 text-center min-w-[120px]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {couponsData.map((coupon) => {
                          const owner = couponOwnerMap[coupon.user_id];
                          const ownerDisplay = owner
                            ? owner.full_name || owner.email
                            : coupon.user_id;
                          return (
                            <tr
                              key={coupon.code}
                              className="border-b border-gray-800"
                            >
                              <td className="py-2 font-mono whitespace-nowrap">
                                {coupon.code}
                              </td>
                              <td className="py-2 whitespace-nowrap">
                                {ownerDisplay}
                              </td>
                              <td className="py-2 text-right whitespace-nowrap">
                                {coupon.usage_count}
                              </td>
                              <td className="py-2 text-right whitespace-nowrap">
                                {formatCurrency(Number(coupon.total_amount) || 0)}
                              </td>
                              <td className="py-2 text-right text-green-400 whitespace-nowrap">
                                {formatCurrency(Number(coupon.commission_earned) || 0)}
                              </td>
                              <td className="py-2 whitespace-nowrap">
                                {coupon.last_used_at
                                  ? format(
                                      new Date(coupon.last_used_at),
                                      "dd MMM yyyy",
                                    )
                                  : "-"}
                              </td>
                              <td className="py-2 text-center">
                                <div className="flex gap-2 justify-center">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleToggleCoupon(coupon)}
                                    disabled={actionLoading === coupon.code}
                                    className={`${coupon.active ? "text-red-500 border-red-500 hover:bg-red-500/10" : "text-green-500 border-green-500 hover:bg-green-500/10"} h-8 px-3 text-xs`}
                                  >
                                    {actionLoading === coupon.code ? (
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : coupon.active ? (
                                      <>
                                        <EyeOff className="w-3 h-3 mr-1" />{" "}
                                        Désactiver
                                      </>
                                    ) : (
                                      <>
                                        <Eye className="w-3 h-3 mr-1" /> Activer
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleBlockCoupon(coupon)}
                                    disabled={
                                      actionLoading === `block_${coupon.code}`
                                    }
                                    className="text-red-600 border-red-600 hover:bg-red-500/10 h-8 px-3 text-xs"
                                  >
                                    {actionLoading ===
                                    `block_${coupon.code}` ? (
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <>🔒 Bloquer</>
                                    )}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Installations PWA */}
        <TabsContent value="pwa_installs">
          <Card className="shadow-sm border-muted">
            <CardHeader>
              <CardTitle>Installations de l'application</CardTitle>
              <CardDescription>
                Utilisateurs ayant installé BonPlanInfos sur leur appareil.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Cartes récapitulatives */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SecondaryStatCard
                    title="Total installations"
                    value={totalPwaInstalls}
                    subtext="Utilisateurs uniques"
                    icon={Smartphone}
                    colorClass="text-blue-500"
                  />
                  <SecondaryStatCard
                    title="Dernière installation"
                    value={
                      pwaInstalls[0]
                        ? format(
                            new Date(pwaInstalls[0].installed_at),
                            "dd MMM yyyy",
                            { locale: fr },
                          )
                        : "-"
                    }
                    subtext={
                      pwaInstalls[0]?.user?.full_name ||
                      pwaInstalls[0]?.user?.email ||
                      "Inconnu"
                    }
                    icon={Calendar}
                    colorClass="text-gray-500"
                  />
                  <SecondaryStatCard
                    title="Plateformes"
                    value={`${pwaInstalls.filter((i) => i.platform === "android").length} Android / ${pwaInstalls.filter((i) => i.platform === "ios").length} iOS`}
                    subtext="Répartition"
                    icon={BarChart}
                    colorClass="text-green-500"
                  />
                </div>

                {/* Liste détaillée */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Liste détaillée
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-700">
                        <tr className="text-left">
                          <th className="pb-2">Utilisateur</th>
                          <th className="pb-2">Plateforme</th>
                          <th className="pb-2">Appareil</th>
                          <th className="pb-2">Source</th>
                          <th className="pb-2">Date d'installation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pwaInstalls.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="text-center py-8 text-muted-foreground"
                            >
                              Aucune installation enregistrée.
                            </td>
                          </tr>
                        ) : (
                          pwaInstalls.map((install) => (
                            <tr
                              key={install.id}
                              className="border-b border-gray-800"
                            >
                              <td className="py-3">
                                {install.user?.full_name ||
                                  install.user?.email ||
                                  "Utilisateur inconnu"}
                              </td>
                              <td className="py-3 capitalize">
                                {install.platform}
                              </td>
                              <td className="py-3 capitalize">
                                {install.device_type}
                              </td>
                              <td className="py-3 capitalize">
                                {install.source?.replace("_", " ") || "-"}
                              </td>
                              <td className="py-3">
                                {format(
                                  new Date(install.installed_at),
                                  "dd MMM yyyy HH:mm",
                                  { locale: fr },
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOUVEL ONGLET : Acceptations de contrat */}
        <TabsContent value="contracts">
          <Card className="shadow-sm border-muted">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Acceptations de contrat
              </CardTitle>
              <CardDescription>
                Historique des acceptations de contrat organisateur. Permet de 
                vérifier qui a accepté le contrat avant de créer un événement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Cartes récapitulatives */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SecondaryStatCard
                    title="Total acceptations"
                    value={totalContractAcceptances}
                    subtext="Nombre total d'acceptations enregistrées"
                    icon={FileText}
                    colorClass="text-blue-500"
                  />
                  <SecondaryStatCard
                    title="Dernière acceptation"
                    value={
                      contractAcceptances[0]
                        ? format(
                            new Date(contractAcceptances[0].accepted_at),
                            "dd MMM yyyy HH:mm",
                            { locale: fr },
                          )
                        : "-"
                    }
                    subtext={
                      contractAcceptances[0]?.user?.full_name ||
                      contractAcceptances[0]?.user?.email ||
                      "Inconnu"
                    }
                    icon={UserCheck}
                    colorClass="text-green-500"
                  />
                  <SecondaryStatCard
                    title="Type de contrat"
                    value="Organisateur"
                    subtext="Version v1.0"
                    icon={CheckCircle2}
                    colorClass="text-purple-500"
                  />
                </div>

                {/* Liste détaillée des acceptations */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">
                    Historique complet des acceptations
                  </h3>
                  {contractAcceptances.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card/30">
                      <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p>Aucune acceptation de contrat enregistrée.</p>
                      <p className="text-sm mt-1">
                        Les acceptations apparaîtront ici lorsque des 
                        organisateurs accepteront le contrat.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-700">
                          <tr className="text-left">
                            <th className="pb-2">#</th>
                            <th className="pb-2">Organisateur</th>
                            <th className="pb-2">Email / Téléphone</th>
                            <th className="pb-2">Événement</th>
                            <th className="pb-2">Date d'acceptation</th>
                            <th className="pb-2">Version</th>
                            <th className="pb-2 text-center">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractAcceptances.map((acceptance, index) => (
                            <tr
                              key={acceptance.id}
                              className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors"
                            >
                              <td className="py-3 whitespace-nowrap text-muted-foreground">
                                {index + 1}
                              </td>
                              <td className="py-3 font-medium">
                                {acceptance.user?.full_name || "Utilisateur inconnu"}
                                <div className="text-xs text-muted-foreground">
                                  ID: {acceptance.user_id?.slice(0, 8)}...
                                </div>
                              </td>
                              <td className="py-3">
                                <div>{acceptance.user?.email || "N/A"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {acceptance.user?.phone || "N/A"}
                                </div>
                              </td>
                              <td className="py-3">
                                {acceptance.event ? (
                                  <div>
                                    <div className="font-medium">
                                      {acceptance.event.title || "Événement"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {acceptance.event.city || "Lieu"} • 
                                      {acceptance.event.event_start_at && (
                                        format(
                                          new Date(acceptance.event.event_start_at),
                                          "dd MMM yyyy",
                                          { locale: fr }
                                        )
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      ID: {acceptance.event_id?.slice(0, 8)}...
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    Événement {acceptance.event_id?.slice(0, 8)}...
                                  </span>
                                )}
                              </td>
                              <td className="py-3 whitespace-nowrap">
                                {format(
                                  new Date(acceptance.accepted_at),
                                  "dd MMM yyyy HH:mm",
                                  { locale: fr }
                                )}
                              </td>
                              <td className="py-3 whitespace-nowrap">
                                <Badge variant="outline" className="font-mono">
                                  {acceptance.contract_version || "v1.0"}
                                </Badge>
                              </td>
                              <td className="py-3 text-center">
                                <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                                  ✅ Accepté
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsDashboard;