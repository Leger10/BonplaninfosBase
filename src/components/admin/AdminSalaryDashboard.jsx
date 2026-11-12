import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FileText,
  CalendarClock,
  DollarSign,
  TrendingUp,
  Download,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { getNextWithdrawalDate, isWithdrawalOpen } from "@/lib/dateUtils";
import AdminSalaryWithdrawalModal from "./AdminSalaryWithdrawalModal";
import { toast } from "@/components/ui/use-toast";
import {
  generatePaymentReceipt,
  generateSalarySlip,
} from "@/utils/pdfGenerator";

const AdminSalaryDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [salaryStats, setSalaryStats] = useState(null);
  const [withdrawalConfig, setWithdrawalConfig] = useState({
    withdrawal_dates: [5],
    withdrawal_available_date: 5,
  });
  const [salaryWithdrawalDays, setSalaryWithdrawalDays] = useState([5]);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [withdrawalHistory, setWithdrawalHistory] = useState([]);
  const [nextWithdrawalDate, setNextWithdrawalDate] = useState(null);
  const [canWithdraw, setCanWithdraw] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: configData } = await supabase
        .from("admin_withdrawal_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      const config = configData || { withdrawal_dates: [5], withdrawal_available_date: 5 };
      setWithdrawalConfig(config);
      // Retraits salaires admin : priorité au jour configuré dans "Gestion des Retraits Salaires"
      const salaryDay = Number(config.withdrawal_available_date);
      const fallbackDays = Array.isArray(config.withdrawal_dates)
        ? config.withdrawal_dates.map(Number).filter(Boolean)
        : [5];
      const days = salaryDay >= 1 && salaryDay <= 31 ? [salaryDay] : (fallbackDays.length ? fallbackDays : [5]);
      setSalaryWithdrawalDays(days);
      setNextWithdrawalDate(getNextWithdrawalDate(days));

      const { data: stats, error: statsError } = await supabase.rpc(
        "get_admin_salary_stats",
        { p_admin_id: user.id },
      );
      if (statsError) console.error("Stats Error:", statsError);
      setSalaryStats(stats);

      const { data: history } = await supabase
        .from("admin_withdrawal_requests")
        .select("*")
        .eq("admin_id", user.id)
        .order("requested_at", { ascending: false });
      setWithdrawalHistory(history || []);

      setCanWithdraw(isWithdrawalOpen(days));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateReceipt = async (withdrawal) => {
    if (!withdrawal) return;
    setGeneratingPdf(withdrawal.id);
    try {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      await generatePaymentReceipt({
        recipientName:
          adminProfile?.full_name || adminProfile?.email || "Administrateur",
        amount: withdrawal.amount_fcfa || 0,
        paymentType: "Salaire Administrateur",
        reference: withdrawal.reference || withdrawal.id,
        date: new Date(withdrawal.processed_at || withdrawal.requested_at),
        description: `Paiement de salaire - ${withdrawal.period || format(new Date(withdrawal.requested_at), "MMMM yyyy", { locale: fr })}`,
      });

      toast({
        title: "Reçu téléchargé",
        description: "Votre reçu a été généré.",
      });
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      toast({
        title: "Erreur",
        description: "Impossible de générer le PDF.",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(null);
    }
  };

  const generateSalarySlipPDF = async () => {
    if (!salaryStats) return;
    if (salaryStats.total_salary_fcfa === 0) {
      toast({
        title: "Aucun salaire",
        description: "Vous n'avez pas encore de salaire à télécharger.",
        variant: "warning",
      });
      return;
    }

    setGeneratingPdf("salary-slip");
    try {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("full_name, country, city")
        .eq("id", user.id)
        .single();

      await generateSalarySlip({
        adminName: adminProfile?.full_name || "Administrateur",
        zone: `${salaryStats.country || adminProfile?.country || ""}${(salaryStats.city || adminProfile?.city) ? `, ${salaryStats.city || adminProfile?.city}` : ""}`,
        period: format(new Date(), "MMMM yyyy", { locale: fr }),
        volumeZone: salaryStats.total_volume_fcfa || 0,
        commissionBase: salaryStats.zone_revenue_fcfa ?? salaryStats.platform_revenue_fcfa ?? 0,
        licenseRate: salaryStats.license_commission_rate || 0,
        personalScore: salaryStats.personal_score || 1.0,
        netSalary: salaryStats.total_salary_fcfa || 0,
        date: new Date(),
      });

      toast({
        title: "Bulletin généré",
        description: "Votre bulletin a été téléchargé.",
      });
    } catch (err) {
      console.error("Erreur génération bulletin:", err);
      toast({
        title: "Erreur",
        description: "Impossible de générer le bulletin.",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(null);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-white" />
      </div>
    );

  const commissionRate = Number(salaryStats?.license_commission_rate || 0);
  const personalScore = Number(salaryStats?.personal_score || 1.0);
  const zoneVolume = Number(salaryStats?.total_volume_fcfa || 0); // volume brut transféré (zone)
  const zoneRevenue = Number(
    salaryStats?.zone_revenue_fcfa ?? salaryStats?.platform_revenue_fcfa ?? 0,
  ); // CA zone (harmonisé, cumul)
  const monthlyZoneRevenue = Number(salaryStats?.monthly_zone_revenue_fcfa || 0);
  const salaryBase = Number(
    salaryStats?.salary_base_fcfa ?? salaryStats?.zone_transfer_fees_fcfa ?? zoneRevenue,
  ); // base salaire = frais de transfert vers compte gains
  const estimatedSalary = Number(salaryStats?.total_salary_fcfa || 0);
  const licenseName = salaryStats?.license_name || "Standard";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">
            Mon Salaire & Revenus
          </h2>
          <p className="text-gray-400">
            Licence :{" "}
            <Badge className="bg-gray-800 text-gray-200">{licenseName}</Badge>{" "}
            — Taux de commission : <strong className="text-white">{commissionRate}%</strong>
          </p>
        </div>
        <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700 flex items-center gap-3">
          <CalendarClock className="text-indigo-400" />
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase">
              Prochain Retrait
            </p>
            <p className="font-medium text-white">
              {nextWithdrawalDate
                ? format(nextWithdrawalDate, "d MMMM yyyy", { locale: fr })
                : "---"}
            </p>
          </div>
        </div>
      </div>

      {salaryStats?.license_missing && monthlyZoneRevenue > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-200">Aucune licence partenaire rattachée</p>
            <p className="text-sm text-amber-100/80">
              Le CA de votre zone est bien comptabilisé ({monthlyZoneRevenue.toLocaleString("fr-FR")} FCFA),
              mais le taux de licence vaut 0 % : le salaire ne peut donc pas être calculé.
              Contactez le super administrateur pour rattacher votre licence.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">CA Plateforme (mois en cours)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-400">
              {monthlyZoneRevenue.toLocaleString("fr-FR")} F CFA
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Base de calcul du salaire (zone)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">
              Salaire estimé (base CA)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-400">
              {estimatedSalary.toLocaleString("fr-FR")} F CFA
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {commissionRate}% (licence) × score {personalScore}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">Score personnel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-indigo-400">
              {personalScore}
            </p>
            <Progress value={Math.min(100, Math.max(0, personalScore * 100))} className="h-1 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Explication calcul salaire */}
      <Card className="bg-gray-900/60 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white">Comment votre salaire est calculé</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-300 space-y-2">
          <p>
            <span className="text-gray-400">Base de calcul :</span>{" "}
            <strong>Chiffres d’affaires de la Plateforme du mois en cours</strong> (zone), harmonisés avec le tableau de bord.
          </p>
          <p>
            <span className="text-gray-400">Formule :</span>{" "}
            <strong>Salaire admin = CA Plateforme (mois en cours) × Taux de licence × Score personnel</strong>
          </p>
          <div className="rounded-md bg-gray-800 border border-gray-700 p-3 text-gray-200">
            <div>CA Plateforme du mois en cours = <strong>{salaryBase.toLocaleString("fr-FR")} F CFA</strong></div>
            <div>Taux de licence = <strong>{commissionRate}%</strong></div>
            <div>Score personnel = <strong>{personalScore}</strong></div>
            <div className="mt-1 pt-1 border-t border-gray-700">
              Salaire estimé = {salaryBase.toLocaleString("fr-FR")} × {commissionRate}% × {personalScore} ={" "}
              <strong className="text-emerald-400">{estimatedSalary.toLocaleString("fr-FR")} F CFA</strong>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Le CA du mois reprend les chiffres d’affaires plateforme de la zone (frais plateforme/transactions et frais de transfert du mois).
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-900/30 rounded-lg">
                <DollarSign className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Salaire estimé</p>
                <p className="text-3xl font-bold text-white">
                  {estimatedSalary.toLocaleString()} FCFA
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={generateSalarySlipPDF}
                disabled={
                  estimatedSalary === 0 || generatingPdf === "salary-slip"
                }
              >
                {generatingPdf === "salary-slip" ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-5 h-5 mr-2" />
                )}
                Bulletin
              </Button>

              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!canWithdraw || estimatedSalary < 1000}
                onClick={() => setIsWithdrawalModalOpen(true)}
                title={
                  !canWithdraw
                    ? "Les retraits sont fermés aujourd'hui."
                    : estimatedSalary < 1000
                      ? `Minimum de retrait : 1 000 FCFA (salaire estimé : ${estimatedSalary.toLocaleString('fr-FR')} FCFA).`
                      : ""
                }
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                {canWithdraw ? "Retrait" : "Fermé"}
              </Button>
            </div>
            {canWithdraw && estimatedSalary < 1000 && (
              <p className="text-xs text-amber-600 mt-3 text-right">
                Minimum de retrait : 1 000 FCFA — salaire estimé actuel : {estimatedSalary.toLocaleString('fr-FR')} FCFA.
              </p>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-4 text-center">
            Retraits salaires disponibles le :{" "}
            {salaryWithdrawalDays.join(", ")} du mois
          </p>
        </CardContent>
      </Card>

      {/* Historique */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Historique des Paiements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800">
                <TableHead className="text-gray-300">Date</TableHead>
                <TableHead className="text-gray-300">Montant</TableHead>
                <TableHead className="text-gray-300">Statut</TableHead>
                <TableHead className="text-right text-gray-300">Reçu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawalHistory.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-8 text-gray-400"
                  >
                    Aucun historique
                  </TableCell>
                </TableRow>
              ) : (
                withdrawalHistory.map((w) => (
                  <TableRow key={w.id} className="border-gray-800">
                    <TableCell className="text-gray-300">
                      {format(new Date(w.requested_at), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="font-bold text-white">
                      {w.amount_fcfa?.toLocaleString() || "0"} F
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          w.status === "approved"
                            ? "success"
                            : w.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {w.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(w.status === "approved" || w.status === "paid") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => generateReceipt(w)}
                          disabled={generatingPdf === w.id}
                          className="text-gray-400 hover:text-white"
                        >
                          {generatingPdf === w.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AdminSalaryWithdrawalModal
        open={isWithdrawalModalOpen}
        onOpenChange={setIsWithdrawalModalOpen}
        availableAmount={estimatedSalary}
        adminId={user.id}
        onSuccess={fetchData}
      />
    </div>
  );
};

export default AdminSalaryDashboard;
