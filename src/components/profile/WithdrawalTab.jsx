import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, History, RefreshCw, AlertCircle, TrendingDown, CalendarClock, Ticket, Vote, Store, Trophy, ArrowUpRight, Wallet, PieChart, Users, Lock, Unlock, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import WithdrawalModal from '@/components/common/WithdrawalModal';
import { formatCurrency } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const WithdrawalTab = () => {
  const { user } = useAuth();
  const { appSettings } = useData();
  const { t } = useTranslation();
  
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [withdrawalHistory, setWithdrawalHistory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [balances, setBalances] = useState({
    event: 0,
    pool: 0,
    total: 0
  });

  const [withdrawalConfig, setWithdrawalConfig] = useState({ withdrawal_dates: [] });
  const [isPoolWithdrawalOpen, setIsPoolWithdrawalOpen] = useState(false);

  const minWithdrawal = appSettings?.min_withdrawal_pi || 50;
  const rate = appSettings?.coin_to_fcfa_rate || 10;

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);

    try {
      // 1. Fetch Balances using the new SQL function
      const { data: balanceData, error: balanceError } = await supabase.rpc('get_withdrawable_balances', {
        p_organizer_id: user.id
      });

      if (!balanceError && balanceData) {
        setBalances({
            event: balanceData.event_balance || 0,
            pool: balanceData.pool_balance || 0,
            total: balanceData.total_balance || 0
        });
      }

      // 2. Fetch Config
      const { data: config } = await supabase.from('admin_withdrawal_config').select('withdrawal_dates').limit(1).maybeSingle();
      if (config) {
          setWithdrawalConfig(config);
          const today = new Date().getDate();
          setIsPoolWithdrawalOpen(config.withdrawal_dates?.includes(today));
      }

      // 3. Fetch History
      const { data: history, error: historyError } = await supabase
        .from('organizer_withdrawal_requests')
        .select('*')
        .eq('organizer_id', user.id)
        .order('requested_at', { ascending: false });

      if (historyError) throw historyError;
      setWithdrawalHistory(history || []);

    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('financial_updates_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_earnings', filter: `organizer_id=eq.${user.id}` }, () => fetchData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_withdrawal_requests', filter: `organizer_id=eq.${user.id}` }, () => fetchData())
        .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, user.id]);

  const StatCard = ({ icon: Icon, title, value, colorClass, bgClass, description, restricted, open }) => (
    <div className={`p-4 rounded-xl border flex items-center gap-4 ${bgClass} ${colorClass.replace('text-', 'border-').replace('600', '200')}`}>
      <div className={`p-3 rounded-full bg-white shadow-sm ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            {restricted && (
                <Badge variant="outline" className={`text-[10px] ml-2 ${open ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {open ? <Unlock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                    {open ? 'Ouvert' : 'Fermé'}
                </Badge>
            )}
        </div>
        <p className="text-xl font-bold truncate">{value.toLocaleString()} pièces <span className="text-sm font-normal text-muted-foreground">({formatCurrency(value * rate)})</span></p>
        {description && <p className="text-[10px] text-muted-foreground mt-1 truncate">{description}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Main Balance Card */}
      <Card className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white border-0 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4">
              <Wallet className="w-32 h-32" />
          </div>
          <CardContent className="p-6 md:p-8 relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                      <p className="text-emerald-100 font-medium mb-1">Total Disponible (Global)</p>
                      <h2 className="text-4xl md:text-5xl font-bold mb-2">{balances.total.toLocaleString()} pièces</h2>
                      <p className="text-emerald-50 opacity-90 text-lg">
                          ≈ {formatCurrency(balances.total * rate)}
                      </p>
                  </div>
                  <Button 
                    onClick={() => setIsModalOpen(true)} 
                    size="lg" 
                    className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold shadow-lg text-lg px-8 h-14 w-full md:w-auto"
                    disabled={balances.total < minWithdrawal}
                    title={balances.total < minWithdrawal ? t('common.limits.withdrawMinFcfa', { min: (minWithdrawal * rate).toLocaleString('fr-FR'), current: (balances.total * rate).toLocaleString('fr-FR') }) : ''}
                  >
                    <ArrowUpRight className="mr-2 h-5 w-5" /> 
                    Demander un retrait
                  </Button>
              </div>
          </CardContent>
      </Card>

      {/* Breakdown Cards */}
      <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-muted-foreground" />
              Détail des Soldes
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Event Earnings (Direct) */}
             <StatCard 
                icon={DollarSign} 
                title="Solde Événements (Direct)" 
                value={balances.event} 
                colorClass="text-emerald-600" 
                bgClass="bg-emerald-50/30" 
                description="Billetterie, Tombolas, Votes, Stands (Dispo 24/7)"
                restricted={false}
             />

             {/* Pool Earnings (Engagement) */}
             <StatCard 
                icon={PieChart} 
                title="Solde Pool (Engagement)" 
                value={balances.pool} 
                colorClass="text-indigo-600" 
                bgClass="bg-indigo-50/30" 
                description={`Vues & Bonus. Retrait uniquement le ${withdrawalConfig.withdrawal_dates?.join(', ')} du mois.`}
                restricted={true}
                open={isPoolWithdrawalOpen}
             />
          </div>
      </div>

      {/* History Section */}
      <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <History className="w-5 h-5" /> Historique des retraits
                    </CardTitle>
                    <CardDescription>Suivi de vos demandes de paiement</CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={fetchData} disabled={loadingHistory}>
                    <RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingHistory && withdrawalHistory.length === 0 ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : withdrawalHistory.length > 0 ? (
              <div className="relative overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                          <tr>
                              <th className="px-4 py-3 rounded-tl-lg">Date</th>
                              <th className="px-4 py-3">Montant</th>
                              <th className="px-4 py-3 hidden md:table-cell">Méthode</th>
                              <th className="px-4 py-3">Statut</th>
                              <th className="px-4 py-3 rounded-tr-lg hidden md:table-cell">Détails</th>
                          </tr>
                      </thead>
                      <tbody>
                          {withdrawalHistory.map((req) => (
                              <tr key={req.id} className="bg-card border-b hover:bg-muted/50 transition-colors">
                                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                                      {new Date(req.requested_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="font-bold text-base">{req.amount_pi} pièces</div>
                                      <div className="text-xs text-muted-foreground">{formatCurrency(req.amount_fcfa)}</div>
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                      <Badge variant="outline">{req.payment_details?.method || req.withdrawal_method}</Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                      <Badge variant={
                                          req.status === 'approved' || req.status === 'paid' ? 'success' : 
                                          req.status === 'rejected' ? 'destructive' : 'secondary'
                                      } className="uppercase text-[10px]">
                                          {req.status === 'approved' ? 'Validé' : 
                                          req.status === 'paid' ? 'Payé' : 
                                          req.status === 'rejected' ? 'Rejeté' : 'En attente'}
                                      </Badge>
                                  </td>
                                  <td className="px-4 py-3 hidden md:table-cell">
                                      {req.rejection_reason ? (
                                          <div className="text-xs text-red-500 max-w-[200px]">
                                              <AlertCircle className="w-3 h-3 inline mr-1" />
                                              {req.rejection_reason}
                                          </div>
                                      ) : (
                                          <span className="text-xs text-muted-foreground">-</span>
                                      )}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
                <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Aucune demande de retrait effectuée.</p>
              </div>
            )}
          </CardContent>
      </Card>

      <WithdrawalModal 
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        availableBalance={(balances.total * rate)} 
        userType="organizer"
        userId={user.id}
        onSuccess={fetchData}
      />
    </div>
  );
};

export default WithdrawalTab;