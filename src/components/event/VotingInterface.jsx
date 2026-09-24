import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { dbService } from "@/services/dbService";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Vote,
  Coins,
  Plus,
  Minus,
  ShoppingCart,
  Trophy,
  Crown,
  Eye,
  BarChart3,
  UserCircle,
  Target,
  Share2,
  Filter,
  Lock,
  Printer,
  Award,
  Search,
  Calendar,
  Info,
  ChevronDown,
  Flame,
  Sparkles,
  Rocket,
  Zap,
  TrendingUp,
  Star,
  Medal,
  Gem,
  Heart,
  ThumbsUp,
  Gift,
  PartyPopper,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import WalletInfoModal from "@/components/WalletInfoModal";
import USSDPaymentModal, { openBonplaninfosRelance, buildUSSDCode } from "@/components/payment/USSDPaymentModal";
import Confetti from "react-confetti";
import generateRankingPDF from "@/utils/generateRankingPDF";

const Separator = ({
  className = "",
  orientation = "horizontal",
  ...props
}) => (
  <div
    className={`${orientation === "horizontal" ? "w-full h-[1px]" : "h-full w-[1px]"} bg-gray-700 ${className}`}
    {...props}
  />
);

// Service pour créer des transactions sécurisées
const TransactionService = {
  async createTransaction(transactionData) {
    try {
      if (
        transactionData.amount_pi === undefined ||
        transactionData.amount_pi === null
      ) {
        throw new Error("amount_pi est requis pour une transaction");
      }

      if (!transactionData.user_id) {
        throw new Error("user_id est requis pour une transaction");
      }

      const safeTransactionData = {
        user_id: transactionData.user_id,
        event_id: transactionData.event_id || null,
        transaction_type: transactionData.transaction_type || "unknown",
        amount_pi: Number(transactionData.amount_pi) || 0,
        amount_fcfa:
          transactionData.amount_fcfa !== undefined
            ? Number(transactionData.amount_fcfa)
            : Math.abs(Number(transactionData.amount_pi)) * 5,
        description: transactionData.description || "",
        status: transactionData.status || "completed",
        payment_gateway_data: transactionData.payment_gateway_data || null,
        created_at: transactionData.created_at || new Date().toISOString(),
        completed_at: transactionData.completed_at || null,
        city: transactionData.city || null,
        region: transactionData.region || null,
        country: transactionData.country || null,
        metadata: transactionData.metadata || {},
        amount_coins:
          transactionData.amount_coins ||
          Math.abs(Number(transactionData.amount_pi)),
      };

      const { data, error } = await supabase
        .from("transactions")
        .insert(safeTransactionData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("TransactionService.createTransaction error:", error);
      throw error;
    }
  },

  async createVoteTransaction(
    userId,
    eventId,
    voteCost,
    candidateId,
    options = {},
  ) {
    const {
      voteType = "vote_purchase",
      platformFeePercent = 5,
      description = "Achat de vote",
    } = options;

    const platformFee = Math.ceil(voteCost * (platformFeePercent / 100));
    const netCost = voteCost - platformFee;

    return await this.createTransaction({
      user_id: userId,
      event_id: eventId,
      transaction_type: voteType,
      amount_pi: -voteCost,
      amount_fcfa: -voteCost * 5,
      description: `${description} - Candidat ID: ${candidateId}`,
      status: "completed",
      metadata: {
        platform_fee: platformFee,
        fee_percent: platformFeePercent,
        net_cost: netCost,
        candidate_id: candidateId,
        source: "vote",
        timestamp: new Date().toISOString(),
      },
    });
  },
};

// Composant pour les messages motivants
const MotivationalMessage = ({ type, rank, timeLeft }) => {
  const messages = {
    cart: [
      {
        icon: <Rocket className="w-5 h-5 text-orange-500" />,
        text: "🚀 Propulsez votre candidat vers la victoire ! Chaque voix compte !",
      },
      {
        icon: <Target className="w-5 h-5 text-red-500" />,
        text: "🎯 Objectif : Faire de votre candidat le numéro 1 ! Voter maintenant !",
      },
      {
        icon: <Flame className="w-5 h-5 text-yellow-500" />,
        text: "🔥 Le pouvoir est entre vos mains ! Multipliez les voix pour un impact maximal !",
      },
      {
        icon: <Zap className="w-5 h-5 text-purple-500" />,
        text: "⚡ Plus vous votez, plus votre candidat gagne en puissance !",
      },
      {
        icon: <Gift className="w-5 h-5 text-pink-500" />,
        text: "🎁 Offrez le cadeau de la victoire à votre candidat préféré !",
      },
    ],
    rankBased: [
      {
        rank: 1,
        icon: <Crown className="w-5 h-5 text-yellow-500" />,
        text: "👑 Votre candidat est en tête ! Consolidez sa position avec plus de votes !",
      },
      {
        rank: 2,
        icon: <Target className="w-5 h-5 text-blue-500" />,
        text: "🎯 À seulement quelques voix de la première place ! Chaque vote vous rapproche du sommet !",
      },
      {
        rank: 3,
        icon: <Medal className="w-5 h-5 text-amber-700" />,
        text: "🥉 Le podium est à portée de main ! Un effort supplémentaire et vous gravissez les marches !",
      },
      {
        rank: "top5",
        icon: <TrendingUp className="w-5 h-5 text-green-500" />,
        text: "📈 Vous êtes dans le top 5 ! Continuez sur cette lancée pour atteindre le podium !",
      },
      {
        rank: "other",
        icon: <Rocket className="w-5 h-5 text-gray-500" />,
        text: "💫 Tout est possible ! Une remontée spectaculaire commence par un premier vote !",
      },
    ],
    approachingEnd: [
      {
        days: 0,
        hours: 24,
        icon: <Flame className="w-5 h-5 text-red-500" />,
        text: "🔥 DERNIÈRE LIGNE DROITE ! 24h pour faire la différence !",
      },
      {
        days: 0,
        hours: 12,
        icon: <Zap className="w-5 h-5 text-yellow-500" />,
        text: "⚡ 12h restantes ! C'est le moment de frapper fort !",
      },
      {
        days: 0,
        hours: 6,
        icon: <PartyPopper className="w-5 h-5 text-purple-500" />,
        text: "🎉 Sprint final ! Chaque seconde compte pour la victoire !",
      },
      {
        days: 0,
        hours: 1,
        icon: <Rocket className="w-5 h-5 text-orange-500" />,
        text: "🚀 ULTIME CHARGE ! 60 minutes pour changer le cours de l'histoire !",
      },
    ],
  };

  let selectedMessage;

  if (type === "cart") {
    selectedMessage =
      messages.cart[Math.floor(Math.random() * messages.cart.length)];
  } else if (type === "rank") {
    if (rank === 1)
      selectedMessage = messages.rankBased.find((m) => m.rank === 1);
    else if (rank === 2)
      selectedMessage = messages.rankBased.find((m) => m.rank === 2);
    else if (rank === 3)
      selectedMessage = messages.rankBased.find((m) => m.rank === 3);
    else if (rank <= 5)
      selectedMessage = messages.rankBased.find((m) => m.rank === "top5");
    else selectedMessage = messages.rankBased.find((m) => m.rank === "other");
  } else if (type === "deadline") {
    if (timeLeft) {
      if (timeLeft.days === 0 && timeLeft.hours <= 1)
        selectedMessage = messages.approachingEnd.find((m) => m.hours === 1);
      else if (timeLeft.days === 0 && timeLeft.hours <= 6)
        selectedMessage = messages.approachingEnd.find((m) => m.hours === 6);
      else if (timeLeft.days === 0 && timeLeft.hours <= 12)
        selectedMessage = messages.approachingEnd.find((m) => m.hours === 12);
      else if (timeLeft.days === 0 && timeLeft.hours <= 24)
        selectedMessage = messages.approachingEnd.find((m) => m.hours === 24);
    }
  }

  if (!selectedMessage) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`bg-gradient-to-r ${getGradientByType(type, rank)} p-3 rounded-lg mb-4 border border-opacity-30 flex items-center gap-2`}
    >
      <div className="flex-shrink-0">{selectedMessage.icon}</div>
      <p className="text-sm font-medium flex-1">{selectedMessage.text}</p>
    </motion.div>
  );
};

const getGradientByType = (type, rank) => {
  if (type === "cart")
    return "from-purple-900/30 to-pink-900/30 border-purple-500/30";
  if (type === "rank") {
    if (rank === 1)
      return "from-yellow-900/30 to-amber-900/30 border-yellow-500/30";
    if (rank === 2)
      return "from-gray-700/30 to-slate-900/30 border-gray-500/30";
    if (rank === 3)
      return "from-orange-900/30 to-red-900/30 border-orange-500/30";
    return "from-blue-900/30 to-indigo-900/30 border-blue-500/30";
  }
  if (type === "deadline")
    return "from-red-900/40 to-orange-900/40 border-red-500/40 animate-pulse";
  return "from-gray-800 to-gray-900 border-gray-700";
};

const CountdownTimer = ({ endDate, onTimerEnd }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    expired: false,
  });
  const [showUrgency, setShowUrgency] = useState(false);
  const timerEndCalledRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    timerEndCalledRef.current = false;

    const calculateTimeLeft = () => {
      if (!endDate) return;

      const now = new Date().getTime();
      const end = new Date(endDate).getTime();
      const distance = end - now;

      if (distance < 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          expired: true,
        });
        setShowUrgency(false);
        if (!timerEndCalledRef.current && onTimerEnd) {
          timerEndCalledRef.current = true;
          onTimerEnd();
        }
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, expired: false });
      setShowUrgency(days === 0 && hours <= 24);
    };

    calculateTimeLeft();
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(calculateTimeLeft, 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [endDate, onTimerEnd]);

  if (timeLeft.expired)
    return (
      <div className="text-center py-4 bg-gradient-to-r from-red-900/50 to-red-800/30 border border-red-700/50 rounded-xl">
        <p className="text-red-300 font-bold text-lg">
          🎉 Le vote est terminé !
        </p>
      </div>
    );

  return (
    <motion.div
      animate={
        showUrgency
          ? {
              scale: [1, 1.02, 1],
              transition: { repeat: Infinity, duration: 2 },
            }
          : {}
      }
      className={`text-center py-4 ${showUrgency ? "bg-gradient-to-r from-red-900/40 to-orange-900/40 border-red-700/50" : "bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border-blue-700/30"} border rounded-xl`}
    >
      <h3 className="font-bold text-lg mb-3 flex items-center justify-center gap-2">
        {showUrgency ? (
          <>
            <Flame className="w-5 h-5 text-red-400 animate-pulse" />
            <span className="text-red-300">DERNIÈRE LIGNE DROITE !</span>
            <Flame className="w-5 h-5 text-red-400 animate-pulse" />
          </>
        ) : (
          <>
            <Target className="w-5 h-5 text-blue-400" />
            <span className="text-blue-300">Temps restant</span>
          </>
        )}
      </h3>
      <div className="flex justify-center gap-2">
        {[
          { v: timeLeft.days, l: "J" },
          { v: timeLeft.hours, l: "H" },
          { v: timeLeft.minutes, l: "M" },
          { v: timeLeft.seconds, l: "S" },
        ].map((item, idx) => (
          <motion.div
            key={idx}
            animate={
              showUrgency && item.l === "H"
                ? {
                    scale: [1, 1.1, 1],
                    transition: { repeat: Infinity, duration: 1 },
                  }
                : {}
            }
            className={`bg-gradient-to-b ${showUrgency ? "from-red-600 to-orange-500" : "from-blue-600 to-cyan-500"} p-3 rounded-xl shadow-lg min-w-[60px]`}
          >
            <div className="text-2xl font-bold text-white">{item.v}</div>
            <div className="text-xs text-white/80">{item.l}</div>
          </motion.div>
        ))}
      </div>
      {showUrgency && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-red-300 mt-2 font-semibold"
        >
          ⚡ Plus que {timeLeft.hours}h
          {timeLeft.minutes > 0 ? ` ${timeLeft.minutes}min` : ""} pour faire la
          différence !
        </motion.p>
      )}
    </motion.div>
  );
};

