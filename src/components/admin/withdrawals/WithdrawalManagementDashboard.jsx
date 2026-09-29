import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import {
  calculateEventMetrics,
  getStatusBadgeColor,
} from "@/utils/withdrawalMetrics";
import SuperAdminWithdrawalActions from "./SuperAdminWithdrawalActions";
import SecretaryReadOnlyView from "./SecretaryReadOnlyView";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  RefreshCw,
  Download,
  Coins,
  Ticket,
  UserCheck,
  UserX,
  BarChart3,
  AlertCircle,
  ArrowUpDown,
  Users,
  Phone,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  Eye,
  CheckCircle,
  XCircle,
  Clock as ClockIcon,
  Wallet,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import * as XLSX from 'xlsx';
import { format } from "date-fns";

const WithdrawalManagementDashboard = () => {
  const { user } = useAuth();
  const { userProfile } = useData();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [eventStats, setEventStats] = useState({});
  const [ticketPurchases, setTicketPurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [scanAgents, setScanAgents] = useState([]);
  
  const [selectedEventId, setSelectedEventId] = useState(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEventType, setFilterEventType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterThreshold, setFilterThreshold] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  
  // Client filters
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [filterClientEvent, setFilterClientEvent] = useState("all");
  const [filterClientDate, setFilterClientDate] = useState("all");

  // Sorting State
  const [sortConfig, setSortConfig] = useState({
    key: "priority",
    direction: "desc",
  });

  // Client sorting state
  const [clientSortConfig, setClientSortConfig] = useState({
    key: "purchase_date",
    direction: "desc",
  });

  useEffect(() => {
    setIsSuperAdmin(userProfile?.user_type === "super_admin");
  }, [userProfile]);

  const fetchEventStats = async (eventId, organizerId) => {
    try {
      const { data, error } = await supabase.rpc("get_verification_stats", {
        p_event_id: eventId,
        p_organizer_id: organizerId,
      });
      if (error) throw error;
      return data?.stats || null;
    } catch (err) {
      console.error(`Error loading stats for event ${eventId}:`, err);
      return null;
    }
  };

  const fetchAllEventsStats = async (eventsList) => {
    const statsPromises = eventsList.map((event) =>
      fetchEventStats(event.id, event.organizer_id).then((stats) => ({
        eventId: event.id,
        stats,
      }))
    );
    const results = await Promise.all(statsPromises);
    const statsMap = {};
    results.forEach(({ eventId, stats }) => {
      if (stats) statsMap[eventId] = stats;
    });
    setEventStats(statsMap);
  };

  // 🔥 Récupérer les statistiques détaillées des tickets pour un événement
  const fetchTicketStatsForEvent = async (eventId) => {
    try {
      // Total des tickets
      const { count: totalTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);
      
      // Tickets en salle (status = 'used')
      const { count: currentlyInside } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'used');
      
      // Tickets sortis (status = 'exited')
      const { count: exitedTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'exited');
      
      // Tickets utilisés (used + exited)
      const { count: verifiedTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('status', ['used', 'exited']);
      
      // Tickets actifs
      const { count: activeTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'active');
      
      // Tickets sans compte
      const { count: guestTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .or('user_id.is.null,user_id.like.guest_%');
      
      // Tickets MoneyFusion
      const { count: moneyFusionTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('payment_method', 'moneyfusion_ticket');
      
      // Tickets MoneyFusion sans compte
      const { count: moneyFusionGuestTickets } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('payment_method', 'moneyfusion_ticket')
        .or('user_id.is.null,user_id.like.guest_%');

      const moneyFusionAccountTickets = moneyFusionTickets - moneyFusionGuestTickets;
      
      // Total des entrées
      const { count: totalEntries } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .gt('entry_count', 0);

      return {
        total_tickets: totalTickets || 0,
        currently_inside: currentlyInside || 0,
        exited_tickets: exitedTickets || 0,
        verified_tickets: verifiedTickets || 0,
        active_tickets: activeTickets || 0,
        guest_tickets: guestTickets || 0,
        moneyfusion_guest_tickets: moneyFusionGuestTickets || 0,
        moneyfusion_account_tickets: moneyFusionAccountTickets || 0,
        moneyfusion_total: moneyFusionTickets || 0,
        total_entries: totalEntries || 0,
        verification_rate: totalTickets > 0 ? Math.round((verifiedTickets / totalTickets) * 100 * 100) / 100 : 0,
      };
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
      return null;
    }
  };

  const fetchTicketPurchases = async () => {
    setLoadingPurchases(true);
    try {
      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select("*")
        .order("updated_at", { ascending: false });

      if (ticketsError) throw ticketsError;

      if (!tickets || tickets.length === 0) {
        setTicketPurchases([]);
        setLoadingPurchases(false);
        return;
      }

      // Récupérer les stats pour chaque événement
      const eventIds = [...new Set(tickets.map(t => t.event_id).filter(Boolean))];
      const statsPromises = eventIds.map(async (eventId) => {
        const stats = await fetchTicketStatsForEvent(eventId);
        return { eventId, stats };
      });
      const statsResults = await Promise.all(statsPromises);
      const eventStatsMap = {};
      statsResults.forEach(({ eventId, stats }) => {
        if (stats) eventStatsMap[eventId] = stats;
      });

      // Extraire les IDs
      const userIds = [...new Set(tickets.map(t => t.user_id).filter(Boolean))];
      const ticketTypeIds = [...new Set(tickets.map(t => t.ticket_type_id).filter(Boolean))];

      const [eventsResult, usersResult, ticketTypesResult] = await Promise.all([
        eventIds.length > 0 
          ? supabase.from("events").select("id, title, event_start_at, event_end_at, location, city, country, full_address, event_type").in("id", eventIds)
          : { data: [], error: null },
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds)
          : { data: [], error: null },
        ticketTypeIds.length > 0
          ? supabase.from("ticket_types").select("id, name, price_coins, price_pi, color").in("id", ticketTypeIds)
          : { data: [], error: null }
      ]);

      const eventsMap = {};
      (eventsResult.data || []).forEach(e => { eventsMap[e.id] = e; });

      const usersMap = {};
      (usersResult.data || []).forEach(u => { usersMap[u.id] = u; });

      const ticketTypesMap = {};
      (ticketTypesResult.data || []).forEach(t => { ticketTypesMap[t.id] = t; });

      const enrichedData = tickets.map(ticket => {
        const userInfo = ticket.user_id && usersMap[ticket.user_id] ? usersMap[ticket.user_id] : null;
        const eventStats = eventStatsMap[ticket.event_id] || {};

        const phone = ticket.phone || userInfo?.phone || "Non renseigné";
        const attendeeName = ticket.attendee_name || userInfo?.full_name || "Inconnu";
        const email = ticket.email || userInfo?.email || "Non renseigné";

        // 🔥 Déterminer la position du ticket
        let ticketStatus = 'active';
        let statusLabel = '🟡 Non utilisé';
        let statusColor = 'bg-blue-900/50 text-blue-300 border-blue-700';
        
        if (ticket.status === 'used') {
          ticketStatus = 'inside';
          statusLabel = '🟢 En salle';
          statusColor = 'bg-green-900/50 text-green-300 border-green-700';
        } else if (ticket.status === 'exited') {
          ticketStatus = 'exited';
          statusLabel = '🔵 Sorti';
          statusColor = 'bg-blue-900/50 text-blue-300 border-blue-700';
        } else if (ticket.is_used) {
          ticketStatus = 'used';
          statusLabel = '✅ Utilisé';
          statusColor = 'bg-green-900/50 text-green-300 border-green-700';
        }

        return {
          ...ticket,
          event: eventsMap[ticket.event_id] || null,
          user: userInfo,
          ticket_type: ticketTypesMap[ticket.ticket_type_id] || null,
          attendeeName: attendeeName,
          phone: phone,
          email: email,
          isGuest: !ticket.user_id || ticket.is_guest === true,
          ticketStatus: ticketStatus,
          statusLabel: statusLabel,
          statusColor: statusColor,
          eventStats: eventStats,
          entryCount: ticket.entry_count || 0,
          reentryCount: ticket.reentry_count || 0,
        };
      });

      setTicketPurchases(enrichedData);
    } catch (err) {
      console.error("Error fetching ticket purchases:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger l'historique des achats.",
        variant: "destructive",
      });
    } finally {
      setLoadingPurchases(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("events")
        .select(
          `*,
          organizer:organizer_id (full_name, email, country, phone, available_earnings),
          validation_status:event_validation_status (status, admin_notes, created_at)`
        )
        .order("event_end_at", { ascending: false });

      if (userProfile?.user_type === "secretary") {
        query = query.eq("country", userProfile.country);
      }

      const { data, error } = await query;
      if (error) throw error;

      setEvents(data || []);
      await fetchAllEventsStats(data || []);
      await fetchTicketPurchases();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userProfile) fetchData();
  }, [userProfile]);

  // Toutes les délégations de scan, pour afficher l'équipe par événement et
  // marquer les clients qui sont agents de scan.
  useEffect(() => {
    supabase.rpc('admin_list_scan_agents', {}).then(({ data, error }) => {
      if (!error) setScanAgents(data?.agents || []);
    });
  }, []);

  const agentsByOrganizer = useMemo(() => {
    const map = {};
    scanAgents.forEach((a) => {
      if (!map[a.organizer_id]) map[a.organizer_id] = [];
      map[a.organizer_id].push(a);
    });
    return map;
  }, [scanAgents]);

  const scanAgentUserIds = useMemo(
    () => new Set(scanAgents.filter((a) => a.is_active).map((a) => a.user_id)),
    [scanAgents]
  );

  const processedEvents = useMemo(() => {
    return events.map((event) => {
      const metrics = calculateEventMetrics(event);
      const organizerName = event.organizer?.full_name || "Utilisateur Supprimé";
      const stats = eventStats[event.id] || null;

      const now = new Date();
      const startDate = new Date(event.event_start_at);
      const endDate = new Date(event.event_end_at);
      
      const isOngoing = startDate <= now && now <= endDate;
      const isPast = endDate < now;
      const isUpcoming = startDate > now;

      let statusPriority = 1;
      if (metrics.status === "EN_ATTENTE") statusPriority = 3;
      if (metrics.status === "AUCUNE_DEMANDE") statusPriority = 2;
      if (isOngoing) statusPriority = 0;

      const enhancedMetrics = {
        ...metrics,
        totalTickets: stats?.total_tickets || metrics.ticketsSold || 0,
        verifiedTickets: stats?.verified_tickets || metrics.ticketsScanned || 0,
        verificationRate: stats?.verification_rate || metrics.scanPercentage || 0,
        remainingTickets: (stats?.total_tickets || metrics.ticketsSold || 0) -
          (stats?.verified_tickets || metrics.ticketsScanned || 0),
        netAmount: metrics.netAmount || 0,
        isOngoing,
        isPast,
        isUpcoming,
      };

      return {
        ...event,
        metrics: enhancedMetrics,
        organizerName,
        statusPriority,
      };
    });
  }, [events, eventStats]);

  const processedClients = useMemo(() => {
    return ticketPurchases.map((purchase) => {
      const eventDate = purchase.event?.event_start_at 
        ? new Date(purchase.event.event_start_at) 
        : null;
      
     const priceInCoins = purchase.purchase_price_pi || 
                     purchase.total_amount_pi || 
                     purchase.ticket_type?.price_coins || 
                     0;

const priceInFcfa = purchase.total_amount_fcfa || 
                    purchase.price_fcfa || 
                    (priceInCoins * 10) || 
                    0;

      const purchaseDate = purchase.updated_at 
        ? new Date(purchase.updated_at) 
        : purchase.created_at 
          ? new Date(purchase.created_at) 
          : new Date();

      return {
        id: purchase.id,
        ticketNumber: purchase.ticket_number || purchase.qr_code || purchase.id,
        attendeeName: purchase.attendeeName || "Inconnu",
        phone: purchase.phone || "Non renseigné",
        email: purchase.email || "Non renseigné",
        eventTitle: purchase.event?.title || "Événement inconnu",
        eventType: purchase.event?.event_type || "ticketing",
        eventDate: eventDate,
        eventLocation: purchase.event?.full_address || purchase.event?.location || purchase.event?.city || "Lieu non spécifié",
        eventCity: purchase.event?.city || "",
        ticketTypeName: purchase.ticket_type?.name || "Billet standard",
        priceCoins: priceInCoins,
        priceFcfa: priceInFcfa,
        purchaseDate: purchaseDate,
        quantity: purchase.quantity || 1,
        status: purchase.status || "active",
        isUsed: purchase.is_used || false,
        usedAt: purchase.used_at ? new Date(purchase.used_at) : null,
        userId: purchase.user_id,
        eventId: purchase.event_id,
        isGuest: purchase.isGuest || false,
        ticketStatus: purchase.ticketStatus || 'active',
        statusLabel: purchase.statusLabel || '🟡 Non utilisé',
        statusColor: purchase.statusColor || 'bg-blue-900/50 text-blue-300 border-blue-700',
        entryCount: purchase.entryCount || 0,
        reentryCount: purchase.reentryCount || 0,
        eventStats: purchase.eventStats || {},
        paymentMethod: purchase.payment_method || 'unknown',
      };
    });
  }, [ticketPurchases]);

  const filteredClients = useMemo(() => {
    const eventFilter = selectedEventId || filterClientEvent;
    
    return processedClients.filter((client) => {
      const matchesSearch = !clientSearchTerm ||
        client.attendeeName.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
        client.phone.includes(clientSearchTerm) ||
        client.eventTitle.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
        client.ticketNumber.toLowerCase().includes(clientSearchTerm.toLowerCase());

      const matchesEvent = eventFilter === "all" || 
        client.eventId === eventFilter;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const clientDate = client.eventDate ? new Date(client.eventDate) : null;
      
      let matchesDate = true;
      if (filterClientDate === "today" && clientDate) {
        const clientDay = new Date(clientDate.getFullYear(), clientDate.getMonth(), clientDate.getDate());
        matchesDate = clientDay.getTime() === today.getTime();
      } else if (filterClientDate === "week" && clientDate) {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        matchesDate = clientDate >= weekAgo;
      } else if (filterClientDate === "month" && clientDate) {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        matchesDate = clientDate >= monthAgo;
      }

      return matchesSearch && matchesEvent && matchesDate;
    });
  }, [processedClients, clientSearchTerm, filterClientEvent, filterClientDate, selectedEventId]);

  const sortedClients = useMemo(() => {
    const sorted = [...filteredClients];
    sorted.sort((a, b) => {
      switch (clientSortConfig.key) {
        case "attendeeName":
          return a.attendeeName.localeCompare(b.attendeeName);
        case "eventTitle":
          return a.eventTitle.localeCompare(b.eventTitle);
        case "eventDate":
          if (!a.eventDate) return 1;
          if (!b.eventDate) return -1;
          return a.eventDate.getTime() - b.eventDate.getTime();
        case "priceFcfa":
          return a.priceFcfa - b.priceFcfa;
        case "priceCoins":
          return a.priceCoins - b.priceCoins;
        case "purchase_date":
          return a.purchaseDate.getTime() - b.purchaseDate.getTime();
        case "phone":
          return a.phone.localeCompare(b.phone);
        default:
          return 0;
      }
    });
    if (clientSortConfig.direction === "desc") sorted.reverse();
    return sorted;
  }, [filteredClients, clientSortConfig]);

  const requestClientSort = (key) => {
    let direction = "asc";
    if (clientSortConfig.key === key && clientSortConfig.direction === "asc") direction = "desc";
    setClientSortConfig({ key, direction });
  };

  const filteredEvents = useMemo(() => {
    return processedEvents.filter((e) => {
      const matchesSearch = !searchTerm ||
        e.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.organizerName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterEventType === "all" || e.event_type === filterEventType;
      const matchesStatus = filterStatus === "all" || e.metrics.status === filterStatus;
      const matchesThreshold = filterThreshold === "all" ||
        (filterThreshold === "ok" && e.metrics.thresholdStatus === "ok") ||
        (filterThreshold === "critical" && e.metrics.thresholdStatus === "critical");
      
      const matchesPeriod = filterPeriod === "all" ||
        (filterPeriod === "ongoing" && e.metrics.isOngoing) ||
        (filterPeriod === "upcoming" && e.metrics.isUpcoming) ||
        (filterPeriod === "past" && e.metrics.isPast);

      return matchesSearch && matchesType && matchesStatus && matchesThreshold && matchesPeriod;
    });
  }, [processedEvents, searchTerm, filterEventType, filterStatus, filterThreshold, filterPeriod]);

  const sortedEvents = useMemo(() => {
    const sorted = [...filteredEvents];
    sorted.sort((a, b) => {
      switch (sortConfig.key) {
        case "priority":
          if (a.statusPriority !== b.statusPriority) return a.statusPriority - b.statusPriority;
          return new Date(a.event_end_at) - new Date(b.event_end_at);
        case "date":
          return new Date(a.event_start_at) - new Date(b.event_start_at);
        case "amount":
          return a.metrics.netAmount - b.metrics.netAmount;
        case "scan_pct":
          return a.metrics.verificationRate - b.metrics.verificationRate;
        case "status":
          return a.metrics.status.localeCompare(b.metrics.status);
        case "participants":
          return a.metrics.totalTickets - b.metrics.totalTickets;
        default:
          return 0;
      }
    });
    if (sortConfig.direction === "desc") sorted.reverse();
    return sorted;
  }, [filteredEvents, sortConfig]);

  const requestSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const handleExport = () => {
    const data = sortedEvents.map((e) => ({
      Date: format(new Date(e.event_start_at), "dd/MM/yyyy"),
      Événement: e.title,
      Organisateur: e.organizerName,
      Type: e.event_type,
      "Tickets Vendus": e.metrics.totalTickets,
      Scannés: e.metrics.verifiedTickets,
      Restants: e.metrics.remainingTickets,
      "Taux (%)": e.metrics.verificationRate,
      "Montant Net (Pièces)": e.metrics.netAmount,
      Statut: e.metrics.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Retraits");
    XLSX.writeFile(wb, "rapport_retraits.xlsx");
  };

  const handleClientExport = () => {
    const data = sortedClients.map((c) => ({
      "Nom": c.attendeeName,
      "Téléphone": c.phone,
      "Email": c.email,
      "Événement": c.eventTitle,
      "Type": c.eventType,
      "Date Événement": c.eventDate ? format(c.eventDate, "dd/MM/yyyy HH:mm") : "N/A",
      "Lieu": c.eventLocation,
      "Billet": c.ticketTypeName,
      "Montant (FCFA)": c.priceFcfa.toLocaleString(),
      "Montant (Pièces)": c.priceCoins,
      "Quantité": c.quantity,
      "Date Achat": format(c.purchaseDate, "dd/MM/yyyy HH:mm"),
      "Statut": c.statusLabel,
      "Type client": c.isGuest ? "Invité" : "Compte",
      "Entrées": c.entryCount,
      "Ré-entrées": c.reentryCount,
      "Paiement": c.paymentMethod === 'moneyfusion_ticket' ? 'MoneyFusion' : c.paymentMethod || 'Standard',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.writeFile(wb, "historique_clients.xlsx");
  };

  const uniqueEvents = useMemo(() => {
    const eventsMap = {};
    processedClients.forEach(client => {
      if (client.eventId && client.eventTitle) {
        eventsMap[client.eventId] = client.eventTitle;
      }
    });
    return Object.entries(eventsMap).map(([id, title]) => ({ id, title }));
  }, [processedClients]);

  const filterByEvent = (eventId) => {
    setSelectedEventId(eventId);
    setTimeout(() => {
      const clientSection = document.getElementById('clients-section');
      if (clientSection) {
        clientSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const resetClientFilter = () => {
    setSelectedEventId(null);
    setFilterClientEvent("all");
    setClientSearchTerm("");
    setFilterClientDate("all");
  };

  // 🔥 Résumé des stats pour l'événement sélectionné
  const selectedEventStats = useMemo(() => {
    if (!selectedEventId) return null;
    const clients = processedClients.filter(c => c.eventId === selectedEventId);
    if (clients.length === 0) return null;
    
    const total = clients.length;
    const inside = clients.filter(c => c.ticketStatus === 'inside').length;
    const exited = clients.filter(c => c.ticketStatus === 'exited').length;
    const active = clients.filter(c => c.ticketStatus === 'active').length;
    const guests = clients.filter(c => c.isGuest).length;
    const moneyFusion = clients.filter(c => c.paymentMethod === 'moneyfusion_ticket').length;
    
    return { total, inside, exited, active, guests, moneyFusion };
  }, [processedClients, selectedEventId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-800/50 backdrop-blur-xl p-6 rounded-2xl border border-gray-700/50 shadow-xl">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Gestion des Retraits & Clients
            </h2>
            <p className="text-gray-400 mt-1">
              Gérez tous les événements et consultez l'historique des achats.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClientExport}
              className="bg-gray-700/50 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
            >
              <Download className="mr-2 h-4 w-4" /> Export Clients
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="bg-gray-700/50 border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
            >
              <Download className="mr-2 h-4 w-4" /> Export Événements
            </Button>
            <Button
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Total Événements</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{sortedEvents.length}</div>
              <p className="text-xs text-gray-400 mt-1">tous événements</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Tickets Vendus</CardTitle>
              <Ticket className="h-4 w-4 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {sortedEvents.reduce((sum, e) => sum + (e.metrics.totalTickets || 0), 0).toLocaleString()}
              </div>
              <p className="text-xs text-gray-400 mt-1">total tous événements</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Tickets Scannés</CardTitle>
              <UserCheck className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-400">
                {sortedEvents.reduce((sum, e) => sum + (e.metrics.verifiedTickets || 0), 0).toLocaleString()}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {((sortedEvents.reduce((sum, e) => sum + (e.metrics.verifiedTickets || 0), 0) /
                  (sortedEvents.reduce((sum, e) => sum + (e.metrics.totalTickets || 0), 0) || 1)) * 100).toFixed(1)}% taux moyen
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Montant Total</CardTitle>
              <Coins className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">
                {sortedEvents.reduce((sum, e) => sum + (e.metrics.netAmount || 0), 0).toLocaleString()}
              </div>
              <p className="text-xs text-gray-400 mt-1">pièces à valider</p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-pink-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{processedClients.length}</div>
              <p className="text-xs text-gray-400 mt-1">acheteurs</p>
            </CardContent>
          </Card>
        </div>

        {/* SECTION ÉVÉNEMENTS */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-6 w-6 text-blue-400" />
            <h3 className="text-2xl font-bold text-white">Gestion des Événements</h3>
            <Badge className="bg-blue-600 text-white ml-2">
              {sortedEvents.length} événements
            </Badge>
          </div>

          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-end md:items-center flex-wrap">
                <div className="w-full md:w-64 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher événement, organisateur..."
                    className="pl-9 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 flex-wrap flex-1">
                  <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                    <SelectTrigger className="w-[160px] bg-gray-700/50 border-gray-600 text-white">
                      <SelectValue placeholder="Période" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="all">Tous les événements</SelectItem>
                      <SelectItem value="ongoing">🟢 En cours</SelectItem>
                      <SelectItem value="upcoming">🟡 À venir</SelectItem>
                      <SelectItem value="past">⚫ Terminés</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px] bg-gray-700/50 border-gray-600 text-white">
                      <SelectValue placeholder="Statut" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="EN_ATTENTE">En Attente</SelectItem>
                      <SelectItem value="AUCUNE_DEMANDE">Non Initié</SelectItem>
                      <SelectItem value="VALIDE">Validé</SelectItem>
                      <SelectItem value="REFUSE">Refusé</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterEventType} onValueChange={setFilterEventType}>
                    <SelectTrigger className="w-[160px] bg-gray-700/50 border-gray-600 text-white">
                      <SelectValue placeholder="Type d'événement" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="all">Tous les types</SelectItem>
                      <SelectItem value="ticketing">Billetterie</SelectItem>
                      <SelectItem value="raffle">Tombola</SelectItem>
                      <SelectItem value="voting">Vote</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterThreshold} onValueChange={setFilterThreshold}>
                    <SelectTrigger className="w-[160px] bg-gray-700/50 border-gray-600 text-white">
                      <SelectValue placeholder="Seuil Scan" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="all">Tous seuils</SelectItem>
                      <SelectItem value="ok" className="text-green-400">✅ Atteint (≥30%)</SelectItem>
                      <SelectItem value="critical" className="text-red-400">⚠️ Non atteint ({'<'}30%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-700/50">
                    <TableRow className="border-gray-700">
                      <TableHead className="cursor-pointer hover:bg-gray-700/50 text-gray-300" onClick={() => requestSort("date")}>
                        <div className="flex items-center gap-1">
                          <span>Date</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[250px] text-gray-300">Événement / Organisateur</TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-700/50 text-gray-300" onClick={() => requestSort("participants")}>
                        <div className="flex items-center gap-1">
                          <span>Participants</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-700/50 text-gray-300" onClick={() => requestSort("scan_pct")}>
                        <div className="flex items-center gap-1">
                          <span>Scan %</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-700/50 text-gray-300" onClick={() => requestSort("amount")}>
                        <div className="flex items-center gap-1">
                          <span>Net (Coins)</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-700/50 text-gray-300" onClick={() => requestSort("status")}>
                        <div className="flex items-center gap-1">
                          <span>Statut</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-right text-gray-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-gray-400">
                          {loading ? "Chargement..." : "Aucun événement trouvé pour ces critères."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedEvents.map((event) => {
                        const isPending = event.metrics.status === "EN_ATTENTE";
                        const isLowAttendance = event.metrics.verificationRate < 30;
                        const clientCount = processedClients.filter(c => c.eventId === event.id).length;
                        
                        return (
                          <TableRow
                            key={event.id}
                            className={`group transition-colors border-gray-700 ${
                              event.metrics.isOngoing
                                ? "bg-blue-900/20 hover:bg-blue-900/30"
                                : isPending && isLowAttendance
                                ? "bg-red-900/20 hover:bg-red-900/30"
                                : isPending
                                ? "bg-amber-900/20 hover:bg-amber-900/30"
                                : "hover:bg-gray-700/30"
                            }`}
                          >
                            <TableCell className="whitespace-nowrap font-medium text-xs text-gray-300">
                              {format(new Date(event.event_start_at), "dd/MM/yyyy")}
                            </TableCell>

                            <TableCell>
                              <div className="font-semibold text-white text-sm line-clamp-1" title={event.title}>
                                {event.title}
                              </div>
                              <div className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                                <span className="uppercase text-[10px] font-bold bg-gray-700 px-2 py-0.5 rounded text-gray-300">
                                  {event.event_type}
                                </span>
                                <span className="line-clamp-1">{event.organizerName}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {(() => {
                                  const ag = agentsByOrganizer[event.organizer_id] || [];
                                  if (!ag.length) return null;
                                  return (
                                    <>
                                      {ag.slice(0, 2).map((a) => (
                                        <span
                                          key={a.user_id}
                                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                            a.is_active
                                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-600/30"
                                              : "bg-gray-700/50 text-gray-400 border-gray-600/50 line-through"
                                          }`}
                                        >
                                          {a.agent?.full_name || a.agent?.email || "Compte supprimé"}
                                        </span>
                                      ))}
                                      {ag.length > 2 && (
                                        <span className="text-[10px] text-gray-400 px-1">+{ag.length - 2}</span>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {event.metrics.isOngoing && (
                                  <Badge className="bg-blue-600 text-white border-0 text-[10px] px-2 py-0.5 animate-pulse">
                                    🔴 EN COURS
                                  </Badge>
                                )}
                                {event.metrics.isUpcoming && (
                                  <Badge className="bg-yellow-600 text-white border-0 text-[10px] px-2 py-0.5">
                                    🟡 À VENIR
                                  </Badge>
                                )}
                                {event.metrics.isPast && (
                                  <Badge className="bg-gray-600 text-white border-0 text-[10px] px-2 py-0.5">
                                    ⚫ TERMINÉ
                                  </Badge>
                                )}
                                <Badge className="bg-pink-600/50 text-pink-200 border-0 text-[10px] px-2 py-0.5">
                                  {clientCount} clients
                                </Badge>
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="flex flex-col gap-1 text-xs">
                                <div className="flex items-center gap-2">
                                  <Ticket className="h-3 w-3 text-blue-400" />
                                  <span className="text-gray-300">{event.metrics.totalTickets}</span>
                                </div>
                                {event.event_type === "ticketing" && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <UserCheck className="h-3 w-3 text-green-400" />
                                      <span className="text-gray-300">{event.metrics.verifiedTickets}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <UserX className="h-3 w-3 text-orange-400" />
                                      <span className="text-gray-300">{event.metrics.remainingTickets}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </TableCell>

                            <TableCell>
                              {event.event_type === "ticketing" ? (
                                <Badge
                                  className={`${
                                    event.metrics.verificationRate < 30
                                      ? "bg-red-900/50 text-red-300 border-red-700"
                                      : "bg-green-900/50 text-green-300 border-green-700"
                                  } border whitespace-nowrap`}
                                >
                                  {event.metrics.verificationRate}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-gray-500 italic">N/A</span>
                              )}
                            </TableCell>

                            <TableCell>
                              <div className="font-mono font-medium flex items-center gap-1 text-sm">
                                <span className="text-amber-400">
                                  {event.metrics.netAmount > 0 ? event.metrics.netAmount.toLocaleString() : "0"}
                                </span>
                                <Coins className="h-3 w-3 text-amber-400" />
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <SecretaryReadOnlyView event={event} metrics={event.metrics} />
                              </div>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => filterByEvent(event.id)}
                                  className="bg-blue-600/20 border-blue-600/30 text-blue-300 hover:bg-blue-600/40 hover:text-white"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Clients ({clientCount})
                                </Button>
                                {isSuperAdmin ? (
                                  <SuperAdminWithdrawalActions
                                    event={event}
                                    metrics={event.metrics}
                                    adminId={user?.id}
                                    onActionComplete={fetchData}
                                    isReadOnly={false}
                                  />
                                ) : (
                                  <SuperAdminWithdrawalActions
                                    event={event}
                                    metrics={event.metrics}
                                    adminId={user?.id}
                                    isReadOnly={true}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SECTION CLIENTS */}
        <div id="clients-section" className="mt-8 scroll-mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-6 w-6 text-pink-400" />
            <h3 className="text-2xl font-bold text-white">Historique Clients</h3>
            <Badge className="bg-pink-600 text-white ml-2">
              {sortedClients.length} clients
            </Badge>
            {selectedEventId && (
              <Badge 
                className="bg-blue-600 text-white cursor-pointer hover:bg-blue-700"
                onClick={resetClientFilter}
              >
                {uniqueEvents.find(e => e.id === selectedEventId)?.title || "Filtré"} ✕
              </Badge>
            )}
            {selectedEventId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetClientFilter}
                className="text-gray-400 hover:text-white"
              >
                Réinitialiser le filtre
              </Button>
            )}
          </div>

          {/* 🔥 Statistiques de l'événement sélectionné */}
          {selectedEventStats && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-4">
              <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-300">Total</CardTitle>
                  <Users className="h-4 w-4 text-pink-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{selectedEventStats.total}</div>
                  <p className="text-xs text-gray-400">clients</p>
                </CardContent>
              </Card>

              <Card className="bg-green-900/20 border-green-700/30">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-green-400">En salle</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-400">{selectedEventStats.inside}</div>
                  <p className="text-xs text-gray-400">billets</p>
                </CardContent>
              </Card>

              <Card className="bg-blue-900/20 border-blue-700/30">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-blue-400">Sortis</CardTitle>
                  <ArrowRightLeft className="h-4 w-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-400">{selectedEventStats.exited}</div>
                  <p className="text-xs text-gray-400">billets</p>
                </CardContent>
              </Card>

              <Card className="bg-yellow-900/20 border-yellow-700/30">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-yellow-400">Non utilisés</CardTitle>
                  <ClockIcon className="h-4 w-4 text-yellow-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-400">{selectedEventStats.active}</div>
                  <p className="text-xs text-gray-400">billets</p>
                </CardContent>
              </Card>

              <Card className="bg-purple-900/20 border-purple-700/30">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-purple-400">MoneyFusion</CardTitle>
                  <Wallet className="h-4 w-4 text-purple-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-400">{selectedEventStats.moneyFusion}</div>
                  <p className="text-xs text-gray-400">dont {selectedEventStats.guests} invités</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Client Filters */}
          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50 mb-4">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-end md:items-center flex-wrap">
                <div className="w-full md:w-64 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher nom, téléphone, événement..."
                    className="pl-9 bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-400"
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 flex-wrap flex-1">
                  <Select value={filterClientEvent} onValueChange={(val) => {
                    setFilterClientEvent(val);
                    setSelectedEventId(null);
                  }}>
                    <SelectTrigger className="w-[180px] bg-gray-700/50 border-gray-600 text-white">
                      <SelectValue placeholder="Événement" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="all">Tous les événements</SelectItem>
                      {uniqueEvents.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterClientDate} onValueChange={setFilterClientDate}>
                    <SelectTrigger className="w-[160px] bg-gray-700/50 border-gray-600 text-white">
                      <SelectValue placeholder="Date" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      <SelectItem value="all">Toutes les dates</SelectItem>
                      <SelectItem value="today">Aujourd'hui</SelectItem>
                      <SelectItem value="week">Cette semaine</SelectItem>
                      <SelectItem value="month">Ce mois</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetClientFilter}
                    className="bg-gray-700/50 border-gray-600 text-gray-200 hover:bg-gray-700"
                  >
                    Réinitialiser
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clients Table avec position du ticket */}
          <Card className="bg-gray-800/50 backdrop-blur-xl border-gray-700/50 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-700/50">
                    <TableRow className="border-gray-700">
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-700/50 text-gray-300 min-w-[150px]"
                        onClick={() => requestClientSort("attendeeName")}
                      >
                        <div className="flex items-center gap-1">
                          <span>Client</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-700/50 text-gray-300"
                        onClick={() => requestClientSort("phone")}
                      >
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>Téléphone</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-700/50 text-gray-300 min-w-[200px]"
                        onClick={() => requestClientSort("eventTitle")}
                      >
                        <div className="flex items-center gap-1">
                          <span>Événement</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-700/50 text-gray-300"
                        onClick={() => requestClientSort("eventDate")}
                      >
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Date</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-gray-700/50 text-gray-300"
                        onClick={() => requestClientSort("priceFcfa")}
                      >
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          <span>Montant</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead className="text-gray-300">Position</TableHead>
                      <TableHead className="text-gray-300">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPurchases ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-gray-400">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Chargement des données clients...
                        </TableCell>
                      </TableRow>
                    ) : sortedClients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-gray-400">
                          {selectedEventId 
                            ? "Aucun client pour cet événement."
                            : "Aucun client trouvé pour ces critères."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedClients.map((client) => (
                        <TableRow
                          key={client.id}
                          className={`group transition-colors border-gray-700 hover:bg-gray-700/30 ${
                            client.isGuest ? "bg-yellow-900/10" : ""
                          } ${
                            client.ticketStatus === 'inside' ? "bg-green-900/5" : ""
                          }`}
                        >
                          <TableCell>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white text-sm">
                                  {client.attendeeName}
                                </span>
                                {client.isGuest && (
                                  <Badge className="bg-yellow-600/50 text-yellow-300 text-[8px] px-1 py-0">
                                    Invité
                                  </Badge>
                                )}
                                {client.paymentMethod === 'moneyfusion_ticket' && (
                                  <Badge className="bg-blue-600/50 text-blue-300 text-[8px] px-1 py-0">
                                    MF
                                  </Badge>
                                )}
                                {client.user_id && scanAgentUserIds.has(client.user_id) && (
                                  <Badge className="bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 text-[8px] px-1 py-0">
                                    Agent de scan
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 truncate max-w-[150px]">
                                {client.email}
                              </span>
                              {client.entryCount > 0 && (
                                <span className="text-[10px] text-gray-500">
                                  Entrées: {client.entryCount} | Ré-entrées: {client.reentryCount}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <span className="text-gray-300 text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3 text-gray-500" />
                              {client.phone}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-white text-sm line-clamp-1" title={client.eventTitle}>
                                {client.eventTitle}
                              </span>
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate max-w-[150px]">{client.eventLocation}</span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            {client.eventDate ? (
                              <div className="flex flex-col">
                                <span className="text-gray-300 text-sm">
                                  {format(client.eventDate, "dd/MM/yyyy")}
                                </span>
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(client.eventDate, "HH:mm")}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs">N/A</span>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-amber-400 font-bold">
                                {client.priceFcfa.toLocaleString()} FCFA
                              </span>
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Coins className="h-3 w-3" />
                                {client.priceCoins} pièces
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge className={client.statusColor}>
                              {client.statusLabel}
                            </Badge>
                            {client.usedAt && (
                              <span className="text-[10px] text-gray-400 block mt-1">
                                {format(client.usedAt, "dd/MM HH:mm")}
                              </span>
                            )}
                          </TableCell>

                          <TableCell>
                            <Badge
                              className={`${
                                client.isUsed
                                  ? "bg-green-900/50 text-green-300 border-green-700"
                                  : client.ticketStatus === 'active'
                                  ? "bg-blue-900/50 text-blue-300 border-blue-700"
                                  : client.ticketStatus === 'exited'
                                  ? "bg-blue-900/50 text-blue-300 border-blue-700"
                                  : "bg-gray-900/50 text-gray-300 border-gray-700"
                              } border`}
                            >
                              {client.isUsed ? "✅ Utilisé" : "🟡 Non utilisé"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default WithdrawalManagementDashboard;