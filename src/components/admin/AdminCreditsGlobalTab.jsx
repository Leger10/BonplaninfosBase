import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { toast } from "@/components/ui/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Coins, Search, TrendingUp, RefreshCw, MapPin, Eraser, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ZoneResetManager from "./ZoneResetManager";
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

const AdminCreditsGlobalTab = () => {
  const { adminConfig } = useData();
  const { user } = useAuth();
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // Distribution de pièces réellement créditées : packs achetés par USSD
  // (virés sur le compte) + versements directs de l'équipe (super admin,
  // secrétaire). Les retraits et les packs pas encore crédités ne figurent pas ici.
  const [totals, setTotals] = useState({
    credited: 0,
    creditedFCFA: 0,
    ussd: 0,
    ussdFcfa: 0,
    // Packs USSD payés mais pas encore virés au compte : affichés à part,
    // jamais additionnés au chiffre d'affaires.
    ussdUncredited: 0,
    ussdPending: 0,
    manual: 0,
    manualFcfa: 0,
    spent: 0,
    spentFcfa: 0,
    uniqueUsers: 0,
  });
  const [countryTotals, setCountryTotals] = useState([]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [countryResetDialogOpen, setCountryResetDialogOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [resetting, setResetting] = useState(false);

  const coinToFcfaRate = adminConfig?.coin_to_fcfa_rate || 10;

  const fetchAllCredits = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Crédits manuels : versements de l'équipe, restreints aux seuls rôles que
      // l'API autorise (super_admin, secretary). Le filtre porte sur le rôle
      // RÉEL de l'acteur, résolu par la jointure, pas sur une supposition.
      const adminQuery = supabase
        .from("admin_logs")
        .select(`
          id,
          created_at,
          details,
          target_id,
          actor:actor_id (full_name, user_type),
          target_user:target_id (full_name, email, country, city)
        `)
        .eq("action_type", "user_credited")
        .order("created_at", { ascending: false });

      const { data: adminLogs, error: adminError } = await adminQuery;
      if (adminError) throw adminError;

      // Un crédit annulé (« Réinitialiser crédits manuels ») ne compte pas :
      // les pièces ont été reprises, les compter gonflerait le chiffre d'affaires.
      // Et seuls les rôles que l'API autorise réellement à créditer sont retenus :
      // `credit_user_coins` refuse tout acteur qui n'est pas super_admin ou
      // secretary. Sans ce filtre, des lignes historiques émises par un
      // organisateur (10 000 pièces) gonflaient un total que personne ne peut
      // reproduire aujourd'hui.
      const TEAM_CREDIT_ROLES = ['super_admin', 'secretary'];
      const validAdminLogs = (adminLogs || []).filter((log) => {
        if (log.details?.reversed) return false;
        return TEAM_CREDIT_ROLES.includes(log.actor?.user_type);
      });

      // 2. Packs achetés par USSD (canal de distribution actuel). On ne retient
      // que les lignes dont `credits_added` est vrai et dont le paiement n'est pas
      // annulé : preuve que les pièces sont arrivées sur le compte.
      const { data: packPayments, error: paymentsError } = await supabase
        .from("payments")
        .select(`
          id,
          created_at,
          amount_fcfa,
          coins_amount,
          user_id,
          status,
          payment_method,
          credits_added,
          transaction_id,
          pack_id,
          profiles!payments_user_id_fkey (full_name, email, country, city)
        `)
        .eq('payment_method', 'ussd')
        .order('created_at', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Un paiement n'est compté que s'il a réellement crédité le compte et
      // qu'il n'a pas été annulé depuis.
      const isCredited = (p) => p.credits_added === true && p.status !== 'cancelled';
      const packRows = packPayments || [];
      const creditedPacks = packRows.filter(isCredited);

      // Suivi des packs USSD payés mais dont les pièces ne sont pas encore sur
      // le compte : ce n'est pas du chiffre d'affaires acquis, on l'affiche à
      // part pour que l'écart soit visible plutôt que silently perdu.
      const ussdNotCredited = packRows.filter(
        (p) => p.payment_method === 'ussd' && !isCredited(p)
      );
      const ussdPending = ussdNotCredited
        .filter((p) => p.status === 'pending')
        .reduce((s, p) => s + (p.coins_amount || 0), 0);
      const ussdUncredited = ussdNotCredited
        .reduce((s, p) => s + (p.coins_amount || 0), 0);

      // 3. Pièces DÉBITÉES : ce que les votants ont consommé. payment_method
      // = 'coins' marque les votes payés en pièces (les achats de packs USSD
      // sont 'ussd', donc pas de double comptage).
      const { data: spentPayments, error: spentError } = await supabase
        .from("payments")
        .select("coins_amount, user_id, profiles!payments_user_id_fkey (country)")
        .eq('payment_method', 'coins');

      if (spentError) throw spentError;

      const formattedPurchases = creditedPacks.map((tx) => ({
        id: tx.id,
        created_at: tx.created_at,
        details: {
          amount: tx.coins_amount || 0,
          // amount_fcfa est le montant réellement payé.
          amount_fcfa: Number(tx.amount_fcfa || 0),
        },
        source: 'ussd',
        actor: { full_name: null, user_type: "system" },
        target_user: {
          full_name: tx.profiles?.full_name || "Utilisateur inconnu",
          email: tx.profiles?.email,
          country: tx.profiles?.country,
          city: tx.profiles?.city,
        },
        user_id: tx.user_id,
        status: tx.status,
      }));

      const formattedAdmin = validAdminLogs.map((log) => ({
        ...log,
        // admin_logs n'a pas de colonne user_id : le bénéficiaire est
        // target_id. Sans ça les versements manuels ne comptent pas dans le
        // décompte des utilisateurs servis.
        user_id: log.target_id || null,
        source: "admin",
      }));

      // Fusionner et trier par date
      const combined = [...formattedAdmin, ...formattedPurchases].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      console.log(`Total: ${combined.length} entrées (Admin: ${formattedAdmin.length}, Achats: ${formattedPurchases.length})`);

      setAllEntries(combined);

      // Répartition par origine et par pays (USSD + versements équipe). Le FCFA
      // suit le montant réellement payé pour les packs USSD, et le taux de
      // référence pour les versements manuels.
      let manual = 0, ussd = 0, ussdFcfa = 0;
      let spent = 0;
      const creditedUsers = new Set();
      const countryMap = new Map();

      const emptyCountry = (country) => ({
        country,
        count: 0,
        totalCoins: 0,
        manual: 0,
        ussd: 0,
        spent: 0,
        ussdFcfa: 0,
        manualFcfa: 0,
        spentFcfa: 0,
      });

      combined.forEach((entry) => {
        const amount = Number(entry.details?.amount || 0);
        const amountFcfa = Number(entry.details?.amount_fcfa || 0);
        const country = entry.target_user?.country || "Inconnu";
        const isManual = entry.source === "admin";

        if (isManual) {
          manual += amount;
        } else {
          ussd += amount;
          ussdFcfa += amountFcfa;
        }

        if (entry.user_id) creditedUsers.add(entry.user_id);

        if (!countryMap.has(country)) countryMap.set(country, emptyCountry(country));
        const c = countryMap.get(country);
        if (isManual) {
          c.manual += amount;
          c.manualFcfa += amount * coinToFcfaRate;
          c.totalCoins += amount;
          c.count += 1;
        } else {
          c.ussd += amount;
          c.ussdFcfa += amountFcfa;
          c.totalCoins += amount;
          c.count += 1;
        }
      });

      // Les pièces dépensées se ventilent aussi par pays (valeur FCFA au taux de référence).
      (spentPayments || []).forEach((p) => {
        const amt = Number(p.coins_amount || 0);
        spent += amt;
        const country = p.profiles?.country || "Inconnu";
        if (!countryMap.has(country)) countryMap.set(country, emptyCountry(country));
        const c = countryMap.get(country);
        c.spent += amt;
        c.spentFcfa += amt * coinToFcfaRate;
      });

      const countryArray = Array.from(countryMap.values()).sort(
        (a, b) => b.totalCoins - a.totalCoins
      );
      const manualFcfa = manual * coinToFcfaRate;
      const spentFcfa = spent * coinToFcfaRate;

      setCountryTotals(countryArray);
      setTotals({
        credited: ussd + manual,
        creditedFCFA: ussdFcfa + manualFcfa,
        ussd,
        ussdFcfa,
        ussdUncredited,
        ussdPending,
        manual,
        manualFcfa,
        spent,
        spentFcfa,
        uniqueUsers: creditedUsers.size,
      });
    } catch (error) {
      console.error("Error fetching credits:", error);
      toast({
        title: "Erreur",
        description: `Impossible de charger l'historique : ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coinToFcfaRate]);

  // Filtrer selon le terme de recherche et l'origine des crédits
  const filteredEntries = allEntries.filter((entry) => {
    if (sourceFilter !== "all" && entry.source !== sourceFilter) return false;
    if (!searchTerm) return true;
    const target = entry.target_user;
    return (
      target?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      target?.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const SOURCE_FILTERS = [
    { key: "all", label: "Tous" },
    { key: "ussd", label: "USSD" },
    { key: "admin", label: "Versements équipe (Super admin / Secrétaire)" },
  ];

  useEffect(() => {
    fetchAllCredits();
  }, [fetchAllCredits]);

  // Écouter l'événement de réinitialisation
  useEffect(() => {
    const handleZoneReset = (event) => {
      console.log("Zone reset detected, refreshing credit logs", event.detail);
      fetchAllCredits();
    };
    window.addEventListener("zone-reset-completed", handleZoneReset);
    return () => window.removeEventListener("zone-reset-completed", handleZoneReset);
  }, [fetchAllCredits]);

  // Réinitialisation globale des crédits manuels seulement
  const handleResetAll = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_admin_stats_only", {
        p_admin_id: user.id,
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      toast({
        title: "Statistiques de performance réinitialisées",
        description:
          "Les statistiques de performance de l'administrateur ont été effacées. Les crédits distribués et les retraits sont conservés.",
        variant: "default",
        className: "bg-green-600 text-white",
      });
      fetchAllCredits();
    } catch (err) {
      console.error("Reset error:", err);
      toast({
        title: "Erreur",
        description: err.message || "Impossible de réinitialiser les données.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
      setResetDialogOpen(false);
    }
  };

  // Réinitialisation complète des statistiques par pays
  const handleResetCountry = (country) => {
    setSelectedCountry(country);
    setCountryResetDialogOpen(true);
  };

  const handleResetCountryConfirm = async () => {
    if (!user || !selectedCountry) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_country_stats_only", {
        p_country: selectedCountry,
        p_admin_id: user.id,
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      
      toast({
        title: "✅ Réinitialisation réussie",
        description: data.message || `Les statistiques pour ${selectedCountry} ont été réinitialisées.`,
        variant: "default",
        className: "bg-green-600 text-white",
      });
      
      fetchAllCredits();
      
      window.dispatchEvent(new CustomEvent('zone-reset-completed', {
        detail: {
          country: selectedCountry,
          resetType: 'stats_only',
          timestamp: new Date().toISOString()
        }
      }));
      
    } catch (err) {
      console.error("Reset error:", err);
      toast({
        title: "Erreur",
        description: err.message || "Impossible de réinitialiser les données.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
      setCountryResetDialogOpen(false);
      setSelectedCountry(null);
    }
  };

  // Réinitialisation globale de TOUTES les statistiques
  const handleResetAllStats = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_all_countries_stats_only", {
        p_admin_id: user.id,
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.message);
      
      toast({
        title: "✅ Réinitialisation globale réussie",
        description: data.message || "Toutes les statistiques ont été réinitialisées.",
        variant: "default",
        className: "bg-green-600 text-white",
      });
      
      fetchAllCredits();
      
      window.dispatchEvent(new CustomEvent('zone-reset-completed', {
        detail: {
          country: 'ALL',
          resetType: 'stats_only',
          timestamp: new Date().toISOString()
        }
      }));
      
    } catch (err) {
      console.error("Reset error:", err);
      toast({
        title: "Erreur",
        description: err.message || "Impossible de réinitialiser les données.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
      setResetDialogOpen(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "XOF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Card className="border-blue-500/20 shadow-lg">
        <CardHeader className="bg-blue-500/5 rounded-t-xl">
          <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl text-blue-700 dark:text-blue-400">
                <Coins className="h-6 w-6" />
                Historique global des crédits
              </CardTitle>
              <CardDescription>
                Pièces réellement créditées aux utilisateurs : packs USSD virés
                sur le compte + versements des super admins et secrétaires.
                Ventilation par pays. Les retraits et les packs pas encore
                crédités ne figurent pas ici. Valeurs affichées en francs CFA.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAllCredits}
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Rafraîchir
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setResetDialogOpen(true)}
                disabled={resetting}
                className="gap-2"
              >
                <Eraser className="w-4 h-4" />
                Réinitialiser mes stats
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleResetAllStats}
                disabled={resetting}
                className="gap-2 bg-red-700 hover:bg-red-800"
              >
                <Trash2 className="w-4 h-4" />
                Réinitialiser TOUTES les stats
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Cartes de synthèse */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Total crédité
                    </p>
                    <p className="text-2xl font-bold text-blue-900">
                      {formatCurrency(totals.creditedFCFA || 0)}
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {Number(totals.credited || 0).toLocaleString("fr-FR")} pièces
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {totals.uniqueUsers} utilisateur
                      {totals.uniqueUsers > 1 ? "s" : ""} servi
                      {totals.uniqueUsers > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="p-2 bg-blue-500 rounded-full">
                    <Coins className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-blue-200 space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-blue-700">Packs USSD</span>
                    <span className="font-semibold text-blue-900 text-right">
                      {formatCurrency(totals.ussdFcfa || 0)} ({Number(totals.ussd || 0).toLocaleString("fr-FR")} pièces)
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-blue-700">Versements équipe</span>
                    <span className="font-semibold text-blue-900 text-right">
                      {formatCurrency(totals.manualFcfa || 0)} ({Number(totals.manual || 0).toLocaleString("fr-FR")} pièces)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Valeur totale FCFA
                    </p>
                    <p className="text-2xl font-bold text-green-900">
                      {formatCurrency(totals.creditedFCFA)}
                    </p>
                  </div>
                  <div className="p-2 bg-green-500 rounded-full">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-1">
                  Taux: 1 pièce = {coinToFcfaRate} FCFA
                </p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-800">
                      Pays concernés
                    </p>
                    <p className="text-2xl font-bold text-purple-900">
                      {countryTotals.filter((c) => c.country !== "Inconnu").length}
                    </p>
                  </div>
                  <div className="p-2 bg-purple-500 rounded-full">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                </div>
                {countryTotals.some((c) => c.country === "Inconnu") && (
                  <p className="text-xs text-purple-700 mt-1">
                    + {countryTotals.find((c) => c.country === "Inconnu").count}{" "}
                    crédit(s) sans pays renseigné
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Dépenses participations (événements)
                    </p>
                    <p className="text-2xl font-bold text-amber-900">
                      {formatCurrency(totals.spentFcfa || 0)}
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      {Number(totals.spent || 0).toLocaleString("fr-FR")} pièces débitées
                    </p>
                    <p className="text-[11px] text-amber-700/90 mt-1">
                      Votes, location de stands, tombola et achats de billets
                    </p>
                  </div>
                  <div className="p-2 bg-amber-500 rounded-full">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Détail par canal de distribution */}
          <Card className="mb-6 border-amber-500/20">
            <CardHeader className="bg-amber-500/5 rounded-t-xl py-3">
              <CardTitle className="text-base text-amber-700 dark:text-amber-400">
                Crédits distribués par canal (FCFA)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
                  <p className="text-sm font-medium text-amber-800">
                    Packs achetés par USSD
                  </p>
                  <p className="text-xl font-bold text-amber-900">
                    {formatCurrency(totals.ussdFcfa || 0)}
                  </p>
                  <p className="text-sm text-amber-700">
                    {Number(totals.ussd || 0).toLocaleString("fr-FR")} pièces
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Mobile money (USSD)
                  </p>
                  {Number(totals.ussdUncredited || 0) > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      + {formatCurrency(Number(totals.ussdUncredited || 0) * coinToFcfaRate)} ({Number(totals.ussdUncredited || 0).toLocaleString("fr-FR")} pièces) payés mais pas encore virés (dont{" "}
                      {formatCurrency(Number(totals.ussdPending || 0) * coinToFcfaRate)} / {Number(totals.ussdPending || 0).toLocaleString("fr-FR")} pièces en attente), non comptés
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
                  <p className="text-sm font-medium text-blue-800">
                    Versements par l'équipe
                  </p>
                  <p className="text-xl font-bold text-blue-900">
                    {formatCurrency(totals.manualFcfa || 0)}
                  </p>
                  <p className="text-sm text-blue-700">
                    {Number(totals.manual || 0).toLocaleString("fr-FR")} pièces
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Super admin et secrétaire
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tableau récapitulatif par pays AVEC BOUTONS DE RÉINITIALISATION */}
          {countryTotals.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">
                Répartition par pays
              </h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pays</TableHead>
                      <TableHead className="text-right">Nb crédits</TableHead>
                      <TableHead className="text-right">Total crédité (FCFA)</TableHead>
                      <TableHead className="text-right">USSD (FCFA)</TableHead>
                      <TableHead className="text-right">Versements équipe (FCFA)</TableHead>
                      <TableHead className="text-right">Dépensées (FCFA)</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countryTotals.map((country) => {
                      const totalFcfa = Number(country.ussdFcfa || 0) + Number(country.manualFcfa ?? Number(country.manual || 0) * coinToFcfaRate);
                      const spentFcfa = Number(country.spentFcfa ?? Number(country.spent || 0) * coinToFcfaRate);
                      return (
                        <TableRow key={country.country}>
                          <TableCell className="font-medium">
                            {country.country}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(country.count || 0)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            <div>{formatCurrency(totalFcfa)}</div>
                            <div className="text-xs font-normal text-muted-foreground">
                              {Number(country.totalCoins || 0).toLocaleString("fr-FR")} pièces
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-amber-700">
                            <div>{formatCurrency(Number(country.ussdFcfa || 0))}</div>
                            <div className="text-xs text-muted-foreground">
                              {Number(country.ussd || 0).toLocaleString("fr-FR")} pièces
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-blue-700">
                            <div>{formatCurrency(Number(country.manualFcfa ?? Number(country.manual || 0) * coinToFcfaRate))}</div>
                            <div className="text-xs text-muted-foreground">
                              {Number(country.manual || 0).toLocaleString("fr-FR")} pièces
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-purple-700">
                            <div>{formatCurrency(spentFcfa)}</div>
                            <div className="text-xs text-muted-foreground">
                              {Number(country.spent || 0).toLocaleString("fr-FR")} pièces
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResetCountry(country.country)}
                              className="text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                              disabled={resetting}
                            >
                              <Eraser className="w-4 h-4 mr-1" />
                              Réinitialiser
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {SOURCE_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={sourceFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setSourceFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Barre de recherche */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou email d'utilisateur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Tableau détaillé des crédits */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12">
              <Loader2 className="animate-spin text-primary w-10 h-10 mb-4" />
              <p className="text-muted-foreground">
                Chargement de l'historique...
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">
                      Utilisateur
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Pays / Ville
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Montant (pièces)
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Valeur FCFA
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Source</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Crédité par
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-12 text-muted-foreground"
                      >
                        <Coins className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg font-medium mb-2">
                          Aucun crédit trouvé
                        </p>
                        <p className="text-sm">
                          {searchTerm
                            ? `Aucun résultat pour "${searchTerm}"`
                            : "Aucun crédit distribué dans l'historique global"}
                        </p>
                        {searchTerm && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSearchTerm("")}
                            className="mt-2"
                          >
                            Effacer la recherche
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => {
                      const coinAmount = entry.details?.amount || 0;
                      // Pour les packs, on affiche l'argent réellement payé ;
                      // pour les versements manuels, la valeur de référence.
                      const fcfaValue = entry.source === "admin"
                        ? coinAmount * coinToFcfaRate
                        : entry.details?.amount_fcfa || 0;
                      const userLocation = `${entry.target_user?.city || "N/A"}, ${
                        entry.target_user?.country || "Inconnu"
                      }`;
                      const sourceLabel =
                        entry.source === "admin"
                          ? "Versement équipe (Super admin / Secrétaire)"
                          : "USSD";
                      const sourceClass =
                        entry.source === "admin"
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-amber-600 hover:bg-amber-700";

                      return (
                        <TableRow
                          key={entry.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <TableCell>
                            <p className="font-semibold">
                              {entry.target_user?.full_name ||
                                "Utilisateur inconnu"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {entry.target_user?.email}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{userLocation}</p>
                          </TableCell>
                          <TableCell className="text-green-600 font-semibold whitespace-nowrap">
                            {formatCurrency(fcfaValue)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-amber-700">
                              <span>{Number(coinAmount || 0).toLocaleString("fr-FR")}</span>
                              <Coins className="w-4 h-4 flex-shrink-0" />
                              <span className="text-xs text-muted-foreground">pièces</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={entry.source === "admin" ? "default" : "secondary"}
                              className={sourceClass}
                            >
                              {sourceLabel}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.source === "admin" ? (
                              <>
                                <p className="font-medium">{entry.actor?.full_name || "Équipe"}</p>
                                <Badge
                                  variant="outline"
                                  className="text-xs capitalize mt-1"
                                >
                                  {entry.actor?.user_type === "super_admin"
                                    ? "Super admin"
                                    : entry.actor?.user_type === "secretary"
                                      ? "Secrétaire"
                                      : entry.actor?.user_type?.replace("_", " ") || "Équipe"}
                                </Badge>
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Mobile money (USSD)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex flex-col">
                              <span>
                                {new Date(entry.created_at).toLocaleDateString(
                                  "fr-FR"
                                )}
                              </span>
                              <span className="text-xs">
                                {new Date(entry.created_at).toLocaleTimeString(
                                  "fr-FR",
                                  { hour: "2-digit", minute: "2-digit" }
                                )}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredEntries.length > 0 && !loading && (
            <div className="mt-4 pt-4 border-t text-sm text-muted-foreground text-center">
              <p>
                Affichage de {filteredEntries.length} crédit
                {filteredEntries.length > 1 ? "s" : ""}
                {searchTerm && ` pour "${searchTerm}"`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <ZoneResetManager />

      {/* Dialogue pour réinitialiser les crédits manuels seulement */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation de réinitialisation</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action efface les statistiques de performance de votre
              compte administrateur. Elle ne supprime ni les crédits distribués
              (USSD et versements équipe), ni les retraits. Voulez-vous
              continuer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetAll} disabled={resetting} className="bg-red-600 hover:bg-red-700">
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Oui, réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogue pour réinitialiser les statistiques par pays */}
      <AlertDialog open={countryResetDialogOpen} onOpenChange={setCountryResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation de réinitialisation par pays</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de réinitialiser TOUTES les statistiques pour le pays : 
              <span className="font-bold text-destructive block mt-2 text-lg">
                {selectedCountry}
              </span>
              <br />
              <br />
              Cette action supprimera :
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Les statistiques de performance pour ce pays</li>
              </ul>
              <br />
              <span className="text-green-600 font-semibold">
                ✓ Crédits, paiements et retraits ne sont PAS supprimés
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResetCountryConfirm} 
              disabled={resetting} 
              className="bg-orange-600 hover:bg-orange-700"
            >
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Oui, réinitialiser les stats
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCreditsGlobalTab;
