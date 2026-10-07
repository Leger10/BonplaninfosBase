import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  Ticket,
  Loader2,
  Calendar,
  MapPin,
  AlertCircle,
  RefreshCw,
  QrCode,
  CheckCircle2,
  User,
  ArrowLeft,
  Clock,
  XCircle,
} from "lucide-react";
import { generateTicketPDF } from "@/utils/generateTicketPDF";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import QRCode from "qrcode.react";
import { useSearchParams, useNavigate } from "react-router-dom";

// 🔥 CLÉ POUR LE STOCKAGE LOCAL DES TICKETS INVITÉS
const GUEST_TICKETS_KEY = "guest_tickets";
const USSD = "ussd";

// 🔥 Consultation publique de l'état d'un paiement USSD (invité sans compte)
const checkUssdStatus = async (orderId) => {
  if (!orderId) return null;
  // 1) Netlify Function (production)
  try {
    const res = await fetch("/.netlify/functions/ussd-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "status", transactionId: orderId }),
    });
    const txt = await res.text();
    const data = txt ? JSON.parse(txt) : {};
    if (res.ok && data.success && data.status) return data.status;
  } catch (e) {
    console.error("Erreur consultation statut USSD:", e);
  }
  // 2) Fallback dev (vite :3000 sans Netlify Function)
  const { fetchUssdStatus } = await import("@/lib/ussdStatusClient");
  return fetchUssdStatus(orderId);
};

const genShortTicketCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return `${String(Math.floor(10000 + Math.random() * 90000))}${chars[Math.floor(Math.random() * chars.length)]}`;
};

