import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Ticket,
  Trash,
  Coins,
  Save,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  MessageSquare,
  FileText,
  ChevronRight,
  Tag,
  Calendar,
  CalendarDays,
  Minus,
  CalendarRange,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import ImageUpload from "@/components/ImageUpload";
import { Checkbox } from "@/components/ui/checkbox";
import OrganizerContractModal from "@/components/organizer/OrganizerContractModal";
import { PromoCodeConfig } from "@/components/organizer/PromoCodeConfig";

const TICKET_COLORS = [
  {
    name: "Bleu Standard",
    value: "blue",
    hex: "bg-blue-500",
    border: "border-blue-500",
    text: "text-blue-400",
    bgLight: "bg-blue-500/20",
  },
  {
    name: "Bronze",
    value: "bronze",
    hex: "bg-amber-600",
    border: "border-amber-600",
    text: "text-amber-400",
    bgLight: "bg-amber-500/20",
  },
  {
    name: "Argent",
    value: "silver",
    hex: "bg-slate-400",
    border: "border-slate-400",
    text: "text-slate-300",
    bgLight: "bg-slate-400/20",
  },
  {
    name: "Or",
    value: "gold",
    hex: "bg-yellow-500",
    border: "border-yellow-500",
    text: "text-yellow-400",
    bgLight: "bg-yellow-500/20",
  },
  {
    name: "Violet VIP",
    value: "purple",
    hex: "bg-purple-600",
    border: "border-purple-600",
    text: "text-purple-400",
    bgLight: "bg-purple-600/20",
  },
  {
    name: "Rouge",
    value: "red",
    hex: "bg-red-500",
    border: "border-red-500",
    text: "text-red-400",
    bgLight: "bg-red-500/20",
  },
  {
    name: "Vert",
    value: "green",
    hex: "bg-green-500",
    border: "border-green-500",
    text: "text-green-400",
    bgLight: "bg-green-500/20",
  },
  {
    name: "Rose",
    value: "pink",
    hex: "bg-pink-500",
    border: "border-pink-500",
    text: "text-pink-400",
    bgLight: "bg-pink-500/20",
  },
  {
    name: "Cyan",
    value: "cyan",
    hex: "bg-cyan-500",
    border: "border-cyan-500",
    text: "text-cyan-400",
    bgLight: "bg-cyan-500/20",
  },
  {
    name: "Orange",
    value: "orange",
    hex: "bg-orange-500",
    border: "border-orange-500",
    text: "text-orange-400",
    bgLight: "bg-orange-500/20",
  },
  {
    name: "Indigo",
    value: "indigo",
    hex: "bg-indigo-500",
    border: "border-indigo-500",
    text: "text-indigo-400",
    bgLight: "bg-indigo-500/20",
  },
  {
    name: "Noir",
    value: "black",
    hex: "bg-slate-900",
    border: "border-slate-700",
    text: "text-slate-300",
    bgLight: "bg-slate-900/30",
  },
  {
    name: "Blanc",
    value: "white",
    hex: "bg-white",
    border: "border-white",
    text: "text-gray-800",
    bgLight: "bg-white/20",
  },
];

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
const CreateTicketingEventPage = () => {
  const { user } = useAuth();
  const { adminConfig } = useData();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [step, setStep] = useState(1);

  // Contract Modal State
  const [showContractModal, setShowContractModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [contractAcceptanceId, setContractAcceptanceId] = useState(null);

  // Promo Code Configuration State
  const [promoConfig, setPromoConfig] = useState(null);
  const [promoConfigSaved, setPromoConfigSaved] = useState(false);

  // Pricing Configuration
  const COIN_RATE = adminConfig?.coin_to_fcfa_rate || 10;

  // Event Details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [maxAttendees, setMaxAttendees] = useState(1000);
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [coverImage, setCoverImage] = useState("");

  // ============================================================
  // GESTION DES BILLETS
  // ============================================================
  const [ticketType, setTicketType] = useState("multi_day");
  const [eventDays, setEventDays] = useState([]);
  const [dailyTicketConfig, setDailyTicketConfig] = useState({});

  const [multiDayTickets, setMultiDayTickets] = useState([
    {
      id: uuidv4(),
      name: "Adulte",
      price: 800,
      presale_price: 600,
      quantity: 500,
      color: "red",
      description: "Billet Adulte - Valable pour toute la durée de l'événement",
    },
    {
      id: uuidv4(),
      name: "Enfant",
      price: 400,
      presale_price: 300,
      quantity: 500,
      color: "blue",
      description: "Billet Enfant - Valable pour toute la durée de l'événement",
    },
  ]);

  // ============================================================
  // CHARGEMENT DES CATÉGORIES
  // ============================================================
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from("event_categories")
          .select("id, name, color_hex, display_order")
          .eq("is_active", true)
          .order("display_order", { ascending: true, nullsFirst: false });

        if (error) throw error;
        setCategories(data || []);
      } catch (err) {
        console.error("❌ Error fetching categories:", err);
        setCategories([]);
      }
    };
    fetchCategories();
  }, []);

  // ============================================================
  // GÉNÉRATION DES JOURS DE L'ÉVÉNEMENT
  // ============================================================
  useEffect(() => {
    if (eventDate && endDate) {
      const start = new Date(eventDate);
      const end = new Date(endDate);
      const days = [];
      const current = new Date(start);

      while (current <= end) {
        days.push({
          date: new Date(current),
          label: current.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }),
          dateStr: current.toISOString().split("T")[0],
        });
        current.setDate(current.getDate() + 1);
      }
      setEventDays(days);
    }
  }, [eventDate, endDate]);

  // ============================================================
  // CONFIGURATION DES BILLETS PAR JOUR
  // ============================================================
  useEffect(() => {
    if (eventDays.length > 0 && ticketType === "daily") {
      const config = {};

      eventDays.forEach((day) => {
        config[day.dateStr] = {
          enabled: true,
          tickets: [
            {
              id: uuidv4(),
              name: "Adulte",
              price: 800,
              presale_price: 600,
              quantity: 500,
              color: "red",
              description: `Billet Adulte - ${day.label}`,
            },
            {
              id: uuidv4(),
              name: "Enfant",
              price: 400,
              presale_price: 300,
              quantity: 500,
              color: "blue",
              description: `Billet Enfant - ${day.label}`,
            },
          ],
        };
      });

      setDailyTicketConfig(config);
    }
  }, [eventDays, ticketType]);

  // ============================================================
  // RESTAURATION DU BROUILLON
  // ============================================================
  useEffect(() => {
    const restoreDraft = () => {
      const draft = localStorage.getItem("draftEvent");
      if (draft) {
        try {
          const draftData = JSON.parse(draft);
          setTitle(draftData.title || "");
          setDescription(draftData.description || "");
          setEventDate(draftData.eventDate || "");
          setEndDate(draftData.endDate || "");
          setCity(draftData.city || "");
          setCountry(draftData.country || "");
          setAddress(draftData.address || "");
          setCategoryId(draftData.categoryId || "");
          setMaxAttendees(draftData.maxAttendees || 1000);
          setIsPublic(
            draftData.isPublic !== undefined ? draftData.isPublic : true,
          );
          setRequiresApproval(draftData.requiresApproval || false);
          setCoverImage(draftData.coverImage || "");
          setTicketType(draftData.ticketType || "multi_day");

          if (draftData.multiDayTickets) {
            setMultiDayTickets(draftData.multiDayTickets);
          }
          if (draftData.dailyTicketConfig) {
            setDailyTicketConfig(draftData.dailyTicketConfig);
          }
          if (draftData.promoConfig) {
            setPromoConfig(draftData.promoConfig);
            setPromoConfigSaved(true);
          }

          toast({
            title: "Brouillon restauré",
            description: "Votre brouillon précédent a été restauré.",
            duration: 4000,
          });
        } catch (error) {
          console.error("Error restoring draft:", error);
        }
      }
    };

    if (user) {
      restoreDraft();
    }
  }, [user]);

  // ============================================================
  // GESTION DES BILLETS MULTI-JOURS
  // ============================================================
  const updateMultiDayTicket = (ticketId, field, value) => {
    setMultiDayTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, [field]: value } : t)),
    );
  };

  const addMultiDayTicket = () => {
    const newTicket = {
      id: uuidv4(),
      name: "Nouveau billet",
      price: 1000,
      presale_price: 800,
      quantity: 0,
      color: "blue",
      description: "Billet - Valable pour toute la durée de l'événement",
    };
    setMultiDayTickets([...multiDayTickets, newTicket]);
  };

  const removeMultiDayTicket = (ticketId) => {
    setMultiDayTickets(multiDayTickets.filter((t) => t.id !== ticketId));
  };

  const getTotalMultiDayTickets = () => {
    return multiDayTickets.reduce(
      (sum, t) => sum + (parseInt(t.quantity) || 0),
      0,
    );
  };

  // ============================================================
  // GESTION DES BILLETS PAR JOUR
  // ============================================================
  const updateTicketField = (dateStr, ticketId, field, value) => {
    setDailyTicketConfig((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        tickets: prev[dateStr].tickets.map((t) =>
          t.id === ticketId ? { ...t, [field]: value } : t,
        ),
      },
    }));
  };

  const addTicketToDay = (dateStr) => {
    const day = eventDays.find((d) => d.dateStr === dateStr);
    const newTicket = {
      id: uuidv4(),
      name: "Nouveau billet",
      price: 500,
      presale_price: 400,
      quantity: 0,
      color: "blue",
      description: `Billet pour le ${day?.label || dateStr}`,
    };

    setDailyTicketConfig((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        tickets: [...prev[dateStr].tickets, newTicket],
      },
    }));
  };

  const removeTicketFromDay = (dateStr, ticketId) => {
    setDailyTicketConfig((prev) => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        tickets: prev[dateStr].tickets.filter((t) => t.id !== ticketId),
      },
    }));
  };

  const getTotalTicketsByDay = (dateStr) => {
    const config = dailyTicketConfig[dateStr];
    if (!config) return 0;
    return config.tickets.reduce(
      (sum, t) => sum + (parseInt(t.quantity) || 0),
      0,
    );
  };

  const getTotalDailyTickets = () => {
    let total = 0;
    Object.values(dailyTicketConfig).forEach((dayConfig) => {
      dayConfig.tickets.forEach((t) => {
        total += parseInt(t.quantity) || 0;
      });
    });
    return total;
  };

  const getTotalAllTickets = () => {
    if (ticketType === "multi_day") {
      return getTotalMultiDayTickets();
    } else {
      return getTotalDailyTickets();
    }
  };

  // ============================================================
  // CONTRAT - NOUVELLE VERSION AVEC ENREGISTREMENT DIRECT
  // ============================================================
  const handleContractAccept = async () => {
    if (!user) {
      toast({
        title: "Erreur",
        description: "Vous devez être connecté pour accepter le contrat.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_contract_acceptances")
        .insert({
          user_id: user.id,
          event_id: null,
          contract_type: "organizer",
          accepted_at: new Date().toISOString(),
          contract_version: "v1.0",
        })
        .select()
        .single();

      if (error) {
        console.warn("⚠️ Table user_contract_acceptances non trouvée:", error);
        setTermsAccepted(true);
        setShowContractModal(false);
        toast({
          title: "Contrat accepté",
          description: "Vous pouvez maintenant publier votre événement.",
          className: "bg-green-600 text-white",
        });
        return;
      }

      if (data) {
        setContractAcceptanceId(data.id);
      }

      setTermsAccepted(true);
      setShowContractModal(false);

      toast({
        title: "✅ Contrat accepté",
        description:
          "Votre acceptation a été enregistrée. Vous pouvez maintenant publier votre événement.",
        className: "bg-green-600 text-white",
      });
    } catch (err) {
      console.error("❌ Erreur lors de l'acceptation du contrat:", err);
      setTermsAccepted(true);
      setShowContractModal(false);
      toast({
        title: "Contrat accepté",
        description: "Vous pouvez maintenant publier votre événement.",
        className: "bg-green-600 text-white",
      });
    }
  };

  const handleOpenContract = () => {
    setShowContractModal(true);
  };

  const handlePromoConfigSave = (config) => {
    setPromoConfig(config);
    setPromoConfigSaved(true);
  };

  // ============================================================
  // SOUMISSION
  // ============================================================
  const performSubmission = async () => {
    if (!termsAccepted) {
      toast({
        title: "Contrat requis",
        description: "Veuillez lire et accepter le contrat organisateur.",
        variant: "destructive",
      });
      setShowContractModal(true);
      return;
    }

    if (!user) {
      toast({
        title: "Erreur",
        description: "Vous devez être connecté.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const eventStartAt = new Date(eventDate);
      const eventEndAt = endDate
        ? new Date(endDate)
        : new Date(eventStartAt.getTime() + 24 * 60 * 60 * 1000);

      // 1. Création de l'événement
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .insert({
          title,
          description: description || "",
          event_start_at: eventStartAt.toISOString(),
          event_end_at: eventEndAt.toISOString(),
          city,
          country: country || "Côte d'Ivoire",
          address: address || null,
          cover_image: coverImage,
          organizer_id: user.id,
          event_type: "ticketing",
          category_id: categoryId,
          status: "active",
          max_attendees: parseInt(maxAttendees, 10) || null,
          is_public: isPublic,
          requires_approval: requiresApproval,
          contract_accepted_at: new Date().toISOString(),
          contract_version: "v1.0",
        })
        .select()
        .single();

      if (eventError) throw eventError;

      const newEventId = eventData.id;

      // 2. Mettre à jour l'acceptation du contrat avec l'event_id
      if (contractAcceptanceId) {
        try {
          await supabase
            .from("user_contract_acceptances")
            .update({ event_id: newEventId })
            .eq("id", contractAcceptanceId);
        } catch (err) {
          console.warn("⚠️ Erreur mise à jour contrat avec event_id:", err);
        }
      } else {
        try {
          await supabase.from("user_contract_acceptances").insert({
            user_id: user.id,
            event_id: newEventId,
            contract_type: "organizer",
            accepted_at: new Date().toISOString(),
            contract_version: "v1.0",
          });
        } catch (err) {
          console.warn("⚠️ Erreur insertion contrat:", err);
        }
      }

      // 3. Sauvegarder les codes promo
      if (promoConfig && promoConfig.enabled) {
        try {
          await supabase.from("event_promo_config").insert({
            event_id: newEventId,
            enabled: promoConfig.enabled,
            discount_type: promoConfig.discount_type,
            discount_value: promoConfig.discount_value,
            commission_rate: promoConfig.commission_rate,
            usage_limit: promoConfig.usage_limit || null,
          });
        } catch (err) {
          console.warn("⚠️ Erreur promo config (non bloquante):", err);
        }
      }

      // 4. Créer ticketing_events
      const totalTickets = getTotalAllTickets();

      await supabase.from("ticketing_events").insert({
        event_id: newEventId,
        total_tickets: totalTickets,
        tickets_sold: 0,
      });

      // ============================================================
      // 5. CRÉATION DES TICKETS
      // ============================================================
      const ticketTypesToInsert = [];
      const ticketsToInsert = [];

      const allEventDates = eventDays.map((day) => day.dateStr);

      if (ticketType === "multi_day") {
        for (const ticket of multiDayTickets) {
          const quantity = parseInt(ticket.quantity) || 0;
          if (quantity <= 0) continue;

          const priceFcfa = parseInt(ticket.price) || 0;
          const presalePriceFcfa = parseInt(ticket.presale_price) || 0;
          const priceCoins = Math.ceil(priceFcfa / COIN_RATE);
          const presalePriceCoins =
            presalePriceFcfa > 0
              ? Math.ceil(presalePriceFcfa / COIN_RATE)
              : null;

          const ticketTypeData = {
            event_id: newEventId,
            name: ticket.name,
            description: ticket.description || `Billet ${ticket.name}`,
            price: priceFcfa.toString(),
            price_pi: priceCoins,
            price_coins: priceCoins,
            quantity_available: quantity,
            quantity_sold: 0,
            presale_price_pi: presalePriceCoins,
            presale_price_fcfa:
              presalePriceFcfa > 0 ? presalePriceFcfa.toString() : null,
            sales_start: new Date().toISOString(),
            sales_end: eventEndAt.toISOString(),
            is_active: true,
            color: ticket.color || "blue",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          ticketTypesToInsert.push(ticketTypeData);
        }
      } else {
        for (const [dateStr, dayConfig] of Object.entries(dailyTicketConfig)) {
          if (!dayConfig.enabled) continue;

          for (const ticket of dayConfig.tickets) {
            const quantity = parseInt(ticket.quantity) || 0;
            if (quantity <= 0) continue;

            const priceFcfa = parseInt(ticket.price) || 0;
            const presalePriceFcfa = parseInt(ticket.presale_price) || 0;
            const priceCoins = Math.ceil(priceFcfa / COIN_RATE);
            const presalePriceCoins =
              presalePriceFcfa > 0
                ? Math.ceil(presalePriceFcfa / COIN_RATE)
                : null;

            const ticketTypeData = {
              event_id: newEventId,
              name: `${ticket.name} - ${dateStr}`,
              description:
                ticket.description ||
                `Billet ${ticket.name} pour le ${dateStr}`,
              price: priceFcfa.toString(),
              price_pi: priceCoins,
              price_coins: priceCoins,
              quantity_available: quantity,
              quantity_sold: 0,
              presale_price_pi: presalePriceCoins,
              presale_price_fcfa:
                presalePriceFcfa > 0 ? presalePriceFcfa.toString() : null,
              sales_start: new Date().toISOString(),
              sales_end: eventEndAt.toISOString(),
              is_active: true,
              color: ticket.color || "blue",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            ticketTypesToInsert.push(ticketTypeData);
          }
        }
      }

      // Insérer les ticket_types
      if (ticketTypesToInsert.length > 0) {
        const { error: ticketTypesError } = await supabase
          .from("ticket_types")
          .insert(ticketTypesToInsert);

        if (ticketTypesError) throw ticketTypesError;
      }

      // Récupérer les ticket_types créés
      const { data: createdTicketTypes, error: fetchError } = await supabase
        .from("ticket_types")
        .select("id, name, price_pi, quantity_available, color")
        .eq("event_id", newEventId);

      if (fetchError) throw fetchError;

      // ============================================================
      // 🔥 CRÉATION DES TICKETS INDIVIDUELS - VERSION CORRIGÉE
      // ============================================================
      const usedCodes = new Set();
      const genShortCode = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        let code;
        do {
          code = `${String(Math.floor(10000 + Math.random() * 90000))}${chars[Math.floor(Math.random() * chars.length)]}`;
        } while (usedCodes.has(code));
        usedCodes.add(code);
        return code;
      };
      for (const ttType of createdTicketTypes) {
        const quantity = parseInt(ttType.quantity_available, 10) || 0;

        const dateMatch = ttType.name.match(/\d{4}-\d{2}-\d{2}/);
        const isMultiDay = !dateMatch;
        const ticketDate = dateMatch ? dateMatch[0] : null;

        // Récupérer le prix en pièces depuis le ticket_type
        const priceInCoins = parseInt(ttType.price_pi, 10) || 0;

        // Pour les billets multi-jours, la date est le premier jour
        const effectiveDate = isMultiDay
          ? eventStartAt.toISOString().split("T")[0]
          : ticketDate;

        // 🔥 VÉRIFIER QUE LA DATE EXISTE
        if (!effectiveDate) {
          console.warn(
            `⚠️ Date non trouvée pour ${ttType.name}, utilisation de la date de début`,
          );
          // Utiliser la date de début comme fallback
          const fallbackDate = eventStartAt.toISOString().split("T")[0];
          console.log(`📅 Date de fallback: ${fallbackDate}`);
          // Recalculer effectiveDate avec fallback
          const finalDate = isMultiDay
            ? eventStartAt.toISOString().split("T")[0]
            : ticketDate || eventStartAt.toISOString().split("T")[0];
          
          // Utiliser finalDate pour la suite
          const usedDate = finalDate;

          for (let i = 0; i < quantity; i++) {
            const shortCode = genShortCode();
            const ticketData = {
              event_id: newEventId,
              ticket_type_id: ttType.id,
              qr_code: shortCode,
              ticket_code_short: shortCode,
              ticket_number: `TN-${ttType.id.slice(0, 8)}-${String(i + 1).padStart(4, "0")}`,
              attendee_name: null,
              phone: null,
              email: null,
              user_id: null,
              purchase_price_pi: priceInCoins,
              status: "active",
              ticket_date: usedDate,
              is_multi_day: isMultiDay,
              valid_dates: isMultiDay ? allEventDates : null,
              purchased_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            ticketsToInsert.push(ticketData);
          }
          
          console.log(
            `✅ ${quantity} tickets générés pour ${ttType.name} avec date ${usedDate}`,
          );
          continue;
        }

        for (let i = 0; i < quantity; i++) {
          const shortCode = genShortCode();
          const ticketData = {
            event_id: newEventId,
            ticket_type_id: ttType.id,
            qr_code: shortCode,
            ticket_code_short: shortCode,
            ticket_number: `TN-${ttType.id.slice(0, 8)}-${String(i + 1).padStart(4, "0")}`,
            attendee_name: null,
            phone: null,
            email: null,
            user_id: null,
            purchase_price_pi: priceInCoins,
            status: "active",
            ticket_date: effectiveDate,
            is_multi_day: isMultiDay,
            valid_dates: isMultiDay ? allEventDates : null,
            purchased_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          ticketsToInsert.push(ticketData);
        }
      }

      // Insérer les tickets
      if (ticketsToInsert.length > 0) {
        const { error: ticketsError } = await supabase
          .from("tickets")
          .insert(ticketsToInsert);

        if (ticketsError) {
          console.error("❌ Erreur création tickets:", ticketsError);
          throw ticketsError;
        }
      }

      // ============================================================
      // 🔥 RÉINITIALISER quantity_sold à 0 (sécurité)
      // ============================================================
      const { error: resetSoldError } = await supabase
        .from("ticket_types")
        .update({ quantity_sold: 0 })
        .eq("event_id", newEventId);

      if (resetSoldError) {
        console.warn(
          "⚠️ Erreur réinitialisation quantity_sold:",
          resetSoldError,
        );
      }

      // Nettoyer les brouillons
      localStorage.removeItem("draftEvent");
      localStorage.removeItem("event_promo_config_draft");

      // Notification de succès
      const ticketTypeLabel =
        ticketType === "multi_day" ? "multi-jours" : "journaliers";
      toast({
        title: "🎉 Succès !",
        description: (
          <div className="space-y-1">
            <p>Votre événement billetterie a été créé avec succès !</p>
            <p className="text-xs opacity-90">
              {ticketsToInsert.length} billets {ticketTypeLabel} •
              {ticketType === "multi_day"
                ? "Valables toute la durée"
                : `${eventDays.length} jours disponibles`}
            </p>
            {ticketType === "multi_day" ? (
              <p className="text-xs opacity-90">
                {multiDayTickets
                  .map((t) => `${t.name}: ${t.quantity || 0}`)
                  .join(" | ")}
              </p>
            ) : (
              <p className="text-xs opacity-90">
                {Object.entries(dailyTicketConfig)
                  .map(
                    ([date, config]) =>
                      `${date}: ${config.tickets.reduce((sum, t) => sum + (parseInt(t.quantity) || 0), 0)} billets`,
                  )
                  .join(" | ")}
              </p>
            )}
            {promoConfig?.enabled && (
              <p className="text-xs opacity-90 mt-1">🏷️ Code promo activé</p>
            )}
          </div>
        ),
        duration: 6000,
        className: "bg-gradient-to-r from-green-600 to-emerald-600 text-white",
      });

      setTimeout(() => {
        navigate(`/event/${newEventId}`);
      }, 2000);
    } catch (error) {
      console.error("❌ Erreur création événement:", error);
      toast({
        title: "Erreur",
        description:
          error.message || "Une erreur est survenue lors de la création",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Sauvegarde automatique du brouillon
  useEffect(() => {
    const saveDraft = () => {
      const draftData = {
        title,
        description,
        eventDate,
        endDate,
        city,
        country,
        address,
        categoryId,
        maxAttendees,
        isPublic,
        requiresApproval,
        coverImage,
        ticketType,
        multiDayTickets,
        dailyTicketConfig,
        promoConfig,
      };
      localStorage.setItem("draftEvent", JSON.stringify(draftData));
    };

    const debounce = setTimeout(saveDraft, 2000);
    return () => clearTimeout(debounce);
  }, [
    title,
    description,
    eventDate,
    endDate,
    city,
    country,
    address,
    categoryId,
    maxAttendees,
    isPublic,
    requiresApproval,
    coverImage,
    ticketType,
    multiDayTickets,
    dailyTicketConfig,
    promoConfig,
  ]);

  // ============================================================
  // RENDU - AVEC CHAMPS DE QUANTITÉ FLUIDES
  // ============================================================
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-4 md:p-8 pb-20">
      <Helmet>
        <title>Créer Billetterie - BonPlanInfos</title>
        <meta
          name="description"
          content="Créez votre événement billetterie et configurez vos billets"
        />
      </Helmet>

      <OrganizerContractModal
        open={showContractModal}
        onOpenChange={setShowContractModal}
        onAccept={handleContractAccept}
        eventTitle={title || "votre événement"}
        eventId="new-event"
      />

      <Card className="max-w-4xl mx-auto bg-[#111118] border border-white/10 shadow-2xl shadow-primary/5">
        <CardHeader className="border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary/20">
              <Ticket className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-white">
                Créer une Billetterie
              </CardTitle>
              <CardDescription className="text-white/60">
                Configurez votre événement, vos billets et vos tarifs.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs
            value={String(step)}
            onValueChange={(v) => setStep(parseInt(v))}
          >
            <div className="relative mb-8">
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 rounded-full"></div>
              <div
                className="absolute bottom-0 left-0 h-1 bg-primary rounded-full transition-all duration-300 ease-in-out"
                style={{
                  width: step === 1 ? "33%" : step === 2 ? "66%" : "100%",
                }}
              ></div>
              <TabsList className="grid w-full grid-cols-3 bg-transparent p-0">
                <TabsTrigger
                  value="1"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary text-base md:text-lg font-medium border-b-2 border-transparent rounded-none pb-2 text-white/60"
                >
                  1. Informations
                </TabsTrigger>
                <TabsTrigger
                  value="2"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary text-base md:text-lg font-medium border-b-2 border-transparent rounded-none pb-2 text-white/60"
                >
                  2. Billets
                </TabsTrigger>
                <TabsTrigger
                  value="3"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary text-base md:text-lg font-medium border-b-2 border-transparent rounded-none pb-2 text-white/60"
                >
                  3. Confirmation
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ÉTAPE 1 - INFORMATIONS - inchangée */}
            <TabsContent
              value="1"
              className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-base text-white">
                      Image de couverture
                    </Label>
                    <ImageUpload
                      onImageUploaded={setCoverImage}
                      existingImage={coverImage}
                      folder="event-covers"
                      maxSizeMB={10}
                      aspectRatio="16/9"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-white">Titre de l'événement *</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Festival 3 Jours..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white">Pays</Label>
                      <Input
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="France"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Ville *</Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Paris"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Adresse précise</Label>
                    <Input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Lieu, Salle, Rue..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Catégorie *</Label>
                    <Select onValueChange={setCategoryId} value={categoryId}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white">
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a2e] border-white/10">
                        {categories.length === 0 ? (
                          <div className="px-2 py-4 text-center text-white/60">
                            Chargement des catégories...
                          </div>
                        ) : (
                          categories.map((c) => (
                            <SelectItem
                              key={c.id}
                              value={c.id}
                              className="text-white hover:bg-white/10"
                            >
                              <div className="flex items-center gap-2">
                                {c.color_hex && (
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: c.color_hex }}
                                  />
                                )}
                                <span>{c.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Détaillez votre événement : programme, artistes, activités, etc."
                  className="min-h-[150px] bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-white">Début *</Label>
                  <Input
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Fin *</Label>
                  <Input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end mt-8">
                <Button
                  onClick={() => setStep(2)}
                  className="px-8 bg-primary hover:bg-primary/80"
                >
                  Suivant <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </TabsContent>

            {/* ÉTAPE 2 - BILLETS - AVEC CHAMPS DE QUANTITÉ FLUIDES */}
            <TabsContent
              value="2"
              className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300"
            >
              <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                <Label className="text-white mb-3 block">
                  Type de billetterie
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      ticketType === "multi_day"
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/30"
                    }`}
                    onClick={() => setTicketType("multi_day")}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarRange className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-white">Multi-jours</p>
                        <p className="text-xs text-white/60">
                          Un seul billet valable pour toute la durée de
                          l'événement
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      ticketType === "daily"
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/30"
                    }`}
                    onClick={() => setTicketType("daily")}
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-white">Par jour</p>
                        <p className="text-xs text-white/60">
                          Un billet spécifique pour chaque jour de l'événement
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {eventDays.length > 0 && (
                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                  <p className="text-sm font-medium text-white mb-2">
                    📅 Jours de l'événement
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {eventDays.map((day, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="text-white border-white/20"
                      >
                        {day.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/30 text-sm flex gap-3">
                <div className="p-2 bg-blue-500/20 rounded-full h-fit">
                  <Coins className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="font-bold text-base text-blue-400">
                    {ticketType === "multi_day"
                      ? "Billets Multi-jours"
                      : "Billets Journaliers"}
                  </p>
                  <p className="text-white/60">
                    10 FCFA = 1 pièce •
                    {ticketType === "multi_day"
                      ? " Chaque billet est valable pour toute la durée de l'événement"
                      : " Chaque billet est valable un jour spécifique"}
                  </p>
                </div>
              </div>

              {ticketType === "multi_day" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-primary" />
                      Types de billets multi-jours
                      <Badge
                        variant="secondary"
                        className="text-xs bg-primary/20 text-primary"
                      >
                        Total: {getTotalMultiDayTickets()} billets
                      </Badge>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addMultiDayTicket}
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Ajouter un billet
                    </Button>
                  </div>

                  {multiDayTickets.map((ticket) => {
                    const colorInfo =
                      TICKET_COLORS.find((c) => c.value === ticket.color) ||
                      TICKET_COLORS[0];
                    const quantity = parseInt(ticket.quantity) || 0;

                    return (
                      <div
                        key={ticket.id}
                        className="bg-black/30 rounded-lg p-4 border border-white/5"
                      >
                        <div className="flex flex-wrap gap-3 items-start">
                          <div className="flex-1 min-w-[150px]">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-3 h-3 rounded-full ${colorInfo.hex}`}
                              />
                              <Input
                                value={ticket.name}
                                onChange={(e) =>
                                  updateMultiDayTicket(
                                    ticket.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                                className="font-bold text-sm border-none shadow-none focus-visible:ring-0 px-0 w-auto min-w-[100px] bg-transparent text-white"
                                placeholder="Nom du billet"
                              />
                            </div>
                            <Input
                              value={ticket.description}
                              onChange={(e) =>
                                updateMultiDayTicket(
                                  ticket.id,
                                  "description",
                                  e.target.value,
                                )
                              }
                              className="text-xs border-none shadow-none focus-visible:ring-0 px-0 w-full bg-transparent text-white/60 mt-1"
                              placeholder="Description"
                            />
                          </div>

                          {/* 🔥 CHAMP DE QUANTITÉ FLUIDE - MULTI-JOURS */}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs text-white/60">
                                Qté
                              </Label>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 border-white/10 text-white hover:bg-white/10"
                                  onClick={() => {
                                    const current =
                                      parseInt(ticket.quantity) || 0;
                                    updateMultiDayTicket(
                                      ticket.id,
                                      "quantity",
                                      Math.max(0, current - 1),
                                    );
                                  }}
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                                <Input
                                  type="number"
                                  min="0"
                                  value={quantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    updateMultiDayTicket(
                                      ticket.id,
                                      "quantity",
                                      Math.max(0, val),
                                    );
                                  }}
                                  className="w-20 h-8 text-center text-sm bg-white/10 border-white/20 text-white font-bold focus:border-primary focus:ring-1 focus:ring-primary"
                                  style={{ 
                                    appearance: "textfield",
                                    MozAppearance: "textfield",
                                  }}
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 border-white/10 text-white hover:bg-white/10"
                                  onClick={() => {
                                    const current =
                                      parseInt(ticket.quantity) || 0;
                                    updateMultiDayTicket(
                                      ticket.id,
                                      "quantity",
                                      current + 1,
                                    );
                                  }}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              <Label className="text-xs text-white/60">
                                Prix FCFA
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                value={ticket.price}
                                onChange={(e) =>
                                  updateMultiDayTicket(
                                    ticket.id,
                                    "price",
                                    e.target.value,
                                  )
                                }
                                className="h-7 text-xs bg-white/5 border-white/10 text-white"
                              />
                            </div>
                            <div className="w-20">
                              <Label className="text-xs text-white/60">
                                Prévente
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                value={ticket.presale_price}
                                onChange={(e) =>
                                  updateMultiDayTicket(
                                    ticket.id,
                                    "presale_price",
                                    e.target.value,
                                  )
                                }
                                className="h-7 text-xs bg-white/5 border-white/10 text-white"
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-xs text-white/60">
                              Couleur
                            </Label>
                            <Select
                              value={ticket.color}
                              onValueChange={(val) =>
                                updateMultiDayTicket(ticket.id, "color", val)
                              }
                            >
                              <SelectTrigger className="w-24 h-7 text-xs bg-white/5 border-white/10 text-white">
                                <SelectValue>
                                  <div className="flex items-center gap-1">
                                    <div
                                      className={`w-3 h-3 rounded-full ${TICKET_COLORS.find((c) => c.value === ticket.color)?.hex || "bg-primary"}`}
                                    />
                                    <span className="text-xs">
                                      {TICKET_COLORS.find(
                                        (c) => c.value === ticket.color,
                                      )?.name || "Standard"}
                                    </span>
                                  </div>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="bg-[#1a1a2e] border-white/10">
                                {TICKET_COLORS.map((c) => (
                                  <SelectItem
                                    key={c.value}
                                    value={c.value}
                                    className="text-white hover:bg-white/10"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`w-3 h-3 rounded-full ${c.hex}`}
                                      />
                                      <span>{c.name}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMultiDayTicket(ticket.id)}
                            className="text-white/40 hover:text-red-400 hover:bg-red-500/10 mt-4 sm:mt-0"
                            disabled={multiDayTickets.length <= 1}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="mt-2 text-xs text-white/30">
                          💡 Valable pour toute la durée de l'événement (
                          {eventDays.length} jours)
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Configuration des billets par jour
                    <Badge
                      variant="secondary"
                      className="text-xs bg-primary/20 text-primary"
                    >
                      Total: {getTotalDailyTickets()} billets
                    </Badge>
                  </p>

                  {eventDays.map((day) => {
                    const dayConfig = dailyTicketConfig[day.dateStr];
                    if (!dayConfig) return null;

                    const dayTotal = getTotalTicketsByDay(day.dateStr);

                    return (
                      <Card
                        key={day.dateStr}
                        className="bg-white/5 border border-white/10 overflow-hidden"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <Badge className="bg-primary/20 text-primary border-primary/30">
                                {day.label}
                              </Badge>
                              <span className="text-sm text-white/60">
                                {dayTotal} billet{dayTotal > 1 ? "s" : ""}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addTicketToDay(day.dateStr)}
                              className="border-white/20 text-white hover:bg-white/10"
                            >
                              <Plus className="w-4 h-4 mr-1" /> Ajouter un
                              billet
                            </Button>
                          </div>

                          <div className="space-y-3">
                            {dayConfig.tickets.map((ticket) => {
                              const colorInfo =
                                TICKET_COLORS.find(
                                  (c) => c.value === ticket.color,
                                ) || TICKET_COLORS[0];
                              const quantity = parseInt(ticket.quantity) || 0;

                              return (
                                <div
                                  key={ticket.id}
                                  className="bg-black/30 rounded-lg p-3 border border-white/5"
                                >
                                  <div className="flex flex-wrap gap-3 items-start">
                                    <div className="flex-1 min-w-[120px]">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className={`w-3 h-3 rounded-full ${colorInfo.hex}`}
                                        />
                                        <Input
                                          value={ticket.name}
                                          onChange={(e) =>
                                            updateTicketField(
                                              day.dateStr,
                                              ticket.id,
                                              "name",
                                              e.target.value,
                                            )
                                          }
                                          className="font-bold text-sm border-none shadow-none focus-visible:ring-0 px-0 w-auto min-w-[80px] bg-transparent text-white"
                                          placeholder="Nom"
                                        />
                                      </div>
                                      <Input
                                        value={ticket.description}
                                        onChange={(e) =>
                                          updateTicketField(
                                            day.dateStr,
                                            ticket.id,
                                            "description",
                                            e.target.value,
                                          )
                                        }
                                        className="text-xs border-none shadow-none focus-visible:ring-0 px-0 w-full bg-transparent text-white/60 mt-1"
                                        placeholder="Description"
                                      />
                                    </div>

                                    {/* 🔥 CHAMP DE QUANTITÉ FLUIDE - PAR JOUR */}
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-1">
                                        <Label className="text-xs text-white/60">
                                          Qté
                                        </Label>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-8 w-8 border-white/10 text-white hover:bg-white/10"
                                            onClick={() => {
                                              const current =
                                                parseInt(ticket.quantity) || 0;
                                              updateTicketField(
                                                day.dateStr,
                                                ticket.id,
                                                "quantity",
                                                Math.max(0, current - 1),
                                              );
                                            }}
                                          >
                                            <Minus className="w-4 h-4" />
                                          </Button>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={quantity}
                                            onChange={(e) => {
                                              const val = parseInt(e.target.value) || 0;
                                              updateTicketField(
                                                day.dateStr,
                                                ticket.id,
                                                "quantity",
                                                Math.max(0, val),
                                              );
                                            }}
                                            className="w-20 h-8 text-center text-sm bg-white/10 border-white/20 text-white font-bold focus:border-primary focus:ring-1 focus:ring-primary"
                                            style={{ 
                                              appearance: "textfield",
                                              MozAppearance: "textfield",
                                            }}
                                          />
                                          <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-8 w-8 border-white/10 text-white hover:bg-white/10"
                                            onClick={() => {
                                              const current =
                                                parseInt(ticket.quantity) || 0;
                                              updateTicketField(
                                                day.dateStr,
                                                ticket.id,
                                                "quantity",
                                                current + 1,
                                              );
                                            }}
                                          >
                                            <Plus className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <div className="w-20">
                                        <Label className="text-xs text-white/60">
                                          Prix FCFA
                                        </Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={ticket.price}
                                          onChange={(e) =>
                                            updateTicketField(
                                              day.dateStr,
                                              ticket.id,
                                              "price",
                                              e.target.value,
                                            )
                                          }
                                          className="h-7 text-xs bg-white/5 border-white/10 text-white"
                                        />
                                      </div>
                                      <div className="w-20">
                                        <Label className="text-xs text-white/60">
                                          Prévente
                                        </Label>
                                        <Input
                                          type="number"
                                          min="0"
                                          value={ticket.presale_price}
                                          onChange={(e) =>
                                            updateTicketField(
                                              day.dateStr,
                                              ticket.id,
                                              "presale_price",
                                              e.target.value,
                                            )
                                          }
                                          className="h-7 text-xs bg-white/5 border-white/10 text-white"
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <Label className="text-xs text-white/60">
                                        Couleur
                                      </Label>
                                      <Select
                                        value={ticket.color}
                                        onValueChange={(val) =>
                                          updateTicketField(
                                            day.dateStr,
                                            ticket.id,
                                            "color",
                                            val,
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-24 h-7 text-xs bg-white/5 border-white/10 text-white">
                                          <SelectValue>
                                            <div className="flex items-center gap-1">
                                              <div
                                                className={`w-3 h-3 rounded-full ${TICKET_COLORS.find((c) => c.value === ticket.color)?.hex || "bg-primary"}`}
                                              />
                                              <span className="text-xs">
                                                {TICKET_COLORS.find(
                                                  (c) =>
                                                    c.value === ticket.color,
                                                )?.name || "Standard"}
                                              </span>
                                            </div>
                                          </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1a1a2e] border-white/10">
                                          {TICKET_COLORS.map((c) => (
                                            <SelectItem
                                              key={c.value}
                                              value={c.value}
                                              className="text-white hover:bg-white/10"
                                            >
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className={`w-3 h-3 rounded-full ${c.hex}`}
                                                />
                                                <span>{c.name}</span>
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        removeTicketFromDay(
                                          day.dateStr,
                                          ticket.id,
                                        )
                                      }
                                      className="text-white/40 hover:text-red-400 hover:bg-red-500/10 mt-4 sm:mt-0"
                                    >
                                      <Trash className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}

                            {dayConfig.tickets.length === 0 && (
                              <div className="text-center py-4 text-white/40 text-sm">
                                Aucun billet pour ce jour. Cliquez sur "Ajouter
                                un billet".
                              </div>
                            )}
                          </div>

                          <div className="mt-3 text-xs text-white/30">
                            💡 Chaque billet est valable uniquement le{" "}
                            {day.label}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-white">
                    Codes de réduction
                  </h3>
                </div>
                <PromoCodeConfig
                  eventId={null}
                  initialConfig={promoConfig}
                  onSave={handlePromoConfigSave}
                  readOnly={false}
                />
              </div>

              <div className="flex justify-between pt-8 border-t border-white/10">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="px-6 border-white/10 text-white hover:bg-white/10"
                >
                  <ArrowLeft className="mr-2 w-4 h-4" /> Retour
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="px-8 bg-primary hover:bg-primary/80"
                >
                  Suivant <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </TabsContent>

            {/* ÉTAPE 3 - CONFIRMATION - inchangée */}
            <TabsContent
              value="3"
              className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300"
            >
              <Card className="border-dashed border-2 border-white/20 bg-white/5">
                <CardContent className="p-8 text-center space-y-4">
                  <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">
                    Prêt à publier ?
                  </h3>
                  <p className="text-white/60 max-w-md mx-auto">
                    Votre événement{" "}
                    <strong className="text-white">{title}</strong> est prêt.
                    <br />
                    <span className="flex items-center justify-center gap-2 font-medium text-green-400 mt-2">
                      <MessageSquare className="w-4 h-4" />
                      Livraison automatique dans votre profil
                    </span>
                  </p>

                  <div className="grid grid-cols-1 gap-4 max-w-sm mx-auto text-left bg-white/5 p-4 rounded-lg border border-white/10">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-white/40 block">
                          Date
                        </span>
                        <span className="font-medium text-white">
                          {eventDate
                            ? new Date(eventDate).toLocaleDateString("fr-FR")
                            : "Non définie"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-white/40 block">
                          Lieu
                        </span>
                        <span className="font-medium text-white">
                          {city || "Non défini"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-white/40 block">
                        {ticketType === "multi_day"
                          ? "Billets multi-jours"
                          : "Billets par jour"}
                      </span>
                      <div className="space-y-1 mt-1">
                        {ticketType === "multi_day"
                          ? multiDayTickets.map((t) => (
                              <div
                                key={t.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="text-white/60">{t.name}</span>
                                <span className="text-white font-medium">
                                  {t.quantity || 0} billet
                                  {t.quantity > 1 ? "s" : ""}
                                </span>
                              </div>
                            ))
                          : eventDays.map((day) => {
                              const total = getTotalTicketsByDay(day.dateStr);
                              const config = dailyTicketConfig[day.dateStr];
                              return (
                                <div
                                  key={day.dateStr}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span className="text-white/60">
                                    {day.label}
                                  </span>
                                  <span className="text-white font-medium">
                                    {total} billet{total > 1 ? "s" : ""}
                                    {config && config.tickets.length > 0 && (
                                      <span className="text-xs text-white/40 ml-2">
                                        (
                                        {config.tickets
                                          .map(
                                            (t) =>
                                              `${t.name}: ${t.quantity || 0}`,
                                          )
                                          .join(", ")}
                                        )
                                      </span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-white/10">
                      <span className="text-xs text-white/40 block">Total</span>
                      <span className="text-white font-medium">
                        {getTotalAllTickets()} billets
                      </span>
                    </div>
                    {ticketType === "multi_day" && (
                      <div className="text-xs text-white/30">
                        📅 Valable pour toute la durée de l'événement (
                        {eventDays.length} jours)
                      </div>
                    )}
                  </div>

                  {promoConfig && promoConfig.enabled && (
                    <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/30">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <Tag className="w-4 h-4 text-primary" />
                        <span className="font-medium text-primary">
                          Codes de réduction activés
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2 text-xs">
                        <Badge
                          variant="outline"
                          className="border-primary/30 text-primary"
                        >
                          {promoConfig.discount_type === "fixed"
                            ? `-${promoConfig.discount_value.toLocaleString()} FCFA`
                            : `-${promoConfig.discount_value}%`}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-green-500/30 text-green-400"
                        >
                          Commission: {promoConfig.commission_rate}%
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => {
                      if (checked && !termsAccepted) {
                        handleOpenContract();
                      } else {
                        setTermsAccepted(checked);
                      }
                    }}
                    className="border-primary/50 data-[state=checked]:bg-primary mt-1"
                    required
                  />
                  <div className="grid gap-1.5 leading-none flex-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="terms"
                        className="text-sm font-medium leading-none text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        J'accepte le contrat Organisateur *
                      </label>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleOpenContract}
                        className="text-primary h-auto p-0 text-xs font-medium"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Lire le contrat
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                    <p className="text-xs text-white/40">
                      En publiant cet événement, vous acceptez de respecter le
                      règlement de la billetterie et les conditions générales
                      d'utilisation.
                    </p>

                    {termsAccepted && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-green-400 bg-green-500/10 p-2 rounded border border-green-500/30">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          <strong>Contrat accepté</strong> - Vous avez accepté
                          les conditions organisateur.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="px-6 border-white/10 text-white hover:bg-white/10"
                >
                  <ArrowLeft className="mr-2 w-4 h-4" /> Retour
                </Button>
                <Button
                  onClick={performSubmission}
                  disabled={loading || !termsAccepted}
                  size="lg"
                  className="px-8 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white shadow-lg hover:shadow-xl transition-all w-full sm:w-auto"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin mr-2 w-5 h-5" />
                      Publication en cours...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 w-4 h-4" />
                      Confirmer et Publier
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateTicketingEventPage;
