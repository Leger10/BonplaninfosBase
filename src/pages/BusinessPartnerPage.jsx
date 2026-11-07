import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, TrendingUp, Wallet, Percent, ArrowLeft, HeartHandshake } from 'lucide-react';

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

const Stat = ({ icon: Icon, label, value, sub }) => (
  <Card>
    <CardContent className="pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
        </div>
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function BusinessPartnerPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!user?.id) { setLoading(false); return; }
      setLoading(true);
      setError('');
      const { data: res, error: err } = await supabase.rpc('get_business_partner_dashboard', { p_user_id: user.id });
      if (!alive) return;
      if (err) setError(err.message || 'Erreur de chargement');
      else if (res && res.success === false) setError(res.message || 'Erreur');
      else setData(res?.data || res);
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [user?.id]);

  const totals = data?.totals || {};
  const settings = data?.settings || {};

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-4">
          <HeartHandshake className="h-10 w-10 mx-auto text-primary" />
          <p>Connectez-vous pour accéder à votre espace partenaire d'affaires.</p>
          <Button asChild><Link to="/auth">Se connecter</Link></Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      <Helmet><title>Partenaire d'affaires | BonPlanInfos</title></Helmet>
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild><Link to="/profile"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><HeartHandshake className="h-6 w-6 text-primary" /> Partenaire d'affaires</h1>
              <p className="text-sm text-muted-foreground">Suivez vos filleuls (organisateurs invités), leurs performances, et vos commissions créditées dans vos gains après retrait de leurs fonds.</p>
            </div>
          </div>
          {settings.business_partner_commission_percentage != null && (
            <Badge variant="secondary" className="text-sm">Commission: {settings.business_partner_commission_percentage}% des frais retenus (appliquée sur frais transfert + frais retrait de l’organisateur)</Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement...</div>
        ) : error ? (
          <Card><CardContent className="pt-6 text-red-600">{error}</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon={Users} label="Organisateurs invités" value={fmt(totals.organizers)} sub={`${fmt(totals.events)} événement(s)`} />
              <Stat icon={TrendingUp} label="Participations" value={fmt(totals.participations)} sub={`sur leurs événements`} />
              <Stat icon={Percent} label="Revenus plateforme (frais)" value={`${fmt(totals.platform_revenue_coins)} π`} sub={`Transfert ${fmt(totals.transfer_fees_coins)} π + Retrait ${fmt(totals.withdrawal_fees_coins)} π`} />
              <Stat icon={Wallet} label="Vos commissions (gains)" value={`${fmt(totals.ledger_commission_coins ?? totals.partner_commission_coins)} π`} sub="Créditées dans vos gains (frais retrait applicables si vous retirez)" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Statistiques de vos filleuls</CardTitle>
                <CardDescription>
                  Votre % ({settings.business_partner_commission_percentage ?? 0}%) s’applique sur les gains plateforme retenus sur chaque filleul : frais transfert portefeuille ({settings.platform_fee_percentage ?? 5}%) + frais retrait ({settings.withdrawal_fee_percentage ?? 5}%). Les commissions sont créditées dans vos gains après le retrait des fonds par le filleul.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!(data?.organizers || []).length ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Aucun organisateur invité pour le moment.</p>
                    <p className="text-sm mt-1">Partagez votre code/lien de parrainage : les organisateurs qui s'inscrivent avec votre parrainage (profiles.referred_by) apparaîtront ici avec leurs statistiques (participations, chiffres d’affaires indicatifs, retraits, frais retenus, vos commissions).</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Filleul (organisateur)</th>
                          <th className="py-2 pr-3 font-medium">Événements</th>
                          <th className="py-2 pr-3 font-medium">Participations</th>
                          <th className="py-2 pr-3 font-medium">Retiré par le filleul</th>
                          <th className="py-2 pr-3 font-medium">Frais transfert</th>
                          <th className="py-2 pr-3 font-medium">Frais retrait</th>
                          <th className="py-2 pr-3 font-medium">Total frais (plateforme)</th>
                          <th className="py-2 pr-0 font-medium">Votre commission (gains)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.organizers || []).map((row) => {
                          const o = row.organizer || {};
                          const s = row.stats || {};
                          return (
                            <tr key={o.id} className="border-b last:border-0">
                              <td className="py-3 pr-3">
                                <div className="font-medium">{o.full_name || o.email || o.id}</div>
                                {o.email ? <div className="text-xs text-muted-foreground">{o.email}</div> : null}
                              </td>
                              <td className="py-3 pr-3">{fmt(s.events_count)}</td>
                              <td className="py-3 pr-3">{fmt(s.participations_count)}</td>
                              <td className="py-3 pr-3">{fmt(s.withdrawn_coins)} π</td>
                              <td className="py-3 pr-3">{fmt(s.transfer_fees_coins)} π</td>
                              <td className="py-3 pr-3">{fmt(s.withdrawal_fees_coins)} π</td>
                              <td className="py-3 pr-3 font-medium">{fmt(s.platform_revenue_coins)} π</td>
                              <td className="py-3 pr-0"><Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">+{fmt(s.partner_commission_coins)} π</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
