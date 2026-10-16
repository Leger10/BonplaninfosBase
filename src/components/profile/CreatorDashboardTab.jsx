import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loader2, DollarSign, Wallet, Download, TrendingUp, ArrowUpRight, Lock, Unlock, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import WithdrawalModal from '@/components/common/WithdrawalModal';
import PinVerificationModal from '@/components/common/PinVerificationModal';
import { useWalletSecurity } from '@/hooks/useWalletSecurity';
import { generateEarningsSlip } from '@/utils/pdfGenerator';
import { toast } from '@/components/ui/use-toast';
import { COIN_TO_FCFA_RATE } from '@/constants/coinRates';
import { useTranslation } from 'react-i18next';

const CreatorDashboardTab = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [isWithdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  const { 
    isWalletUnlocked, 
    showPinModal, 
    openPinModal, 
    closePinModal, 
    unlockWallet,
    failedAttempts,
    incrementFailedAttempts,
    lockAccount,
    isLocked
  } = useWalletSecurity(user?.id);

  // Charger le profil complet au démarrage
  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchData();

      const channel = supabase.channel('creator-dashboard-changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'organizer_withdrawal_requests', 
          filter: `organizer_id=eq.${user.id}` 
        }, () => {
          fetchData(false);
          fetchUserProfile(); // Recharger le profil après un changement de retrait
        })
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'profiles', 
          filter: `id=eq.${user.id}` 
        }, (payload) => {
          console.log('Profile updated:', payload);
          setUserProfile(payload.new);
        })
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  // Fonction pour récupérer le profil complet depuis Supabase
  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
      console.log('Profil chargé - available_earnings:', data?.available_earnings);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // Récupérer l'historique des retraits
      const { data: history } = await supabase
        .from('organizer_withdrawal_requests')
        .select('*')
        .eq('organizer_id', user.id)
        .order('requested_at', { ascending: false });
      setWithdrawals(history || []);
      
      // Récupérer les statistiques via RPC
      const { data: statsData } = await supabase.rpc('get_organizer_earnings_summary', { p_organizer_id: user.id });
      setStats(statsData?.data || {});

    } catch (error) {
      console.error("Error fetching creator stats:", error);
      toast({
        title: t('creatorDashboard.toast.error'),
        description: t('creatorDashboard.toast.errorLoadingStats'),
        variant: "destructive"
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // === CORRECTION : Utiliser userProfile.available_earnings pour le solde disponible ===
  const availableBalanceCoins = userProfile?.available_earnings || 0;
  const availableBalanceFcfa = availableBalanceCoins * COIN_TO_FCFA_RATE;

  const pendingNetCoins = stats?.pending?.total_net || 0;
  const pendingNetFcfa = pendingNetCoins * COIN_TO_FCFA_RATE;

  const handleWithdrawClick = () => {
    if (!isWalletUnlocked) {
      openPinModal();
    } else {
      setWithdrawalModalOpen(true);
    }
  };

  const handleDownloadSlip = async () => {
    if (!isWalletUnlocked) {
      openPinModal();
      return;
    }

    if (availableBalanceFcfa === 0) {
      toast({
        title: t('creatorDashboard.toast.noEarnings'),
        description: t('creatorDashboard.toast.noEarningsDesc'),
        variant: "warning"
      });
      return;
    }

    setDownloading(true);
    try {
      const netEarnings = availableBalanceFcfa || 0;
      const grossRevenue = Math.round(netEarnings / 0.95);
      const fees = grossRevenue - netEarnings;

      await generateEarningsSlip({
        organizerName: user?.user_metadata?.full_name || userProfile?.full_name || 'Créateur',
        totalRevenue: grossRevenue,
        fees: fees,
        netEarnings: netEarnings,
        date: new Date(),
        eventCount: stats?.creator_stats?.events_count || 0
      });

      toast({
        title: t('creatorDashboard.toast.pdfReady'),
        description: t('creatorDashboard.toast.pdfReadyDesc'),
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: t('creatorDashboard.toast.error'),
        description: t('creatorDashboard.toast.pdfError'),
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  // Fonction appelée après le succès de la vérification du PIN
  const handlePinSuccess = () => {
    unlockWallet();
    toast({
      title: t('creatorDashboard.toast.walletUnlocked'),
      description: t('creatorDashboard.toast.walletUnlockedDesc'),
    });
  };

  const handleWithdrawalSuccess = () => {
    fetchData(false);
    fetchUserProfile(); // Recharger le profil pour mettre à jour available_earnings
    toast({
      title: t('creatorDashboard.toast.withdrawalSuccess'),
      description: t('creatorDashboard.toast.withdrawalSuccessDesc'),
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Message de verrouillage si compte bloqué */}
      {isLocked && (
        <Alert className="bg-red-500/10 border-red-500/50 mb-4">
          <Lock className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">{t('creatorDashboard.lockedAlert.title')}</AlertTitle>
          <AlertDescription className="text-red-700">
            {t('creatorDashboard.lockedAlert.description')}
          </AlertDescription>
        </Alert>
      )}

      {/* Message de déverrouillage si wallet verrouillé mais compte non bloqué */}
      {!isWalletUnlocked && !isLocked && (
        <Alert className="bg-amber-500/10 border-amber-500/50 mb-4">
          <Lock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">{t('creatorDashboard.securityAlert.title')}</AlertTitle>
          <AlertDescription className="text-amber-700 flex flex-col sm:flex-row justify-between items-center gap-2">
            <span>{t('creatorDashboard.securityAlert.description')}</span>
            <Button 
              size="sm" 
              variant="outline" 
              className="bg-white border-amber-500 text-amber-700 hover:bg-amber-50" 
              onClick={openPinModal}
              disabled={isLocked}
            >
              <Unlock className="w-3 h-3 mr-1" /> {t('creatorDashboard.securityAlert.unlockButton')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Available Balance Card - CORRIGÉ avec userProfile.available_earnings */}
        <Card className="bg-gradient-to-br from-purple-600 to-indigo-800 text-white border-0 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Wallet className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2 relative z-10">
            <CardTitle className="text-lg font-medium opacity-90 flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> {t('creatorDashboard.cards.availableBalance.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-4xl font-bold mb-1">
              {isWalletUnlocked 
                ? t('creatorDashboard.cards.availableBalance.valueFcfa', { value: availableBalanceFcfa.toLocaleString() })
                : '***'} 
            </div>
            <p className="text-sm opacity-80 mb-6 font-mono">
              {isWalletUnlocked 
                ? t('creatorDashboard.cards.availableBalance.valueCoins', { value: availableBalanceCoins.toLocaleString() })
                : '(***)'}
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={handleWithdrawClick} 
                className="flex-1 bg-white text-indigo-800 hover:bg-indigo-50 font-bold shadow-sm"
                disabled={!isWalletUnlocked || (isWalletUnlocked && availableBalanceFcfa < 500) || isLocked}
                title={
                  !isWalletUnlocked
                    ? t('creatorDashboard.cards.availableBalance.disabledTooltip')
                    : availableBalanceFcfa < 500
                      ? t('common.limits.withdrawMinFcfa', { min: 500, current: availableBalanceFcfa.toLocaleString('fr-FR') })
                      : ''
                }
              >
                {!isWalletUnlocked && <Lock className="w-3 h-3 mr-2 text-indigo-400" />}
                <ArrowUpRight className="mr-2 h-4 w-4" /> {t('creatorDashboard.cards.availableBalance.withdrawButton')}
              </Button>
              <Button 
                variant="outline"
                className="bg-indigo-700/50 border-indigo-500 text-white hover:bg-indigo-600 flex items-center gap-2"
                onClick={handleDownloadSlip}
                disabled={downloading || !isWalletUnlocked || (isWalletUnlocked && availableBalanceFcfa === 0) || isLocked}
                title={!isWalletUnlocked ? t('creatorDashboard.cards.availableBalance.disabledTooltip') : ''}
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">{t('creatorDashboard.cards.availableBalance.downloadButton')}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pending Balance Card */}
        <Card className="bg-gradient-to-br from-amber-400 to-orange-500 text-white border-0 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <TrendingUp className="w-20 h-20" />
          </div>
          <CardHeader className="pb-2 relative z-10">
            <CardTitle className="text-lg font-medium text-white/90 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> {t('creatorDashboard.cards.pendingEarnings.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold text-white mb-1">
              {isWalletUnlocked 
                ? t('creatorDashboard.cards.pendingEarnings.valueFcfa', { value: pendingNetFcfa.toLocaleString() })
                : '***'}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="bg-white/20 px-3 py-1 rounded-full">
                <p className="text-sm font-mono text-white">
                  {isWalletUnlocked 
                    ? t('creatorDashboard.cards.pendingEarnings.valueCoins', { value: pendingNetCoins.toLocaleString() })
                    : '***'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Stats - CORRIGÉ avec les données du profil */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-medium text-gray-600 flex items-center gap-2">
              <Eye className="w-5 h-5" /> {t('creatorDashboard.cards.overview.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-sm text-gray-500">{t('creatorDashboard.cards.overview.totalEarned')}</span>
                <span className="font-bold text-green-600">
                  {isWalletUnlocked 
                    ? t('creatorDashboard.cards.availableBalance.valueFcfa', { 
                        value: ((userProfile?.total_earnings || 0) * COIN_TO_FCFA_RATE).toLocaleString() 
                      })
                    : '*** F'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">{t('creatorDashboard.cards.overview.totalWithdrawn')}</span>
                <span className="font-bold text-blue-600">
                  {isWalletUnlocked 
                    ? t('creatorDashboard.cards.availableBalance.valueFcfa', { 
                        value: (((userProfile?.total_earnings || 0) - (userProfile?.available_earnings || 0)) * COIN_TO_FCFA_RATE).toLocaleString() 
                      })
                    : '*** F'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-gray-500">{t('creatorDashboard.cards.overview.availableNow')}</span>
                <span className="font-bold text-purple-600">
                  {isWalletUnlocked 
                    ? t('creatorDashboard.cards.availableBalance.valueFcfa', { value: availableBalanceFcfa.toLocaleString() })
                    : '*** F'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card className="relative overflow-hidden">
        {!isWalletUnlocked && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-4 text-center">
            <Lock className="w-10 h-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm font-medium text-muted-foreground mb-4">{t('creatorDashboard.withdrawalHistory.hiddenMessage')}</p>
            <Button size="sm" variant="outline" onClick={openPinModal} disabled={isLocked}>
              {t('creatorDashboard.withdrawalHistory.unlockButton')}
            </Button>
          </div>
        )}
        <CardHeader>
          <CardTitle>{t('creatorDashboard.withdrawalHistory.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('creatorDashboard.withdrawalHistory.table.date')}</TableHead>
                <TableHead>{t('creatorDashboard.withdrawalHistory.table.gross')}</TableHead>
                <TableHead>{t('creatorDashboard.withdrawalHistory.table.fee')}</TableHead>
                <TableHead>{t('creatorDashboard.withdrawalHistory.table.net')}</TableHead>
                <TableHead>{t('creatorDashboard.withdrawalHistory.table.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t('creatorDashboard.withdrawalHistory.emptyMessage')}
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((req) => {
                  const gross = req.amount_fcfa || 0;
                  const fees = req.fees || Math.floor(gross * 0.05);
                  const net = req.net_amount || (gross - fees);
                  
                  // Déterminer le libellé du statut en français selon la valeur
                  let statusLabel = '';
                  if (req.status === 'paid') statusLabel = t('creatorDashboard.withdrawalHistory.status.paid');
                  else if (req.status === 'approved') statusLabel = t('creatorDashboard.withdrawalHistory.status.approved');
                  else if (req.status === 'rejected') statusLabel = t('creatorDashboard.withdrawalHistory.status.rejected');
                  else statusLabel = t('creatorDashboard.withdrawalHistory.status.pending');

                  const variant = 
                    req.status === 'paid' || req.status === 'approved' ? 'success' : 
                    req.status === 'rejected' ? 'destructive' : 'secondary';

                  return (
                    <TableRow key={req.id}>
                      <TableCell>{format(new Date(req.requested_at), 'dd MMM yyyy HH:mm', { locale: fr })}</TableCell>
                      <TableCell>{gross.toLocaleString()} F</TableCell>
                      <TableCell className="text-red-500">-{fees.toLocaleString()} F</TableCell>
                      <TableCell className="font-bold text-emerald-600">{net.toLocaleString()} F</TableCell>
                      <TableCell>
                        <Badge variant={variant}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <WithdrawalModal 
        open={isWithdrawalModalOpen} 
        onOpenChange={setWithdrawalModalOpen}
        availableBalance={availableBalanceFcfa}
        userType="creator"
        userId={user?.id}
        onSuccess={handleWithdrawalSuccess}
      />

      <PinVerificationModal 
        isOpen={showPinModal}
        onClose={closePinModal}
        onSuccess={handlePinSuccess}
        userId={user?.id}
        userProfile={userProfile}
        failedAttempts={failedAttempts}
        onIncrementFailed={incrementFailedAttempts}
        onLockAccount={lockAccount}
      />
    </div>
  );
};

export default CreatorDashboardTab;