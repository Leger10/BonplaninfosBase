import React, { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Smartphone,
  Ticket,
  Coins,
  Search,
  Eye,
  Download,
  MessageCircle,
  Send,
  Calendar,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import QRCode from "qrcode.react";
import { generateTicketPDF } from "@/utils/generateTicketPDF";

const SUPPORT_WHATSAPP = "22654329299"; // Bonplaninfos — Burkina Faso

const STATUS_LABELS = {
  pending: { label: "En attente", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  completed: { label: "Validé", cls: "bg-green-500/20 text-green-400 border-green-500/40" },
  cancelled: { label: "Rejeté", cls: "bg-red-500/20 text-red-400 border-red-500/40" },
};

const USSDPaymentsTab = ({ actorId }) => {
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [billetPayment, setBilletPayment] = useState(null);
  const [showBilletModal, setShowBilletModal] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      // Client service-role (bypass RLS) pour que la secrétaire nommée par super
      // admin puisse lire les paiements USSD, comme le fait la Netlify Function.
      let srv = supabase;
      try {
        const mod = await import("@/lib/ussdStatusClient");
        if (mod.ussdServiceClient) srv = mod.ussdServiceClient;
      } catch (_) {
        /* ignore */
      }
      const { data, error } = await srv
        .from("payments")
        .select(`
          id,
          created_at,
          amount_fcfa,
          coins_amount,
          user_id,
          status,
          payment_method,
          transaction_id,
          pack_id,
          validated_by,
          rejected_by,
          validated_at,
          rejected_at,
          profiles!payments_user_id_fkey (full_name, email, phone)
        `)
        .eq("payment_method", "ussd")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Détails USSD (réf. SMS + capture d'écran) stockés dans transactions.metadata
      const { data: txs, error: txsErr } = await srv
        .from("transactions")
        .select("id, created_at, user_id, metadata")
        .not("metadata", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);

      const proofMap = {};
      if (!txsErr && txs) {
        for (const tx of txs) {
          // metadata peut revenir en JSON (objet) ou en texte selon la source
          let meta = tx.metadata;
          if (typeof meta === "string") {
            try { meta = JSON.parse(meta); } catch { meta = null; }
          }
          const u = meta?.ussd;
          if (u && meta?.payment_id) {
            if (!proofMap[meta.payment_id]) {
              proofMap[meta.payment_id] = {
                sms_reference: u.sms_reference || "",
                proof_url: u.proof_url || "",
              };
            }
          }
        }
      }

      // Billets associés aux paiements "Billets" (pour voir/partager le billet client)
      const ticketOrderIds = (data || [])
        .filter((p) => p.pack_id === "ticket_payment" && p.transaction_id)
        .map((p) => p.transaction_id);

      let ticketsMap = {};
      if (ticketOrderIds.length > 0) {
        const { data: tix, error: tixErr } = await srv
          .from("tickets")
          .select(
            "id,event_id,attendee_name,qr_code,ticket_code_short,ticket_number,status,purchase_price_pi,total_amount_fcfa,purchased_at,transaction_reference"
          )
          .in("transaction_reference", ticketOrderIds);
        if (!tixErr && tix && tix.length) {
          const evIds = [...new Set(tix.map((t) => t.event_id).filter(Boolean))];
          const { data: evts } = evIds.length
            ? await srv
                .from("events")
                .select("id,title,event_start_at,event_end_at,location,full_address,address,city,country,cover_image_url,image_url")
                .in("id", evIds)
            : { data: [] };
          const evMap = {};
          (evts || []).forEach((e) => {
            evMap[e.id] = e;
          });
          ticketsMap = {};
          tix.forEach((t) => {
            if (!ticketsMap[t.transaction_reference])
              ticketsMap[t.transaction_reference] = [];
            ticketsMap[t.transaction_reference].push({
              ...t,
              event: evMap[t.event_id] || null,
            });
          });
        }
      }

      // Résolution des noms des acteurs (qui a validé / rejeté)
      const actorIds = [
        ...new Set(
          (data || [])
            .map((p) => [p.validated_by, p.rejected_by])
            .flat()
            .filter(Boolean)
        ),
      ];
      let actorNames = {};
      if (actorIds.length) {
        const { data: actors, error: actorsErr } = await srv
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        if (!actorsErr && actors) {
          actors.forEach((a) => {
            actorNames[a.id] = a.full_name;
          });
        }
      }

      setPayments(
        (data || []).map((p) => ({
          ...p,
          ussd: proofMap[p.id] || { sms_reference: "", proof_url: "" },
          tickets: ticketsMap[p.transaction_id] || [],
          validatedByName: p.validated_by ? actorNames[p.validated_by] : "",
          rejectedByName: p.rejected_by ? actorNames[p.rejected_by] : "",
        }))
      );
    } catch (err) {
      console.error("❌ Erreur chargement paiements USSD:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les paiements USSD.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const act = async (payment, action) => {
    setProcessingId(payment.id);
    try {
      const res = await fetch("/.netlify/functions/ussd-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action, paymentId: payment.id, actorId: actorId || null }),
      });
      const text = await res.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        result = null;
      }
      if (!result) {
        throw new Error(
          "Le service de validation USSD est injoignable. Refus : aucun paiement ne peut etre modifie sans la fonction serveur (validation humaine + livraison).",
        );
      }
      if (!res.ok || !result.success) {
        throw new Error(result.message || `Erreur HTTP ${res.status}`);
      }
      toast({
        title: result.message,
        className: action === "validate" ? "bg-green-600 text-white" : "bg-red-600 text-white",
      });
      await fetchPayments();
    } catch (err) {
      console.error("❌ Erreur action admin:", err);
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  // ─── Billet client : construction des données PDF / aperçu ───
  const buildBilletData = (p) => {
    const tix = p.tickets || [];
    const ev = tix[0]?.event || {};
    const eventForPDF = {
      id: ev.id,
      title: ev.title || "Événement",
      event_start_at: ev.event_start_at,
      event_end_at: ev.event_end_at,
      location: ev.location || ev.city || "",
      full_address:
        ev.full_address ||
        ev.address ||
        ev.location ||
        ev.city ||
        "Lieu non spécifié",
      address: ev.address || "",
      city: ev.city || "",
      country: ev.country || "",
      cover_image_url: ev.cover_image_url || ev.image_url || "",
    };
    const ticketDatas = tix.map((t) => ({
      ticket_number: t.ticket_number || t.qr_code || "",
      ticket_code: t.qr_code || t.ticket_number || "",
      ticket_code_short: t.ticket_code_short || "",
      qr_code: t.qr_code || "",
      type_name: "Standard",
      color: "blue",
      price: t.purchase_price_pi || 0,
      price_fcfa:
        t.total_amount_fcfa || (t.purchase_price_pi || 0) * 10 || p.amount_fcfa || 0,
      purchase_date: t.purchased_at,
      purchased_at: t.purchased_at,
      payment_method: "ussd",
      attendee_name: t.attendee_name || p.profiles?.full_name || "Invité",
      event_title: eventForPDF.title,
      event_start_at: eventForPDF.event_start_at,
      event_end_at: eventForPDF.event_end_at,
      location: eventForPDF.full_address || eventForPDF.location,
      full_address: eventForPDF.full_address,
    }));
    const userData = {
      full_name: p.profiles?.full_name || tix[0]?.attendee_name || "Client",
      email: p.profiles?.email || "client@invite.com",
      id: p.user_id || "guest",
    };
    return { eventForPDF, ticketDatas, userData };
  };

  const handleBilletPdf = async (p, { onlyDownload = false } = {}) => {
    if (pdfBusy) return;
    setPdfBusy(p.id);
    try {
      const { eventForPDF, ticketDatas, userData } = buildBilletData(p);
      if (onlyDownload || !(navigator.canShare && navigator.share)) {
        await generateTicketPDF(eventForPDF, ticketDatas, userData);
        toast({
          title: "✅ Billet généré",
          description: "Le PDF du billet a été téléchargé/ouvert.",
        });
        return;
      }
      const res = await generateTicketPDF(eventForPDF, ticketDatas, userData, {
        returnBlob: true,
      });
      const file = new File([res.blob], res.fileName, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Billet ${eventForPDF.title}`,
          text: buildTicketMessage(p),
        });
        toast({
          title: "✅ Billet partagé",
          description: "Envoi du PDF via WhatsApp/Messagerie.",
        });
      } else {
        res.doc.save(res.fileName);
        toast({
          title: "✅ PDF téléchargé",
          description: "Joignez ensuite le fichier dans WhatsApp.",
        });
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // partage annulé par l'utilisateur
      console.error("Erreur billet PDF/partage:", e);
      toast({
        title: "Erreur",
        description: e.message || "Échec génération PDF.",
        variant: "destructive",
      });
    } finally {
      setPdfBusy(null);
    }
  };

  // ─── WhatsApp : numéro international + message du billet ───
  const formatWhatsAppNumber = (phone) => {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 8) return "226" + digits; // n° local Burkina Faso
    if (digits.startsWith("0"))
      return "226" + digits.replace(/^0+/, "");
    return digits;
  };

  const buildTicketMessage = (p) => {
    const tix = p.tickets || [];
    const ev = tix[0]?.event || {};
    const name = p.profiles?.full_name || tix[0]?.attendee_name || "Client";
    const codes = tix
      .map((t) => t.ticket_code_short || t.ticket_number)
      .filter(Boolean)
      .join(", ");
    const date = ev.event_start_at
      ? new Date(ev.event_start_at).toLocaleString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const lieu =
      ev.full_address || ev.location || ev.city || "";
    return [
      `🎟️ Bonjour ${name},`,
      `Voici votre billet pour : ${ev.title || "l'événement"}`,
      date ? `📅 ${date}` : "",
      lieu ? `📍 ${lieu}` : "",
      codes ? `N° : ${codes}` : "",
      "",
      "Merci d'avoir choisi BonPlanInfos. 🎉",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const openBilletWhatsApp = (p) => {
    const clientPhone = formatWhatsAppNumber(p.profiles?.phone || p.tickets?.[0]?.phone);
    const target = clientPhone || SUPPORT_WHATSAPP;
    const message = buildTicketMessage(p);
    window.open(
      `https://wa.me/${target}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const filtered = payments.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const profile = p.profiles || {};
      const ref = p.ussd?.sms_reference || "";
      return (
        (profile.full_name || "").toLowerCase().includes(q) ||
        (profile.phone || "").includes(q) ||
        (p.transaction_id || "").toLowerCase().includes(q) ||
        ref.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const pendingCount = payments.filter((p) => p.status === "pending").length;

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-yellow-500" />
          <CardTitle className="text-lg">Paiements USSD (mobile money)</CardTitle>
          <Badge variant="outline" className="ml-2 bg-yellow-500/20 text-yellow-400 border-yellow-500/40">
            {pendingCount} à valider
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtres */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex gap-2">
            {["pending", "completed", "cancelled", "all"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className={filter === f ? "bg-yellow-500 hover:bg-yellow-600 text-black" : ""}
              >
                {f === "pending" ? "En attente" : f === "completed" ? "Validés" : f === "cancelled" ? "Rejetés" : "Tous"}
              </Button>
            ))}
          </div>
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher (nom, téléphone, référence SMS, ID)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            Aucun paiement USSD {filter !== "all" ? "dans cet état" : ""}.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Réf. SMS</TableHead>
                  <TableHead>Preuve</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Traite par</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const st = STATUS_LABELS[p.status] || STATUS_LABELS.pending;
                  const isTickets = p.pack_id === "ticket_payment";
                  const smsRef = p.ussd?.sms_reference || "—";
                  const proofUrl = p.ussd?.proof_url || "";
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.profiles?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.profiles?.email || ""}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{p.profiles?.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={isTickets ? "bg-blue-500/20 text-blue-400 border-blue-500/40" : "bg-purple-500/20 text-purple-400 border-purple-500/40"}>
                          {isTickets ? <Ticket className="w-3 h-3 mr-1" /> : <Coins className="w-3 h-3 mr-1" />}
                          {isTickets ? "Billets" : "Crédits"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.amount_fcfa?.toLocaleString()} FCFA
                        {!isTickets && (
                          <div className="text-xs text-muted-foreground">+{p.coins_amount} pièces</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{smsRef}</TableCell>
                      <TableCell>
                        {proofUrl ? (
                          <a href={proofUrl} target="_blank" rel="noreferrer" title="Voir la capture d'écran (nouvel onglet)">
                            <img
                              src={proofUrl}
                              alt="Preuve de paiement"
                              className="w-14 h-14 object-cover rounded-md border border-gray-700 hover:opacity-80 cursor-pointer"
                            />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Aucune</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.status === "completed"
                          ? (p.validatedByName || "—")
                          : p.status === "cancelled"
                            ? (p.rejectedByName || "—")
                            : "En attente"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("fr-FR")}{" "}
                        {new Date(p.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5 flex-wrap items-center">
                          {isTickets && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setBilletPayment(p);
                                setShowBilletModal(true);
                              }}
                              title="Voir le billet du client (partager / PDF)"
                            >
                              <Ticket className="w-3.5 h-3.5 mr-1" />
                              Billet
                            </Button>
                          )}
                          {p.status === "pending" ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => act(p, "validate")}
                                disabled={processingId === p.id}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                Valider
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act(p, "reject")}
                                disabled={processingId === p.id}
                                className="border-red-600 text-red-500 hover:bg-red-600/10"
                              >
                                {processingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
                                Rejeter
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">{p.transaction_id}</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>

    {/* ─── Modal : voir le billet client / partager WhatsApp / PDF ─── */}
    <Dialog open={showBilletModal} onOpenChange={setShowBilletModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🎟️ Billet du client</DialogTitle>
          <DialogDescription>
            Téléchargez le billet en PDF ou partagez-le sur WhatsApp après
            validation.
          </DialogDescription>
        </DialogHeader>
        {billetPayment &&
          (() => {
            const tix = billetPayment.tickets || [];
            const ev = tix[0]?.event || {};
            const st = STATUS_LABELS[billetPayment.status] || STATUS_LABELS.pending;
            if (tix.length === 0) {
              return (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Aucun billet trouvé pour ce paiement.
                </div>
              );
            }
            return (
              <div className="space-y-4">
                {billetPayment.status === "pending" && (
                  <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/40 rounded-md p-2">
                    ⚠️ Paiement encore en attente de validation. Partagez le
                    billet après avoir cliqué sur « Valider ».
                  </div>
                )}
                <div className="rounded-xl border overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4">
                    <p className="font-bold text-lg leading-tight">
                      {ev.title || billetPayment.profiles?.full_name || "Événement"}
                    </p>
                    <div className="text-xs text-white/80 mt-1 space-y-0.5">
                      {ev.event_start_at && (
                        <p>
                          <Calendar className="w-3 h-3 inline mr-1" />
                          {new Date(ev.event_start_at).toLocaleString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                      {(ev.full_address || ev.location || ev.city) && (
                        <p>
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {ev.full_address || ev.location || ev.city}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-4 text-center">
                    {tix.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-center gap-4 py-2"
                      >
                        <div className="bg-white p-1.5 rounded-lg border">
                          <QRCode
                            value={
                              t.ticket_code_short ||
                              t.ticket_number ||
                              t.qr_code ||
                              t.id
                            }
                            size={110}
                            level="H"
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-mono font-bold tracking-widest text-gray-900">
                            {t.ticket_code_short || "—"}
                          </p>
                          <p className="text-xs text-gray-500">
                            N° {t.ticket_number}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-3 mt-2 flex items-center justify-center gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          👤{" "}
                          {tix[0]?.attendee_name ||
                            billetPayment.profiles?.full_name ||
                            "Invité"}
                        </p>
                        {billetPayment.profiles?.phone && (
                          <p className="text-xs text-gray-500 font-mono">
                            {billetPayment.profiles.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="bg-muted/40 px-4 py-2 flex items-center justify-between">
                    <Badge variant="outline" className={st.cls}>
                      {st.label}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {billetPayment.amount_fcfa?.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => openBilletWhatsApp(billetPayment)}
                    disabled={billetPayment.status === "cancelled"}
                    title="Ouvre WhatsApp avec un message pré-rempli (joignez ensuite le PDF téléchargé)"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    onClick={() => handleBilletPdf(billetPayment, { onlyDownload: true })}
                    disabled={billetPayment.status === "cancelled" || pdfBusy !== null}
                  >
                    {pdfBusy === billetPayment.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    PDF
                  </Button>
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => handleBilletPdf(billetPayment)}
                  disabled={billetPayment.status === "cancelled" || pdfBusy !== null}
                >
                  {pdfBusy === billetPayment.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Envoyer le PDF (WhatsApp)
                </Button>
              </div>
            );
          })()}
      </DialogContent>
    </Dialog>
    </>
  );
};

export default USSDPaymentsTab;