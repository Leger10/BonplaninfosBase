import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Ticket,
  Coins,
  Plus,
  Minus,
  ShoppingCart,
  Check,
  Download,
  Crown,
  Star,
  Bell,
  Trash2,
  X,
  Wallet,
  Package,
  Tag,
  Smartphone,
  Phone,
  Lock,
  User,
  Calendar,
  CalendarDays,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { generateTicketPDF } from "@/utils/generateTicketPDF";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CoinService } from "@/services/CoinService";
import { usePromoCode } from "@/hooks/usePromoCode";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import USSDPaymentModal, { openBonplaninfosRelance } from "@/components/payment/USSDPaymentModal";

const FCFA_PER_COIN = 10;
const MONEYFUSION_FEE_RATE = 0.04;

const TICKET_COLORS = {
  blue: {
    bg: "bg-gradient-to-br from-blue-600 to-blue-700",
    border: "border-blue-700",
    hover: "hover:from-blue-700 hover:to-blue-800",
    text: "text-white",
    badge: "bg-blue-500 text-white",
  },
  bronze: {
    bg: "bg-gradient-to-br from-amber-700 to-amber-800",
    border: "border-amber-800",
    hover: "hover:from-amber-800 hover:to-amber-900",
    text: "text-white",
    badge: "bg-amber-600 text-white",
  },
  silver: {
    bg: "bg-gradient-to-br from-slate-500 to-slate-600",
    border: "border-slate-600",
    hover: "hover:from-slate-600 hover:to-slate-700",
    text: "text-white",
    badge: "bg-slate-400 text-slate-900",
  },
  gold: {
    bg: "bg-gradient-to-br from-yellow-600 to-yellow-700",
    border: "border-yellow-700",
    hover: "hover:from-yellow-700 hover:to-yellow-800",
    text: "text-white",
    badge: "bg-yellow-500 text-slate-900",
  },
  purple: {
    bg: "bg-gradient-to-br from-purple-600 to-purple-700",
    border: "border-purple-700",
    hover: "hover:from-purple-700 hover:to-purple-800",
    text: "text-white",
    badge: "bg-purple-500 text-white",
  },
  red: {
    bg: "bg-gradient-to-br from-red-600 to-red-700",
    border: "border-red-700",
    hover: "hover:from-red-700 hover:to-red-800",
    text: "text-white",
    badge: "bg-red-500 text-white",
  },
  green: {
    bg: "bg-gradient-to-br from-green-600 to-green-700",
    border: "border-green-700",
    hover: "hover:from-green-700 hover:to-green-800",
    text: "text-white",
    badge: "bg-green-500 text-white",
  },
  black: {
    bg: "bg-gradient-to-br from-slate-800 to-slate-900",
    border: "border-slate-900",
    hover: "hover:from-slate-900 hover:to-black",
    text: "text-white",
    badge: "bg-slate-700 text-white",
  },
};

// Regrouper les tickets par jour
const groupTicketsByDay = (ticketTypes) => {
  const grouped = {};
  ticketTypes?.forEach((ticket) => {
    const dateMatch = ticket.name?.match(/\d{4}-\d{2}-\d{2}/);
    const dateKey = dateMatch ? dateMatch[0] : "autre";

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        date: dateKey,
        tickets: [],
        label: dateMatch
          ? new Date(dateKey).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })
          : "Autres billets",
      };
    }
    grouped[dateKey].tickets.push(ticket);
  });

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "autre") return 1;
    if (b === "autre") return -1;
    return a.localeCompare(b);
  });

  return sortedKeys.map((key) => grouped[key]);
};

