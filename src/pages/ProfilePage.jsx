import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import {
  Loader2,
  Clock,
  Wallet,
  Percent,
  AlertCircle,
  Coins,
  ArrowRight,
  LogIn,
  Lock,
  Ticket,
} from "lucide-react";

import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileStats from "@/components/profile/ProfileStats";
import ProfilePageContent from "@/components/profile/ProfilePageContent";
import TransferModal from "@/components/profile/TransferModal";
import CoinTransferModal from "@/components/profile/CoinTransferModal";
import TransferHistory from "@/components/profile/TransferHistory";
import PinVerificationModal from "@/components/common/PinVerificationModal";
import { useWalletSecurity } from "@/hooks/useWalletSecurity";

import { supabase } from "@/lib/customSupabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { fetchWithRetry } from "@/lib/utils";
import { COIN_TO_FCFA_RATE } from "@/constants/coinRates";
import MyTicketsTab from "@/components/profile/MyTicketsTab";

const ProfilePage = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading, session } = useAuth();
  const { userProfile, getEvents, forceRefreshUserProfile } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [userEvents, setUserEvents] = useState([]);
  const [userTransactions, setUserTransactions] = useState([]);
  const [totalPending, setTotalPending] = useState(0);
  const [recentEarnings, setRecentEarnings] = useState([]);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [coinTransferModalOpen, setCoinTransferModalOpen] = useState(false);

  const [isPageLoading, setIsPageLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState(0);

  const activeTab = searchParams.get("tab") || "events";
  const paymentStatus = searchParams.get("payment");
  const orderId = searchParams.get("order");

  // 🔥 DÉTECTER SI C'EST UN PAIEMENT SANS COMPTE
  const isGuestPayment = paymentStatus === 'success' && orderId;

  // Session invité persistée localement (dont billets USSD "sans compte")
  const hasLocalGuestSession = () => {
    try {
      return (JSON.parse(localStorage.getItem('guest_tickets') || '[]').length > 0);
    } catch (e) {
      return false;
    }
  };
  const showGuestView = !user && (isGuestPayment || hasLocalGuestSession());

  // Intégration globale de la sécurité portefeuille
  const {
    isWalletUnlocked,
    showPinModal,
    openPinModal,
    closePinModal,
    unlockWallet,
  } = useWalletSecurity(user?.id);

  // 🔥 MODIFICATION: Ne pas rediriger si c'est un paiement invité
  useEffect(() => {
    // Vérifier si c'est un paiement invité
    if (isGuestPayment && !user) {
      const pendingPayment = localStorage.getItem('pending_ticket_payment');
      if (pendingPayment) {
        try {
          const paymentData = JSON.parse(pendingPayment);
          if (paymentData.isGuest) {
            // ✅ C'est un invité, NE PAS REDIRIGER
            console.log('👤 Invité détecté, affichage des tickets sans connexion');
            return;
          }
        } catch (e) {
          console.error('Erreur lecture pending payment:', e);
        }
      }
    }

    // Redirection uniquement si pas de session ET pas de paiement invité ET pas de session invite locale
    if (!authLoading && (!user || !session) && !isGuestPayment && !hasLocalGuestSession()) {
      const timer = setTimeout(() => {
        navigate("/auth?redirect=/profile");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, session, authLoading, navigate, isGuestPayment]);

  /* ===================== GAINS EN ATTENTE ===================== */
  const fetchAllEventEarnings = useCallback(async () => {
    if (!user || !session) return;

    try {
      // On récupère le détail des gains récents : la `description` porte le
      // détail d'une vente avec code promo (prix plein / remise / montant net),
      // ce qui explique à l'organisateur d'où vient la différence.
      const { data, error } = await fetchWithRetry(() =>
        supabase
          .from("organizer_earnings")
          .select(
            "id, earnings_coins, earnings_fcfa, amount_pi, platform_commission, transaction_type, earning_type, description, status, created_at"
          )
          .eq("organizer_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20)
      );

      if (error) throw error;

      const rows = data || [];
      const total = rows
        .filter((item) => (item.status || "pending") === "pending")
        .reduce((sum, item) => sum + Number(item.earnings_coins || 0), 0);
      setTotalPending(total);
      setRecentEarnings(rows);
    } catch (err) {
      console.error("[ProfilePage] Error fetching earnings:", err);
      setTotalPending(0);
      setRecentEarnings([]);
    }
  }, [user, session]);

  /* ===================== PAGE DATA ===================== */
  const fetchPageData = useCallback(async () => {
    if (!user || !session) return;

    setIsPageLoading(true);

    try {
      const [eventsRes, transRes] = await Promise.all([
        getEvents({ organizer_id: user.id }),
        fetchWithRetry(() =>
          supabase
            .from("transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50)
        ),
      ]);

      if (transRes.error)
        console.error("Transaction fetch error:", transRes.error);
      setUserTransactions(transRes.data || []);
      setUserEvents(eventsRes || []);
    } catch (e) {
      console.error("Critical Error:", e);
      setUserEvents([]);
      setUserTransactions([]);
    } finally {
      setIsPageLoading(false);
    }
  }, [user, session, getEvents]);

  useEffect(() => {
    if (!authLoading && user && session) {
      fetchAllEventEarnings();
      fetchPageData();
    }
  }, [authLoading, user, session, fetchAllEventEarnings, fetchPageData]);

  const handleGlobalRefresh = async () => {
    if (!user) return;
    await Promise.all([
      forceRefreshUserProfile(),
      fetchAllEventEarnings(),
      fetchPageData(),
    ]);
    setRefreshHistoryTrigger((prev) => prev + 1);
  };

  /* ===================== TRANSFERT EARNINGS -> AVAILABLE ===================== */
  const confirmTransfer = async () => {
    if (!user || !session) {
      toast({
        title: t('profile.toast.error'),
        description: t('profile.toast.sessionExpired'),
        variant: "destructive",
      });
      return;
    }

    setTransferring(true);
    try {
      const { data, error } = await supabase.rpc(
        "transfer_pending_earnings_to_available",
        {
          p_user_id: user.id,
        }
      );

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.message || t('profile.toast.error'));
      }

      toast({
        title: t('profile.toast.transferSuccess'),
        description: t('profile.toast.transferDetails', {
          gross: data.total_gross,
          fee: data.platform_fee,
          net: data.total_net,
        }),
        className: "bg-green-600 text-white",
      });

      await handleGlobalRefresh();
      setTransferModalOpen(false);
    } catch (err) {
      console.error("Transfer error:", err);
      toast({
        title: t('profile.toast.error'),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setTransferring(false);
    }
  };

  // 🔥 SI INVITÉ (sans compte) : AFFICHER DIRECTEMENT LES BILLETS STOCKÉS
  if (showGuestView) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
              Retour
            </Button>
            <Button variant="outline" onClick={() => navigate('/auth?redirect=/profile?tab=tickets&claim=guest')}>
              <LogIn className="w-4 h-4 mr-2" />
              Créer un compte
            </Button>
          </div>
          <MyTicketsTab isGuestView={true} />
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin w-10 h-10" />
      </div>
    );
  }

  // Affichage si non connecté (Fallback)
  if (!user || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold">{t('profile.notLoggedIn.title')}</h1>
          <p className="text-muted-foreground">
            {t('profile.notLoggedIn.description')}
          </p>
          <Button onClick={() => navigate("/auth")} className="w-full">
            <LogIn className="mr-2 h-4 w-4" /> {t('profile.notLoggedIn.loginButton')}
          </Button>
        </div>
      </div>
    );
  }

  const pendingFee = Math.ceil(totalPending * 0.05);
  const pendingNet = totalPending - pendingFee;
  const balanceCfa = (userProfile?.coin_balance || 0) * COIN_TO_FCFA_RATE;

  // 🔥 SI L'UTILISATEUR EST CONNECTÉ MAIS VEUT VOIR SES TICKETS
  if (activeTab === 'tickets') {
    return (
      <div className="min-h-screen pb-20">
        <Helmet>
          <title>{userProfile?.full_name || t('profile.helmet.title')}</title>
        </Helmet>
        <main className="max-w-7xl mx-auto px-4 py-8">
          <ProfileHeader user={userProfile} />
          <div className="mt-6">
            <MyTicketsTab isGuestView={false} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <Helmet>
        <title>{userProfile?.full_name || t('profile.helmet.title')}</title>
      </Helmet>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ProfileHeader user={userProfile} />
        <ProfileStats
          userProfile={userProfile}
          eventCount={userEvents.length}
        />

        {/* --- SECTION SOLDE PIÈCES --- */}
        <Card className="mt-6 border-l-4 border-l-blue-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold flex items-center gap-2 text-blue-900">
              <Coins className="w-6 h-6 text-blue-600" />
              {t('profile.balance.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                {isWalletUnlocked ? (
                  <>
                    <div className="text-3xl font-extrabold text-blue-700">
                      {userProfile?.coin_balance || 0}{" "}
                      <span className="text-lg text-blue-500">{t('profile.balance.coins')}</span>
                    </div>
                    <p className="text-sm font-semibold text-blue-600">
                      {t('profile.balance.approx', { balance: balanceCfa.toLocaleString() })}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('profile.balance.description')}
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col justify-center h-full">
                    <div className="text-3xl font-extrabold text-blue-700 flex items-center gap-2">
                      <Lock className="w-6 h-6" /> {t('profile.balance.locked')}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {t('profile.balance.lockedDescription')}
                    </p>
                  </div>
                )}
              </div>

              {!isWalletUnlocked ? (
                <Button
                  onClick={openPinModal}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
                >
                  <Lock className="w-4 h-4 mr-2" /> {t('profile.balance.unlockButton')}
                </Button>
              ) : (
                userProfile?.coin_balance > 0 && (
                  <Button
                    onClick={() => setCoinTransferModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200"
                  >
                    {t('profile.balance.transferButton')}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* --- SECTION GAINS EN ATTENTE (ORGANISATEUR) --- */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Clock /> {t('profile.pendingEarnings.title')}
              </h2>
              <Badge variant="outline" className="flex items-center gap-1">
                <Percent className="w-3 h-3" /> {t('profile.pendingEarnings.feeLabel')}
              </Badge>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center text-sm sm:text-base">
                <span className="text-gray-500">{t('profile.pendingEarnings.totalPending')}</span>
                <span className="font-bold">
                  {isWalletUnlocked
                    ? `${totalPending} ${t('profile.balance.coins')} (${(totalPending * COIN_TO_FCFA_RATE).toLocaleString()} F)`
                    : t('profile.balance.locked')}
                </span>
              </div>
              <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="text-gray-600 font-medium">
                  {t('profile.pendingEarnings.netReceivable')}
                </span>
                <span className="text-2xl font-bold text-green-600">
                  {isWalletUnlocked
                    ? `${pendingNet} ${t('profile.balance.coins')} (${(pendingNet * COIN_TO_FCFA_RATE).toLocaleString()} F)`
                    : t('profile.balance.locked')}
                </span>
              </div>
            </div>

            {!isWalletUnlocked ? (
              <Button
                onClick={openPinModal}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Lock className="w-4 h-4 mr-2" /> {t('profile.pendingEarnings.unlockToTransfer')}
              </Button>
            ) : (
              <Button
                onClick={() => setTransferModalOpen(true)}
                disabled={!totalPending || totalPending <= 0 || transferring}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white"
              >
                {transferring ? (
                  <Loader2 className="animate-spin mr-2" />
                ) : (
                  <Wallet className="mr-2" />
                )}
                {totalPending > 0
                  ? t('profile.pendingEarnings.transferButton')
                  : t('profile.pendingEarnings.noEarnings')}
              </Button>
            )}

            {isWalletUnlocked && totalPending === 0 && (
              <Alert className="mt-4 bg-gray-50 border-gray-200">
                <AlertCircle className="h-4 w-4 text-gray-400" />
                <AlertTitle className="text-gray-600">
                  {t('profile.pendingEarnings.noEarnings')}
                </AlertTitle>
                <AlertDescription className="text-gray-500">
                  {t('profile.pendingEarnings.noEarningsDescription')}
                </AlertDescription>
              </Alert>
            )}

            {/* --- DÉTAIL DES GAINS (remise code promo incluse) --- */}
            {isWalletUnlocked && recentEarnings.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Détail des gains
                </p>
                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recentEarnings.map((e) => (
                    <li
                      key={e.id}
                      className="p-3 rounded-lg border border-gray-100 bg-gray-50/60 text-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-gray-700 font-medium break-words">
                            {e.description || "Gain"}
                          </p>
                          {e.created_at && (
                            <p className="text-gray-400 mt-0.5">
                              {new Date(e.created_at).toLocaleString("fr-FR")}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-green-600">
                            +{Number(e.earnings_coins || 0)}{" "}
                            {t('profile.balance.coins')}
                          </p>
                          <p className="text-gray-400">
                            {Number(e.earnings_fcfa || 0).toLocaleString("fr-FR")} F
                          </p>
                        </div>
                      </div>
                      {Number(e.platform_commission || 0) > 0 && (
                        <p className="text-gray-400 mt-1">
                          Frais plateforme : −
                          {Number(e.platform_commission || 0).toLocaleString("fr-FR")}{" "}
                          {t('profile.balance.coins')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* --- HISTORIQUE DES TRANSFERTS --- */}
        <TransferHistory refreshTrigger={refreshHistoryTrigger} />

        {/* --- RESTE DU CONTENU --- */}
        <div className="mt-8">
          <ProfilePageContent
            userProfile={userProfile}
            userEvents={userEvents}
            userTransactions={userTransactions}
            activeTab={activeTab}
          />
        </div>
      </main>

      <TransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        totalAmount={totalPending}
        totalNetAmount={pendingNet}
        loading={transferring}
        onConfirm={confirmTransfer}
        exchangeRate={COIN_TO_FCFA_RATE}
      />

      <CoinTransferModal
        isOpen={coinTransferModalOpen}
        onClose={() => setCoinTransferModalOpen(false)}
        balance={userProfile?.coin_balance || 0}
        onSuccess={handleGlobalRefresh}
      />

      <PinVerificationModal
        isOpen={showPinModal}
        onClose={closePinModal}
        onSuccess={unlockWallet}
        userId={user?.id}
        userProfile={userProfile}
      />
    </div>
  );
};

export default React.memo(ProfilePage);