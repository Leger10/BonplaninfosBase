import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  Banknote,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/customSupabaseClient";

const nf = new Intl.NumberFormat("fr-FR");
const fmtFcfa = (value) => `${nf.format(Math.round(Number(value) || 0))} FCFA`;
const fmtCompact = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)} M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} k`;
  return nf.format(n);
};

const pad = (n) => String(n).padStart(2, "0");
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const currentMonthKey = () => monthKey(new Date());
const monthLabel = (key) => {
  if (!/^\d{4}-\d{2}$/.test(String(key || ""))) return key;
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
  const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const COMPONENT_ICONS = {
  commissions: TrendingUp,
  packs: Wallet,
  licences: ShieldCheck,
  publicite: Activity,
  abonnements: Users,
  autres: Banknote,
};

const COMPONENT_COLORS = {
  commissions: "bg-indigo-500",
  packs: "bg-emerald-500",
  licences: "bg-sky-500",
  publicite: "bg-amber-500",
  abonnements: "bg-fuchsia-500",
  autres: "bg-slate-500",
};

const RbpDashboard = () => {
  const [month, setMonth] = useState(currentMonthKey);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const id = requestId.current + 1;
      requestId.current = id;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc("get_super_admin_rbp_stats", { p_month: month });
        if (requestId.current !== id) return;
        if (rpcError) throw new Error(rpcError.message || "Calcul des revenus RBP impossible.");
        setStats(data || null);
        setLastUpdated(new Date());
      } catch (e) {
        if (requestId.current !== id) return;
        setError(e?.message || "Calcul des revenus RBP impossible.");
      } finally {
        if (requestId.current === id) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [month],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Temps reel : rafraichissement silencieux toutes les 60 s et au retour
  // sur l'onglet. Le serveur reste la seule source de calcul.
  useEffect(() => {
    const interval = window.setInterval(() => load({ silent: true }), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const total = Number(stats?.total_rbp_fcfa || 0);
  const distribution = stats?.distribution || {};
  const components = stats?.components || [];
  const byEventType = stats?.by_event_type || [];
  const series = stats?.monthly_series || [];
  const commissionSummary = stats?.commission_summary || {};
  const isCurrentMonth = month === currentMonthKey();
  const hasData = total > 0 || byEventType.length > 0;

  const chartData = useMemo(
    () =>
      series.map((m) => ({
        ...m,
        autres_stacked:
          Number(m.licences_fcfa || 0)
          + Number(m.publicite_fcfa || 0)
          + Number(m.abonnements_fcfa || 0)
          + Number(m.autres_fcfa || 0),
      })),
    [series],
  );

  const maxComponent = useMemo(
    () => Math.max(1, ...components.map((c) => Number(c.amount_fcfa || 0))),
    [components],
  );

  if (loading && !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* En-tete */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Revenus Bruts Plateforme (RBP)</h2>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <span className={`h-2 w-2 rounded-full bg-emerald-500 ${refreshing ? "animate-ping" : "animate-pulse"}`} />
              {refreshing ? "Actualisation…" : "Temps réel"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Assiette contractuelle du partage : 20 % Fonds de Survie · 40 % Partie A · 40 % Partie B.
            {lastUpdated && (
              <span className="ml-1">
                Dernière actualisation : {lastUpdated.toLocaleTimeString("fr-FR")}.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="rbp-month" className="mb-1 block text-xs font-medium text-muted-foreground">
              Mois civil
            </label>
            <Input
              id="rbp-month"
              type="month"
              value={month}
              max={currentMonthKey()}
              onChange={(e) => setMonth(e.target.value || currentMonthKey())}
              className="w-44"
            />
          </div>
          <Button variant="outline" onClick={() => load({ silent: true })} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Impossible de charger les revenus RBP</p>
            <p className="mt-1">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => load()}>Réessayer</Button>
        </div>
      )}

      {/* Total + partage */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-transparent">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              RBP du mois — {monthLabel(month)}
            </CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {fmtFcfa(total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {isCurrentMonth ? "Mois en cours" : "Mois clôturé"} · commissions acquises, packs,
              licences, publicité et autres encaissements.
            </p>
            <p className="text-xs">
              Cumul 12 mois : <span className="font-semibold text-foreground">{fmtFcfa(stats?.total_series_fcfa || 0)}</span>
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-amber-500" />
                Fonds de Survie (20 %)
              </CardDescription>
              <CardTitle className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {fmtFcfa(distribution.survival_fund_fcfa)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Charges directes, hébergement, USSD, support, développement.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-indigo-500" />
                Partie A (40 %)
              </CardDescription>
              <CardTitle className="text-xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                {fmtFcfa(distribution.party_a_fcfa)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              50 % du Résultat Distribuable.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-500" />
                Partie B (40 %)
              </CardDescription>
              <CardTitle className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtFcfa(distribution.party_b_fcfa)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Revenu net partenaire, 50 % du Résultat Distribuable.
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Résultat Distribuable (80 %) :</span>{" "}
        {fmtFcfa(distribution.distributable_fcfa)}. Le partage porte uniquement sur les revenus de la
        Plateforme : les 90 % revenant aux organisateurs ne sont jamais inclus.
      </div>

      {!hasData && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4" />
          Aucun encaissement enregistré pour {monthLabel(month)}. Le tableau se remplira dès le
          premier paiement ou transfert de gains validé.
        </div>
      )}

      {/* Composantes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Détail par source de revenu</CardTitle>
          <CardDescription>
            Chaque ligne est un encaissement réel de la Plateforme, avec sa source de données.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Source</th>
                  <th className="pb-2 pr-4 font-medium">Montant</th>
                  <th className="pb-2 pr-4 font-medium">Part du RBP</th>
                  <th className="pb-2 font-medium">Origine</th>
                </tr>
              </thead>
              <tbody>
                {components.map((component) => {
                  const Icon = COMPONENT_ICONS[component.key] || Banknote;
                  const amount = Number(component.amount_fcfa || 0);
                  const share = total > 0 ? (amount / total) * 100 : 0;
                  return (
                    <tr key={component.key} className="border-b last:border-0 align-top">
                      <td className="py-3 pr-4">
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{component.label}</p>
                            <p className="text-xs text-muted-foreground">{component.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap font-semibold tabular-nums">{fmtFcfa(amount)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${COMPONENT_COLORS[component.key] || "bg-slate-500"}`}
                              style={{ width: `${Math.min(100, (amount / maxComponent) * 100)}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                            {share.toFixed(1)} %
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">{component.source}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="pt-3 font-semibold">Total RBP</td>
                  <td className="pt-3 font-bold tabular-nums">{fmtFcfa(total)}</td>
                  <td className="pt-3 text-xs text-muted-foreground">100 %</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail par type d'evenement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Commissions par type d'événement — {monthLabel(month)}</CardTitle>
          <CardDescription>
            {commissionSummary.entries
              ? `${nf.format(commissionSummary.entries)} transaction(s) commissionnée(s) sur ${fmtFcfa(commissionSummary.gross_fcfa)} de volume, soit un taux effectif de ${commissionSummary.effective_rate_pct} %.`
              : "Aucune commission acquise pour ce mois."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Type d'événement</th>
                  <th className="pb-2 pr-4 text-right font-medium">Transactions</th>
                  <th className="pb-2 pr-4 text-right font-medium">Volume brut</th>
                  <th className="pb-2 pr-4 text-right font-medium">Commission</th>
                  <th className="pb-2 text-right font-medium">Part des commissions</th>
                </tr>
              </thead>
              <tbody>
                {byEventType.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Aucune commission reconnue sur ce mois.
                    </td>
                  </tr>
                )}
                {byEventType.map((row) => (
                  <tr key={row.event_type} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{row.label}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{nf.format(Number(row.entries || 0))}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{fmtFcfa(row.gross_fcfa)}</td>
                    <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">{fmtFcfa(row.commission_fcfa)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <Badge variant="secondary">{Number(row.share_of_commissions_pct || 0).toFixed(1)} %</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              {byEventType.length > 0 && (
                <tfoot>
                  <tr className="border-t">
                    <td className="pt-3 font-semibold">Total commissions</td>
                    <td className="pt-3 text-right font-semibold tabular-nums">{nf.format(Number(commissionSummary.entries || 0))}</td>
                    <td className="pt-3 text-right tabular-nums text-muted-foreground">{fmtFcfa(commissionSummary.gross_fcfa)}</td>
                    <td className="pt-3 text-right font-bold tabular-nums">{fmtFcfa(commissionSummary.commission_fcfa)}</td>
                    <td className="pt-3 text-right text-xs text-muted-foreground">100 %</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {Number(commissionSummary.pending_commission_fcfa || 0) > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {fmtFcfa(commissionSummary.pending_commission_fcfa)} de commissions sont encore en
              attente de transfert vers le portefeuille des gains. Elles seront ajoutées au RBP à
              leur date de transfert et ne sont pas comptées dans le total ci-dessus.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tendance 12 mois */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Évolution du RBP sur 12 mois</CardTitle>
          <CardDescription>
            Encaissements mensuels, empilés par grande famille de revenus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} />
                <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12 }} width={64} />
                <RechartsTooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid rgba(148,163,184,0.35)", fontSize: 12 }}
                  formatter={(value, name) => [fmtFcfa(value), name]}
                />
                <Bar dataKey="commissions_fcfa" name="Commissions" stackId="rbp" fill="#6366f1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="packs_fcfa" name="Packs" stackId="rbp" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="autres_stacked" name="Licences, publicité et autres" stackId="rbp" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Commissions</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Packs de crédits</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Licences, publicité et autres</span>
          </div>
        </CardContent>
      </Card>

      {/* Methode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Méthode de calcul et règles d'exclusion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Devise :</span> FCFA. Les montants sont
            arrondis au franc.
          </p>
          <p>
            <span className="font-semibold text-foreground">Date de reconnaissance :</span>{" "}
            commission à la date du transfert vers le portefeuille des gains (ou du paiement), sinon
            à la date de la transaction ; paiements à la date de traitement.
          </p>
          <p>
            <span className="font-semibold text-foreground">Jamais inclus :</span> les 90 % dus aux
            organisateurs, les dépenses en pièces, les paiements en attente, annulés, refusés ou
            remboursés, et les boosts réglés en pièces (déjà couverts par l'achat du pack).
          </p>
          <p>
            <span className="font-semibold text-foreground">Note contractuelle :</span> le RBP net
            définitif déduit les frais des prestataires de paiement et les remboursements. Ces frais
            sont à valider avec la comptabilité avant reversement de la part partenaire.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RbpDashboard;
