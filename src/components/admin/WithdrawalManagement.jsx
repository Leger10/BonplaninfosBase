import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Check,
  X,
  RefreshCw,
  Search,
  Download,
  Eye,
  AlertTriangle,
  Calculator,
} from "lucide-react";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const WithdrawalManagement = () => {
  const { user } = useAuth();
  const { userProfile } = useData();

  const [requests, setRequests] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [feeStats, setFeeStats] = useState({ total_fees: 0, pending_fees: 0 });

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const isSuperAdmin = userProfile?.user_type === "super_admin";
  const canPerformActions = isSuperAdmin;

  // Fetch Requests
  const fetchWithdrawalRequests = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("organizer_withdrawal_requests")
        .select(
          `
                  *,
                  organizer:organizer_id (full_name, email, country, phone)
                `,
        )
        .order("requested_at", { ascending: false });

      // Admin zone restriction
      if (!isSuperAdmin && userProfile?.country) {
        query = query.eq("organizer.country", userProfile.country);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Safety filter
      const safeData = isSuperAdmin
        ? data
        : data.filter((req) => req.organizer?.country === userProfile?.country);

      setRequests(safeData || []);
      setFiltered(safeData || []);

      // Calculate fees stats
      const totalFees = safeData
        .filter((r) => r.status === "paid" || r.status === "approved")
        .reduce((acc, curr) => acc + (curr.fees || 0), 0);
      const pendingFees = safeData
        .filter((r) => r.status === "pending")
        .reduce((acc, curr) => acc + (curr.fees || 0), 0);
      setFeeStats({ total_fees: totalFees, pending_fees: pendingFees });
    } catch (error) {
      console.error("Erreur chargement:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les demandes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, userProfile]);

  useEffect(() => {
    fetchWithdrawalRequests();
  }, [fetchWithdrawalRequests]);

  // Filtering
  useEffect(() => {
    let result = [...requests];
    if (search.trim().length > 0) {
      const s = search.toLowerCase();
      result = result.filter(
        (req) =>
          req.organizer?.full_name?.toLowerCase().includes(s) ||
          req.organizer?.email?.toLowerCase().includes(s),
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((req) => req.status === statusFilter);
    }
    setFiltered(result);
  }, [search, statusFilter, requests]);

  // Actions
  const handleProcessRequest = async (requestId, status, reason = null) => {
    if (!canPerformActions) return;
    setProcessingId(requestId);

    try {
      const { error } = await supabase.rpc("process_organizer_withdrawal", {
        p_request_id: requestId,
        p_status: status,
        p_notes: reason,
        p_admin_id: user?.id || null,
      });

      if (error) throw error;

      toast({
        title: status === "approved" ? "Demande approuvée" : "Demande rejetée",
        description:
          status === "approved"
            ? "Paiement marqué comme validé."
            : "Fonds remboursés à l'organisateur.",
        variant: status === "approved" ? "success" : "default",
      });

      await fetchWithdrawalRequests();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
      setIsRejectionDialogOpen(false);
      setRejectionReason("");
    }
  };

  const exportToExcel = () => {
    const rows = filtered.map((r) => ({
      ID: r.id,
      Organisateur: r.organizer?.full_name,
      Montant_Brut: r.amount_fcfa,
      Frais_5_Pourcent: r.fees,
      Montant_Net: r.net_amount || r.amount_fcfa - (r.fees || 0),
      Méthode: r.payment_details?.method,
      Compte: r.payment_details?.number,
      Statut: r.status,
      Date: new Date(r.requested_at).toLocaleDateString(),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Retraits");
    XLSX.writeFile(wb, "Retraits_Organisateurs.xlsx");
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Collectés (5%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              {feeStats.total_fees.toLocaleString()} FCFA
            </div>
            <p className="text-xs text-blue-600 mt-1">Sur retraits validés</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Frais en Attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">
              {feeStats.pending_fees.toLocaleString()} FCFA
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Sur demandes en cours
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-3 justify-between items-center bg-muted/30 p-4 rounded-lg border">
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full bg-background border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="bg-background border rounded-md px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tout</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvé</option>
            <option value="rejected">Rejeté</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchWithdrawalRequests}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Demandeur</TableHead>
              <TableHead>Montant Brut</TableHead>
              <TableHead className="text-red-500">Frais (5%)</TableHead>
              <TableHead className="text-emerald-600">Net à Payer</TableHead>
              <TableHead>Info Paiement</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date</TableHead>
              {canPerformActions && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  Aucune demande trouvée.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <div className="font-medium">
                      {req.organizer?.full_name || "Inconnu"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {req.organizer?.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {req.amount_fcfa?.toLocaleString()} FCFA
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {req.amount_pi} pièces
                    </div>
                  </TableCell>
                  <TableCell className="text-red-500 font-medium">
                    -{req.fees?.toLocaleString()} FCFA
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-emerald-600">
                      {(
                        req.net_amount || req.amount_fcfa - (req.fees || 0)
                      ).toLocaleString()}{" "}
                      FCFA
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {req.payment_details?.method}
                    </div>
                    <div className="text-xs font-mono bg-muted px-1 rounded w-fit">
                      {req.payment_details?.number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium border ${
                        req.status === "approved"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : req.status === "rejected"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                      }`}
                    >
                      {req.status === "approved"
                        ? "Validé"
                        : req.status === "rejected"
                          ? "Rejeté"
                          : "En attente"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(req.requested_at), "dd MMM yyyy HH:mm", {
                      locale: fr,
                    })}
                  </TableCell>
                  {canPerformActions && (
                    <TableCell className="text-right">
                      {req.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 h-8 px-2"
                            onClick={() =>
                              handleProcessRequest(req.id, "approved")
                            }
                            disabled={processingId === req.id}
                            title="Approuver"
                          >
                            {processingId === req.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-2"
                            onClick={() => {
                              setSelectedRequest(req);
                              setIsRejectionDialogOpen(true);
                            }}
                            disabled={processingId === req.id}
                            title="Rejeter"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={isRejectionDialogOpen}
        onOpenChange={setIsRejectionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Indiquez la raison du rejet. Les fonds seront remboursés
              intégralement à l'utilisateur.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Ex: Numéro incorrect, Compte inactif..."
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRejectionDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                handleProcessRequest(
                  selectedRequest.id,
                  "rejected",
                  rejectionReason,
                )
              }
              disabled={
                !rejectionReason.trim() || processingId === selectedRequest?.id
              }
            >
              {processingId === selectedRequest?.id && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Confirmer Rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WithdrawalManagement;