const MyTicketsTab = ({ isGuestView = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [newTicketId, setNewTicketId] = useState(null);
  const [isGuest, setIsGuest] = useState(isGuestView || false);

  // 🔥 RÉCUPÉRER L'ÉVÉNEMENT DEPUIS LE STOCKAGE LOCAL
  useEffect(() => {
    const pendingPayment = localStorage.getItem("pending_ticket_payment");
    if (pendingPayment) {
      try {
        const paymentData = JSON.parse(pendingPayment);
        localStorage.setItem(
          "pending_event_data",
          JSON.stringify({
            event_id: paymentData.event_id,
            title: paymentData.event_title || "Événement",
            event_start_at: paymentData.event_start_at,
            location: paymentData.event_location,
            full_address:
              paymentData.event_full_address || paymentData.event_location,
            city: paymentData.event_city || "",
            country: paymentData.event_country || "",
          }),
        );
      } catch (e) {
        console.error("Erreur lecture pending payment:", e);
      }
    }
  }, []);

  // 🔥 LIRE LES BILLETS INVITÉS DU STOCKAGE LOCAL (sans toucher l'état)
  // Utilisé pour fusionner : le stockage local n'est la source de vérité que
  // pour un visiteur sans compte.
  const readGuestTickets = () => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
      );
      if (!Array.isArray(raw)) return [];
      return raw.filter((t) => t && t.event_id && t.qr_code && t.event_title);
    } catch (e) {
      console.error("Erreur lors de la lecture des tickets invités:", e);
      return [];
    }
  };

  // 🔥 CRÉER UN TICKET TEMPORAIRE POUR LES INVITÉS
  const createGuestTicket = (orderId, paymentData) => {
    const guestTickets = JSON.parse(
      localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
    );

    // Vérifier si le ticket existe déjà
    const existing = guestTickets.find(
      (t) => t.transaction_reference === orderId || t.order_id === orderId,
    );

    if (existing) {
      console.log("✅ Ticket déjà existant:", existing);
      return existing;
    }

    const eventLocation =
      paymentData?.event_full_address ||
      paymentData?.event_location ||
      paymentData?.event_city ||
      "Lieu non spécifié";

    // Récupérer le premier type de billet
    const firstTicketType = paymentData?.ticketTypes?.[0] || {
      name: "Standard",
      color: "blue",
      description: "Billet standard",
    };

    const tempTicket = {
      id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      event_id: paymentData?.event_id || "unknown",
      user_id: "guest",
      qr_code: genShortTicketCode(),
      attendee_name:
        paymentData?.attendeeName || paymentData?.nomclient || "Invité",
      status: "active",
      purchase_amount_pi: Math.floor((paymentData?.totalFcfa || 0) / 10),
      purchase_amount_fcfa: paymentData?.totalFcfa || 0,
      purchased_at: new Date().toISOString(),
      payment_method: "moneyfusion_ticket",
      transaction_reference: orderId,
      order_id: orderId,
      isGuest: true,
      ticket_number: `TKT-${Date.now()}`,
      ticket_code_short: genShortTicketCode(),
      // Informations de l'événement
      event_title: paymentData?.event_title || "Événement",
      event_start_at: paymentData?.event_start_at,
      event_end_at: paymentData?.event_end_at,
      location: eventLocation,
      full_address: paymentData?.event_full_address || eventLocation,
      address: paymentData?.event_address || "",
      city: paymentData?.event_city || "",
      country: paymentData?.event_country || "",
      // Informations du type de billet
      ticket_type_name: firstTicketType.name,
      ticket_type_color: firstTicketType.color,
      ticket_type_description: firstTicketType.description || "",
      // Données de l'événement complet
      events: {
        id: paymentData?.event_id,
        title: paymentData?.event_title || "Événement",
        event_start_at: paymentData?.event_start_at,
        event_end_at: paymentData?.event_end_at,
        location: eventLocation,
        full_address: paymentData?.event_full_address || eventLocation,
        address: paymentData?.event_address || "",
        city: paymentData?.event_city || "",
        country: paymentData?.event_country || "",
      },
      ticket_types: {
        name: firstTicketType.name,
        color: firstTicketType.color,
        description: firstTicketType.description || "",
      },
    };

    guestTickets.push(tempTicket);
    localStorage.setItem(GUEST_TICKETS_KEY, JSON.stringify(guestTickets));
    console.log("✅ Ticket invité créé:", tempTicket);
    return tempTicket;
  };

  // 🔥 ENRICHIR LE TICKET AVEC LES DÉTAILS DE L'ÉVÉNEMENT
  const enrichGuestTicketWithEventDetails = async (ticket) => {
    if (!ticket.event_id) return ticket;

    try {
      const { data: eventData, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", ticket.event_id)
        .maybeSingle();

      if (eventData && !error) {
        return {
          ...ticket,
          event_title: eventData.title || ticket.event_title,
          event_start_at: eventData.event_start_at || ticket.event_start_at,
          event_end_at: eventData.event_end_at || ticket.event_end_at,
          location: eventData.location || eventData.city || ticket.location,
          full_address:
            eventData.full_address ||
            eventData.address ||
            eventData.location ||
            eventData.city ||
            ticket.full_address,
          address: eventData.address || ticket.address || "",
          city: eventData.city || ticket.city || "",
          country: eventData.country || ticket.country || "",
          events: {
            ...ticket.events,
            ...eventData,
          },
        };
      }
      return ticket;
    } catch (err) {
      console.error("Erreur récupération événement:", err);
      return ticket;
    }
  };

  // 🔥 VÉRIFIER SI LE PAIEMENT VIENT D'ÊTRE RÉUSSI (INVITÉ OU CONNECTÉ)
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    const orderId = searchParams.get("order");

    if (paymentStatus === "success" && orderId) {
      setPaymentSuccess(true);

      // 1. Chercher dans les tickets invités existants
      const guestTickets = JSON.parse(
        localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
      );
      const matchingTickets = guestTickets.filter(
        (t) => t.order_id === orderId || t.transaction_reference === orderId,
      );

      if (matchingTickets.length > 0) {
        // Enrichir avec les détails de l'événement si nécessaire
        const enrichTickets = async () => {
          const enriched = await Promise.all(
            matchingTickets.map((t) => enrichGuestTicketWithEventDetails(t)),
          );
          setIsGuest(true);
          setTickets(enriched.map((t) => ({ ...t, isGuest: true })));
          setNewTicketId(enriched[0]?.id);
          setLoading(false);
          toast({
            title: "🎉 Paiement réussi !",
            description: "Vos billets sont disponibles ci-dessous.",
            className: "bg-green-600 text-white",
          });
        };
        enrichTickets();
        return;
      }

      // 2. Chercher dans le pending payment
      const pendingPayment = localStorage.getItem("pending_ticket_payment");
      if (pendingPayment) {
        try {
          const paymentData = JSON.parse(pendingPayment);
          if (paymentData.order_id === orderId) {
            const newTicket = createGuestTicket(orderId, paymentData);
            // Enrichir avec les détails de l'événement
            const enrichAndSet = async () => {
              const enrichedTicket =
                await enrichGuestTicketWithEventDetails(newTicket);
              setIsGuest(true);
              setTickets([{ ...enrichedTicket, isGuest: true }]);
              setNewTicketId(enrichedTicket.id);
              setLoading(false);

              toast({
                title: "🎉 Paiement réussi !",
                description: "Vos billets sont disponibles ci-dessous.",
                className: "bg-green-600 text-white",
              });

              setTimeout(() => {
                localStorage.removeItem("pending_ticket_payment");
              }, 5000);
            };
            enrichAndSet();
            return;
          }
        } catch (err) {
          console.error("❌ Erreur création ticket fallback:", err);
        }
      }

      // 3. Chercher dans Supabase
      const fetchTicketFromSupabase = async () => {
        try {
          console.log(
            `🔍 Recherche du ticket avec transaction_reference: ${orderId}`,
          );

          const { data, error } = await supabase
            .from("event_tickets")
            .select("*")
            .eq("transaction_reference", orderId)
            .maybeSingle();

          if (data && !error) {
            console.log("✅ Ticket trouvé dans Supabase:", data);

            const { data: eventData, error: eventError } = await supabase
              .from("events")
              .select("*")
              .eq("id", data.event_id)
              .maybeSingle();

            const formattedTicket = {
              ...data,
              isGuest: true,
              order_id: orderId,
              event_title: eventData?.title || data.event_title || "Événement",
              event_start_at: eventData?.event_start_at || data.event_start_at,
              event_end_at: eventData?.event_end_at || data.event_end_at,
              location:
                eventData?.location ||
                eventData?.city ||
                data.location ||
                "Lieu non spécifié",
              full_address:
                eventData?.full_address ||
                eventData?.address ||
                eventData?.location ||
                eventData?.city ||
                data.full_address ||
                data.location ||
                "Lieu non spécifié",
              address: eventData?.address || data.address || "",
              city: eventData?.city || data.city || "",
              country: eventData?.country || data.country || "",
              events: eventData || data.events || {},
              ticket_types: data.ticket_types || {
                name: "Standard",
                color: "blue",
              },
            };

            // Sauvegarder dans localStorage
            const guestTickets = JSON.parse(
              localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
            );
            const existingIndex = guestTickets.findIndex(
              (t) => t.id === data.id,
            );
            if (existingIndex >= 0) {
              guestTickets[existingIndex] = formattedTicket;
            } else {
              guestTickets.push(formattedTicket);
            }
            localStorage.setItem(
              GUEST_TICKETS_KEY,
              JSON.stringify(guestTickets),
            );

            setIsGuest(true);
            setTickets([formattedTicket]);
            setNewTicketId(data.id);
            setLoading(false);

            toast({
              title: "🎉 Paiement réussi !",
              description: "Vos billets sont disponibles ci-dessous.",
              className: "bg-green-600 text-white",
            });
            return;
          }

          // 4. Créer un ticket générique en dernier recours
          console.log("❌ Aucun ticket trouvé, création d'un ticket générique");
          const genericTicket = {
            id: `gen_${Date.now()}`,
            qr_code: genShortTicketCode(),
            attendee_name: "Invité",
            status: "active",
            purchase_amount_pi: 0,
            purchase_amount_fcfa: 0,
            purchased_at: new Date().toISOString(),
            payment_method: "moneyfusion_ticket",
            transaction_reference: orderId,
            order_id: orderId,
            isGuest: true,
            ticket_code_short: genShortTicketCode(),
            ticket_number: `TKT-${Date.now()}`,
            event_title: "Événement",
            location: "Lieu non spécifié",
            full_address: "Lieu non spécifié",
            events: {
              title: "Événement",
              location: "Lieu non spécifié",
              full_address: "Lieu non spécifié",
            },
            ticket_types: {
              name: "Standard",
              color: "blue",
            },
          };

          const guestTickets = JSON.parse(
            localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
          );
          guestTickets.push(genericTicket);
          localStorage.setItem(GUEST_TICKETS_KEY, JSON.stringify(guestTickets));

          setIsGuest(true);
          setTickets([genericTicket]);
          setNewTicketId(genericTicket.id);
          setLoading(false);

          toast({
            title: "🎉 Paiement réussi !",
            description: "Vos billets sont disponibles ci-dessous.",
            className: "bg-green-600 text-white",
          });
        } catch (err) {
          console.error("❌ Erreur récupération ticket:", err);
          setLoading(false);
        }
      };

      fetchTicketFromSupabase();

      // Nettoyer les paramètres URL après un délai
      setTimeout(() => {
        const newUrl =
          window.location.pathname +
          window.location.search
            .replace(/[?&]payment=[^&]*/, "")
            .replace(/[?&]order=[^&]*/, "");
        window.history.replaceState({}, "", newUrl);
      }, 500);
    }
  }, [searchParams, user]);

  // 🔥 CHARGER LES TICKETS (CONNECTÉ OU INVITÉ)
  const fetchTickets = async () => {
    setLoading(true);
    setError(null);

    const guestTickets = readGuestTickets();

    // Visiteur sans compte : le stockage local EST la source (rien en base).
    if (isGuestView || !user) {
      if (guestTickets.length > 0) {
        const enriched = await Promise.all(
          guestTickets.map((t) => enrichGuestTicketWithEventDetails(t)),
        );
        setTickets(enriched.map((t) => ({ ...t, isGuest: true })));
        setIsGuest(true);
      } else {
        setTickets([]);
      }
      setLoading(false);
      return;
    }

    try {
      console.log("🔍 Fetching tickets for user:", user.id);

      const { data, error } = await supabase
        .from("event_tickets")
        .select("*")
        .eq("user_id", user.id)
        .order("purchased_at", { ascending: false });

      if (error) {
        console.error("❌ Supabase error:", error);
        throw error;
      }

      const dbTickets = data || [];
      console.log("✅ Tickets fetched:", dbTickets.length);

      // Enrichir les billets en base avec leur type (nom + couleur) : la requête
      // `select("*")` sur event_tickets ne renvoie pas la relation imbriquée, ce
      // qui faisait afficher « Standard » / bleu et un PDF décoloré.
      const dbTypeIds = [
        ...new Set(
          dbTickets
            .map((t) => t.ticket_type_id)
            .filter(Boolean)
        ),
      ];
      if (dbTypeIds.length > 0) {
        const { data: dbTypes, error: dbTypesErr } = await supabase
          .from("ticket_types")
          .select("id,name,color,description")
          .in("id", dbTypeIds);
        if (!dbTypesErr && dbTypes) {
          const dbTypeMap = new Map(dbTypes.map((x) => [x.id, x]));
          dbTickets.forEach((t) => {
            if (t.ticket_type_id && !t.ticket_types) {
              t.ticket_types = dbTypeMap.get(t.ticket_type_id) || null;
            }
          });
        }
      }

      // La base fait foi pour un utilisateur connecté. On y ajoute les billets
      // invités du navigateur qui n'y figurent pas encore (achat sans compte,
      // puis connexion) : sinon ils disparaissaient de l'écran.
      const dbIds = new Set(dbTickets.map((t) => t.id));
      const dbRefs = new Set(
        dbTickets.map((t) => t.transaction_reference || t.order_id).filter(Boolean),
      );
      const localOnly = guestTickets.filter(
        (t) =>
          !dbIds.has(t.id) &&
          !dbRefs.has(t.transaction_reference) &&
          !dbRefs.has(t.order_id),
      );
      const enrichedLocal = await Promise.all(
        localOnly.map((t) => enrichGuestTicketWithEventDetails(t)),
      );

      const merged = [...dbTickets, ...enrichedLocal.map((t) => ({ ...t, isGuest: true }))].sort(
        (a, b) =>
          new Date(b.purchased_at || 0).getTime() -
          new Date(a.purchased_at || 0).getTime(),
      );

      setTickets(merged);
      setIsGuest(false);
      refreshUssdStatuses(merged);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      setError(
        "Impossible de charger vos billets. Veuillez vérifier votre connexion.",
      );
    } finally {
      setLoading(false);
    }
  };

  // 🔥 RAFRAÎCHIR LES STATUTS DES BILLETS USSD (validation admin) EN VUE INVITÉ
  const refreshUssdStatuses = async (baseTickets) => {
    const target = baseTickets || tickets;
    if (!target.some((t) => t.payment_method === USSD)) return;
    const updated = [...target];
    let changed = false;
    for (let i = 0; i < updated.length; i++) {
      const t = updated[i];
      if (t.payment_method !== USSD) continue;
      const orderId = t.order_id || t.transaction_reference;
      const status = orderId ? await checkUssdStatus(orderId) : null;
      if (status && status !== t.payment_status) {
        updated[i] = { ...t, payment_status: status };
        if (status === "cancelled") updated[i] = { ...updated[i], status: "cancelled" };
        changed = true;
      }
    }
    if (changed) {
      try {
        const saved = JSON.parse(localStorage.getItem(GUEST_TICKETS_KEY) || "[]");
        const merged = saved.map((g) => {
          const upd = updated.find((t) => t.id === g.id);
          return upd || g;
        });
        localStorage.setItem(GUEST_TICKETS_KEY, JSON.stringify(merged));
      } catch (e) {
        console.error("Erreur mise à jour tickets invités:", e);
      }
      setTickets(updated);
    }
  };

  // Chargement initial
  useEffect(() => {
    if (isGuestView) {
      setIsGuest(true);
      const guestTickets = JSON.parse(
        localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
      );
      // Enrichir avec les détails de l'événement
      const enrichAndSetTickets = async () => {
        const enriched = await Promise.all(
          guestTickets.map((t) => enrichGuestTicketWithEventDetails(t)),
        );
        const mapped = enriched.map((t) => ({ ...t, isGuest: true }));
        setTickets(mapped);
        setLoading(false);
        refreshUssdStatuses(mapped);
      };
      enrichAndSetTickets();
      return;
    }

    fetchTickets();

    // Abonnement aux changements pour les utilisateurs connectés
    if (user) {
      const channel = supabase
        .channel("public:event_tickets")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "event_tickets",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setTickets((current) => [payload.new, ...current]);
            toast({
              title: "🎫 Nouveau billet",
              description: "Un nouveau billet a été ajouté à votre compte.",
              className: "bg-blue-600 text-white",
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "event_tickets",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setTickets((current) =>
              current.map((t) =>
                t.id === payload.new.id ? { ...t, ...payload.new } : t,
              ),
            );
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isGuestView]);

  // 🔥 TÉLÉCHARGEMENT DU PDF
  const handleDownload = async (ticket) => {
    setDownloadingId(ticket.id);
    try {
      // 🔒 Billet USSD : téléchargement uniquement après validation admin
      if (ticket.payment_method === USSD && ticket.payment_status !== "completed") {
        const orderId = ticket.order_id || ticket.transaction_reference;
        const liveStatus = orderId ? await checkUssdStatus(orderId) : null;
        if (liveStatus === "completed") {
          try {
            const saved = JSON.parse(localStorage.getItem(GUEST_TICKETS_KEY) || "[]");
            const merged = saved.map((g) =>
              g.id === ticket.id ? { ...g, payment_status: "completed" } : g,
            );
            localStorage.setItem(GUEST_TICKETS_KEY, JSON.stringify(merged));
          } catch (e) { /* ignore */ }
          setTickets((prev) =>
            prev.map((t) => (t.id === ticket.id ? { ...t, payment_status: "completed" } : t)),
          );
        } else {
          setDownloadingId(null);
          toast({
            title: "Billet en attente de validation",
            description:
              "Le téléchargement sera disponible une fois votre paiement validé par l'administrateur.",
            variant: "destructive",
          });
          return;
        }
      }

      // Récupérer toutes les données du ticket
      const eventData = ticket.events || {};
      const ticketType = ticket.ticket_types || {};

      // Construire l'objet EVENT avec toutes les données
      const eventForPDF = {
        title:
          ticket.event_title ||
          eventData.title ||
          ticket.events?.title ||
          "Événement",
        event_start_at:
          ticket.event_start_at ||
          eventData.event_start_at ||
          ticket.events?.event_start_at,
        event_end_at:
          ticket.event_end_at ||
          eventData.event_end_at ||
          ticket.events?.event_end_at,
        location:
          ticket.full_address ||
          ticket.location ||
          eventData.full_address ||
          eventData.address ||
          eventData.location ||
          eventData.city ||
          "Lieu non spécifié",
        full_address:
          ticket.full_address ||
          eventData.full_address ||
          eventData.address ||
          eventData.location ||
          eventData.city ||
          "Lieu non spécifié",
        address: ticket.address || eventData.address || "",
        city: ticket.city || eventData.city || "",
        country: ticket.country || eventData.country || "",
      };

      // Construire les données du ticket
      const ticketData = {
        ticket_number: String(ticket.ticket_number || ticket.qr_code || ""),
        ticket_code_short: String(ticket.ticket_code_short || ""),
        ticket_code: String(ticket.ticket_code || ticket.ticket_number || ""),
        type_name: ticketType.name || "Standard",
        color: ticketType.color || "blue",
        price:
          Number(ticket.purchase_amount_pi) ||
          Number(ticket.purchase_price_pi) ||
          0,
        price_fcfa:
          Number(ticket.purchase_amount_fcfa) ||
          Number(ticket.purchase_price_pi || 0) * 10 ||
          0,
        purchase_date: ticket.purchased_at,
        purchased_at: ticket.purchased_at,
        payment_method: ticket.payment_method || "coins",
        attendee_name: ticket.attendee_name || "Invité",
        event_title: eventForPDF.title,
        event_start_at: eventForPDF.event_start_at,
        event_end_at: eventForPDF.event_end_at,
        location: eventForPDF.location,
        full_address: eventForPDF.full_address,
      };

      const attendeeName = ticket.attendee_name || "Invité";

      const userData = {
        full_name: attendeeName,
        email: user?.email || ticket.email || "invite@temp.com",
        id: user?.id || ticket.user_id || "guest",
      };

      console.log("📄 Génération PDF pour ticket:", {
        ticket: ticketData,
        event: eventForPDF,
        user: userData,
      });

      await generateTicketPDF(eventForPDF, [ticketData], userData);
      toast({ title: "✅ Succès", description: "Billet téléchargé." });
    } catch (e) {
      console.error("Download error", e);
      toast({
        title: "Erreur",
        description: "Échec du téléchargement PDF.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const openQrModal = (ticket) => {
    setSelectedTicket(ticket);
    setShowQrModal(true);
  };

  const formatPurchaseDate = (dateString) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  };

  const handleCreateAccount = () => {
    const guestTickets = JSON.parse(
      localStorage.getItem(GUEST_TICKETS_KEY) || "[]",
    );
    if (guestTickets.length > 0) {
      localStorage.setItem(
        "pending_guest_tickets",
        JSON.stringify(guestTickets),
      );
    }
    navigate("/auth?redirect=/profile?tab=tickets&claim=guest");
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const renderTickets = () => {
    if (tickets.length === 0) {
      return (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Ticket className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun billet</h3>
            <p className="text-muted-foreground mb-6">
              {isGuest || isGuestView
                ? "Vous n'avez pas encore acheté de billets en tant qu'invité."
                : "Vous n'avez pas encore acheté de billets."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => (window.location.href = "/events")}>
                Explorer les événements
              </Button>
              {(isGuest || isGuestView) && (
                <Button variant="outline" onClick={handleCreateAccount}>
                  <User className="w-4 h-4 mr-2" />
                  Créer un compte pour sauvegarder mes billets
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Ticket className="text-primary w-5 h-5" />
            Mes Billets ({tickets.length})
            {(isGuest || isGuestView) && (
              <Badge
                variant="outline"
                className="ml-2 bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-xs"
              >
                🎟️ Invité
              </Badge>
            )}
          </h2>
          <div className="flex gap-2">
            {(isGuest || isGuestView) && (
              <>
                <Button variant="outline" size="sm" onClick={handleGoBack}>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Retour
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshUssdStatuses(tickets)}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                  Vérifier statut
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateAccount}
                >
                  <User className="w-4 h-4 mr-1" />
                  Sauvegarder
                </Button>
              </>
            )}
            {!isGuest && !isGuestView && (
              <Button variant="ghost" size="sm" onClick={fetchTickets}>
                <RefreshCw className="w-4 h-4 mr-2" /> Actualiser
              </Button>
            )}
          </div>
        </div>

        {(isGuest || isGuestView) && (
          <Alert className="bg-yellow-950/50 border-yellow-800/50 text-yellow-300 mb-4">
            <AlertDescription>
              💡 Vos billets sont sauvegardés localement.
              <Button
                variant="link"
                onClick={handleCreateAccount}
                className="text-yellow-400 font-bold p-0 h-auto ml-1"
              >
                Créez un compte
              </Button>{" "}
              pour les retrouver partout.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          {tickets.map((ticket) => {
            const eventData = ticket.events || {};
            const ticketType = ticket.ticket_types || {};
            const isNew = ticket.id === newTicketId;
            const isMoneyFusion =
              ticket.payment_method === "moneyfusion_ticket";
            const attendeeName = ticket.attendee_name || null;
            const isUssd = ticket.payment_method === USSD;
            const ussdCompleted =
              isUssd && ticket.payment_status === "completed";
            const ussdCancelled =
              isUssd && ticket.payment_status === "cancelled";
            const ussdWaiting =
              isUssd && !ussdCompleted && !ussdCancelled;

            const eventLocation =
              ticket.full_address ||
              ticket.location ||
              eventData.full_address ||
              eventData.address ||
              eventData.location ||
              eventData.city ||
              "Lieu non spécifié";

            return (
              <Card
                key={ticket.id}
                className={`overflow-hidden border-l-4 hover:shadow-md transition-all ${
                  isNew
                    ? "border-green-500 ring-2 ring-green-500/20 animate-in fade-in slide-in-from-left-4"
                    : ""
                }`}
                style={{ borderLeftColor: getComputedColor(ticketType.color) }}
              >
                {isNew && (
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold px-4 py-1.5 text-center animate-pulse">
                    🎉 Nouveau billet !
                  </div>
                )}
                {ticket.isGuest && !isNew && (
                  <div className="bg-yellow-500/20 text-yellow-300 text-[10px] font-medium px-4 py-0.5 text-center border-b border-yellow-500/20">
                    🎟️ Billet valide
                  </div>
                )}
                <div className="flex flex-col md:flex-row">
                  <div className="bg-muted/30 md:w-32 p-4 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-border">
                    <span className="text-2xl font-bold text-primary">
                      {eventData.event_start_at
                        ? new Date(eventData.event_start_at).getDate()
                        : "--"}
                    </span>
                    <span className="text-xs uppercase font-bold text-muted-foreground">
                      {eventData.event_start_at
                        ? new Date(eventData.event_start_at).toLocaleDateString(
                            "fr-FR",
                            { month: "short" },
                          )
                        : "--"}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">
                      {eventData.event_start_at
                        ? new Date(eventData.event_start_at).getFullYear()
                        : ""}
                    </span>
                  </div>

                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg line-clamp-1">
                          {ticket.event_title || eventData.title || "Événement"}
                        </h3>
                        <StatusBadge status={ticket.status} />
                      </div>

                      {attendeeName && (
                        <div className="flex items-center text-sm text-primary mb-2 bg-primary/5 p-1.5 rounded-md border border-primary/10">
                          <User className="w-3 h-3 mr-1.5 text-primary" />
                          <span className="font-medium text-primary">
                            {attendeeName}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-2">
                            Titulaire
                          </span>
                        </div>
                      )}

                      <div className="flex items-center text-sm text-muted-foreground mb-3">
                        <MapPin className="w-3 h-3 mr-1" />
                        <span className="line-clamp-1">{eventLocation}</span>
                      </div>

                      {ticket.purchased_at && (
                        <div className="flex items-center text-xs text-muted-foreground mb-3 bg-muted/30 p-1.5 rounded-md w-fit border border-black/5">
                          <Calendar className="w-3 h-3 mr-1.5 text-primary/70" />
                          <span>
                            Acheté le {formatPurchaseDate(ticket.purchased_at)}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: getComputedColor(ticketType.color),
                            color: getComputedColor(ticketType.color),
                          }}
                        >
                          {ticketType.name || "Standard"}
                        </Badge>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">
                          {ticket.ticket_code_short || "******"}
                        </span>
                        {ticket.payment_method && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30"
                          >
                            {ticket.payment_method === USSD
                              ? "📱 Paiement USSD"
                              : ticket.payment_method === "moneyfusion_ticket"
                                ? "💰 Paiement externe"
                                : "🎫 Pièces"}
                          </Badge>
                        )}
                        {isUssd && (
                          <Badge
                            variant="outline"
                            className={
                              ussdCompleted
                                ? "text-[10px] bg-green-500/10 text-green-400 border-green-500/30"
                                : ussdCancelled
                                  ? "text-[10px] bg-red-500/10 text-red-400 border-red-500/30"
                                  : "text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30"
                            }
                          >
                            {ussdCompleted
                              ? "✅ Paiement validé"
                              : ussdCancelled
                                ? "❌ Paiement rejeté"
                                : "⏳ En attente de validation"}
                          </Badge>
                        )}
                        {attendeeName && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30"
                          >
                            👤{" "}
                            {attendeeName.length > 15
                              ? attendeeName.substring(0, 15) + "…"
                              : attendeeName}
                          </Badge>
                        )}
                        {eventLocation !== "Lieu non spécifié" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30"
                          >
                            📍{" "}
                            {eventLocation.length > 20
                              ? eventLocation.substring(0, 20) + "…"
                              : eventLocation}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/10 flex flex-row md:flex-col items-center justify-center gap-2 border-t md:border-t-0 md:border-l border-border">
                    {isUssd && ussdWaiting ? (
                      <div className="flex-1 w-full flex flex-col items-center justify-center text-center gap-1 p-2">
                        <span className="text-amber-500">
                          <Clock className="w-5 h-5 mx-auto" />
                        </span>
                        <p className="text-[11px] text-amber-600 font-medium">
                          {ussdCancelled
                            ? "❌ Paiement rejeté"
                            : "⏳ Billet disponible après validation de l'administrateur"}
                        </p>
                      </div>
                    ) : isUssd && ussdCancelled ? (
                      <div className="flex-1 w-full flex flex-col items-center justify-center text-center gap-1 p-2">
                        <span className="text-red-500">
                          <XCircle className="w-5 h-5 mx-auto" />
                        </span>
                        <p className="text-[11px] text-red-500 font-medium">
                          Paiement rejeté (billet annulé)
                        </p>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 w-full"
                          onClick={() => openQrModal(ticket)}
                        >
                          <QrCode className="w-4 h-4 mr-2" /> QR Code
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 w-full"
                          onClick={() => handleDownload(ticket)}
                          disabled={downloadingId === ticket.id}
                        >
                          {downloadingId === ticket.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          PDF
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
          <DialogContent className="sm:max-w-sm text-center">
            <DialogHeader>
              <DialogTitle>
                {selectedTicket?.events?.title ||
                  selectedTicket?.event_title ||
                  "Billet"}
              </DialogTitle>
              <DialogDescription>
                Présentez ce QR Code à l'entrée
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-6">
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                {selectedTicket && (
                  <QRCode
                    value={
                      selectedTicket.ticket_code_short ||
                      selectedTicket.ticket_number ||
                      selectedTicket.id
                    }
                    size={200}
                    level={"H"}
                  />
                )}
              </div>
              <p className="mt-4 text-2xl font-mono font-bold tracking-widest text-primary">
                {selectedTicket?.ticket_code_short}
              </p>
              {selectedTicket?.purchased_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  Acheté le {formatPurchaseDate(selectedTicket.purchased_at)}
                </p>
              )}
              <div className="mt-4 flex gap-2 flex-wrap justify-center">
                <Badge
                  variant={
                    selectedTicket?.status === "used" ? "secondary" : "default"
                  }
                >
                  {selectedTicket?.status === "active"
                    ? "✅ Billet Valide"
                    : "❌ Déjà utilisé"}
                </Badge>
                {selectedTicket?.payment_method === "moneyfusion_ticket" && (
                  <Badge
                    variant="outline"
                    className="bg-blue-500/10 text-blue-400 border-blue-500/30"
                  >
                    Paiement externe
                  </Badge>
                )}
                {selectedTicket?.isGuest && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                  >
                    🎟️ Invité
                  </Badge>
                )}
                {selectedTicket?.attendee_name && (
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-400 border-green-500/30"
                  >
                    👤 {selectedTicket.attendee_name}
                  </Badge>
                )}
                {(selectedTicket?.events?.full_address ||
                  selectedTicket?.events?.address ||
                  selectedTicket?.events?.location ||
                  selectedTicket?.events?.city ||
                  selectedTicket?.full_address ||
                  selectedTicket?.location) && (
                  <Badge
                    variant="outline"
                    className="bg-blue-500/10 text-blue-400 border-blue-500/30 w-full mt-1"
                  >
                    📍{" "}
                    {selectedTicket?.events?.full_address ||
                      selectedTicket?.full_address ||
                      selectedTicket?.events?.address ||
                      selectedTicket?.events?.location ||
                      selectedTicket?.events?.city ||
                      selectedTicket?.location}
                  </Badge>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}{" "}
          <Button
            variant="link"
            onClick={fetchTickets}
            className="p-0 h-auto font-bold ml-2"
          >
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (paymentSuccess && tickets.length > 0) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <Alert className="bg-gradient-to-r from-green-950/50 to-emerald-950/50 border-green-800/50 text-green-300">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
          <AlertDescription className="font-medium">
            🎉 Paiement réussi ! Vos billets sont disponibles ci-dessous.
            {(isGuest || isGuestView) && (
              <span className="block text-xs text-yellow-300 mt-1">
                💡 Créez un compte pour sauvegarder vos billets de façon
                permanente.
              </span>
            )}
          </AlertDescription>
        </Alert>
        {renderTickets()}
      </div>
    );
  }

  return renderTickets();
};

const StatusBadge = ({ status }) => {
  if (status === "used") {
    return (
      <Badge variant="secondary" className="bg-gray-200 text-gray-600">
        Utilisé
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">
        Valide
      </Badge>
    );
  }
  return <Badge variant="destructive">Invalide</Badge>;
};

const getComputedColor = (colorName) => {
  const colors = {
    blue: "#3b82f6",
    bronze: "#cd7f32",
    silver: "#9ca3af",
    gold: "#eab308",
    purple: "#9333ea",
    red: "#ef4444",
    green: "#22c55e",
    black: "#1f2937",
  };
  return colors[colorName] || colors.blue;
};

export default MyTicketsTab;