const TicketingInterface = ({
  event,
  ticketingData,
  ticketTypes: propTicketTypes,
  isUnlocked,
  onRefresh,
  isClosed,
}) => {
  const { user } = useAuth();
  const { userProfile } = useData();
  const { applyPromoCode, removePromoCode } = usePromoCode(event?.id);

  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [isPromoApplied, setIsPromoApplied] = useState(false);
  const [promoDiscountAmount, setPromoDiscountAmount] = useState(0);
  const [promoCommissionAmount, setPromoCommissionAmount] = useState(0);
  const [appliedPromoCodeId, setAppliedPromoCodeId] = useState(null);
  const [promoCodeError, setPromoCodeError] = useState("");
  const [applyingPromoCode, setApplyingPromoCode] = useState(false);
  const [appliedInfluencerId, setAppliedInfluencerId] = useState(null);
  const [pendingCommissionAmount, setPendingCommissionAmount] = useState(0);
  const [appliedDiscountValue, setAppliedDiscountValue] = useState(0);
  const [appliedDiscountType, setAppliedDiscountType] = useState(null);

  const isPurchasingRef = useRef(false);

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(`cart_${event?.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [loading, setLoading] = useState(false);
  const [purchasedTickets, setPurchasedTickets] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCartDetails, setShowCartDetails] = useState(false);
  const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] =
    useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [transactionId, setTransactionId] = useState(null);
  const [selectedDay, setSelectedDay] = useState("all");

  // États pour le paiement sans compte
  const [isTicketPaymentProcessing, setIsTicketPaymentProcessing] =
    useState(false);
  const [showPaymentInfoModal, setShowPaymentInfoModal] = useState(false);
  const [attendeeName, setAttendeeName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showUSSDModal, setShowUSSDModal] = useState(false);
  const [ussdAmount, setUssdAmount] = useState(0);
  const [ussdTicketData, setUssdTicketData] = useState(null);
  const [ussdSuccess, setUssdSuccess] = useState(false);
  const [isInfoRequired, setIsInfoRequired] = useState(false);

  // ============================================================
  // 🔥 ÉTATS POUR LES TICKETS CHARGÉS DEPUIS LA BASE
  // ============================================================
  const [dbTicketTypes, setDbTicketTypes] = useState([]);
  const [ticketAvailability, setTicketAvailability] = useState({});
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);

  // refreshKey pour forcer le rechargement
  const [refreshKey, setRefreshKey] = useState(0);

  // Fonction pour forcer le rechargement
  const forceRefresh = useCallback(() => {
    console.log("🔄 Force refresh appelé");
    setRefreshKey((prev) => prev + 1);
  }, []);

  // ============================================================
  // 🔥 CHARGEMENT DES DONNÉES DEPUIS LA BASE - CORRIGÉ
  // ============================================================
  const loadDataFromDB = useCallback(async () => {
    if (!event?.id) {
      console.log("⚠️ Pas d'event ID");
      return;
    }

    setIsLoadingTickets(true);

    try {
      console.log("🔍 Chargement des données pour l'événement:", event.id);

      // 1️⃣ Charger TOUS les types de billets
      const { data: typesData, error: typesError } = await supabase
        .from("ticket_types")
        .select("*")
        .eq("event_id", event.id);

      if (typesError) {
        console.error("❌ Erreur chargement ticket_types:", typesError);
        setTicketsLoaded(true);
        setIsLoadingTickets(false);
        return;
      }

      console.log(`📋 ${typesData?.length || 0} types de billets chargés`);
      setDbTicketTypes(typesData || []);

      // 2️⃣ Charger TOUS les tickets AVEC PAGINATION
      let allTicketsData = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        console.log(`📄 Chargement page ${page + 1} (${from} à ${to})...`);

        const { data, error } = await supabase
          .from("tickets")
          .select("id, ticket_type_id, status, user_id")
          .eq("event_id", event.id)
          .range(from, to);

        if (error) {
          console.error("❌ Erreur chargement tickets:", error);
          setTicketsLoaded(true);
          setIsLoadingTickets(false);
          return;
        }

        if (data && data.length > 0) {
          allTicketsData = allTicketsData.concat(data);
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ ${allTicketsData.length} tickets chargés au total`);

      // 3️⃣ Calculer la disponibilité par type
      const availability = {};
      (typesData || []).forEach((tt) => {
        const availableCount = allTicketsData.filter(
          (t) =>
            t.ticket_type_id === tt.id &&
            t.user_id === null &&
            t.status === "active",
        ).length;

        const soldCount = allTicketsData.filter(
          (t) => t.ticket_type_id === tt.id && t.user_id !== null,
        ).length;

        const totalCount = allTicketsData.filter(
          (t) => t.ticket_type_id === tt.id,
        ).length;

        const soldCounter = Number(tt.quantity_sold ?? tt.tickets_sold ?? 0);
        const capacityLeft = Math.max(
          0,
          Number(tt.quantity_available ?? 0) - soldCounter,
        );

        availability[tt.id] = {
          available: Math.min(availableCount, capacityLeft),
          sold: soldCount,
          total: totalCount,
        };

        console.log(
          `📊 ${tt.name}: disponible=${availableCount}, vendu=${soldCount}, total=${totalCount}`,
        );
      });

      setTicketAvailability(availability);
      setTicketsLoaded(true);
    } catch (err) {
      console.error("❌ Erreur chargement données:", err);
      setTicketsLoaded(true);
    } finally {
      setIsLoadingTickets(false);
    }
  }, [event?.id]);

  // Chargement au montage
  useEffect(() => {
    if (event?.id) {
      console.log("🔄 Chargement initial des données");
      loadDataFromDB();
    }
  }, []); // ← Une seule fois au montage

  // Rechargement quand refreshKey change
  useEffect(() => {
    if (event?.id && refreshKey > 0) {
      console.log(`🔄 Rechargement des données (refreshKey: ${refreshKey})`);
      loadDataFromDB();
    }
  }, [event?.id, refreshKey, loadDataFromDB]);

  // ============================================================
  // 🔥 UTILISER LES TYPES CHARGÉS DEPUIS LA BASE
  // ============================================================
  const effectiveTicketTypes = useMemo(() => {
    if (dbTicketTypes && dbTicketTypes.length > 0) {
      console.log(
        "✅ Utilisation des types chargés depuis la base:",
        dbTicketTypes.length,
      );
      dbTicketTypes.forEach((t) => {
        console.log(
          `📋 ${t.name}: id=${t.id}, quantity=${t.quantity_available}`,
        );
      });
      return dbTicketTypes;
    }
    console.log("⚠️ Utilisation des types props (fallback)");
    return propTicketTypes || [];
  }, [dbTicketTypes, propTicketTypes]);

  // Regrouper les tickets par jour
  const groupedTickets = useMemo(() => {
    const types = effectiveTicketTypes;
    console.log("📋 groupedTickets - types reçus:", types?.length);
    return groupTicketsByDay(types);
  }, [effectiveTicketTypes]);

  // ============================================================
  // 🔥 FONCTION POUR OBTENIR LA DISPONIBILITÉ
  // ============================================================
  const getRealAvailability = useCallback(
    (typeId) => {
      // Si les tickets sont chargés et que l'ID existe
      if (ticketsLoaded && ticketAvailability[typeId] !== undefined) {
        return ticketAvailability[typeId].available || 0;
      }

      const type = effectiveTicketTypes?.find((t) => t.id === typeId);
      const soldCounter = Number(type?.quantity_sold ?? type?.tickets_sold ?? 0);
      return Math.max(0, Number(type?.quantity_available ?? 0) - soldCounter);
    },
    [ticketAvailability, effectiveTicketTypes, ticketsLoaded],
  );

  // Fonction pour obtenir la disponibilité totale par jour
  const getTotalAvailabilityForDay = useCallback(
    (dayTickets) => {
      let total = 0;
      dayTickets.forEach((ticket) => {
        total += getRealAvailability(ticket.id);
      });
      return total;
    },
    [getRealAvailability],
  );

  // ============================================================
  // GESTION DU PANIER
  // ============================================================

  // Vider le panier si l'événement est fermé
  useEffect(() => {
    if (isClosed) {
      setCart({});
      localStorage.removeItem(`cart_${event?.id}`);
    }
  }, [isClosed, event?.id]);

  // Sauvegarder le panier
  useEffect(() => {
    if (event?.id && !isClosed) {
      localStorage.setItem(`cart_${event.id}`, JSON.stringify(cart));
    }
  }, [cart, event?.id, isClosed]);

  // Récupérer le solde
  useEffect(() => {
    const fetchUserBalance = async () => {
      if (!user) return;
      setIsCheckingBalance(true);
      try {
        const balances = await CoinService.getWalletBalances(user.id);
        setUserBalance(balances.coin_balance);
      } catch (error) {
        console.error("Error fetching user balance:", error);
        if (userProfile?.coin_balance !== undefined) {
          setUserBalance(userProfile.coin_balance);
        }
      } finally {
        setIsCheckingBalance(false);
      }
    };

    if (showCheckoutModal || showCartDetails) {
      fetchUserBalance();
    } else if (userProfile?.coin_balance !== undefined) {
      setUserBalance(userProfile.coin_balance);
    }
  }, [user, showCheckoutModal, showCartDetails, userProfile]);

  // Restaurer les infos sauvegardées
  useEffect(() => {
    const savedName = localStorage.getItem("guest_name");
    if (savedName) {
      setAttendeeName(savedName);
    }

    const savedPhone = localStorage.getItem("guest_phone");
    if (savedPhone) {
      setPhoneNumber(savedPhone);
    }
  }, []);

  // Récupérer le nom de l'utilisateur connecté
  useEffect(() => {
    if (user) {
      const userName = user?.full_name || user?.user_metadata?.full_name || "";
      if (userName) {
        setAttendeeName(userName);
      }
      const fetchUserPhone = async () => {
        if (user?.id) {
          const { data, error } = await supabase
            .from("profiles")
            .select("phone")
            .eq("id", user.id)
            .maybeSingle();
          if (data && !error && data.phone) {
            setPhoneNumber(data.phone);
          }
        }
      };
      fetchUserPhone();
    }
  }, [user]);

  const isPresale = useMemo(() => {
    if (!event || !event.event_start_at) return false;
    return new Date() < new Date(event.event_start_at);
  }, [event]);

  // Gestion des quantités
  const handleQuantityChange = (typeId, delta) => {
    if (isClosed) {
      toast({
        title: "Ventes fermees",
        description: "La billetterie est actuellement fermee.",
        variant: "destructive",
      });
      return;
    }
    setCart((prev) => {
      const current = prev[typeId] || 0;
      const available = getRealAvailability(typeId);
      let next;
      if (delta > 0) {
        next = Math.min(current + delta, available);
      } else {
        next = Math.max(0, current + delta);
      }
      const newCart = { ...prev };
      if (next === 0) {
        delete newCart[typeId];
      } else {
        newCart[typeId] = next;
      }
      return newCart;
    });
  };

  const handleAddMultiple = (typeId, quantity) => {
    if (isClosed) {
      toast({
        title: "Ventes fermees",
        description: "La billetterie est actuellement fermee.",
        variant: "destructive",
      });
      return;
    }
    const available = getRealAvailability(typeId);
    const current = cart[typeId] || 0;
    if (quantity <= 0) {
      setCart((prev) => {
        const newCart = { ...prev };
        delete newCart[typeId];
        return newCart;
      });
      return;
    }
    const maxToAdd = Math.min(quantity, available - current);
    if (maxToAdd <= 0) {
      const type = effectiveTicketTypes?.find((t) => t.id === typeId);
      toast({
        title: "Quantite non disponible",
        description: `Seulement ${available} places disponibles pour ${type?.name || "ce billet"}`,
        variant: "destructive",
      });
      return;
    }
    setCart((prev) => ({
      ...prev,
      [typeId]: (prev[typeId] || 0) + maxToAdd,
    }));
  };

  const removeFromCart = (typeId) => {
    const type = effectiveTicketTypes?.find((t) => t.id === typeId);
    setCart((prev) => {
      const newCart = { ...prev };
      delete newCart[typeId];
      return newCart;
    });
    if (type) {
      toast({
        title: "Retire du panier",
        description: `${type.name} a ete retire de votre panier`,
      });
    }
  };

  const clearCart = () => {
    if (Object.keys(cart).length === 0) return;
    setCart({});
    toast({
      title: "Panier vide",
      description: "Tous les billets ont ete retires de votre panier",
    });
  };

  const getActivePrice = (type) => {
    if (!type) return 0;
    if (isPresale && type.presale_price_pi && type.presale_price_pi > 0)
      return type.presale_price_pi;
    return type.price_coins || type.price_pi || 0;
  };

  const cartItems = useMemo(() => {
    if (!effectiveTicketTypes) return [];
    return Object.entries(cart)
      .map(([id, qty]) => {
        const type = effectiveTicketTypes.find((t) => t.id === id);
        if (!type) return null;
        const unitPrice = getActivePrice(type);
        const total = unitPrice * qty;
        const totalFcfa = total * 10;
        return {
          id,
          type,
          quantity: qty,
          unitPrice,
          total,
          totalFcfa,
        };
      })
      .filter(Boolean);
  }, [cart, effectiveTicketTypes, isPresale]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.total, 0);
  }, [cartItems]);

  const cartTotal = useMemo(() => {
    return Math.max(0, subtotal - promoDiscountAmount);
  }, [subtotal, promoDiscountAmount]);

  const cartTotalFcfa = useMemo(() => cartTotal * 10, [cartTotal]);

  const cartTotalWithFees = useMemo(() => {
    const totalWithFees = cartTotalFcfa * (1 + MONEYFUSION_FEE_RATE);
    return Math.ceil(totalWithFees);
  }, [cartTotalFcfa]);

  const totalTicketsInCart = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );
  const hasSufficientBalance = useMemo(
    () => (userBalance || 0) >= cartTotal,
    [userBalance, cartTotal],
  );
  const balanceDeficit = useMemo(
    () => Math.max(0, cartTotal - (userBalance || 0)),
    [userBalance, cartTotal],
  );
  const userBalanceCfa = (userBalance || 0) * FCFA_PER_COIN;
  const deficitCfa = balanceDeficit * FCFA_PER_COIN;

  // Gestion des codes promo
  const handleApplyPromoCode = async () => {
    if (!promoCodeInput.trim()) {
      setPromoCodeError("Veuillez entrer un code");
      return;
    }

    setApplyingPromoCode(true);
    setPromoCodeError("");

    try {
      const result = await applyPromoCode(promoCodeInput, subtotal, user?.id);

      if (!result.codeId) {
        setPromoCodeError(result.message || "Code promo invalide");
        toast({
          title: "Code promo invalide",
          description: result.message || "Verifiez que le code est correct",
          variant: "destructive",
        });
        setApplyingPromoCode(false);
        return;
      }

      if (result.newTotal !== subtotal && result.codeId) {
        setIsPromoApplied(true);
        setPromoDiscountAmount(subtotal - result.newTotal);
        setPromoCommissionAmount(result.commissionAmount);
        setAppliedPromoCodeId(result.codeId);
        setAppliedInfluencerId(result.influencerId);
        setPendingCommissionAmount(result.commissionAmount);
        setAppliedDiscountValue(result.discountValue);
        setAppliedDiscountType(result.discountType);
        setPromoCodeInput("");

        toast({
          title: "Code promo applique !",
          description: `Reduction de ${(subtotal - result.newTotal).toFixed(2)} pieces`,
          className: "bg-green-600 text-white",
          duration: 4000,
        });
      }
    } catch (error) {
      console.error("Error applying promo code:", error);
      setPromoCodeError("Erreur lors de l'application du code");
    } finally {
      setApplyingPromoCode(false);
    }
  };

  const handleRemovePromoCode = () => {
    removePromoCode();
    setIsPromoApplied(false);
    setPromoDiscountAmount(0);
    setPromoCommissionAmount(0);
    setAppliedPromoCodeId(null);
    setAppliedInfluencerId(null);
    setPendingCommissionAmount(0);
    setAppliedDiscountValue(0);
    setAppliedDiscountType(null);
    toast({
      title: "Code promo supprime",
      description: "La reduction a ete retiree",
    });
  };

  const redirectToPacks = () => {
    setShowInsufficientBalanceModal(false);
    setShowCheckoutModal(false);
    window.location.href = "/packs";
  };

  const redirectToMyTickets = () => {
    window.location.href = "/profile?tab=tickets";
  };

  const saveUserPhone = async (phone) => {
    if (!user?.id) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ phone: phone })
      .eq("id", user.id);
    if (error) {
      console.error("❌ Erreur sauvegarde téléphone:", error);
      return false;
    }
    return true;
  };

  const saveUserName = async (name) => {
    if (!user?.id) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", user.id);
    if (error) {
      console.error("❌ Erreur sauvegarde nom:", error);
      return false;
    }
    return true;
  };

  // ============================================================
  // PAIEMENTS
  // ============================================================

  const processTicketPayment = async () => {
    if (isTicketPaymentProcessing) return;
    setIsTicketPaymentProcessing(true);

    try {
      const cartData = {};
      cartItems.forEach((item) => {
        cartData[item.id] = item.quantity;
      });

      const userId =
        user?.id ||
        `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const orderId = `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const phoneToSend = phoneNumber.trim();
      if (!phoneToSend || phoneToSend.length < 8) {
        toast({
          title: "Numéro requis",
          description: "Veuillez entrer un numéro de téléphone valide.",
          variant: "destructive",
        });
        setShowPaymentInfoModal(true);
        setIsTicketPaymentProcessing(false);
        return;
      }

      let finalAttendeeName = attendeeName.trim();
      if (!finalAttendeeName && user) {
        finalAttendeeName =
          user?.full_name ||
          user?.user_metadata?.full_name ||
          user?.email?.split("@")[0] ||
          "Participant";
      }
      if (!finalAttendeeName) {
        finalAttendeeName = "Invité";
      }

      const fullAddress =
        event?.full_address ||
        event?.address ||
        event?.location ||
        event?.city ||
        "Lieu non spécifié";
      const location = event?.location || event?.city || "Lieu non spécifié";
      const city = event?.city || "";
      const country = event?.country || "";
      const address = event?.address || "";

      const amountWithFees = cartTotalWithFees;
      const paymentData = {
        order_id: orderId,
        event_id: event.id,
        cart: cartData,
        promoCodeId: appliedPromoCodeId || null,
        commissionAmount: pendingCommissionAmount || promoCommissionAmount || 0,
        discountAmount: promoDiscountAmount || 0,
        totalFcfa: cartTotalFcfa,
        totalWithFees: amountWithFees,
        feesAmount: amountWithFees - cartTotalFcfa,
        timestamp: Date.now(),
        isGuest: !user,
        userEmail: user?.email || null,
        phone: phoneToSend,
        attendeeName: finalAttendeeName,
        event_title: event.title,
        event_start_at: event.event_start_at,
        event_end_at: event.event_end_at,
        event_location: location,
        event_full_address: fullAddress,
        event_city: city,
        event_country: country,
        event_address: address,
        userId: userId,
        ticketTypes: effectiveTicketTypes.map((t) => ({
          id: t.id,
          name: t.name,
          price: t.price,
          color: t.color,
          description: t.description,
        })),
      };

      // Sauvegarder les données du paiement pour la création du billet après confirmation
      localStorage.setItem(
        "pending_ticket_payment",
        JSON.stringify(paymentData),
      );

      // Ouvrir le paiement USSD (code + QR + référence SMS)
      setUssdSuccess(false);
      setUssdTicketData({ ...paymentData, userId, orderId, amountWithFees });
      setUssdAmount(amountWithFees);
      setShowUSSDModal(true);
      setIsTicketPaymentProcessing(false);
    } catch (error) {
      console.error("❌ Erreur paiement ticket:", error);
      toast({
        title: "Erreur de paiement",
        description:
          error.message || "Une erreur est survenue lors du paiement.",
        variant: "destructive",
        duration: 6000,
      });
      setIsTicketPaymentProcessing(false);
    }
  };

  const confirmTicketUSSD = async (smsReference, proofDataUrl) => {
    const ticketData = ussdTicketData;
    if (!ticketData) {
      throw new Error("Données de paiement manquantes.");
    }

    try {
      const response = await fetch("/.netlify/functions/ussd-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          action: "submit",
          type: "tickets",
          smsReference,
          proofDataUrl: proofDataUrl || null,
          amountFcfa: ticketData.amountWithFees,
          phone: ticketData.phone,
          transactionId: ticketData.orderId,
          userId: ticketData.userId,
          eventId: ticketData.event_id,
          cart: ticketData.cart,
          cartTotalFcfa: ticketData.totalFcfa,
          attendeeName: ticketData.attendeeName,
          promoCodeId: ticketData.promoCodeId,
          commissionAmount: ticketData.commissionAmount,
          isGuest: ticketData.isGuest,
          userEmail: ticketData.userEmail,
        }),
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error("La réponse du serveur n'est pas un JSON valide");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Erreur HTTP ${response.status}`);
      }

      toast({
        title: "🎉 Paiement enregistré !",
        description: "Vos billets sont disponibles dans « Mes billets ».",
        className: "bg-green-600 text-white",
      });

      setUssdSuccess(true);

      // 📌 Billet sans compte : conserver une copie locale (comme l'ancien flux invité)
      // pour que le client puisse voir son billet stocké et le télécharger après validation.
      if (!user && result.tickets && result.tickets.length > 0) {
        try {
          const guestList = JSON.parse(
            localStorage.getItem("guest_tickets") || "[]",
          );
          const detail =
            ticketData.event_full_address ||
            ticketData.event_location ||
            ticketData.event_city ||
            "Lieu non spécifié";
          const firstType = ticketData.ticketTypes?.[0] || {
            name: "Standard",
            color: "blue",
            description: "Billet standard",
          };
          result.tickets.forEach((tk) => {
            if (guestList.some((g) => g.id === tk.id)) return;
            guestList.push({
              id: tk.id,
              event_id: ticketData.event_id,
              user_id: "guest",
              qr_code: tk.qr_code,
              attendee_name: ticketData.attendeeName || "Invité",
              status: "active",
              payment_status: "pending",
              purchase_amount_pi: Math.floor((ticketData.totalFcfa || 0) / 10),
              purchase_amount_fcfa: ticketData.totalFcfa || 0,
              purchased_at: new Date().toISOString(),
              payment_method: "ussd",
              transaction_reference: ticketData.orderId,
              order_id: ticketData.orderId,
              isGuest: true,
              ticket_number: tk.ticket_number,
              ticket_code_short: tk.ticket_code_short,
              event_title: ticketData.event_title,
              event_start_at: ticketData.event_start_at,
              event_end_at: ticketData.event_end_at,
              location: detail,
              full_address: ticketData.event_full_address || detail,
              address: ticketData.event_address || "",
              city: ticketData.event_city || "",
              country: ticketData.event_country || "",
              ticket_type_name: firstType.name,
              ticket_type_color: firstType.color,
              ticket_type_description: firstType.description || "",
              events: {
                id: ticketData.event_id,
                title: ticketData.event_title,
                event_start_at: ticketData.event_start_at,
                event_end_at: ticketData.event_end_at,
                location: detail,
                full_address: ticketData.event_full_address || detail,
                address: ticketData.event_address || "",
                city: ticketData.event_city || "",
                country: ticketData.event_country || "",
              },
              ticket_types: {
                name: firstType.name,
                color: firstType.color,
                description: firstType.description || "",
              },
            });
          });
          localStorage.setItem("guest_tickets", JSON.stringify(guestList));
        } catch (mirrorErr) {
          console.error("⚠️ Miroir billet invité non enregistré:", mirrorErr);
        }
      }

      setTimeout(async () => {
        await loadDataFromDB();
        if (forceRefresh) forceRefresh();
      }, 3000);

      return true;
    } catch (error) {
      console.error("❌ Erreur paiement ticket:", error);
      toast({
        title: "Erreur de paiement",
        description: error.message || "Une erreur est survenue.",
        variant: "destructive",
        duration: 6000,
      });
      throw error;
    }
  };

  const handleTicketPaymentWithoutAccount = async () => {
    if (isTicketPaymentProcessing) {
      toast({
        title: "Paiement en cours",
        description: "Veuillez patienter, le paiement est déjà en cours.",
        variant: "default",
      });
      return;
    }

    if (totalTicketsInCart === 0) {
      toast({
        title: "Panier vide",
        description: "Veuillez ajouter des billets à votre panier.",
        variant: "destructive",
      });
      return;
    }

    if (isClosed) {
      toast({
        title: "Ventes fermees",
        description: "La billetterie est actuellement fermee.",
        variant: "destructive",
      });
      return;
    }

    const hasName =
      attendeeName.trim() &&
      attendeeName.trim() !== "Invité" &&
      attendeeName.trim().length > 0;
    const hasPhone = phoneNumber.trim() && phoneNumber.trim().length >= 8;

    if (!user || !hasName || !hasPhone) {
      setIsInfoRequired(true);
      setShowPaymentInfoModal(true);
      return;
    }

    await processTicketPayment();

    setTimeout(async () => {
      console.log("🔄 Mise à jour après paiement MoneyFusion...");
      await loadDataFromDB();
      forceRefresh();
    }, 3000);
  };

  const handlePaymentInfoSubmit = async () => {
    if (!attendeeName.trim()) {
      toast({
        title: "Nom requis",
        description: "Veuillez entrer votre nom complet.",
        variant: "destructive",
      });
      return;
    }

    let cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanPhone.startsWith("226") && cleanPhone.length > 8) {
      cleanPhone = cleanPhone.substring(3);
    }
    if (cleanPhone.startsWith("0") && cleanPhone.length === 9) {
      cleanPhone = cleanPhone.substring(1);
    }

    if (cleanPhone.length < 8 || cleanPhone.length > 12) {
      toast({
        title: "Numéro invalide",
        description: "Veuillez entrer un numéro valide (8 à 12 chiffres).",
        variant: "destructive",
      });
      return;
    }

    localStorage.setItem("guest_name", attendeeName.trim());
    localStorage.setItem("guest_phone", cleanPhone);

    setPhoneNumber(cleanPhone);

    if (user?.id) {
      await saveUserName(attendeeName.trim());
      await saveUserPhone(cleanPhone);
    }

    setShowPaymentInfoModal(false);
    setIsInfoRequired(false);

    setTimeout(() => {
      processTicketPayment();
    }, 300);
  };

  const handlePurchase = async () => {
    if (isPurchasingRef.current) return;

    if (!event || !event.id) {
      toast({
        title: "Erreur",
        description: "Événement non trouvé. Veuillez rafraîchir la page.",
        variant: "destructive",
      });
      return;
    }

    if (isClosed) {
      toast({
        title: "Impossible",
        description: "Les ventes sont fermees.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Veuillez vous connecter pour acheter des billets",
        variant: "destructive",
      });
      setShowCheckoutModal(false);
      return;
    }

    if (totalTicketsInCart === 0) {
      toast({
        title: "Panier vide",
        description: "Veuillez ajouter des billets a votre panier",
        variant: "destructive",
      });
      return;
    }

    if (!hasSufficientBalance) {
      setShowInsufficientBalanceModal(true);
      return;
    }

    const currentName = attendeeName.trim();
    const userFullName =
      user?.full_name || user?.user_metadata?.full_name || "";
    const hasValidName =
      currentName && currentName !== "Invité" && currentName.length > 0;

    if (!hasValidName && !userFullName) {
      setIsInfoRequired(false);
      setShowPaymentInfoModal(true);
      return;
    }

    const userName =
      currentName ||
      userFullName ||
      user?.email?.split("@")[0] ||
      "Participant";

    isPurchasingRef.current = true;
    setLoading(true);

    try {
      console.log("🛒 Achat avec compte - Event ID:", event.id);
      console.log("🛒 Cart:", cart);
      console.log("🛒 Total:", cartTotal);

      const { data, error } = await supabase.rpc("purchase_tickets_v2", {
        p_user_id: user.id,
        p_event_id: event.id,
        p_cart: cart,
        p_final_amount: cartTotal,
        p_promo_code_id: appliedPromoCodeId || null,
        p_commission_amount:
          pendingCommissionAmount || promoCommissionAmount || 0,
        p_payment_method: "coins",
        p_transaction_reference: null,
        p_attendee_name: userName,
      });

      if (error) {
        console.error("RPC Error:", error);
        throw new Error(error.message || "Erreur lors de l'achat");
      }

      if (!data.success) {
        throw new Error(data.message || "Erreur lors de l'achat");
      }

      const generatedTickets = data.tickets || [];

      // 🔥 Fonction pour générer un code court de 4 caractères
      const generateShortCode = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
        let code = "";
        for (let i = 0; i < 4; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      // 🔥 Traiter les tickets avec des codes courts
      const pdfTickets = generatedTickets.map((t) => {
        let cleanPrice = t.price_fcfa || t.price * 10 || 0;
        if (typeof cleanPrice === "string") {
          cleanPrice = cleanPrice.replace(/[^0-9,.]/g, "").replace(",", ".");
        }
        const priceFcfa = parseFloat(cleanPrice) || 0;

        // 🔥 Utiliser le code court s'il existe, ou en générer un nouveau
        let shortCode = t.ticket_code_short || t.qr_code || t.number;

        // Si le code est plus long que 4 caractères, en générer un nouveau
        if (!shortCode || shortCode.length > 4) {
          shortCode = generateShortCode();
        }

        // Si le code fait exactement 4 caractères, le garder
        // Sinon, en générer un nouveau
        if (shortCode.length !== 4) {
          shortCode = generateShortCode();
        }

        return {
          ticket_number: shortCode, // Utiliser le code court comme numéro de ticket
          type_name: t.type,
          price: t.price,
          price_fcfa: priceFcfa,
          ticket_code_short: shortCode,
          qr_code: t.qr_code, // Garder le QR code original pour référence
          full_code: t.qr_code || t.number, // Garder le code complet pour traçabilité
        };
      });

      setPurchasedTickets(pdfTickets);
      setTransactionId(data.transaction_id);
      setShowCheckoutModal(false);

      clearCart();

      setIsPromoApplied(false);
      setPromoDiscountAmount(0);
      setPromoCommissionAmount(0);
      setAppliedPromoCodeId(null);
      setAppliedInfluencerId(null);
      setPendingCommissionAmount(0);
      setPromoCodeInput("");

      console.log("🔄 Mise à jour après achat avec compte...");
      await loadDataFromDB();
      forceRefresh();

      const newBalance = await CoinService.getWalletBalances(user.id);
      setUserBalance(newBalance.coin_balance);

      toast({
        title: "Commande validee ! 🎉",
        description: (
          <div className="flex flex-col gap-1">
            <span>Votre commande a ete effectuee avec succes.</span>
            {promoDiscountAmount > 0 && (
              <div className="mt-1 p-2 bg-green-100 rounded-md">
                <span className="font-medium text-green-700">
                  Reduction appliquee : {promoDiscountAmount.toFixed(2)} pieces
                  ({Math.floor(promoDiscountAmount * 10).toLocaleString()} FCFA)
                </span>
              </div>
            )}
            <span className="font-medium text-primary mt-1">
              <Bell className="w-3 h-3 inline mr-1" />
              Redirection vers vos billets...
            </span>
          </div>
        ),
        duration: 3000,
      });

      setTimeout(() => {
        redirectToMyTickets();
      }, 2500);

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Purchase error:", error);
      toast({
        title: "Erreur d'achat",
        description: error.message || "Une erreur est survenue lors de l'achat",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      isPurchasingRef.current = false;
    }
  };

  const handleDownloadPDF = async () => {
    if (purchasedTickets && purchasedTickets.length > 0) {
      toast({
        title: "Generation en cours...",
        description: "Preparation de votre PDF de billets.",
      });
      try {
        await generateTicketPDF(event, purchasedTickets, user);
        toast({
          title: "Succes",
          description: "Vos billets ont ete telecharges.",
        });
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Impossible de telecharger les billets",
          variant: "destructive",
        });
      }
    }
  };

  const getTicketIcon = (color) => {
    switch (color) {
      case "gold":
        return <Crown className="w-5 h-5 text-yellow-300" />;
      case "silver":
        return <Star className="w-5 h-5 text-slate-300" />;
      default:
        return <Ticket className="w-5 h-5 text-white" />;
    }
  };

  const quickAddOptions = [1, 2, 3, 5];

  if (!isUnlocked) return null;

  // Calcul du total des places disponibles
  const totalAvailablePlaces = useMemo(() => {
    let total = 0;
    Object.values(ticketAvailability).forEach((val) => {
      total += val.available || 0;
    });
    return total;
  }, [ticketAvailability]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gradient-to-r from-primary/10 to-purple-500/10 p-4 sm:p-6 rounded-xl border border-primary/20 gap-3 sm:gap-0">
        <div className="w-full sm:w-auto">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-foreground">
            <Ticket className="text-primary h-5 w-5 sm:h-6 sm:w-6" />{" "}
            Billetterie
          </h2>
          <p className="text-muted-foreground text-sm">
            Selectionnez vos billets ci-dessous
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          {isPresale ? (
            <Badge
              variant="secondary"
              className="bg-yellow-100 text-yellow-800 border-yellow-300 animate-pulse text-xs sm:text-sm"
            >
              Prevente
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs sm:text-sm">
              Tarif Normal
            </Badge>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 sm:py-2 bg-primary/10 rounded-lg">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium whitespace-nowrap">
              Solde:{" "}
              <span className="font-bold">{userBalance.toFixed(2)} pieces</span>
            </span>
          </div>
          {/* 🔥 BOUTON DE RAFRAÎCHISSEMENT */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              console.log("🔄 Rafraîchissement manuel...");
              loadDataFromDB();
              setRefreshKey((prev) => prev + 1);
            }}
            className="ml-2 bg-yellow-500/20 border-yellow-500 text-yellow-500 hover:bg-yellow-500/30"
          >
            <Loader2 className="w-4 h-4 mr-1" />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* Indicateur de disponibilité en temps réel */}
      {ticketsLoaded && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Données en temps réel</span>
          <span className="text-muted-foreground">•</span>
          <span>{totalAvailablePlaces} places disponibles</span>
          {isLoadingTickets && (
            <Loader2 className="w-3 h-3 animate-spin ml-2" />
          )}
        </div>
      )}

      {/* Sélecteur de jour */}
      {groupedTickets.length > 1 && (
        <div className="flex flex-wrap gap-2 py-2">
          <Button
            variant={selectedDay === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedDay("all")}
            className="rounded-full"
          >
            <CalendarDays className="w-4 h-4 mr-1" />
            Tous les jours
          </Button>
          {groupedTickets.map((group) => (
            <Button
              key={group.date}
              variant={selectedDay === group.date ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDay(group.date)}
              className="rounded-full"
            >
              <Calendar className="w-4 h-4 mr-1" />
              {group.label}
            </Button>
          ))}
        </div>
      )}

      {/* Ticket Grid */}
      {!effectiveTicketTypes || effectiveTicketTypes.length === 0 ? (
        <Alert>
          <AlertTitle>Aucun billet disponible</AlertTitle>
          <AlertDescription>
            La billetterie est fermee ou les billets sont epuises.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {groupedTickets.map((group) => {
            if (selectedDay !== "all" && group.date !== selectedDay)
              return null;

            const dayTickets = group.tickets;
            const totalAvailable = getTotalAvailabilityForDay(dayTickets);

            return (
              <div key={group.date} className="mb-8">
                {/* En-tête du jour */}
                {groupedTickets.length > 1 && (
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-primary/10 px-4 py-2 rounded-lg border border-primary/20">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        <span className="font-bold text-lg">{group.label}</span>
                        <Badge variant="secondary" className="ml-2">
                          {dayTickets.length} type
                          {dayTickets.length > 1 ? "s" : ""} de billet
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-green-500 border-green-500"
                        >
                          {totalAvailable} places disponibles
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grille des tickets */}
                <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {dayTickets.map((type) => {
                    const price = getActivePrice(type);
                    const available = getRealAvailability(type.id);
                    const isSoldOut = available <= 0;
                    const inCart = cart[type.id] || 0;
                    const style =
                      TICKET_COLORS[type.color] || TICKET_COLORS.blue;

                    return (
                      <Card
                        key={type.id}
                        className={`relative overflow-hidden transition-all hover:shadow-xl ${style.bg} ${style.border} ${isSoldOut || isClosed ? "opacity-80 grayscale" : "hover:scale-[1.02]"} group`}
                      >
                        <CardContent className="p-4 sm:p-6 flex flex-col h-full justify-between gap-3 sm:gap-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              {getTicketIcon(type.color)}
                              <h3
                                className={`font-bold text-lg sm:text-xl ${style.text} break-words`}
                              >
                                {type.name}
                              </h3>
                            </div>
                            <div>
                              <div
                                className={`font-bold text-xl sm:text-2xl ${style.text} flex items-center`}
                              >
                                {price.toFixed(2)}{" "}
                                <Coins className="w-4 h-4 sm:w-5 sm:h-5 ml-1 text-yellow-300" />
                              </div>
                              <div
                                className={`text-xs sm:text-sm ${style.text} opacity-80`}
                              >
                                {(price * 10).toLocaleString()} FCFA
                              </div>
                            </div>
                          </div>
                          {type.description && (
                            <p
                              className={`text-xs sm:text-sm ${style.text} opacity-90 mt-2 line-clamp-2`}
                            >
                              {type.description}
                            </p>
                          )}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs ${style.text} font-medium ${isSoldOut ? "text-red-200" : ""} truncate`}
                              >
                                {isClosed
                                  ? "Termine"
                                  : isSoldOut
                                    ? "Epuise"
                                    : `${available} places`}
                              </span>
                              {inCart > 0 && !isClosed && (
                                <Badge
                                  variant="secondary"
                                  className={`${style.badge} text-xs px-2`}
                                >
                                  {inCart} dans le panier
                                </Badge>
                              )}
                            </div>
                            {!isSoldOut && !isClosed && (
                              <div className="flex flex-wrap gap-1">
                                {quickAddOptions.map((qty) => (
                                  <Button
                                    key={qty}
                                    size="sm"
                                    variant="outline"
                                    className={`h-6 sm:h-7 px-2 text-xs ${style.text} border-white/30 hover:bg-white/20`}
                                    onClick={() =>
                                      handleAddMultiple(type.id, qty)
                                    }
                                    disabled={available < inCart + qty}
                                  >
                                    +{qty}
                                  </Button>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 border-t border-white/20 gap-3 sm:gap-0">
                              {isClosed ? (
                                <div className="w-full text-center py-2 bg-black/20 rounded-lg text-white font-medium text-sm">
                                  Billetterie fermee
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 sm:gap-3 bg-black/20 p-1 rounded-lg backdrop-blur-sm w-full sm:w-auto justify-center">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 sm:h-8 sm:w-8 text-white hover:bg-white/20 transition-colors"
                                      onClick={() =>
                                        handleQuantityChange(type.id, -1)
                                      }
                                      disabled={!inCart || isSoldOut}
                                    >
                                      <Minus className="w-3 h-3 sm:w-3 sm:h-3" />
                                    </Button>
                                    <span
                                      className={`w-8 text-center font-bold ${style.text} text-lg`}
                                    >
                                      {inCart || 0}
                                    </span>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 sm:h-8 sm:w-8 text-white hover:bg-white/20 transition-colors"
                                      onClick={() =>
                                        handleQuantityChange(type.id, 1)
                                      }
                                      disabled={
                                        available <= inCart || isSoldOut
                                      }
                                    >
                                      <Plus className="w-3 h-3 sm:w-3 sm:h-3" />
                                    </Button>
                                  </div>
                                  {inCart > 0 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className={`h-7 px-2 text-xs ${style.text} hover:bg-white/20 w-full sm:w-auto mt-2 sm:mt-0`}
                                      onClick={() => removeFromCart(type.id)}
                                    >
                                      <X className="w-3 h-3 mr-1" /> Retirer
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {isSoldOut && (
                            <div className="absolute top-2 right-2">
                              <Badge className="bg-red-600 text-white px-3 py-1 animate-pulse font-bold">
                                ÉPUISÉ
                              </Badge>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Floating Cart */}
      {totalTicketsInCart > 0 && !isClosed && (
        <>
          {showCartDetails && (
            <div
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setShowCartDetails(false)}
            >
              <div
                className="fixed bottom-0 left-0 right-0 sm:bottom-24 sm:left-1/2 sm:transform sm:-translate-x-1/2 w-full sm:max-w-md max-h-[85vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <Card className="bg-card shadow-2xl border-t-4 border-t-primary rounded-2xl sm:rounded-xl h-full overflow-hidden">
                  <CardContent className="p-4 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">
                        Votre panier ({totalTicketsInCart} billet
                        {totalTicketsInCart > 1 ? "s" : ""})
                      </h3>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded text-sm">
                          <Wallet className="w-3 h-3" />
                          <span className="font-medium">
                            {userBalance.toFixed(2)} pieces
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearCart}
                          className="text-destructive hover:text-destructive p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sr-only sm:not-sr-only sm:ml-1">
                            Vider
                          </span>
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1 pr-2 sm:pr-4">
                      {cartItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 mb-2 bg-muted/30 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {item.type.name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {item.unitPrice.toFixed(2)} pieces x{" "}
                              {item.quantity}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 ml-2">
                            <div className="text-right">
                              <div className="font-bold text-sm sm:text-base">
                                {item.total.toFixed(2)} pieces
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.totalFcfa.toLocaleString()} FCFA
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive flex-shrink-0"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <X className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                    <div className="mt-4 pt-4 border-t">
                      {/* Promo code */}
                      {!isPromoApplied && (
                        <div className="mb-3 p-3 bg-muted/20 rounded-lg">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Code promo"
                              value={promoCodeInput}
                              onChange={(e) =>
                                setPromoCodeInput(e.target.value.toUpperCase())
                              }
                              className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background"
                            />
                            <Button
                              onClick={handleApplyPromoCode}
                              disabled={
                                applyingPromoCode || !promoCodeInput.trim()
                              }
                              variant="outline"
                              size="sm"
                            >
                              {applyingPromoCode ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Tag className="w-4 h-4" />
                              )}{" "}
                              Appliquer
                            </Button>
                          </div>
                          {promoCodeError && (
                            <p className="text-xs text-destructive mt-1">
                              {promoCodeError}
                            </p>
                          )}
                        </div>
                      )}
                      {isPromoApplied && (
                        <div className="mb-3 p-2 bg-green-500/10 rounded-lg border border-green-500/20 animate-in zoom-in duration-300">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Tag className="w-4 h-4 text-green-600 animate-bounce" />
                              <span className="text-sm font-medium text-green-600">
                                Reduction appliquee
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-green-600 animate-pulse">
                                -{promoDiscountAmount.toFixed(2)} pieces
                              </div>
                              <div className="text-xs text-green-600">
                                -
                                {Math.floor(
                                  promoDiscountAmount * 10,
                                ).toLocaleString()}{" "}
                                FCFA
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemovePromoCode}
                            className="h-7 px-2 text-destructive absolute right-2 top-2 hover:scale-110 transition-transform"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {!hasSufficientBalance && (
                        <Alert variant="destructive" className="mb-3">
                          <AlertTitle className="text-sm">
                            Solde insuffisant
                          </AlertTitle>
                          <AlertDescription className="text-xs">
                            Il vous manque {balanceDeficit.toFixed(2)} pieces
                          </AlertDescription>
                        </Alert>
                      )}
                      <div className="flex flex-col gap-3 mb-3">
                        <div className="flex justify-between items-center">
                          <div className="min-w-0">
                            <span className="font-bold text-sm sm:text-base">
                              Total
                            </span>
                            <div className="text-xs sm:text-sm text-muted-foreground truncate">
                              Solde disponible: {userBalance.toFixed(2)} pièces
                            </div>
                            {isPromoApplied && (
                              <div className="text-xs text-green-600 font-medium">
                                ✅ Réduction appliquée
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xl sm:text-2xl font-bold text-primary block">
                              {cartTotal.toFixed(2)} pièces
                            </span>
                            <span className="text-xs sm:text-sm text-muted-foreground">
                              {cartTotalFcfa.toLocaleString()} FCFA
                            </span>
                          </div>
                        </div>

                        {/* Bannière d'information */}
                        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-lg p-3 border border-amber-200/50 dark:border-amber-800/50">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-amber-500/20 p-1.5 rounded-full">
                                <Tag className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                  💡 Pas de code promo ? Pas de problème !
                                </span>
                                <p className="text-[10px] text-muted-foreground">
                                  Vous pouvez payer sans code promo, le montant
                                  ci-dessous sera débité
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-amber-300 text-amber-600 dark:text-amber-400 text-[10px] whitespace-nowrap"
                            >
                              Paiement direct
                            </Badge>
                          </div>
                        </div>

                        {/* Bannière SANS COMPTE */}
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg p-3 border border-blue-200/50 dark:border-blue-800/50">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div className="flex items-start sm:items-center gap-2 w-full sm:w-auto">
                              <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 flex-shrink-0 mt-0.5 sm:mt-0">
                                SANS COMPTE
                              </Badge>
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] sm:text-xs font-medium text-blue-700 dark:text-blue-300 block sm:inline truncate">
                                  Paiement rapide sans inscription
                                </span>
                                <p className="text-[8px] sm:text-[10px] text-muted-foreground hidden sm:block">
                                  Aucun compte requis, payez en quelques clics
                                </p>
                              </div>
                            </div>
                            <div className="text-right w-full sm:w-auto flex-shrink-0">
                              <span className="text-sm sm:text-base font-bold text-blue-700 dark:text-blue-300 block">
                                {cartTotalWithFees.toLocaleString()} FCFA
                              </span>
                              <span className="text-[8px] sm:text-[10px] text-muted-foreground block">
                                frais 4% inclus
                              </span>
                            </div>
                          </div>
                        </div>

                        {isPromoApplied && (
                          <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2 border border-green-200/50 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 text-xs text-green-700 dark:text-green-400">
                              <span className="flex items-center gap-1 text-[10px] sm:text-xs">
                                <Tag className="w-3 h-3 flex-shrink-0" />
                                Économie réalisée
                              </span>
                              <span className="font-medium text-[10px] sm:text-xs">
                                {promoDiscountAmount.toFixed(2)} pièces
                                <span className="text-[9px] sm:text-[10px] text-muted-foreground ml-1">
                                  (
                                  {Math.floor(
                                    promoDiscountAmount * 10,
                                  ).toLocaleString()}{" "}
                                  FCFA)
                                </span>
                              </span>
                            </div>
                            <div className="text-[9px] sm:text-[10px] text-muted-foreground text-right line-through mt-0.5">
                              {(subtotal * 10).toLocaleString()} FCFA sans promo
                            </div>
                          </div>
                        )}

                        <Button
                          size="sm"
                          onClick={handleTicketPaymentWithoutAccount}
                          disabled={isTicketPaymentProcessing || isClosed}
                          className="h-9 rounded-full flex-1 sm:flex-none text-xs sm:text-sm bg-green-600 hover:bg-green-700 text-white"
                        >
                          {isTicketPaymentProcessing ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Smartphone className="w-3 h-3 mr-1 sm:w-4 sm:h-4" />
                          )}
                          Payer {cartTotalWithFees.toLocaleString()} FCFA
                        </Button>

                        <Button
                          onClick={() => {
                            setShowCartDetails(false);
                            if (!hasSufficientBalance) {
                              setShowInsufficientBalanceModal(true);
                            } else {
                              setShowCheckoutModal(true);
                            }
                          }}
                          className={`flex-1 ${!hasSufficientBalance ? "bg-destructive hover:bg-destructive/90" : "bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"}`}
                          size="lg"
                          disabled={isCheckingBalance}
                        >
                          {isCheckingBalance ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              <span>Vérification...</span>
                            </>
                          ) : !hasSufficientBalance ? (
                            <>
                              <Package className="w-5 h-5 mr-2" />
                              <span>Recharger</span>
                            </>
                          ) : (
                            <>
                              <Wallet className="w-5 h-5 mr-2 flex-shrink-0" />
                              <span className="truncate">
                                Payer {cartTotalFcfa.toLocaleString()} FCFA
                              </span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
          <div className="fixed bottom-4 left-0 right-0 z-50 flex justify-center px-3 sm:px-4 animate-in slide-in-from-bottom duration-500">
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-card/95 backdrop-blur-md rounded-2xl sm:rounded-full shadow-2xl border-t-4 border-t-primary p-3 sm:p-2 sm:pl-4 w-full max-w-md sm:max-w-none">
              <div className="flex items-center gap-3 mb-2 sm:mb-0 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ShoppingCart className="w-6 h-6 text-primary" />
                    {totalTicketsInCart > 0 && (
                      <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center">
                        {totalTicketsInCart}
                      </Badge>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium whitespace-nowrap">
                      {totalTicketsInCart} billet
                      {totalTicketsInCart > 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-primary whitespace-nowrap">
                        {cartTotal.toFixed(2)} pieces
                      </p>
                      {isPromoApplied && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-green-500/20"
                        >
                          Promo
                        </Badge>
                      )}
                      {!hasSufficientBalance && (
                        <Badge
                          variant="destructive"
                          className="h-4 px-1 text-[10px] whitespace-nowrap"
                        >
                          Solde insuffisant
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCartDetails(true)}
                  className="h-9 rounded-full flex-1 sm:flex-none text-xs sm:text-sm"
                >
                  Voir details
                </Button>
                <Button
                  size="sm"
                  onClick={handleTicketPaymentWithoutAccount}
                  disabled={
                    isTicketPaymentProcessing ||
                    isClosed ||
                    totalTicketsInCart === 0
                  }
                  className={`
    h-9 rounded-full flex-1 sm:flex-none 
    text-xs sm:text-sm 
    bg-gradient-to-r from-green-600 to-emerald-600 
    hover:from-green-700 hover:to-emerald-700 
    text-white shadow-lg hover:shadow-xl 
    transition-all duration-300
    ${isTicketPaymentProcessing ? "opacity-80 cursor-wait" : ""}
    ${totalTicketsInCart === 0 ? "opacity-50 cursor-not-allowed" : ""}
  `}
                >
                  {isTicketPaymentProcessing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                      <span className="hidden xs:inline">
                        Paiement en cours...
                      </span>
                      <span className="xs:hidden">En cours...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2 w-full justify-center">
                      <Smartphone className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="hidden xs:inline truncate">
                        Payer sans compte
                      </span>
                      <span className="xs:hidden"> Payer sans compte</span>
                      <span className="hidden sm:inline text-green-300">•</span>

                      <span className="hidden lg:inline text-[8px] text-green-300/70">
                        (frais inclus)
                      </span>
                    </div>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!hasSufficientBalance) {
                      setShowInsufficientBalanceModal(true);
                    } else {
                      setShowCheckoutModal(true);
                    }
                  }}
                  className={`h-9 rounded-full flex-1 sm:flex-none text-xs sm:text-sm ${!hasSufficientBalance ? "bg-destructive hover:bg-destructive/90" : "bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"}`}
                >
                  {!hasSufficientBalance ? "Recharger" : "Payer avec compte"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty Cart State */}
      {totalTicketsInCart === 0 && !isClosed && (
        <div className="fixed bottom-4 left-0 right-0 z-50 flex justify-center px-3 sm:px-4">
          <Card className="bg-card/95 backdrop-blur-md border-t-4 border-t-primary shadow-lg w-full max-w-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-3">
                <ShoppingCart className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Votre panier est vide
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }
                  className="whitespace-nowrap"
                >
                  Ajouter des billets
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Checkout Modal */}
      <Dialog open={showCheckoutModal} onOpenChange={setShowCheckoutModal}>
        <DialogContent className="w-[95vw] max-w-lg mx-auto p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              Validation de commande
            </DialogTitle>
            <DialogDescription>
              Verifiez et modifiez votre commande avant de finaliser
            </DialogDescription>
          </DialogHeader>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 mb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Titulaire :</span>
              <span className="text-sm font-bold text-blue-700">
                {attendeeName ||
                  user?.full_name ||
                  user?.user_metadata?.full_name ||
                  user?.email?.split("@")[0] ||
                  "Non défini"}
              </span>
              <Button
                variant="link"
                size="sm"
                className="text-blue-600 p-0 h-auto ml-auto"
                onClick={() => {
                  setShowCheckoutModal(false);
                  setShowPaymentInfoModal(true);
                }}
              >
                Modifier
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Ce nom apparaîtra sur vos billets
            </p>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg border border-blue-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Votre solde</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary">
                    {userBalance.toFixed(2)} pieces
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">Total panier</p>
                <p
                  className={`text-xl sm:text-2xl font-bold ${hasSufficientBalance ? "text-green-600" : "text-destructive"}`}
                >
                  {cartTotal.toFixed(2)} pieces
                </p>
                {isPromoApplied && (
                  <p className="text-xs text-green-600">
                    (reduction de {promoDiscountAmount.toFixed(2)} pieces)
                  </p>
                )}
              </div>
            </div>
            {!hasSufficientBalance && (
              <Alert variant="destructive" className="mt-3">
                <AlertTitle className="text-sm">Solde insuffisant</AlertTitle>
                <AlertDescription className="text-xs">
                  Il vous manque {balanceDeficit.toFixed(2)} pieces pour valider
                  cette commande.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div id="promo-section" className="mb-3 p-3 bg-muted/20 rounded-lg">
            <div className="flex gap-2">
              <input
                id="promo-code-input"
                type="text"
                placeholder="Code promo"
                value={promoCodeInput}
                onChange={(e) =>
                  setPromoCodeInput(e.target.value.toUpperCase())
                }
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background transition-all duration-200 focus:ring-2 focus:ring-green-500"
              />
              <Button
                onClick={handleApplyPromoCode}
                disabled={applyingPromoCode || !promoCodeInput.trim()}
                variant="outline"
                size="sm"
                className={`transition-all duration-300 ${applyingPromoCode ? "opacity-70" : "hover:scale-105"}`}
              >
                {applyingPromoCode ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Tag className="w-4 h-4 transition-transform group-hover:rotate-12" />
                )}{" "}
                Appliquer
              </Button>
            </div>
            {promoCodeError && (
              <p id="promo-error" className="text-xs text-destructive mt-1">
                {promoCodeError}
              </p>
            )}
          </div>

          <ScrollArea className="max-h-[40vh] sm:max-h-[50vh] pr-2 sm:pr-4">
            <div className="space-y-3 sm:space-y-4 py-2">
              {cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Votre panier est vide</p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 sm:p-4 bg-muted/30 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base sm:text-lg truncate">
                        {item.type.name}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-1">
                        {item.type.description || "Billet standard"}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 sm:h-8 sm:w-8"
                            onClick={() => handleQuantityChange(item.id, -1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="font-bold w-6 sm:w-8 text-center text-sm sm:text-base">
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 sm:h-8 sm:w-8"
                            onClick={() => handleQuantityChange(item.id, 1)}
                            disabled={
                              getRealAvailability(item.id) <= item.quantity
                            }
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 sm:h-8 px-2"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="sr-only sm:not-sr-only sm:ml-1">
                            Supprimer
                          </span>
                        </Button>
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-base sm:text-lg font-bold">
                        {item.total.toFixed(2)} pieces
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        {item.totalFcfa.toLocaleString()} FCFA
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {item.unitPrice.toFixed(2)} pieces / billet
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {cartItems.length > 0 && (
            <>
              <div className="space-y-3">
                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="min-w-0">
                    <span className="text-base sm:text-lg font-bold">
                      Total ({totalTicketsInCart} billet
                      {totalTicketsInCart > 1 ? "s" : ""})
                    </span>
                    <div className="text-xs sm:text-sm text-muted-foreground truncate">
                      {cartItems.length} type{cartItems.length > 1 ? "s" : ""}{" "}
                      de billet
                    </div>
                  </div>
                  <div className="text-right ml-2">
                    <span className="text-xl sm:text-2xl font-bold text-primary block">
                      {cartTotal.toFixed(2)} pieces
                    </span>
                    <span className="text-xs sm:text-sm text-muted-foreground">
                      {cartTotalFcfa.toLocaleString()} FCFA
                    </span>
                    {isPromoApplied && (
                      <div className="text-xs text-green-600 line-through">
                        (au lieu de {(subtotal * 10).toLocaleString()} FCFA)
                      </div>
                    )}
                  </div>
                </div>
                {!hasSufficientBalance && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertDescription className="text-xs sm:text-sm text-amber-800">
                      <Package className="w-4 h-4 inline mr-2" /> Votre solde
                      est insuffissant.{" "}
                      <strong>Rechargez vos pieces pour continuer.</strong>
                    </AlertDescription>
                  </Alert>
                )}
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertDescription className="text-xs sm:text-sm text-blue-700">
                    <Bell className="w-4 h-4 inline mr-2" /> Apres paiement, vos
                    billets seront disponibles dans votre profil.
                  </AlertDescription>
                </Alert>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button
                    variant="destructive"
                    onClick={clearCart}
                    className="w-full sm:flex-1"
                    disabled={cartItems.length === 0}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Vider le panier
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCheckoutModal(false)}
                    className="w-full sm:flex-1"
                  >
                    Continuer mes achats
                  </Button>
                </div>
                <Button
                  onClick={
                    hasSufficientBalance
                      ? handlePurchase
                      : () => setShowInsufficientBalanceModal(true)
                  }
                  disabled={
                    loading || cartItems.length === 0 || !hasSufficientBalance
                  }
                  className={`w-full sm:w-48 ${hasSufficientBalance ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"}`}
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin mr-2 w-5 h-5 flex-shrink-0" />
                      <span>Traitement...</span>
                    </>
                  ) : hasSufficientBalance ? (
                    <>
                      <Check className="mr-2 w-5 h-5 flex-shrink-0" />
                      <span>Payer {cartTotalFcfa.toLocaleString()} FCFA</span>
                    </>
                  ) : (
                    <>
                      <Package className="mr-2 w-5 h-5 flex-shrink-0" />
                      <span>Recharger</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Insufficient Balance Modal */}
      <Dialog
        open={showInsufficientBalanceModal}
        onOpenChange={setShowInsufficientBalanceModal}
      >
        <DialogContent className="w-[95vw] max-w-md mx-auto p-4 sm:p-6">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full flex items-center justify-center mb-4">
              <Wallet className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl text-center text-amber-700">
              Solde insuffisant
            </DialogTitle>
            <DialogDescription className="text-center text-sm sm:text-base">
              <div>
                Votre solde actuel de{" "}
                <strong>{userBalance.toLocaleString()} pièces</strong>{" "}
                <span className="text-muted-foreground">
                  (≈ {userBalanceCfa.toLocaleString()} FCFA)
                </span>{" "}
                ne permet pas d'acheter le panier de{" "}
                <strong>{cartTotal.toLocaleString()} pièces</strong>{" "}
                <span className="text-muted-foreground">
                  (≈ {cartTotalFcfa.toLocaleString()} FCFA)
                </span>
                .
              </div>
              <div>
                Il vous manque{" "}
                <strong className="text-destructive">
                  {balanceDeficit.toLocaleString()} pièces
                </strong>{" "}
                <span className="text-muted-foreground">
                  (≈ {deficitCfa.toLocaleString()} FCFA)
                </span>
                .
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
              <AlertTitle className="text-amber-800 text-sm sm:text-base">
                Solution rapide
              </AlertTitle>
              <AlertDescription className="text-amber-700 text-xs sm:text-sm">
                Rechargez votre compte avec un pack de pièces pour finaliser
                votre achat !
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-14 sm:h-16 flex-col gap-1"
                onClick={() => setShowInsufficientBalanceModal(false)}
              >
                <X className="w-5 h-5" />
                <span className="text-xs">Annuler</span>
              </Button>
              <Button
                onClick={redirectToPacks}
                className="h-14 sm:h-16 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 flex-col gap-1"
              >
                <Package className="w-5 h-5" />
                <span className="text-xs font-bold">Voir les packs</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Info Modal */}
      <Dialog
        open={showPaymentInfoModal}
        onOpenChange={(open) => {
          if (!open && !attendeeName.trim() && isInfoRequired) {
            return;
          }
          setShowPaymentInfoModal(open);
        }}
      >
        <DialogContent className="w-[95vw] max-w-md mx-auto p-4 sm:p-6">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600/20 rounded-full flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-blue-500" />
            </div>
            <DialogTitle className="text-xl text-center">
              👤 Informations requises
            </DialogTitle>
            <DialogDescription className="text-center">
              {user
                ? "Veuillez confirmer vos informations pour le paiement."
                : "Veuillez renseigner vos informations pour le paiement."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label
                htmlFor="name-modal"
                className="text-sm font-medium flex items-center gap-2"
              >
                <User className="w-4 h-4 text-blue-500" />
                Nom complet
              </Label>
              <Input
                id="name-modal"
                type="text"
                placeholder="Ex: Jean Dupont"
                value={attendeeName}
                onChange={(e) => setAttendeeName(e.target.value)}
                className="text-lg mt-1"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ce nom sera imprimé sur vos billets.
              </p>
            </div>

            <div>
              <Label
                htmlFor="phone-modal"
                className="text-sm font-medium flex items-center gap-2"
              >
                <Phone className="w-4 h-4 text-green-500" />
                Numéro à débiter
              </Label>
              <Input
                id="phone-modal"
                type="tel"
                placeholder="Ex: 73790978"
                value={phoneNumber}
                onChange={(e) =>
                  setPhoneNumber(e.target.value.replace(/\D/g, ""))
                }
                className="text-lg mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: 8 à 12 chiffres (sans espaces ni indicatif)
              </p>
              <p className="text-xs text-yellow-500 mt-1">
                🔒 Ce numéro sera associé au paiement USSD (mobile money).
              </p>
              <p className="text-xs text-blue-400 mt-1">
                💡{" "}
                {user
                  ? "Ce numéro sera associé à votre compte."
                  : "Si vous créez un compte plus tard, ce numéro vous sera associé."}
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (!isInfoRequired) {
                    setShowPaymentInfoModal(false);
                  } else {
                    toast({
                      title: "Informations requises",
                      description:
                        "Vous devez remplir tous les champs pour continuer.",
                      variant: "destructive",
                    });
                  }
                }}
                className="flex-1"
                disabled={isInfoRequired}
              >
                Annuler
              </Button>
              <Button
                onClick={handlePaymentInfoSubmit}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                disabled={!attendeeName.trim() || !phoneNumber.trim()}
              >
                <Lock className="w-4 h-4 mr-2" />
                Envoyer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal paiement USSD */}
      <USSDPaymentModal
        open={showUSSDModal}
        onClose={() => {
          setShowUSSDModal(false);
          if (ussdSuccess) {
            setUssdSuccess(false);
            if (!user && ussdTicketData?.orderId) {
              window.location.href = `/profile?tab=tickets&payment=success&order=${ussdTicketData.orderId}`;
            } else {
              redirectToMyTickets();
            }
          } else {
            openBonplaninfosRelance(ussdAmount);
          }
        }}
        amountFcfa={ussdAmount}
        title="Paiement Mobile Money"
        subtitle="Payez par USSD puis confirmez avec la référence reçue par SMS."
        submitLabel="J'ai payé mes billets"
        onConfirm={confirmTicketUSSD}
      />
    </div>
  );
};

export default TicketingInterface;