const CandidateCard = ({
  candidate,
  totalVotes,
  votePrice,
  onVote,
  isFinished,
  isSelected,
  onSelect,
  event,
  rank,
  isClosed,
  allCandidates,
  isFreeVoting = false,
  maxVotesPerUser = 0,
  maxVotesPerPhone = 0,
  onFreeVote,
}) => {
  const [voteCount, setVoteCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showWalletInfo, setShowWalletInfo] = useState(false);
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    onConfirm: null,
  });
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [candidateVoteCount, setCandidateVoteCount] = useState(
    candidate.vote_count || 0,
  );
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  const votePercentage =
    totalVotes > 0 ? ((candidateVoteCount || 0) / totalVotes) * 100 : 0;
  const totalCostPi = voteCount * votePrice;
  const isVotingLocked = isFinished || isClosed;

  const [votePaymentMethod, setVotePaymentMethod] = useState("coins");
  const [showUSSDModal, setShowUSSDModal] = useState(false);
  const [ussdSuccess, setUssdSuccess] = useState(false);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  const { adminConfig } = useData();
  const coinRate = adminConfig?.coin_to_fcfa_rate || 10;

  const ussdFcfa = totalCostPi * coinRate;

  useEffect(() => {
    setCandidateVoteCount(candidate.vote_count || 0);
  }, [candidate.vote_count]);

  // 📞 Bonus anti-fraude : limite de voix par numéro de téléphone
  const getStoredPhone = () => localStorage.getItem("bp_guest_phone") || "";
  const storePhone = (p) => {
    const v = (p || "").trim();
    if (v) localStorage.setItem("bp_guest_phone", v);
    return v;
  };
  const getPhoneVoteUsed = async (phone) => {
    try {
      const { data } = await supabase.rpc("get_phone_vote_count", {
        p_event_id: event.id,
        p_phone: phone,
      });
      return Number(data || 0);
    } catch (e) {
      return null;
    }
  };
  const checkPhoneVoteLimit = async (phone, addingVotes) => {
    if (!phone || maxVotesPerPhone <= 0) return true;
    const used = await getPhoneVoteUsed(phone);
    if (used === null) return true;
    if (used + addingVotes > maxVotesPerPhone) {
      toast({
        title: "Limite atteinte",
        description: `Vous avez atteint la limite de ${maxVotesPerPhone} voix par téléphone pour ce concours.`,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };
  const confirmPhoneSave = () => {
    const phone = storePhone(phoneInput);
    if (!phone) {
      toast({
        title: "Numéro requis",
        description: "Veuillez saisir votre numéro de téléphone pour voter.",
        variant: "destructive",
      });
      return;
    }
    setPhoneDialogOpen(false);
  };

  const getRankInfo = () => {
    if (!allCandidates || allCandidates.length === 0)
      return { gapToNext: null };

    const sortedCandidates = [...allCandidates].sort(
      (a, b) => (b.vote_count || 0) - (a.vote_count || 0),
    );
    const index = sortedCandidates.findIndex((c) => c.id === candidate.id);

    if (index === -1) return { gapToNext: null };

    const gapToNext =
      index > 0
        ? (sortedCandidates[index - 1]?.vote_count || 0) -
          (candidateVoteCount || 0)
        : null;

    return { gapToNext };
  };

  const { gapToNext } = getRankInfo();

  const handleVote = async () => {
    if (isVotingLocked) {
      toast({
        title: "Votes fermés",
        description: isFinished
          ? "Les votes sont terminés."
          : "Les ventes sont actuellement fermées.",
        variant: "destructive",
      });
      return;
    }

    // 🎁 Vote GRATUIT (sans compte) : pas de débit, pas de USSD
    if (isFreeVoting) {
      setConfirmation({ isOpen: false, onConfirm: null });
      if (!user) {
        const storedPhone = getStoredPhone();
        if (!storedPhone) {
          setPhoneInput("");
          setPhoneDialogOpen(true);
          return;
        }
        const used = Number(
          localStorage.getItem(`bp_free_votes_${event.id}`) || 0,
        );
if (maxVotesPerUser > 0 && !(maxVotesPerPhone > 0 && storedPhone) && used + voteCount > maxVotesPerUser) {
          toast({
            title: "Limite atteinte",
            description: `Vous avez atteint la limite de ${maxVotesPerUser} voix pour ce concours.`,
            variant: "destructive",
          });
          return;
        }
        if (maxVotesPerPhone > 0) {
          const phoneUsed = await getPhoneVoteUsed(storedPhone);
          if (phoneUsed !== null && phoneUsed + voteCount > maxVotesPerPhone) {
            toast({
              title: "Limite atteinte",
              description: `Vous avez atteint la limite de ${maxVotesPerPhone} voix par téléphone pour ce concours.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
      setLoading(true);
      try {
        const result = await onFreeVote?.(
          candidate,
          voteCount,
          user ? "" : getStoredPhone(),
        );
        if (result && typeof result.newVoteCount === "number") {
          setCandidateVoteCount(result.newVoteCount);
        }
      } catch (error) {
        console.error("Free vote error:", error);
        toast({
          title: "❌ Erreur",
          description: error.message || "Impossible d'enregistrer le vote.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    setConfirmation({ isOpen: false, onConfirm: null });
    if (!user) {
      navigate("/auth");
      return;
    }

    // Paiement par USSD : ouvrir la modale au lieu de débiter les pièces
    if (votePaymentMethod === "ussd") {
      setUssdSuccess(false);
      setShowUSSDModal(true);
      return;
    }

    setLoading(true);
    try {
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("coin_balance")
        .eq("id", user.id)
        .single();

      if (userError) throw userError;

      if ((userData?.coin_balance || 0) < totalCostPi) {
        setShowWalletInfo(true);
        setLoading(false);
        return;
      }

      // 🔒 Limite par téléphone (anti-fraude) : vérifier AVANT de débiter
      let voterPhone = user?.user_metadata?.phone || user?.phone || "";
      if (!voterPhone) {
        const { data: phoneData } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();
        voterPhone = phoneData?.phone || "";
      }
      if (!voterPhone) {
        voterPhone = getStoredPhone();
      }
      const allowed = await checkPhoneVoteLimit(voterPhone, voteCount);
      if (!allowed) {
        setLoading(false);
        return;
      }

      const platformFeePercent = 0;
      const platformFee = 0;
      const netAmount = totalCostPi;

      const newBalance = (userData.coin_balance || 0) - totalCostPi;
      const { error: debitError } = await supabase
        .from("profiles")
        .update({ coin_balance: newBalance })
        .eq("id", user.id);

      if (debitError) throw debitError;

      await TransactionService.createVoteTransaction(
        user.id,
        event.id,
        totalCostPi,
        candidate.id,
        {
          description: `Vote pour ${candidate.name}`,
        },
      );

      const { data: existingVote, error: checkError } = await supabase
        .from("user_votes")
        .select("vote_count, vote_cost_pi, net_to_organizer, fees")
        .eq("user_id", user.id)
        .eq("candidate_id", candidate.id)
        .eq("event_id", event.id)
        .maybeSingle();

      const existingVoteCount = existingVote?.vote_count || 0;
      const existingCost = existingVote?.vote_cost_pi || 0;
      const existingNet = existingVote?.net_to_organizer || 0;
      const existingFees = existingVote?.fees || 0;

      const totalVoteCount = existingVoteCount + voteCount;
      const totalCost = existingCost + totalCostPi;
      const totalNetAmount = existingNet + netAmount;
      const totalFees = existingFees + platformFee;

      const { error: voteError } = await supabase.from("user_votes").upsert(
        {
          user_id: user.id,
          candidate_id: candidate.id,
          event_id: event.id,
          vote_count: totalVoteCount,
          vote_cost_pi: totalCost,
          vote_cost_fcfa: totalCost * coinRate,
          net_to_organizer: totalNetAmount,
          fees: totalFees,
          voter_phone: voterPhone || null,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: "event_id, candidate_id, user_id",
        },
      );

      if (voteError) throw voteError;

      const newVoteCount = candidateVoteCount + voteCount;
      setCandidateVoteCount(newVoteCount);

      const { error: updateError } = await supabase
        .from("candidates")
        .update({ vote_count: newVoteCount })
        .eq("id", candidate.id);

      if (updateError) throw updateError;

      const { data: eventData } = await supabase
        .from("events")
        .select("organizer_id, title")
        .eq("id", event.id)
        .single();

      if (eventData?.organizer_id) {
        const { data: organizerProfile } = await supabase
          .from("profiles")
          .select("available_earnings")
          .eq("id", eventData.organizer_id)
          .single();

        if (organizerProfile) {
          const newEarnings =
            (organizerProfile.available_earnings || 0) + netAmount;

          await supabase
            .from("profiles")
            .update({
              available_earnings: newEarnings,
            })
            .eq("id", eventData.organizer_id);
        }

        await supabase.from("organizer_earnings").insert({
          organizer_id: eventData.organizer_id,
          event_id: event.id,
          earnings_coins: netAmount,
          transaction_type: "vote",
          fee_percent: platformFeePercent,
          platform_fee: platformFee,
          status: "pending",
          created_at: new Date().toISOString(),
          description: `Gains de vote: ${candidate.name} - ${eventData.title} (${voteCount} voix)`,
        });
      }

      toast({
        title: "🎉 Vote enregistré !",
        description: `Vous avez ajouté ${voteCount} voix à ${candidate.name} (${totalCostPi} pièces = ${(totalCostPi * coinRate).toLocaleString("fr-FR")} FCFA). Total: ${totalVoteCount} voix.`,
        className: "bg-gradient-to-r from-green-600 to-emerald-600 text-white",
      });

      if (onVote) onVote();
    } catch (error) {
      console.error("Vote error:", error);
      toast({
        title: "❌ Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (e) => {
    e.stopPropagation();

    const eventName = event?.title || event?.name || "ce concours";
    const candidateName =
      candidate.name || candidate.full_name || candidate?.id || "ce candidat";
    const shareUrl = `${window.location.origin}/og/${candidate.id}`;

    let urgentMessage = "";
    if (rank === 1) {
      urgentMessage =
        "👑 Je suis 1er pour l'instant ! Mais l'écart est mince...";
    } else if (rank === 2) {
      const gapToFirst =
        allCandidates?.find((c) => c.vote_count > candidate.vote_count)
          ?.vote_count - candidate.vote_count || 0;
      urgentMessage = `🎯 À seulement ${gapToFirst} voix de la 1ère place ! Chaque vote peut faire basculer le résultat !`;
    } else if (rank === 3) {
      urgentMessage =
        "🥉 Je tiens le podium mais ça chauffe derrière ! J'ai besoin de vous !";
    } else {
      urgentMessage = `💪 Je suis ${rank}e/${allCandidates?.length || 0} et je compte sur vous pour remonter ! Rien n'est joué !`;
    }

    const votingCta = isFreeVoting ? "VOTEZ GRATUITEMENT" : "VOTER MAINTENANT";
    const priceLine = isFreeVoting
      ? "🆓 VOTE 100% GRATUIT - Aucun frais !"
      : `💰 1 voix = ${votePrice} pièce(s) = ${(votePrice * 10).toLocaleString("fr-FR")} FCFA`;
    const shareText = `🔥 URGENT - ${candidateName} a BESOIN DE VOUS dans ${eventName} !\n\n${urgentMessage}\n\n🚨 Chaque seconde compte ! ${votingCta} 👇\n${shareUrl}\n\n${priceLine}\n⚡ 1 VOIX = 1 CHANCE DE GAGNER !\n💪 FAITES LA DIFFÉRENCE !\n\n🙏 Merci pour votre soutien précieux !`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Votez pour ${candidateName} ! 🗳️`,
          text: shareText,
          url: shareUrl,
        });
        toast({
          title: "📢 Merci du partage !",
          description: `Vous venez d'offrir une chance à ${candidateName} de gagner plus de voix !`,
          className:
            "bg-gradient-to-r from-green-600 to-emerald-600 text-white",
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          navigator.clipboard.writeText(shareText + "\n\n" + shareUrl);
          toast({
            title: "📋 Lien copié !",
            description:
              "Collez-le dans vos stories ou messages pour soutenir votre candidat !",
            className:
              "bg-gradient-to-r from-blue-600 to-indigo-600 text-white",
          });
        }
      }
    } else {
      navigator.clipboard.writeText(shareText + "\n\n" + shareUrl);
      toast({
        title: "📋 Lien copié !",
        description:
          "Partagez-le maintenant sur WhatsApp, Facebook ou Instagram !",
        className: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white",
      });
    }
  };

  const confirmVoteUSSD = async (smsReference, proofDataUrl, phoneInput) => {
    const txnId = `ussd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const response = await fetch("/.netlify/functions/ussd-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "submit",
        type: "votes",
        smsReference,
        proofDataUrl: proofDataUrl || null,
        amountFcfa: ussdFcfa,
        phone: phoneInput || user?.user_metadata?.phone || user?.phone || "",
        transactionId: txnId,
        userId: user?.id,
        eventId: event?.id,
        contestId: null,
        organizerId: event?.organizer_id || null,
        candidateId: candidate.id,
        voteCount,
        votePricePi: votePrice || 1,
        attendeeName: user?.user_metadata?.full_name || user?.email || "Inconnu",
        userEmail: user?.email || null,
        isGuest: false,
      }),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = null;
    }
    if (!result && response.status === 404) {
      throw new Error(
        "Paiement USSD indisponible sur ce serveur. Utilisez http://localhost:8090 (netlify dev).",
      );
    }
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || `Erreur HTTP ${response.status}`);
    }
    setUssdSuccess(true);
    return true;
  };

  return (
    <>
      <motion.div
        id={`candidate-card-${candidate.id}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
        className={`bg-gradient-to-br from-gray-900 to-gray-800 border ${isSelected ? "border-emerald-500 ring-2 ring-emerald-500/50" : "border-gray-700"} rounded-2xl p-4 relative overflow-hidden group hover:border-emerald-500/50 transition-all cursor-pointer`}
        onClick={() => setShowDetails(true)}
      >
        {candidate.category && candidate.category !== "Général" && (
          <div className="absolute top-0 right-0 z-10">
            <Badge
              variant="secondary"
              className="bg-emerald-900/80 text-emerald-200 border-0 rounded-bl-xl rounded-tr-none text-[10px] px-2"
            >
              {candidate.category}
            </Badge>
          </div>
        )}

        {rank === 1 && (
          <div className="absolute -top-1 -left-1 z-10">
            <div className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-br-lg shadow-lg flex items-center">
              <Crown className="w-3 h-3 mr-1" /> LEADER
            </div>
          </div>
        )}

        {rank === 2 && (
          <div className="absolute -top-1 -left-1 z-10">
            <div className="bg-purple-700 text-white text-xs font-bold px-2 py-1 rounded-br-lg shadow-lg flex items-center">
              <Target className="w-3 h-3 mr-1" /> CHASSEUR
            </div>
          </div>
        )}

        {rank === 3 && (
          <div className="absolute -top-1 -left-1 z-10">
            <div className="bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded-br-lg shadow-lg flex items-center">
              <Medal className="w-3 h-3 mr-1" /> PODIUM
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 mb-3 mt-2">
          <div className="relative">
            <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-emerald-500/50 cursor-pointer shrink-0 shadow-lg group-hover:shadow-emerald-900/50 transition-all">
              <img
                src={candidate.photo_url || "/api/placeholder/64/64"}
                alt={candidate.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFullPhoto(true);
                }}
              />
            </div>
            {rank <= 3 && (
              <div
                className={`absolute -bottom-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 border-gray-900
                  ${rank === 1 ? "bg-yellow-500 text-black" : rank === 2 ? "bg-gray-400 text-gray-900" : "bg-orange-600 text-white"}`}
              >
                {rank}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start">
              <h4 className="font-bold text-white truncate pr-2 cursor-pointer hover:text-emerald-400 transition-colors">
                {candidate.name}
              </h4>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDetails(true);
                  }}
                >
                  <Eye className="w-4 h-4 text-gray-400" />
                </Button>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1 text-emerald-400">
                <span className="font-semibold">{candidateVoteCount} voix</span>
                <span>{votePercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(5, votePercentage)}%` }}
                  transition={{ duration: 0.5 }}
                  className={`h-1.5 rounded-full ${rank === 1 ? "bg-yellow-500" : "bg-emerald-500"}`}
                />
              </div>
            </div>
          </div>
        </div>

        {!isVotingLocked ? (
          !user && !isFreeVoting ? (
            <div className="space-y-3 p-3 bg-gradient-to-r from-blue-900/30 to-indigo-900/30 rounded-xl border border-blue-700/30 text-center">
              <UserCircle className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <p className="text-sm text-blue-300 font-medium">
                Connectez-vous pour voter !
              </p>
              <Button
                onClick={() => navigate("/auth")}
                variant="outline"
                size="sm"
                className="w-full border-blue-600 text-blue-400 hover:bg-blue-950/50"
              >
                Se connecter / S'inscrire
              </Button>
              <p className="text-[10px] text-gray-400 mt-2">
                1 vote = {votePrice} pièces (≈ {votePrice * coinRate} FCFA)
              </p>
            </div>
          ) : (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between bg-gray-800 p-1.5 rounded-lg border border-gray-700/50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:text-emerald-400"
                  onClick={() => setVoteCount((v) => Math.max(1, v - 1))}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="text-white font-bold font-mono text-lg min-w-[2ch] text-center">
                  {voteCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:text-emerald-400"
                  onClick={() => setVoteCount((v) => v + 1)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>

              <div className="grid grid-cols-12 gap-1.5 sm:gap-2">
                <Button
                  onClick={() => {
                    if (!user && !isFreeVoting) {
                      navigate("/auth");
                      toast({
                        title: "Connexion requise",
                        description: "Connectez-vous pour ajouter des votes",
                        variant: "destructive",
                      });
                      return;
                    }
                    onSelect(candidate, voteCount);
                    toast({
                      title: "✅ Ajouté au panier",
                      description: (
                        <div className="flex flex-col gap-1">
                          <span className="font-bold">
                            {voteCount} voix pour {candidate.name}
                          </span>
                          <span className="text-xs opacity-90">
                            👍 Vous pouvez ajouter d'autres candidats
                          </span>
                        </div>
                      ),
                      className:
                        "bg-gradient-to-r from-purple-600 to-indigo-600 text-white",
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="col-span-4 text-[11px] sm:text-xs bg-transparent border-gray-600 hover:bg-gray-800 hover:text-white px-1 py-1.5 group relative"
                  title="Ajouter au panier pour voter pour plusieurs candidats"
                >
                  <ShoppingCart className="w-3.5 h-3.5 sm:mr-1 group-hover:scale-110 transition-transform" />
                  <span className="ml-0.5 sm:ml-1">📦</span>
                  <span className="hidden sm:inline ml-1">Panier</span>
                </Button>

                <Button
                  onClick={handleShare}
                  variant="outline"
                  size="sm"
                  className="col-span-3 text-xs bg-transparent border-gray-600 hover:bg-gray-800 hover:text-white p-0 group relative"
                  title="Partager pour mobiliser vos amis"
                >
                  <Share2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  <span className="sr-only">Partager</span>
                </Button>

                <Button
                  onClick={() =>
                    setConfirmation({ isOpen: true, onConfirm: handleVote })
                  }
                  disabled={loading}
                  size="sm"
                  className={`col-span-5 text-[11px] sm:text-xs text-white border-0 shadow-lg relative overflow-hidden group/vote
                    ${
                      rank === 1
                        ? "bg-yellow-600 hover:bg-yellow-700 shadow-yellow-900/20"
                        : rank === 2
                          ? "bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-700 hover:to-gray-600 shadow-gray-900/20"
                          : rank === 3
                            ? "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 shadow-orange-900/20"
                            : "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-emerald-900/20"
                    }`}
                  title={`Voter ${voteCount} fois pour ${candidate.name}`}
                >
                  {loading ? (
                    <Loader2 className="animate-spin w-3 h-3" />
                  ) : isFreeVoting ? (
                    <>
                      <Gift className="w-3 h-3 mr-1 group-hover/vote:animate-pulse" />
                      <span className="font-bold mr-0.5">{voteCount}</span>
                      <span className="text-[9px] sm:text-[10px] opacity-90">
                        vote gratuit
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3 mr-1 group-hover/vote:animate-pulse" />
                      <span className="font-bold mr-0.5">{voteCount}</span>
                      <span className="text-[9px] sm:text-[10px] opacity-90">
                        voter ici
                      </span>
                      <span className="ml-1 text-[9px] opacity-75">
                        ({totalCostPi}⚡)
                      </span>
                    </>
                  )}
                </Button>
              </div>

              {!isVotingLocked && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 flex items-center justify-center gap-3 text-[11px] text-gray-400"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-purple-900/30 flex items-center justify-center">
                      <span className="text-purple-400 text-[10px] font-bold">
                        1
                      </span>
                    </div>
                    <span>Clique sur Panier</span>
                  </div>
                  <div className="w-4 h-[2px] bg-gray-700"></div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-purple-900/30 flex items-center justify-center">
                      <span className="text-purple-400 text-[10px] font-bold">
                        2
                      </span>
                    </div>
                    <span>📦 Tes candidats au choix</span>
                  </div>
                  <div className="w-4 h-[2px] bg-gray-700"></div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-purple-900/30 flex items-center justify-center">
                      <span className="text-purple-400 text-[10px] font-bold">
                        3
                      </span>
                    </div>
                    <span>💳 Ajoute+ et Payer</span>
                  </div>
                </motion.div>
              )}

              {rank === 2 && gapToNext && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="text-[11px] text-blue-400 mt-2 text-center font-bold bg-gradient-to-r from-blue-950/30 to-transparent py-2 px-3 rounded-xl border border-blue-800/40 shadow-lg"
                >
                  <span className="animate-pulse inline-block mr-1">⚡</span>
                  PLUS QUE {gapToNext} VOIX POUR DÉTRÔNER LE LEADER !
                  <span className="animate-pulse inline-block ml-1">⚡</span>
                </motion.p>
              )}

              {rank === 3 && gapToNext && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="text-[11px] text-orange-400 mt-2 text-center font-bold bg-gradient-to-r from-orange-950/30 to-transparent py-2 px-3 rounded-xl border border-orange-800/40 shadow-lg"
                >
                  <span className="animate-bounce inline-block mr-1">🎯</span>À
                  SEULEMENT {gapToNext} VOIX DE LA 2ÈME PLACE !
                  <span className="animate-bounce inline-block ml-1">🎯</span>
                </motion.p>
              )}

              {rank > 3 && rank <= 5 && gapToNext && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="text-[11px] text-green-400 mt-2 text-center font-bold bg-gradient-to-r from-green-950/30 to-transparent py-2 px-3 rounded-xl border border-green-800/40 shadow-lg"
                >
                  <span className="animate-pulse inline-block mr-1">🚀</span>
                  TOP 5 ! PLUS QUE {gapToNext} VOIX POUR LE PODIUM !
                  <span className="animate-pulse inline-block ml-1">🚀</span>
                </motion.p>
              )}

              {rank === 1 && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="text-[11px] text-yellow-400 mt-2 text-center font-bold bg-gradient-to-r from-yellow-950/30 to-transparent py-2 px-3 rounded-xl border border-yellow-800/40 shadow-lg"
                >
                  <span className="animate-pulse inline-block mr-1">👑</span>
                  GARDE TON TRÔNE !
                  <span className="animate-pulse inline-block ml-1">👑</span>
                </motion.p>
              )}
            </div>
          )
        ) : (
          <div className="bg-gray-800/50 p-2 rounded text-center border border-gray-700/50">
            <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3" />
              {isFinished
                ? "Votes terminés"
                : "Ventes fermées par l'organisateur"}
            </p>
            {isClosed && !isFinished && (
              <p className="text-[10px] text-amber-500 mt-1 italic">
                La période est active mais les votes sont temporairement
                suspendus.
              </p>
            )}
          </div>
        )}
      </motion.div>

      <AlertDialog open={showDetails} onOpenChange={setShowDetails}>
        <AlertDialogContent className="bg-gradient-to-b from-gray-900 to-gray-950 border-gray-700 max-w-md">
          <AlertDialogHeader>
            <div
              className="relative mx-auto mb-4 cursor-pointer group"
              onClick={() => setShowFullPhoto(true)}
            >
              <div className="w-40 h-40 rounded-full p-1 bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 shadow-xl shadow-emerald-500/20 overflow-hidden">
                <img
                  src={candidate.photo_url || "/api/placeholder/160/160"}
                  className="w-full h-full rounded-full object-cover border-4 border-gray-900 transition-transform group-hover:scale-110 duration-500"
                  alt={candidate.name}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full">
                <Search className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-gray-900 rounded-full p-1 border border-gray-700">
                <div
                  className={`${rank === 1 ? "bg-yellow-600" : rank === 2 ? "bg-gray-500" : rank === 3 ? "bg-orange-600" : "bg-emerald-600"} text-white text-xs font-bold px-3 py-1 rounded-full flex items-center`}
                >
                  <Trophy className="w-3 h-3 mr-1" /> #{rank}
                </div>
              </div>
            </div>

            <AlertDialogTitle className="text-2xl font-bold text-white text-center mb-1">
              {candidate.name}
            </AlertDialogTitle>

            {candidate.category && (
              <div className="flex justify-center mb-2">
                <Badge
                  variant="outline"
                  className="border-emerald-500 text-emerald-400 bg-emerald-950/30"
                >
                  {candidate.category}
                </Badge>
              </div>
            )}

            <AlertDialogDescription className="text-center space-y-4">
              <div className="text-gray-400 text-sm max-h-32 overflow-y-auto px-2">
                {candidate.description ||
                  "Aucune description disponible pour ce candidat."}
              </div>

              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                  <div className="text-emerald-400 font-bold text-xl">
                    {candidateVoteCount}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Votes
                  </div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                  <div
                    className={`font-bold text-xl ${rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" : rank === 3 ? "text-orange-400" : "text-blue-400"}`}
                  >
                    #{rank}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Rang
                  </div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                  <div className="text-purple-400 font-bold text-xl">
                    {votePercentage.toFixed(1)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Score
                  </div>
                </div>
              </div>

              {!isVotingLocked && (
                <div className="space-y-2">
                  {rank === 1 && (
                    <div className="p-4 bg-gradient-to-r from-yellow-900/20 to-amber-900/20 border border-yellow-800/30 rounded-xl">
                      <p className="text-yellow-200 font-medium flex items-center gap-2">
                        <Crown className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                        <span className="italic">
                          "Je suis en tête grâce à vous ! Continuons ensemble
                          jusqu'à la victoire ! 👑"
                        </span>
                      </p>
                    </div>
                  )}

                  {rank === 2 && gapToNext && (
                    <div className="p-4 bg-gradient-to-r from-gray-800 to-slate-800 border border-gray-700 rounded-xl">
                      <p className="text-gray-200 font-medium flex items-center gap-2">
                        <Target className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <span className="italic">
                          "Plus que {gapToNext} voix pour détrôner le leader !
                          Chaque vote compte ! 🎯"
                        </span>
                      </p>
                    </div>
                  )}

                  {rank === 3 && gapToNext && (
                    <div className="p-4 bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-800/30 rounded-xl">
                      <p className="text-orange-200 font-medium flex items-center gap-2">
                        <Medal className="w-5 h-5 text-orange-400 flex-shrink-0" />
                        <span className="italic">
                          "À {gapToNext} voix de la 2ème place ! Le podium n'est
                          pas une finalité ! 🥉"
                        </span>
                      </p>
                    </div>
                  )}

                  {rank > 3 && rank <= 5 && gapToNext && (
                    <div className="p-4 bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-800/30 rounded-xl">
                      <p className="text-blue-200 font-medium flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <span className="italic">
                          "Top 5 ! Plus que {gapToNext} voix pour rejoindre le
                          podium ! 🚀"
                        </span>
                      </p>
                    </div>
                  )}

                  {rank > 5 && (
                    <div className="p-4 bg-gradient-to-r from-emerald-900/20 to-teal-900/20 border border-emerald-800/30 rounded-xl">
                      <p className="text-emerald-200 font-medium flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <span className="italic">
                          "Votez pour moi et aidez-moi à remonter le classement
                          ! Rien n'est impossible ! 💫"
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {isVotingLocked && (
                <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
                  <p className="text-gray-300 font-medium">
                    {isFinished
                      ? "Le vote est terminé. Merci pour votre soutien !"
                      : "Les votes sont actuellement suspendus."}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              onClick={handleShare}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <Share2 className="w-4 h-4 mr-2" /> Partager
            </Button>
            <Button
              onClick={() => setShowFullPhoto(true)}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <Eye className="w-4 h-4 mr-2" /> Voir la photo
            </Button>
            <Button
              onClick={() => setShowDetails(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            >
              Fermer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showFullPhoto} onOpenChange={setShowFullPhoto}>
        <AlertDialogContent className="bg-black/95 border-gray-800 max-w-4xl p-0 overflow-hidden">
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setShowFullPhoto(false)}
            >
              <span className="sr-only">Fermer</span>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>

            <div className="max-h-[80vh] max-w-full overflow-auto">
              <img
                src={candidate.photo_url || "/api/placeholder/800/800"}
                alt={candidate.name}
                className="w-auto h-auto max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>

            <div className="absolute bottom-4 left-4 right-4 text-center">
              <p className="text-white text-lg font-bold bg-black/50 py-2 px-4 rounded-full inline-block">
                {candidate.name} - #{rank}
              </p>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <WalletInfoModal
        isOpen={showWalletInfo}
        onClose={() => setShowWalletInfo(false)}
        onProceed={() => {
          setShowWalletInfo(false);
          navigate("/packs");
        }}
      />

      <AlertDialog
        open={confirmation.isOpen}
        onOpenChange={(o) =>
          !o && setConfirmation({ isOpen: false, onConfirm: null })
        }
      >
        <AlertDialogContent className="bg-gray-900 text-white border-gray-700">
          {isFreeVoting ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer le vote gratuit</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  Voter {voteCount} fois gratuitement pour {candidate.name} ?
                  Aucun paiement ne sera demandé.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="text-xs text-emerald-400 text-center bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2 my-2">
                🎁 Vote GRATUIT — sans compte, sans paiement.
              </p>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmer le vote</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  Voter pour {candidate.name} ({voteCount} voix) pour{" "}
                  {totalCostPi} pièces (
                  {ussdFcfa.toLocaleString("fr-FR")} FCFA)?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex gap-2 my-2">
                <Button
                  variant={votePaymentMethod === "coins" ? "default" : "outline"}
                  onClick={() => setVotePaymentMethod("coins")}
                  className="flex-1"
                  size="sm"
                >
                  <Coins className="w-4 h-4 mr-1" /> Pièces
                </Button>
                <Button
                  variant={votePaymentMethod === "ussd" ? "default" : "outline"}
                  onClick={() => setVotePaymentMethod("ussd")}
                  className="flex-1"
                  size="sm"
                >
                  <Trophy className="w-4 h-4 mr-1" /> USSD
                </Button>
              </div>
              {votePaymentMethod === "coins" ? (
                <p className="text-xs text-gray-400 text-center">
                  {totalCostPi} pièces (≈ {ussdFcfa.toLocaleString("fr-FR")}{" "}
                  FCFA) seront retirées de votre solde.
                </p>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-gray-400">
                    {ussdFcfa.toLocaleString("fr-FR")} FCFA à payer par mobile
                    money. Vos voix seront ajoutées après validation.
                  </p>
                  <p className="mt-2 font-mono text-base sm:text-lg font-bold text-yellow-400 tracking-wider break-all select-all">
                    {buildUSSDCode(ussdFcfa)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Composez ce code sur votre téléphone, validez avec votre
                    code secret, puis confirmez.
                  </p>
                </div>
              )}
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="text-wite bg-gray-700 hover:bg-gray-600 border-0">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmation.onConfirm}
              className="bg-emerald-600 text-white"
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={phoneDialogOpen}
        onOpenChange={(o) => !o && setPhoneDialogOpen(false)}
      >
        <AlertDialogContent className="bg-gray-900 text-white border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle>
              📱 Votre numéro de téléphone
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Pour voter gratuitement et garantir un vote équitable, veuillez
              indiquer votre numéro de téléphone.{" "}
              {maxVotesPerPhone > 0
                ? `Un même numéro est limité à ${maxVotesPerPhone} voix pour ce concours.`
                : "Ces informations restent confidentielles."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="Ex : 07 08 43 21 00"
            type="tel"
            inputMode="tel"
            className="bg-gray-800 border-gray-700 text-white"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="text-white bg-gray-700 hover:bg-gray-600 border-0">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPhoneSave}
              className="bg-emerald-600 text-white"
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <USSDPaymentModal
        open={showUSSDModal}
        onClose={() => {
          setShowUSSDModal(false);
          if (ussdSuccess) {
            setUssdSuccess(false);
          } else {
            openBonplaninfosRelance(ussdFcfa);
          }
        }}
        amountFcfa={ussdFcfa}
        title="Paiement du vote par Mobile Money"
        subtitle="Payez par USSD puis confirmez avec la référence reçue par SMS. Vos voix seront ajoutées après validation par l'équipe."
        submitLabel="J'ai payé mes voix"
        requirePhone={true}
        initialPhone={user?.user_metadata?.phone || user?.phone || ""}
        onConfirm={confirmVoteUSSD}
      />
    </>
  );
};

// ============================================================
// 🎯 VOTING INTERFACE - VERSION CORRIGÉE
// ============================================================
const VotingInterface = ({ event, isUnlocked, onRefresh, isClosed }) => {
  const [candidates, setCandidates] = useState([]);
  const [settings, setSettings] = useState(null);
  const [isFreeVoting, setIsFreeVoting] = useState(false);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(0);
  const [maxVotesPerPhone, setMaxVotesPerPhone] = useState(0);
  const [freePhoneDialogOpen, setFreePhoneDialogOpen] = useState(false);
  const [freePhoneInput, setFreePhoneInput] = useState("");
  const { user } = useAuth();
  const [userPaidBalance, setUserPaidBalance] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [activeTab, setActiveTab] = useState("candidates");
  const [isVoteFinished, setIsVoteFinished] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [showConfetti, setShowConfetti] = useState(false);
  const navigate = useNavigate();

  // Paiement du panier : Pièces OU USSD (comme les billets / recharges)
  const [cartPaymentMethod, setCartPaymentMethod] = useState("coins");
  const [showCartUSSDModal, setShowCartUSSDModal] = useState(false);
  const [cartUssdAmount, setCartUssdAmount] = useState(0);
  const [cartUssdSuccess, setCartUssdSuccess] = useState(false);

  const { adminConfig } = useData();
  const coinRate = adminConfig?.coin_to_fcfa_rate || 10;

  const [selectedCategory, setSelectedCategory] = useState("Tous");
  const [availableCategories, setAvailableCategories] = useState(["Tous"]);
  const [rankingFilter, setRankingFilter] = useState("Tous");

  // 🔥 REFS POUR ÉVITER LES RENDER INFINIS
  const eventIdRef = useRef(event?.id);
  const isClosedRef = useRef(isClosed);
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const timerIntervalRef = useRef(null);
  const initialLoadDoneRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  // 🔥 METTRE À JOUR LES REFS
  useEffect(() => {
    eventIdRef.current = event?.id;
    isClosedRef.current = isClosed;
    onRefreshRef.current = onRefresh;
  }, [event?.id, isClosed, onRefresh]);

  // 🔥 CHARGEMENT DES CANDIDATS - AVEC VERROU
  const loadCandidates = useCallback(async () => {
    if (isLoadingRef.current) {
      console.log('⏳ Chargement déjà en cours, ignoré');
      return;
    }

    const currentEventId = eventIdRef.current;
    if (!currentEventId) {
      console.log('ℹ️ Pas d\'event ID');
      return;
    }
    
    isLoadingRef.current = true;
    setLoadingCandidates(true);
    
try {
      console.log('Chargement des candidats pour event:', currentEventId);
      
      let cData = null;
      let cError = null;
      try {
        cData = await dbService.getCandidates({ event_id: currentEventId });
      } catch (dbErr) {
        console.warn("dbService indisponible, fallback Supabase:", dbErr.message);
      }

      if (cData === null) {
        const res = await supabase
          .from("candidates")
          .select("*")
          .eq("event_id", currentEventId)
          .order("vote_count", { ascending: false });
        cData = res.data;
        cError = res.error;
      }

      if (cError) {
        console.error("❌ Erreur chargement candidats:", cError);
        if (isMountedRef.current) {
          setCandidates([]);
        }
        return;
      }

      if (isMountedRef.current) {
        if (cData && cData.length > 0) {
          console.log(`✅ ${cData.length} candidats chargés`);
          setCandidates(cData);
          const cats = [...new Set(cData.map((c) => c.category).filter(Boolean))];
          if (cats.length > 0) {
            setAvailableCategories(["Tous", ...cats.sort()]);
          }

          // 👁️ Arrivé via un lien partagé (?candidate=...) : descendre jusqu'au candidat
          const focusCand = new URLSearchParams(window.location.search).get(
            "candidate",
          );
          if (focusCand) {
            setTimeout(() => {
              document
                .getElementById(`candidate-card-${focusCand}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 450);
            try {
              history.replaceState({}, "", window.location.pathname);
            } catch (e) {
              /* ignore */
            }
          }
        } else {
          console.log('ℹ️ Aucun candidat trouvé');
          setCandidates([]);
          setAvailableCategories(["Tous"]);
        }
      }

    } catch (error) {
      console.error("❌ Erreur chargement candidats:", error);
      if (isMountedRef.current) {
        setCandidates([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingCandidates(false);
      }
      isLoadingRef.current = false;
    }
  }, []);

  // 🔥 CHARGEMENT DU STATUT - AVEC VÉRIFICATION
  const loadEventStatus = useCallback(async () => {
    const currentEventId = eventIdRef.current;
    if (!currentEventId) return;
    
    try {
      const { data: sData, error: sError } = await supabase
        .from("events")
        .select("event_end_at, is_sales_closed, price_pi, start_date")
        .eq("id", currentEventId)
        .maybeSingle();

      if (sError) {
        console.error("❌ Erreur chargement événement:", sError);
        return;
      }

      if (!sData) {
        console.log('ℹ️ Événement non trouvé');
        return;
      }

      // 🔥 Type de vote (gratuit ou payant) depuis event_settings
      let votingType = "paid";
      let maxPerUser = 0;
      let maxPerPhone = 0;
      let votingEnabled = true;
      try {
        const { data: esData } = await supabase
          .from("event_settings")
          .select("voting_type, voting_enabled, max_votes_per_user")
          .eq("event_id", currentEventId)
          .maybeSingle();
        if (esData) {
          votingType = esData.voting_type || "paid";
          votingEnabled = esData.voting_enabled !== false;
          maxPerUser = Number(esData.max_votes_per_user) || 0;
        }
        // Limite par téléphone : requête séparée (compatible AVANT migration)
        try {
          const { data: esPhone } = await supabase
            .from("event_settings")
            .select("max_votes_per_phone")
            .eq("event_id", currentEventId)
            .maybeSingle();
          maxPerPhone = Number(esPhone?.max_votes_per_phone) || 0;
        } catch (ePh) {
          maxPerPhone = 0;
        }
      } catch (e) {
        console.warn("⚠️ Erreur lecture event_settings:", e);
      }

      const isFree = votingType === "free" || Number(sData.price_pi) === 0;
      if (isMountedRef.current && isFreeVoting !== isFree) {
        setIsFreeVoting(isFree);
      }
      if (isMountedRef.current && maxVotesPerUser !== maxPerUser) {
        setMaxVotesPerUser(maxPerUser);
      }
      if (isMountedRef.current && maxVotesPerPhone !== maxPerPhone) {
        setMaxVotesPerPhone(maxPerPhone);
      }

      const now = new Date();
      const endDate = sData.event_end_at ? new Date(sData.event_end_at) : null;
      const isExpired = endDate ? now > endDate : false;
      const finalIsFinished = isExpired || isClosedRef.current;

      if (isMountedRef.current && isVoteFinished !== finalIsFinished) {
        setIsVoteFinished(finalIsFinished);
        if (finalIsFinished && timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }

      const votePrice = Number(sData.price_pi) || 0;

      const newSettings = {
        price_pi: votePrice,
        voting_type: votingType,
        voting_enabled: votingEnabled,
        max_votes_per_user: maxPerUser,
        max_votes_per_phone: maxPerPhone,
        is_free_voting: isFree,
        event_end_at: sData.event_end_at || new Date(Date.now() + 86400000).toISOString(),
        start_date: sData.start_date || new Date().toISOString(),
      };

      if (isMountedRef.current && JSON.stringify(settings) !== JSON.stringify(newSettings)) {
        setSettings(newSettings);
      }

    } catch (error) {
      console.error("❌ Erreur chargement statut événement:", error);
    }
  }, [isVoteFinished, settings, isFreeVoting, maxVotesPerUser]);

  // 🔥 CHARGEMENT DU SOLDE
  const loadUserBalance = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data: uData, error: uError } = await supabase
        .from("profiles")
        .select("coin_balance")
        .eq("id", user.id)
        .single();

      if (!uError && uData && isMountedRef.current) {
        setUserPaidBalance(uData.coin_balance || 0);
      }
    } catch (err) {
      console.warn("⚠️ Erreur récupération solde:", err);
    }
  }, [user]);

  // 🔥 USEEFFECT PRINCIPAL - UN SEUL CHARGEMENT
  useEffect(() => {
    isMountedRef.current = true;
    
    const loadAll = async () => {
      await loadCandidates();
      await loadEventStatus();
      if (user) {
        await loadUserBalance();
      }
      initialLoadDoneRef.current = true;
    };
    
    loadAll();

    return () => {
      isMountedRef.current = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, []);

  // 🔥 RECHARGER QUAND L'EVENT CHANGE
  useEffect(() => {
    if (event?.id && event.id !== eventIdRef.current) {
      eventIdRef.current = event.id;
      setIsVoteFinished(false);
      loadCandidates();
      loadEventStatus();
    }
  }, [event?.id, loadCandidates, loadEventStatus]);

  // 🔥 RECHARGER QUAND isClosed CHANGE
  useEffect(() => {
    isClosedRef.current = isClosed;
    loadEventStatus();
  }, [isClosed, loadEventStatus]);

  // ⏱️ TIMER - CORRIGÉ : NE S'ACTIVE QUE SI LE VOTE N'EST PAS TERMINÉ
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!settings?.event_end_at || isVoteFinished) {
      return;
    }

    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const end = new Date(settings.event_end_at).getTime();
      const distance = end - now;

      if (distance > 0) {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        if (!isVoteFinished) {
          setIsVoteFinished(true);
        }
      }
    };

    calculateTimeLeft();
    
    timerIntervalRef.current = setInterval(() => {
      const now = new Date();
      const endDate = new Date(settings.event_end_at);
      const isExpired = now.getTime() > endDate.getTime();

      if (isExpired && !isVoteFinished) {
        setIsVoteFinished(true);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (onRefreshRef.current) {
          onRefreshRef.current();
        }
      }

      if (!isVoteFinished) {
        calculateTimeLeft();
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [settings?.event_end_at, isVoteFinished]);

  // 🔥 FONCTION DE RAFRAÎCHISSEMENT MANUEL
  const refreshData = useCallback(() => {
    if (isLoadingRef.current) {
      console.log('⏳ Rafraîchissement déjà en cours, ignoré');
      return;
    }
    loadCandidates();
    loadEventStatus();
    if (user) {
      loadUserBalance();
    }
  }, [loadCandidates, loadEventStatus, loadUserBalance, user]);

  // 🎁 VOTES GRATUITS SANS COMPTE
  const getGuestId = () => {
    let gid = localStorage.getItem("bp_guest_id");
    if (!gid) {
      gid = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 12)}`;
      localStorage.setItem("bp_guest_id", gid);
    }
    return gid;
  };

  const getGuestVoteCount = () =>
    Number(localStorage.getItem(`bp_free_votes_${event?.id}`) || 0);

  const addGuestVoteCount = (n) => {
    const v = getGuestVoteCount() + n;
    localStorage.setItem(`bp_free_votes_${event?.id}`, String(v));
    return v;
  };

  const submitFreeVote = async (candidateId, voteCount, phone) => {
    const response = await fetch("/.netlify/functions/free-vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "vote",
        eventId: event?.id,
        candidateId,
        voteCount,
        phone: phone || null,
        userId: user?.id || null,
        guestId: user?.id ? null : getGuestId(),
      }),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = null;
    }
    if (!result && response.status === 404) {
      throw new Error(
        "Vote gratuit indisponible sur ce serveur. Utilisez http://localhost:8090 (netlify dev).",
      );
    }
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || `Erreur HTTP ${response.status}`);
    }
    return result;
  };

  const handleFreeVoteApi = async (candidate, voteCount, phone) => {
    if (!user) {
      const used = getGuestVoteCount();
      if (maxVotesPerUser > 0 && !(maxVotesPerPhone > 0 && phone) && used + voteCount > maxVotesPerUser) {
        throw new Error(
          `Limite de ${maxVotesPerUser} voix atteinte pour ce concours (appareil).`,
        );
      }
    }
    const result = await submitFreeVote(candidate.id, voteCount, phone);
    if (!user) {
      addGuestVoteCount(voteCount);
    }
    toast({
      title: "🎉 Vote gratuit ajouté !",
      description: `${voteCount} voix offerte(s) à ${candidate.name}.`,
      className: "bg-gradient-to-r from-emerald-600 to-green-600 text-white",
    });
    refreshData();
    if (onRefreshRef.current) onRefreshRef.current();
    return result;
  };

  const handleFreeCheckout = async () => {
    const totalVotes = cartItems.reduce((s, i) => s + i.quantity, 0);
    let guestPhone = "";
    if (!user) {
      guestPhone = localStorage.getItem("bp_guest_phone") || "";
      if (!guestPhone) {
        setFreePhoneInput("");
        setFreePhoneDialogOpen(true);
        return false;
      }
      const used = getGuestVoteCount();
      if (maxVotesPerUser > 0 && !(maxVotesPerPhone > 0 && guestPhone) && used + totalVotes > maxVotesPerUser) {
        toast({
          title: "Limite atteinte",
          description: `Vous avez atteint la limite de ${maxVotesPerUser} voix pour ce concours.`,
          variant: "destructive",
        });
        return false;
      }
      if (maxVotesPerPhone > 0) {
        try {
          const { data } = await supabase.rpc("get_phone_vote_count", {
            p_event_id: event?.id,
            p_phone: guestPhone,
          });
          const used = Number(data || 0);
          if (used + totalVotes > maxVotesPerPhone) {
            toast({
              title: "Limite atteinte",
              description: `Vous avez atteint la limite de ${maxVotesPerPhone} voix par téléphone pour ce concours.`,
              variant: "destructive",
            });
            return false;
          }
        } catch (e) {
          console.warn("Erreur vérification téléphone:", e);
        }
      }
    }
    for (const item of cartItems) {
      await submitFreeVote(item.candidate.id, item.quantity, guestPhone);
    }
    if (!user) {
      addGuestVoteCount(totalVotes);
    }
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);
    toast({
      title: "🎉 VICTOIRE !",
      description: `${totalVotes} voix offertes gratuitement à vos candidats favoris !`,
      className:
        "bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold",
    });
    setCartItems([]);
    refreshData();
    if (onRefreshRef.current) onRefreshRef.current();
    return true;
  };

  const handleCheckout = async () => {
    if (!user && !isFreeVoting) {
      navigate("/auth");
      toast({
        title: "Connexion requise",
        description:
          "Veuillez vous connecter pour valider votre panier et voter",
        variant: "destructive",
      });
      return;
    }

    const isLocked = isVoteFinished || isClosed;

    if (isLocked) {
      toast({
        title: "Action impossible",
        description: isVoteFinished
          ? "Les votes sont terminés."
          : "Les ventes sont actuellement fermées.",
        variant: "destructive",
      });
      return;
    }

    if (cartItems.length === 0) {
      toast({
        title: "Panier vide",
        description: "Veuillez ajouter des votes à votre panier.",
        variant: "destructive",
      });
      return;
    }

    // Paiement du panier par USSD : ouvrir la modale au lieu de débiter les pièces
    if (cartPaymentMethod === "ussd") {
      const totalCostPieces = cartItems.reduce(
        (sum, item) => sum + item.quantity * item.price,
        0,
      );
      setCartUssdAmount(totalCostPieces * coinRate);
      setCartUssdSuccess(false);
      setShowCartUSSDModal(true);
      return;
    }

    // 🎁 PANIER GRATUIT (sans compte) : pas de débit, votes directs
    if (isFreeVoting) {
      setIsProcessingCheckout(true);
      try {
        await handleFreeCheckout();
      } catch (e) {
        console.error("Free checkout error:", e);
        toast({
          title: "❌ Erreur",
          description: e.message || "Erreur lors de l'enregistrement des votes",
          variant: "destructive",
        });
      } finally {
        setIsProcessingCheckout(false);
      }
      return;
    }

    setIsProcessingCheckout(true);

    try {
      const totalCost = cartItems.reduce(
        (sum, item) => sum + item.quantity * item.price,
        0,
      );

      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("coin_balance")
        .eq("id", user.id)
        .single();

      if (userError) throw userError;

if ((userData?.coin_balance || 0) < totalCost) {
        const { dismiss } = toast({
          title: "Solde insuffisant",
          description: (
            <div className="space-y-2">
              <p className="text-sm">
                Il vous faut{" "}
                <span className="font-bold text-primary">
                  {totalCost} pièces (
                  {(totalCost * coinRate).toLocaleString("fr-FR")} FCFA)
                </span>
                .
                <br />
                Votre solde actuel est{" "}
                <span className="font-bold">
                  {userData?.coin_balance || 0} pièces (
                  {((userData?.coin_balance || 0) * coinRate).toLocaleString(
                    "fr-FR",
                  )}{" "}
                  FCFA)
                </span>
                .
              </p>
              <Button
                variant="default"
                className="w-full bg-primary text-white hover:bg-primary/90 mt-2"
                onClick={() => {
                  dismiss();
                  navigate("/packs");
                }}
              >
                Acheter des pièces
              </Button>
            </div>
          ),
        });
        setIsProcessingCheckout(false);
        return;
      }

      // 🔒 Limite par téléphone (anti-fraude) : vérifier AVANT de débiter
      let checkoutPhone = user?.user_metadata?.phone || user?.phone || "";
      if (!checkoutPhone) {
        const { data: checkoutPhoneData } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();
        checkoutPhone = checkoutPhoneData?.phone || "";
      }
      if (!checkoutPhone) {
        checkoutPhone = getStoredPhone();
      }
      if (checkoutPhone && maxVotesPerPhone > 0) {
        try {
          const totalCheckoutVotes = cartItems.reduce(
            (sum, item) => sum + (item.quantity || 1),
            0,
          );
          const { data } = await supabase.rpc("get_phone_vote_count", {
            p_event_id: event?.id,
            p_phone: checkoutPhone,
          });
          const alreadyVoted = Number(data || 0);
          if (alreadyVoted + totalCheckoutVotes > maxVotesPerPhone) {
            setIsProcessingCheckout(false);
            toast({
              title: "Limite atteinte",
              description: `Vous avez atteint la limite de ${maxVotesPerPhone} voix par téléphone pour ce concours.`,
              variant: "destructive",
            });
            return;
          }
        } catch (e) {
          console.warn("Erreur vérification téléphone:", e);
        }
      }

      const newBalance = (userData.coin_balance || 0) - totalCost;
      await supabase
        .from("profiles")
        .update({ coin_balance: newBalance })
        .eq("id", user.id);

      const errors = [];
      const platformFeePercent = 0;
      let spentCoins = 0;

      for (const item of cartItems) {
        try {
          const itemTotalCost = item.quantity * item.price;
          const platformFee = Math.ceil(
            itemTotalCost * (platformFeePercent / 100),
          );
          const netAmount = itemTotalCost;

          await TransactionService.createVoteTransaction(
            user.id,
            event.id,
            itemTotalCost,
            item.candidate.id,
            {
              description: `Vote pour ${item.candidate.name} (${item.quantity} voix)`,
            },
          );

          const { data: existingVote, error: checkError } = await supabase
            .from("user_votes")
            .select("vote_count, vote_cost_pi, net_to_organizer, fees")
            .eq("user_id", user.id)
            .eq("candidate_id", item.candidate.id)
            .eq("event_id", event.id)
            .maybeSingle();

          const existingVoteCount = existingVote?.vote_count || 0;
          const existingCost = existingVote?.vote_cost_pi || 0;
          const existingNet = existingVote?.net_to_organizer || 0;
          const existingFees = existingVote?.fees || 0;

          const totalVoteCount = existingVoteCount + item.quantity;
          const totalCostInc = existingCost + itemTotalCost;
          const totalNetAmount = existingNet + netAmount;
          const totalFees = existingFees + platformFee;

          const { error: voteError } = await supabase.from("user_votes").upsert(
            {
              user_id: user.id,
              candidate_id: item.candidate.id,
              event_id: event.id,
vote_count: totalVoteCount,
                vote_cost_pi: totalCostInc,
                vote_cost_fcfa: totalCostInc * coinRate,
                net_to_organizer: totalNetAmount,
                fees: totalFees,
                voter_phone: checkoutPhone || null,
                created_at: new Date().toISOString(),
            },
            {
              onConflict: "event_id, candidate_id, user_id",
            },
          );

if (voteError) {
        await supabase
          .from("profiles")
          .update({ coin_balance: userData.coin_balance })
          .eq("id", user.id);
        throw new Error(
          `Vote refusé (${voteError.message}). Vos ${totalCostPi} pièces ont été remboursées.`,
        );
      }

          const newVoteCount = (item.candidate.vote_count || 0) + item.quantity;

          const { error: cartCandidUpdErr } = await supabase
            .from("candidates")
            .update({ vote_count: newVoteCount })
            .eq("id", item.candidate.id);

          if (cartCandidUpdErr) throw cartCandidUpdErr;

          const { data: eventData } = await supabase
            .from("events")
            .select("organizer_id, title")
            .eq("id", event.id)
            .single();

          if (eventData?.organizer_id) {
            const { data: organizerProfile } = await supabase
              .from("profiles")
              .select("available_earnings")
              .eq("id", eventData.organizer_id)
              .single();

            if (organizerProfile) {
              const newEarnings =
                (organizerProfile.available_earnings || 0) + netAmount;

              await supabase
                .from("profiles")
                .update({
                  available_earnings: newEarnings,
                })
                .eq("id", eventData.organizer_id);
            }

            await supabase.from("organizer_earnings").insert({
              organizer_id: eventData.organizer_id,
              event_id: event.id,
              earnings_coins: netAmount,
              transaction_type: "vote",
              fee_percent: platformFeePercent,
              platform_fee: platformFee,
              status: "pending",
              created_at: new Date().toISOString(),
              description: `Gains de vote: ${item.candidate.name} - ${eventData.title} (${item.quantity} voix)`,
            });
          }

          spentCoins += itemTotalCost;
        } catch (itemError) {
          errors.push(
            `Erreur pour ${item.candidate.name}: ${itemError.message}`,
          );
        }
      }

      if (errors.length > 0) {
        const refund = Math.max(0, totalCost - spentCoins);
        if (refund > 0) {
          await supabase
            .from("profiles")
            .update({ coin_balance: (userData.coin_balance || 0) - spentCoins })
            .eq("id", user.id);
        }
        throw new Error(
          errors.join("\n") +
            (refund > 0
              ? `\n\n${refund} pièce(s) non consommée(s) vous ont été remboursées.`
              : ""),
        );
      }

      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);

      toast({
        title: "🎉 VICTOIRE !",
        description: `Tous les votes du panier ont été enregistrés avec succès (${totalCost} pièces = ${(totalCost * coinRate).toLocaleString("fr-FR")} FCFA)! Vous avez changé la donne !`,
        className:
          "bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold",
      });

      setCartItems([]);
      refreshData();
      if (onRefreshRef.current) onRefreshRef.current();
    } catch (e) {
      console.error("Checkout error:", e);
      toast({
        title: "❌ Erreur",
        description: e.message || "Erreur lors de l'enregistrement des votes",
        variant: "destructive",
      });
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // Confirmation du paiement USSD du panier (plusieurs candidats)
  const confirmCartUSSD = async (smsReference, proofDataUrl, phoneInput) => {
    const txnId = `ussd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const votes = cartItems.map((item) => ({
      candidateId: item.candidate.id,
      voteCount: item.quantity,
      votePricePi: item.price || settings?.price_pi || 1,
    }));
    const response = await fetch("/.netlify/functions/ussd-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        action: "submit",
        type: "votes",
        smsReference,
        proofDataUrl: proofDataUrl || null,
        amountFcfa: cartUssdAmount,
        phone: phoneInput || user?.user_metadata?.phone || user?.phone || "",
        transactionId: txnId,
        userId: user?.id,
        eventId: event?.id,
        contestId: null,
        organizerId: event?.organizer_id || null,
        votes,
        attendeeName: user?.user_metadata?.full_name || user?.email || "Inconnu",
        userEmail: user?.email || null,
        isGuest: false,
      }),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = null;
    }
    if (!result && response.status === 404) {
      throw new Error(
        "Paiement USSD indisponible sur ce serveur. Utilisez http://localhost:8090 (netlify dev).",
      );
    }
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || `Erreur HTTP ${response.status}`);
    }
    setCartUssdSuccess(true);
    setCartItems([]);
    refreshData();
    if (onRefreshRef.current) onRefreshRef.current();
    return true;
  };

  const totalVotes = candidates.reduce(
    (sum, c) => sum + (c.vote_count || 0),
    0,
  );

  const filteredCandidates = useMemo(() => {
    let result = candidates;

    if (selectedCategory !== "Tous") {
      result = result.filter((c) => c.category === selectedCategory);
    }

    if (searchTerm) {
      result = result.filter((c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    return result;
  }, [candidates, selectedCategory, searchTerm]);

  const sortedCandidates = useMemo(() => {
    return [...candidates].sort(
      (a, b) => (b.vote_count || 0) - (a.vote_count || 0),
    );
  }, [candidates]);

  const getRank = (id) => sortedCandidates.findIndex((c) => c.id === id) + 1;

  const rankedCandidatesFiltered = useMemo(() => {
    let result = candidates;
    if (rankingFilter !== "Tous") {
      result = result.filter((c) => c.category === rankingFilter);
    }
    return result.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
  }, [candidates, rankingFilter]);

  // Export du classement en PDF (ouvert dans le navigateur => compatible iOS/Android)
  const handleExportRanking = async (mode, options = {}) => {
    try {
      const done = await generateRankingPDF({
        title: event?.title || "Classement",
        subtitle: event?.event_start_at
          ? `Concours / Vote officiel - ${new Date(event.event_start_at).toLocaleDateString("fr-FR")}`
          : "Classement officiel",
        mode,
        candidates,
        filter: rankingFilter,
        totalVotes,
        topN: options.topN || 3,
      });
      if (done) {
        toast({
          title: "✅ PDF généré",
          description: "Le classement s'ouvre dans votre navigateur.",
          className: "bg-green-600 text-white",
        });
      }
    } catch (e) {
      console.error("❌ Export classement:", e);
      toast({
        title: "❌ Erreur",
        description: e.message || "Impossible de générer le PDF.",
        variant: "destructive",
      });
    }
  };

  if (!isUnlocked) return null;

  // 🔥 Si le vote est terminé, afficher le classement final avec les candidats cliquables
  if (isVoteFinished) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-amber-950/30 to-orange-950/30 border border-amber-800/50 rounded-2xl p-8 text-center">
          <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">🏁 Vote terminé !</h3>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Ce concours est maintenant clos. Voici le classement final.
          </p>
        </div>

        {candidates.length > 0 && (
          <Card className="bg-gray-800 border-gray-700 shadow-xl overflow-hidden">
            <CardHeader className="bg-gradient-to-b from-gray-800 to-gray-900 border-b border-gray-700 pb-6">
              <CardTitle className="text-white flex items-center gap-2 text-xl">
                <Trophy className="text-yellow-500 w-6 h-6" />
                Classement Final
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-700/50">
                {[...candidates]
                  .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
                  .map((c, i) => {
                    const rank = i + 1;
                    const total = candidates.reduce((sum, cand) => sum + (cand.vote_count || 0), 0);
                    const percentage = total > 0 ? ((c.vote_count || 0) / total * 100).toFixed(1) : 0;
                    
                    let rankBadge;
                    if (rank === 1)
                      rankBadge = (
                        <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-black w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/20">
                          <Crown className="w-5 h-5" />
                        </div>
                      );
                    else if (rank === 2)
                      rankBadge = (
                        <div className="bg-gray-300 text-gray-800 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-gray-400">
                          2
                        </div>
                      );
                    else if (rank === 3)
                      rankBadge = (
                        <div className="bg-orange-700 text-orange-100 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-orange-600">
                          3
                        </div>
                      );
                    else
                      rankBadge = (
                        <span className="text-gray-500 font-mono font-bold text-lg w-8 text-center">
                          #{rank}
                        </span>
                      );

                    return (
                      <FinalRankingItem
                        key={c.id}
                        candidate={c}
                        rank={rank}
                        rankBadge={rankBadge}
                        percentage={percentage}
                        totalVotes={total}
                      />
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // 🔥 RENDU NORMAL QUAND LE VOTE EST EN COURS
  return (
    <div className="mt-8 space-y-6 relative">
      {showConfetti && <Confetti recycle={false} numberOfPieces={200} />}

      {isProcessingCheckout && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 p-8 rounded-2xl shadow-2xl border border-emerald-500/30 flex flex-col items-center max-w-md mx-4"
          >
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Vote className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              Traitement en cours
            </h3>
            <p className="text-gray-400 text-center mb-4">
              Vos votes sont en cours de validation...
              <br />
              Préparez-vous à faire la différence !
            </p>
            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: ["0%", "100%"] }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Vote className="w-6 h-6 text-emerald-500" />
          Espace de Vote
        </h2>
        {user && !isFreeVoting && (
          <Badge
            variant="outline"
            className="text-amber-400 border-amber-400 bg-amber-950/20 px-3 py-1"
          >
            <Coins className="w-3 h-3 mr-2" />
            Solde: {userPaidBalance} pièces (
            {userPaidBalance * coinRate} FCFA)
          </Badge>
        )}
      </div>

      {isFreeVoting && (
        <div className="mt-3 flex items-start sm:items-center gap-2 px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-sm">
          <Gift className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
          <span>
            <strong>Concours GRATUIT</strong> — vous pouvez voter sans compte,
            directement sur les candidats. Aucun paiement requis.
          </span>
        </div>
      )}

      {loadingCandidates ? (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-gray-400">Chargement des candidats...</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-gray-700 border-dashed">
          <div className="bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-1">
            Aucun candidat
          </h3>
          <p className="text-gray-400">
            Aucun candidat n&apos;a encore été ajouté à ce vote.
          </p>
        </div>
      ) : (
        <>
          {settings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CountdownTimer
                endDate={settings.event_end_at}
                onTimerEnd={() => {
                  setIsVoteFinished(true);
                  refreshData();
                  if (onRefreshRef.current) onRefreshRef.current();
                }}
              />

              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">
                    Période de vote
                  </span>
                  <div className="flex gap-2">
                    {isVoteFinished ? (
                      <Badge className="bg-red-900/50 text-red-300 border-red-800">
                        Terminé
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-900/50 text-emerald-300 border-emerald-800">
                        En cours
                      </Badge>
                    )}
                    {isClosed && !isVoteFinished && (
                      <Badge className="bg-amber-900/50 text-amber-300 border-amber-800">
                        <Lock className="w-3 h-3 mr-1" /> Ventes fermées
                      </Badge>
                    )}
                  </div>
                </div>

                {!isVoteFinished &&
                  !isClosed &&
                  timeLeft.days === 0 &&
                  timeLeft.hours <= 24 && (
                    <MotivationalMessage type="deadline" timeLeft={timeLeft} />
                  )}

                <div className="space-y-1">
                  <div className="flex items-center text-sm text-gray-300">
                    <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                    <span className="w-16 text-gray-500">Début:</span>
                    <span>
                      {settings.start_date
                        ? new Date(settings.start_date).toLocaleDateString(
                            "fr-FR",
                          )
                        : "Immédiat"}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-300">
                    <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                    <span className="w-16 text-gray-500">Fin:</span>
                    <span className="text-white font-medium">
                      {new Date(settings.event_end_at).toLocaleDateString(
                        "fr-FR",
                      )}{" "}
                      à{" "}
                      {new Date(settings.event_end_at).toLocaleTimeString(
                        "fr-FR",
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </span>
                  </div>
                  {isFreeVoting ? (
                    <div className="flex items-center text-sm text-gray-300 mt-2">
                      <Gift className="w-4 h-4 mr-2 text-emerald-500" />
                      <span className="w-16 text-gray-500">Prix/vote:</span>
                      <span className="text-emerald-400 font-bold">
                        GRATUIT
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-gray-300 mt-2">
                      <Coins className="w-4 h-4 mr-2 text-amber-500" />
                      <span className="w-16 text-gray-500">Prix/vote:</span>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="text-amber-400 font-medium">
                          {settings?.price_pi || 1} pièces
                        </span>
                        <span className="text-gray-400 text-xs">
                          ≈ {((settings?.price_pi || 1) * coinRate).toLocaleString()}{" "}
                          FCFA
                        </span>
                      </div>
                    </div>
                  )}
                  {isClosed && !isVoteFinished && (
                    <div className="flex items-center text-sm text-amber-400 mt-2 p-2 bg-amber-900/20 rounded-lg border border-amber-800/30">
                      <Info className="w-4 h-4 mr-2 text-amber-500" />
                      <span className="text-xs">
                        Les votes sont temporairement désactivés par
                        l'organisateur
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="bg-gray-800 w-full border border-gray-700 grid grid-cols-2 p-1">
                  <TabsTrigger
                    value="candidates"
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400"
                  >
                    <UserCircle className="w-4 h-4 mr-2" /> Candidats
                  </TabsTrigger>
                  <TabsTrigger
                    value="ranking"
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400"
                  >
                    <BarChart3 className="w-4 h-4 mr-2" /> Classement
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="candidates" className="space-y-4">
                  <div className="flex flex-col gap-4 bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-4 h-4" />
                      <Input
                        placeholder="Rechercher un candidat..."
                        className="pl-9 bg-gray-900 border-gray-600 text-white placeholder:text-gray-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>

                    {availableCategories.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                        {availableCategories.map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            title={cat}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap max-w-[220px] truncate transition-all duration-200 border ${
                              selectedCategory === cat
                                ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/20"
                                : "bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700 hover:text-gray-200"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {filteredCandidates.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredCandidates.map((c) => (
                        <CandidateCard
                          key={c.id}
                          candidate={c}
                          totalVotes={totalVotes}
                          votePrice={settings?.price_pi || 1}
                          onVote={() => {
                            refreshData();
                            if (onRefreshRef.current) onRefreshRef.current();
                          }}
                          isFinished={isVoteFinished}
                          isSelected={cartItems.some(
                            (i) => i.candidate.id === c.id,
                          )}
                          onSelect={(cand, qty) => {
                            setCartItems((prev) => {
                              const existingIndex = prev.findIndex(
                                (i) => i.candidate.id === cand.id,
                              );
                              if (existingIndex >= 0) {
                                const updated = [...prev];
                                updated[existingIndex].quantity += qty;
                                return updated;
                              } else {
                                return [
                                  ...prev,
                                  {
                                    candidate: cand,
                                    quantity: qty,
                                    price: settings?.price_pi || 1,
                                  },
                                ];
                              }
                            });
                          }}
                          event={event}
                          rank={getRank(c.id)}
                          isClosed={isClosed}
                          isFreeVoting={isFreeVoting}
                          maxVotesPerUser={maxVotesPerUser}
                          maxVotesPerPhone={maxVotesPerPhone}
                          onFreeVote={handleFreeVoteApi}
                          allCandidates={candidates}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-gray-800/30 rounded-xl border border-gray-700 border-dashed">
                      <div className="bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Filter className="w-8 h-8 text-gray-500" />
                      </div>
                      <h3 className="text-lg font-medium text-white mb-1">
                        Aucun résultat
                      </h3>
                      <p className="text-gray-400">
                        Essayez de changer de catégorie ou de terme de
                        recherche.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ranking">
                  <Card className="bg-gray-800 border-gray-700 shadow-xl overflow-hidden">
                    <CardHeader className="bg-gradient-to-b from-gray-800 to-gray-900 border-b border-gray-700 pb-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <CardTitle className="text-white flex items-center gap-2 text-xl">
                          <Trophy className="text-yellow-500 w-6 h-6" />
                          Classement Officiel
                        </CardTitle>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="bg-emerald-600 border-0 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 w-full md:w-auto"
                            >
                              <Printer className="w-4 h-4 mr-2" />
                              Imprimer le classement
                              <ChevronDown className="w-4 h-4 ml-2" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-gray-800 border-gray-700 text-gray-200">
                            <DropdownMenuItem
                              className="hover:bg-gray-700 cursor-pointer focus:bg-gray-700 focus:text-white"
                              onClick={() => {
                                handleExportRanking("general");
                              }}
                            >
                              📊 Classement Général
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="hover:bg-gray-700 cursor-pointer focus:bg-gray-700 focus:text-white"
                              onClick={() => handleExportRanking("top_categories", { topN: 3 })}
                            >
                              🏆 Meilleurs par Catégorie — Top 3
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="hover:bg-gray-700 cursor-pointer focus:bg-gray-700 focus:text-white"
                              onClick={() => handleExportRanking("top_categories", { topN: 5 })}
                            >
                              🏆 Meilleurs par Catégorie — Top 5
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="hover:bg-gray-700 cursor-pointer focus:bg-gray-700 focus:text-white"
                              onClick={() => handleExportRanking("top_categories", { topN: 10 })}
                            >
                              🏆 Meilleurs par Catégorie — Top 10
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="hover:bg-gray-700 cursor-pointer focus:bg-gray-700 focus:text-white"
                              onClick={() => {
                                handleExportRanking("full_categories");
                              }}
                            >
                              📋 Classement Complet par Catégorie
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-6">
                        <div className="text-xs text-gray-400 uppercase font-semibold mb-2 ml-1">
                          Filtrer par catégorie
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {availableCategories.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setRankingFilter(cat)}
                              title={cat === "Tous" ? "Vue Globale" : cat}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap max-w-[200px] truncate transition-colors border ${
                                rankingFilter === cat
                                  ? "bg-emerald-600 text-white border-emerald-500"
                                  : "bg-gray-900/50 text-gray-400 border-gray-600 hover:border-gray-500 hover:text-gray-300"
                              }`}
                            >
                              {cat === "Tous" ? "Vue Globale" : cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-700/50">
                        {rankedCandidatesFiltered.length > 0 ? (
                          rankedCandidatesFiltered.map((c, i) => {
                            const rank = i + 1;
                            const total = candidates.reduce((sum, cand) => sum + (cand.vote_count || 0), 0);
                            const percentage = total > 0 ? ((c.vote_count || 0) / total * 100).toFixed(1) : 0;
                            const gapToNext =
                              i > 0
                                ? sortedCandidates[i - 1]?.vote_count -
                                  c.vote_count
                                : null;

                            let rankBadge;
                            if (rank === 1)
                              rankBadge = (
                                <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 text-black w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/20">
                                  <Crown className="w-5 h-5" />
                                </div>
                              );
                            else if (rank === 2)
                              rankBadge = (
                                <div className="bg-gray-300 text-gray-800 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-gray-400">
                                  2
                                </div>
                              );
                            else if (rank === 3)
                              rankBadge = (
                                <div className="bg-orange-700 text-orange-100 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-orange-600">
                                  3
                                </div>
                              );
                            else
                              rankBadge = (
                                <span className="text-gray-500 font-mono font-bold text-lg w-8 text-center">
                                  #{rank}
                                </span>
                              );

                            return (
                              <motion.div
                                key={c.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`flex items-center p-4 transition-colors ${rank <= 3 ? "bg-gray-800/80" : "hover:bg-gray-700/30"}`}
                              >
                                <div className="flex-shrink-0 mr-4 w-10 flex justify-center">
                                  {rankBadge}
                                </div>
                                <div className="flex-shrink-0 mr-4">
                                  <img
                                    src={
                                      c.photo_url || "/api/placeholder/40/40"
                                    }
                                    className={`w-10 h-10 rounded-full object-cover border ${rank === 1 ? "border-yellow-500" : "border-gray-600"}`}
                                    alt={c.name}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p
                                      className={`text-sm font-medium truncate ${rank === 1 ? "text-yellow-400" : "text-white"}`}
                                    >
                                      {c.name}
                                    </p>
                                    {rank === 1 && (
                                      <Award className="w-3 h-3 text-yellow-500" />
                                    )}
                                  </div>
                                  <div className="flex items-center mt-1 gap-2">
                                    <div className="flex-1 bg-gray-700 rounded-full h-1.5 max-w-[100px] overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${percentage}%` }}
                                        transition={{ duration: 0.5 }}
                                        className={`h-1.5 rounded-full ${rank === 1 ? "bg-yellow-500" : "bg-emerald-500"}`}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-400">
                                      {percentage}%
                                    </span>
                                    {c.category && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] border-gray-600 text-gray-500 h-4 px-1 ml-auto sm:ml-0 max-w-[140px] truncate"
                                        title={c.category}
                                      >
                                        {c.category}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right ml-2">
                                  <div
                                    className={`text-sm font-bold ${rank <= 3 ? "text-white" : "text-gray-300"}`}
                                  >
                                    {c.vote_count || 0}
                                  </div>
                                  <div className="text-[10px] text-gray-500 uppercase">
                                    voix
                                  </div>
                                  {gapToNext && gapToNext > 0 && rank <= 5 && (
                                    <div className="text-[8px] text-orange-400 mt-1 whitespace-nowrap">
                                      -{gapToNext} voix du #{rank - 1}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })
                        ) : (
                          <div className="p-12 text-center text-gray-500">
                            Aucun candidat trouvé pour ce filtre.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <div className="lg:col-span-1">
              <Card className="bg-gray-800 border-gray-700 sticky top-4">
                <CardHeader>
                  <CardTitle className="text-white text-lg flex items-center">
                    <ShoppingCart className="mr-2" /> Panier ({cartItems.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cartItems.length > 0 && !isClosed && !isVoteFinished && (
                    <MotivationalMessage type="cart" />
                  )}

                  {cartItems.length > 0 && !isClosed && !isVoteFinished ? (
                    <div className="space-y-3">
                      {cartItems.map((i, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="flex justify-between items-center text-sm bg-gray-900/50 p-2 rounded border border-gray-700"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-900 flex items-center justify-center text-emerald-400 text-xs font-bold">
                              {i.quantity}
                            </div>
                            <span className="text-gray-300 truncate max-w-[120px]">
                              {i.candidate.name}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 ml-auto text-gray-500 hover:text-red-400"
                              onClick={() => {
                                setCartItems((prev) =>
                                  prev.filter((_, index) => index !== idx),
                                );
                              }}
                            >
                              ×
                            </Button>
                          </div>
                          <span className="text-emerald-400 font-mono">
                            {isFreeVoting
                              ? "GRATUIT"
                              : `${i.quantity * i.price} pièces (${i.quantity * i.price * coinRate} FCFA)`}
                          </span>
                        </motion.div>
                      ))}
                      <Separator />
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-gray-400">Total</span>
                        {isFreeVoting ? (
                          <span className="text-xl font-bold text-emerald-400">
                            {cartItems.reduce((s, i) => s + i.quantity, 0)} votes
                            GRATUITS
                          </span>
                        ) : (
                          <span className="text-xl font-bold text-emerald-400">
                            {cartItems.reduce(
                              (s, i) => s + i.quantity * i.price,
                              0,
                            )}{" "}
                            pièces (
                            {cartItems.reduce(
                              (s, i) => s + i.quantity * i.price,
                              0,
                            ) * coinRate}{" "}
                            FCFA)
                          </span>
                        )}
                      </div>

                      {isFreeVoting ? (
                        <p className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2 mt-3 text-center">
                          🎁 Vote GRATUIT — aucun paiement demandé. Vos voix
                          seront comptabilisées immédiatement.
                        </p>
                      ) : (
                        <>
                          {/* Choix du mode de paiement du panier */}
                          <div className="flex gap-2 mt-3">
                        <Button
                          variant={
                            cartPaymentMethod === "coins"
                              ? "default"
                              : "outline"
                          }
                          onClick={() => setCartPaymentMethod("coins")}
                          size="sm"
                          className="flex-1"
                        >
                          <Coins className="w-4 h-4 mr-1" /> Pièces
                        </Button>
                        <Button
                          variant={
                            cartPaymentMethod === "ussd" ? "default" : "outline"
                          }
                          onClick={() => setCartPaymentMethod("ussd")}
                          size="sm"
                          className="flex-1"
                        >
                          <Trophy className="w-4 h-4 mr-1" /> USSD
                        </Button>
                      </div>
                      {cartPaymentMethod === "ussd" && (
                        <div className="text-center">
                          <p className="mt-2 text-[11px] text-gray-400">
                            {(
                              cartItems.reduce(
                                (s, i) => s + i.quantity * i.price,
                                0,
                              ) * coinRate
                            ).toLocaleString("fr-FR")}{" "}
                            FCFA à payer par mobile money
                          </p>
                          <p className="mt-1 font-mono text-sm sm:text-base font-bold text-yellow-400 tracking-wider break-all select-all">
                            {buildUSSDCode(
                              cartItems.reduce(
                                (s, i) => s + i.quantity * i.price,
                                0,
                              ) * coinRate,
                            )}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Composez ce code, validez, puis joignez la capture
                            d&apos;écran du dépôt.
                          </p>
                        </div>
                      )}
                        </>
                      )}

                      <Button
                        onClick={handleCheckout}
                        disabled={isProcessingCheckout}
                        className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3"
                      >
                        {isProcessingCheckout ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Traitement...
                          </>
                        ) : isFreeVoting ? (
                          "J'offre mes votes"
                        ) : (
                          "Confirmer le paiement"
                        )}
                      </Button>
                      <Button
                        onClick={() => setCartItems([])}
                        variant="ghost"
                        size="sm"
                        className="w-full text-gray-500 hover:text-red-400 h-auto py-1 text-xs"
                        disabled={isProcessingCheckout}
                      >
                        Vider le panier
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">
                        {isVoteFinished
                          ? "Les votes sont terminés"
                          : isClosed
                            ? "Les votes sont temporairement désactivés"
                            : "Votre panier est vide"}
                      </p>
                      {!isVoteFinished && !isClosed && (
                        <p className="text-xs text-emerald-500 mt-2">
                          Ajoutez des voix pour soutenir vos candidats !
                        </p>
                      )}
                      {isClosed && !isVoteFinished && (
                        <p className="text-xs text-amber-500 mt-2">
                          La période de vote est active mais les ventes sont
                          suspendues
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {!isVoteFinished &&
            !isClosed &&
            timeLeft.days === 0 &&
            timeLeft.hours <= 6 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mt-3 p-2 bg-gradient-to-r from-red-900/30 to-orange-900/30 border border-red-800/50 rounded-lg text-center"
              >
                <p className="text-xs text-red-300 flex items-center justify-center gap-1.5 font-medium">
                  <Flame className="w-4 h-4 text-red-400 animate-pulse" />
                  ⚡ DERNIÈRE LIGNE DROITE ⚡
                  <Flame className="w-4 h-4 text-red-400 animate-pulse" />
                </p>
                <p className="text-[11px] text-orange-200 mt-1">
                  Plus que {timeLeft.hours}h
                  {timeLeft.minutes > 0 ? ` ${timeLeft.minutes}min` : ""} pour
                  faire la différence !
                </p>
              </motion.div>
            )}
        </>
      )}

      {/* 🔥 MODAL USSD DU PANIER (plusieurs candidats) */}
      <USSDPaymentModal
        open={showCartUSSDModal}
        onClose={() => {
          setShowCartUSSDModal(false);
          if (cartUssdSuccess) {
            setCartUssdSuccess(false);
          } else {
            openBonplaninfosRelance(cartUssdAmount);
          }
        }}
        amountFcfa={cartUssdAmount}
        title="Paiement du panier par Mobile Money"
        subtitle="Payez par USSD puis confirmez avec la capture d'écran du dépôt. Vos voix seront ajoutées après validation par l'équipe."
        submitLabel="J'ai payé mes voix"
        requirePhone={true}
        initialPhone={user?.user_metadata?.phone || user?.phone || ""}
        onConfirm={confirmCartUSSD}
      />
    </div>
  );
};

// ============================================================
// 🔥 COMPOSANT FINAL RANKING ITEM - SÉPARÉ POUR ÉVITER LES HOOKS DANS LA BOUCLE
// ============================================================
const FinalRankingItem = ({ candidate, rank, rankBadge, percentage, totalVotes }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: (rank - 1) * 0.05 }}
        className={`flex items-center p-4 transition-colors cursor-pointer hover:bg-gray-700/50 ${
          rank <= 3 ? "bg-gray-800/80" : "hover:bg-gray-700/30"
        }`}
        onClick={() => setShowDetails(true)}
      >
        <div className="flex-shrink-0 mr-4 w-10 flex justify-center">
          {rankBadge}
        </div>
        <div className="flex-shrink-0 mr-4">
          <img
            src={candidate.photo_url || "/api/placeholder/40/40"}
            className={`w-10 h-10 rounded-full object-cover border ${
              rank === 1 ? "border-yellow-500" : "border-gray-600"
            }`}
            alt={candidate.name}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium truncate ${
              rank === 1 ? "text-yellow-400" : "text-white"
            }`}>
              {candidate.name}
            </p>
            {rank === 1 && <Award className="w-3 h-3 text-yellow-500" />}
            {candidate.category && candidate.category !== "Général" && (
              <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-500 h-4 px-1">
                {candidate.category}
              </Badge>
            )}
          </div>
          <div className="flex items-center mt-1 gap-2">
            <div className="flex-1 bg-gray-700 rounded-full h-1.5 max-w-[100px] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5 }}
                className={`h-1.5 rounded-full ${
                  rank === 1 ? "bg-yellow-500" : "bg-emerald-500"
                }`}
              />
            </div>
            <span className="text-xs text-gray-400">{percentage}%</span>
          </div>
        </div>
        <div className="text-right ml-2">
          <div className={`text-sm font-bold ${
            rank <= 3 ? "text-white" : "text-gray-300"
          }`}>
            {candidate.vote_count || 0}
          </div>
          <div className="text-[10px] text-gray-500 uppercase">voix</div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails(true);
            }}
          >
            <Eye className="w-3 h-3 mr-1" /> Détails
          </Button>
        </div>
      </motion.div>

      {/* 🔥 MODAL DES DÉTAILS DU CANDIDAT */}
      <AlertDialog open={showDetails} onOpenChange={setShowDetails}>
        <AlertDialogContent className="bg-gradient-to-b from-gray-900 to-gray-950 border-gray-700 max-w-md">
          <AlertDialogHeader>
            <div
              className="relative mx-auto mb-4 cursor-pointer group"
              onClick={() => setShowFullPhoto(true)}
            >
              <div className="w-40 h-40 rounded-full p-1 bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 shadow-xl shadow-emerald-500/20 overflow-hidden">
                <img
                  src={candidate.photo_url || "/api/placeholder/160/160"}
                  className="w-full h-full rounded-full object-cover border-4 border-gray-900 transition-transform group-hover:scale-110 duration-500"
                  alt={candidate.name}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full">
                <Search className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-gray-900 rounded-full p-1 border border-gray-700">
                <div
                  className={`${
                    rank === 1 ? "bg-yellow-600" : 
                    rank === 2 ? "bg-gray-500" : 
                    rank === 3 ? "bg-orange-600" : 
                    "bg-emerald-600"
                  } text-white text-xs font-bold px-3 py-1 rounded-full flex items-center`}
                >
                  <Trophy className="w-3 h-3 mr-1" /> #{rank}
                </div>
              </div>
            </div>

            <AlertDialogTitle className="text-2xl font-bold text-white text-center mb-1">
              {candidate.name}
            </AlertDialogTitle>

            {candidate.category && (
              <div className="flex justify-center mb-2">
                <Badge
                  variant="outline"
                  className="border-emerald-500 text-emerald-400 bg-emerald-950/30"
                >
                  {candidate.category}
                </Badge>
              </div>
            )}

            <AlertDialogDescription className="text-center space-y-4">
              <div className="text-gray-400 text-sm max-h-32 overflow-y-auto px-2">
                {candidate.description || "Aucune description disponible pour ce candidat."}
              </div>

              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                  <div className="text-emerald-400 font-bold text-xl">
                    {candidate.vote_count || 0}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Votes
                  </div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                  <div
                    className={`font-bold text-xl ${
                      rank === 1 ? "text-yellow-400" : 
                      rank === 2 ? "text-gray-300" : 
                      rank === 3 ? "text-orange-400" : 
                      "text-blue-400"
                    }`}
                  >
                    #{rank}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Rang
                  </div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                  <div className="text-purple-400 font-bold text-xl">
                    {percentage}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                    Score
                  </div>
                </div>
              </div>

              {/* Message personnalisé selon le rang */}
              {rank === 1 && (
                <div className="p-4 bg-gradient-to-r from-yellow-900/20 to-amber-900/20 border border-yellow-800/30 rounded-xl">
                  <p className="text-yellow-200 font-medium flex items-center gap-2">
                    <Crown className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                    <span className="italic">
                      "🏆 Vainqueur ! Félicitations pour cette victoire méritée ! 👑"
                    </span>
                  </p>
                </div>
              )}

              {rank === 2 && (
                <div className="p-4 bg-gradient-to-r from-gray-800 to-slate-800 border border-gray-700 rounded-xl">
                  <p className="text-gray-200 font-medium flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <span className="italic">
                      "🥈 Excellent parcours ! Vous étiez si proche de la première place ! 🎯"
                    </span>
                  </p>
                </div>
              )}

              {rank === 3 && (
                <div className="p-4 bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-800/30 rounded-xl">
                  <p className="text-orange-200 font-medium flex items-center gap-2">
                    <Medal className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <span className="italic">
                      "🥉 Bravo pour ce podium ! Un grand bravo pour cette performance ! 🎉"
                    </span>
                  </p>
                </div>
              )}

              {rank > 3 && rank <= 5 && (
                <div className="p-4 bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-800/30 rounded-xl">
                  <p className="text-blue-200 font-medium flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <span className="italic">
                      "Top 5 ! Une très belle performance ! Continuez comme ça ! 🚀"
                    </span>
                  </p>
                </div>
              )}

              {rank > 5 && (
                <div className="p-4 bg-gradient-to-r from-emerald-900/20 to-teal-900/20 border border-emerald-800/30 rounded-xl">
                  <p className="text-emerald-200 font-medium flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="italic">
                      "Merci pour votre participation ! Chaque voix compte pour l'aventure ! 💫"
                    </span>
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              onClick={() => setShowFullPhoto(true)}
              variant="outline"
              className="w-full border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <Eye className="w-4 h-4 mr-2" /> Voir la photo
            </Button>
            <Button
              onClick={() => setShowDetails(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            >
              Fermer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🔥 MODAL PHOTO PLEINE */}
      <AlertDialog open={showFullPhoto} onOpenChange={setShowFullPhoto}>
        <AlertDialogContent className="bg-black/95 border-gray-800 max-w-4xl p-0 overflow-hidden">
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
              onClick={() => setShowFullPhoto(false)}
            >
              <span className="sr-only">Fermer</span>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>

            <div className="max-h-[80vh] max-w-full overflow-auto">
              <img
                src={candidate.photo_url || "/api/placeholder/800/800"}
                alt={candidate.name}
                className="w-auto h-auto max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>

            <div className="absolute bottom-4 left-4 right-4 text-center">
              <p className="text-white text-lg font-bold bg-black/50 py-2 px-4 rounded-full inline-block">
                {candidate.name} - #{rank}
              </p>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* 🔥 DEMANDE DU NUMÉRO DE TÉLÉPHONE (panier gratuit sans compte) */}
      <AlertDialog
        open={freePhoneDialogOpen}
        onOpenChange={(o) => !o && setFreePhoneDialogOpen(false)}
      >
        <AlertDialogContent className="bg-gray-900 text-white border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle>📱 Votre numéro de téléphone</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Pour voter gratuitement et garantir un vote équitable, veuillez
              indiquer votre numéro de téléphone.{" "}
              {maxVotesPerPhone > 0
                ? `Un même numéro est limité à ${maxVotesPerPhone} voix pour ce concours.`
                : "Ces informations restent confidentielles."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={freePhoneInput}
            onChange={(e) => setFreePhoneInput(e.target.value)}
            placeholder="Ex : 07 08 43 21 00"
            type="tel"
            inputMode="tel"
            className="bg-gray-800 border-gray-700 text-white"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="text-white bg-gray-700 hover:bg-gray-600 border-0">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const phone = (freePhoneInput || "").trim();
                if (!phone) {
                  toast({
                    title: "Numéro requis",
                    description:
                      "Veuillez saisir votre numéro de téléphone pour voter.",
                    variant: "destructive",
                  });
                  return;
                }
                localStorage.setItem("bp_guest_phone", phone);
                setFreePhoneDialogOpen(false);
                handleCheckout();
              }}
              className="bg-emerald-600 text-white"
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default VotingInterface;