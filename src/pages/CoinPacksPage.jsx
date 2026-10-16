import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/customSupabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Zap,
  Star,
  Crown,
  Sparkles,
  Coins,
  Check,
  Calculator,
  Rocket,
  Target,
  Gift,
  Shield,
  Flame,
  TrendingUp,
  Tag,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import MultilingualSeoHead from "@/components/MultilingualSeoHead";
import {
  PurchaseService,
  CUSTOM_PURCHASE_MIN_FCFA,
  CUSTOM_PURCHASE_MAX_FCFA,
  COINS_PER_FCFA_DIVISOR,
} from "@/services/purchaseService";

// Configuration des packs avec liens MoneyFusion spécifiques
const CREDIT_PACKS = [
  {
    id: "pack_debutant",
    name: "Pack Débutant",
    amount: 500,
    coins: 50,
    bonus: 0,
    features: ["50 Crédits", "Idéal pour tester", "Validité illimitée"],
    icon: Coins,
    color: "text-yellow-400",
    actionTags: ["Démarrer", "Essentiel"],
    paymentLink: "https://my.moneyfusion.net/694df16698fe6dbde0fbf5c8",
  },
  {
    id: "pack_intermediaire",
    name: "Pack Standard",
    amount: 1000,
    coins: 100,
    bonus: 0,
    features: ["100 Crédits", "Participation simple", "Support standard"],
    icon: Zap,
    color: "text-blue-400",
    actionTags: ["Populaire", "Sans risque"],
    paymentLink: "https://my.moneyfusion.net/694df3b298fe6dbde0fbf9b5",
  },
  {
    id: "pack_standard",
    name: "Pack Start ",
    amount: 5000,
    coins: 500,
    bonus: 0,
    features: ["500 Crédits", "Création d'événements", "Boost léger"],
    icon: Star,
    color: "text-indigo-400",
    actionTags: ["Recommandé"],
    badge: "🔥 Choix intelligent",
    paymentLink: "https://my.moneyfusion.net/694df44f98fe6dbde0fbfaa8",
  },
  {
    id: "pack_premium",
    name: "Pack Premium",
    amount: 10000,
    coins: 1000,
    bonus: 5,   // 5% de bonus
    features: [
      "1000 Crédits",
      "5% Crédits Bonus",
      "Visibilité accrue",
      "Support prioritaire",
    ],
    icon: Sparkles,
    color: "text-purple-400",
    actionTags: ["Boost +5%", "Prioritaire"],
    badge: "🚀 Le plus acheté",
    paymentLink: "https://my.moneyfusion.net/694df92d98fe6dbde0fbff97",
  },
  {
    id: "pack_vip",
    name: "Pack VIP",
    amount: 25000,
    coins: 2500,
    bonus: 10,  // 10% de bonus
    features: [
      "2500 Crédits",
      "10% Crédits Bonus",
      "Statut VIP",
      "Support dédié",
    ],
    icon: Crown,
    color: "text-red-400",
    actionTags: ["Exclusif", "+10%"],
    badge: "👑 Élite",
    paymentLink: "https://my.moneyfusion.net/694df7e598fe6dbde0fbfe80",
  },
  {
    id: "pack_king",
    name: "Pack King",
    amount: 50000,
    coins: 5000,
    bonus: 10,  // 10% de bonus
    features: [
      "5000 Crédits",
      "10% Crédits Bonus",
      "Boost Maximum",
      "Partenariat exclusif",
    ],
    icon: Crown,
    color: "text-orange-400",
    actionTags: ["Maximum", "+10%"],
    badge: "🏆 Ultime",
    paymentLink: "https://my.moneyfusion.net/694df57e98fe6dbde0fbfc78",
  },
];

const CUSTOM_PAYMENT_LINK =
  "https://my.moneyfusion.net/694dfabb98fe6dbde0fc014f";

const CreditPacksPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customAmount, setCustomAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  useEffect(() => {
    const savedCoupon = localStorage.getItem("appliedCoupon");
    if (savedCoupon) {
      try {
        const coupon = JSON.parse(savedCoupon);
        setAppliedCoupon(coupon);
        setCouponCode(coupon.code);
      } catch (e) {}
    }
  }, []);

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      toast({
        title: "Code vide",
        description: "Veuillez saisir un code.",
        variant: "destructive",
      });
      return;
    }
    setValidatingCoupon(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select(
          "code, user_id, active, usage_count, total_amount, commission_earned, profiles:user_id(email)",
        )
        .eq("code", couponCode.trim().toUpperCase())
        .single();

      if (error || !data) {
        throw new Error("Code invalide");
      }
      if (!data.active) {
        throw new Error("Ce code est désactivé");
      }

      const ownerEmail = data.profiles?.email || "Propriétaire";
      setAppliedCoupon({
        code: data.code,
        ownerEmail: ownerEmail,
        commissionRate: 2,
      });
      localStorage.setItem(
        "appliedCoupon",
        JSON.stringify({
          code: data.code,
          ownerEmail: ownerEmail,
          commissionRate: 2,
        }),
      );
      toast({
        title: "Coupon appliqué",
        description: `${data.code} est valide !`,
        variant: "default",
      });
    } catch (err) {
      toast({
        title: "Coupon invalide",
        description: err.message,
        variant: "destructive",
      });
      setAppliedCoupon(null);
      localStorage.removeItem("appliedCoupon");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    localStorage.removeItem("appliedCoupon");
    toast({
      title: "Coupon retiré",
      description: "Vous pouvez en appliquer un autre.",
      variant: "default",
    });
  };

  const initPayment = async (amountFcfa, coinsAmount, packId, paymentLink) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Veuillez vous connecter pour acheter des crédits.",
        variant: "warning",
      });
      navigate("/auth?redirect=/packs");
      return;
    }

    setIsProcessing(true);
    const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const { error } = await supabase.from("payments").insert({
        user_id: user.id,
        coins_amount: coinsAmount,
        amount_fcfa: amountFcfa,
        status: "pending",
        payment_method: "moneyfusion",
        transaction_id: txnId,
        pack_id: packId,
      });

      if (error)
        throw new Error("Erreur lors de l'enregistrement de la transaction.");

      // Stocker le txnId pour le retrouver après le retour de MoneyFusion
      localStorage.setItem("pendingPaymentTxnId", txnId);

      if (appliedCoupon) {
        localStorage.setItem("couponCodeForPayment", appliedCoupon.code);
      } else {
        localStorage.removeItem("couponCodeForPayment");
      }

      // URL de retour (MoneyFusion ne conserve que le token, mais on met quand même notre paramètre)
      const returnUrl = `${window.location.origin}/payment-success?transaction_id=${txnId}&amount=${amountFcfa}&status=success`;
      const cancelUrl = `${window.location.origin}/payment-cancel`;

      const params = new URLSearchParams({
        amount: amountFcfa.toString(),
        userId: user.id,
        packId: packId,
        action: "buy_credits",
        email: user.email || "",
        phone: user.phone || "",
        return_url: returnUrl,
        cancel_url: cancelUrl,
        // MoneyFusion ignore peut-être ces paramètres, mais on les envoie quand même
        order_id: txnId,
        custom: txnId,
      });

      const finalRedirectLink = `${paymentLink}?${params.toString()}`;
      console.info(`[Payment] Redirection vers MoneyFusion avec txnId: ${txnId}`);
      window.location.href = finalRedirectLink;
    } catch (err) {
      console.error("Payment init error:", err);
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      setIsProcessing(false);
    }
  };

  const handlePurchase = (pack) => {
    const bonusCoins = pack.bonus
      ? Math.floor((pack.coins * pack.bonus) / 100)
      : 0;
    const totalCoins = pack.coins + bonusCoins;
    initPayment(pack.amount, totalCoins, pack.id, pack.paymentLink);
  };

  const handleCustomAmountPurchase = () => {
    const amount = parseInt(customAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Erreur",
        description: "Veuillez entrer un montant valide.",
        variant: "destructive",
      });
      return;
    }

    if (amount < CUSTOM_PURCHASE_MIN_FCFA) {
      toast({
        title: "Montant trop faible",
        description: `Le montant minimum pour un achat personnalisé est de ${CUSTOM_PURCHASE_MIN_FCFA.toLocaleString("fr-FR")} FCFA.`,
        variant: "destructive",
      });
      return;
    }

    if (amount > CUSTOM_PURCHASE_MAX_FCFA) {
      toast({
        title: "Montant trop élevé",
        description: `Le montant maximum pour un achat personnalisé est de ${CUSTOM_PURCHASE_MAX_FCFA.toLocaleString("fr-FR")} FCFA.`,
        variant: "destructive",
      });
      return;
    }

    let estimatedCoins = Math.floor(amount / COINS_PER_FCFA_DIVISOR);

    // Grille de bonus unique : celle de PurchaseService.calculateCustomBonus.
    // Avant, cette page appliquait 5% / 10% alors que le serveur appliquait des
    // tranches 1→8% : le même montant donnait deux nombres de pièces différents.
    const bonus = PurchaseService.calculateCustomBonus(amount);

    initPayment(amount, estimatedCoins + bonus, "custom", CUSTOM_PAYMENT_LINK);
  };

  // Aperçu de l'achat personnalisé : mêmes bornes et même grille que le serveur.
  const customAmountNumber = Math.max(0, Math.floor(Number(customAmount) || 0));
  const customBaseCoins = Math.floor(customAmountNumber / COINS_PER_FCFA_DIVISOR);
  const customBonusCoins = PurchaseService.calculateCustomBonus(customAmountNumber);
  const customTotalCoins = customBaseCoins + customBonusCoins;
  const customBonusPercent = customBaseCoins > 0 ? Math.round((customBonusCoins / customBaseCoins) * 100) : 0;

  return (
    <div className="min-h-screen bg-black py-12 px-4 text-gray-100">
      <style>{`
        .pack-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .pack-card:hover {
          transform: translateY(-5px) rotateX(2deg);
          box-shadow: 0 20px 30px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 215, 0, 0.3);
        }
        .pack-card::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.3), transparent);
          transition: height 0.3s ease;
          pointer-events: none;
        }
        .pack-card:hover::after {
          height: 100%;
        }
        .glow-yellow:hover { box-shadow: 0 0 15px 2px rgba(250, 204, 21, 0.6); }
        .glow-blue:hover { box-shadow: 0 0 15px 2px rgba(59, 130, 246, 0.6); }
        .glow-indigo:hover { box-shadow: 0 0 15px 2px rgba(99, 102, 241, 0.6); }
        .glow-purple:hover { box-shadow: 0 0 15px 2px rgba(168, 85, 247, 0.6); }
        .glow-red:hover { box-shadow: 0 0 15px 2px rgba(239, 68, 68, 0.6); }
        .glow-orange:hover { box-shadow: 0 0 15px 2px rgba(249, 115, 22, 0.6); }
        @keyframes gentleShake {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(0.5deg); }
          75% { transform: rotate(-0.5deg); }
          100% { transform: rotate(0deg); }
        }
        .pack-card {
          animation: gentleShake 3s infinite ease-in-out;
        }
        .pack-card:hover {
          animation: none;
        }
      `}</style>

      <MultilingualSeoHead
        pageData={{
          title: "Acheter des Crédits - BonPlanInfos",
          description:
            "Rechargez votre compte en crédits avec nos packs exclusifs.",
        }}
      />

      <div className="max-w-7xl mx-auto space-y-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-white">
            💳 Boutique de crédits BonPlanInfos
          </h1>

          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Rechargez votre compte en toute sécurité, choisissez un pack adapté
            à vos besoins et participez facilement aux événements sur la
            plateforme.
          </p>
          <div className="max-w-3xl mx-auto mt-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Paiement sécurisé
                  </span>
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Recharge instantanée
                  </span>
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Gift className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Bonus exclusifs
                  </span>
                </div>
              </div>
              <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Target className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-gray-300">
                    Crédits illimités
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="max-w-xl mx-auto">
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl border border-yellow-500/50 p-6 shadow-lg shadow-yellow-500/10 transition-all duration-300 animate-pulse-slow">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl animate-bounce">🎁</span>
              <h3 className="text-xl font-bold text-white">
                Code de réduction
              </h3>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Entrez un code (ex: FRIEND2024)"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  disabled={!!appliedCoupon}
                  className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                />
              </div>
              {!appliedCoupon ? (
                <Button
                  onClick={validateCoupon}
                  disabled={validatingCoupon || !couponCode.trim()}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                >
                  {validatingCoupon ? "Vérification..." : "Appliquer"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={removeCoupon}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  <X className="w-4 h-4 mr-2" /> Retirer
                </Button>
              )}
            </div>
            {appliedCoupon && (
              <div className="mt-4 p-3 bg-green-900/40 border border-green-500/50 rounded-lg text-sm">
                <p className="text-green-300 font-medium">
                  ✓ Code {appliedCoupon.code} appliqué
                </p>

                <p className="text-gray-300 text-xs mt-1">
                  👤 Propriétaire : {appliedCoupon.ownerEmail}
                  <br />
                  🎁 {appliedCoupon.commissionRate}% de commission sera
                  attribuée au propriétaire du coupon
                  <br />
                  💳 Choisissez votre pack pour procéder au dépôt dans votre
                  compte
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Packs Grid – 2 colonnes sur mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {CREDIT_PACKS.map((pack, index) => {
            const Icon = pack.icon;
            const bonusCoins = pack.bonus
              ? Math.floor((pack.coins * pack.bonus) / 100)
              : 0;
            const totalCoins = pack.coins + bonusCoins;

            // Déterminer la classe de glow en fonction de la couleur
            let glowClass = "";
            if (pack.color === "text-yellow-400") glowClass = "glow-yellow";
            else if (pack.color === "text-blue-400") glowClass = "glow-blue";
            else if (pack.color === "text-indigo-400")
              glowClass = "glow-indigo";
            else if (pack.color === "text-purple-400")
              glowClass = "glow-purple";
            else if (pack.color === "text-red-400") glowClass = "glow-red";
            else if (pack.color === "text-orange-400")
              glowClass = "glow-orange";

            return (
              <motion.div
                key={pack.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative group bg-gray-900 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden border border-gray-800 flex flex-col pack-card ${glowClass}`}
              >
                {/* ActionTags – en haut à gauche avec animation */}
                <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                  {pack.actionTags?.map((tag, idx) => (
                    <motion.span
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1, duration: 0.3 }}
                      whileHover={{ scale: 1.05 }}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-yellow-500 text-black shadow-md cursor-default"
                    >
                      {tag}
                    </motion.span>
                  ))}
                </div>

                {/* Badge – marges réduites sur mobile */}
                {pack.badge && (
                  <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] sm:text-xs font-bold px-2 sm:px-4 py-1 rounded-bl-lg sm:rounded-bl-xl shadow-lg">
                    {pack.badge}
                  </div>
                )}

                <div className="p-8 text-center border-b border-gray-800 bg-gray-950 flex-grow pt-12 sm:pt-8">
                  <div
                    className={`w-20 h-20 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300 ${pack.color}`}
                  >
                    <Icon className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">
                    {pack.name}
                  </h3>
                  <div className="flex items-baseline justify-center mb-2">
                    <span className="text-2xl sm:text-5xl font-extrabold text-white">
                      {pack.amount.toLocaleString()}
                    </span>
                    <span className="text-xs sm:text-lg font-medium text-gray-400 ml-1">
                      FCFA
                    </span>
                  </div>
                  <div className="inline-flex items-center bg-gray-800 border border-gray-700 text-yellow-300 px-3 py-1 rounded-full text-xs sm:text-sm font-bold mt-1">
                    <Coins className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    {totalCoins.toLocaleString()} Crédits
                  </div>
                </div>

                <div className="p-4 sm:p-6 bg-gray-900 flex flex-col justify-between flex-grow">
                  <ul className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                    {pack.features.map((feature, i) => (
                      <li
                        key={i}
                        className="flex items-start text-xs sm:text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        <Check className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {bonusCoins > 0 && (
                      <li className="flex items-start text-xs sm:text-sm font-bold text-green-400 bg-gray-800/50 p-2 rounded border border-green-500/20">
                        <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-green-400 mr-1 mt-0.5" />
                        <span>+{bonusCoins} Crédits Bonus</span>
                      </li>
                    )}
                  </ul>

                  <Button
                    disabled={isProcessing}
                    className={`w-full h-10 sm:h-12 text-sm sm:text-base font-bold shadow-lg transition-all duration-300 group relative overflow-hidden ${
                      pack.badge
                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                        : "bg-yellow-500 hover:bg-yellow-600 text-black"
                    }`}
                    onClick={() => handlePurchase(pack)}
                  >
                    <span className="relative z-10 flex items-center justify-center">
                      {isProcessing ? "Redirection..." : "Acheter maintenant"}
                      {!isProcessing && <Rocket className="ml-2 w-4 h-4" />}
                    </span>
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Custom Amount Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto"
        >
          <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-yellow-500"></div>

            <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
              <div className="flex-shrink-0 bg-gray-800 p-4 rounded-full border border-gray-700 shadow-lg">
                <Calculator className="w-10 h-10 text-yellow-400" />
              </div>

              <div className="flex-grow text-center md:text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <h3 className="text-xl font-bold text-white">
                    Montant Personnalisé
                  </h3>
                  <span className="ml-2 px-2 py-1 text-xs font-bold bg-yellow-500 text-black rounded-full">
                    Flexible
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-6">
                  Vous avez un budget spécifique ? Renseigner le montant
                  ci-dessous !
                </p>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="relative w-full">
                    <Input
                      type="number"
                      placeholder="Montant en FCFA"
                      value={customAmount}
                      min={CUSTOM_PURCHASE_MIN_FCFA}
                      max={CUSTOM_PURCHASE_MAX_FCFA}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="pr-16 bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-yellow-500 focus:ring-yellow-500/20 h-12 text-base"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                      FCFA
                    </span>
                  </div>

                  <Button
                    disabled={isProcessing}
                    className="w-full sm:w-auto h-12 bg-gray-800 border border-gray-700 text-white hover:border-yellow-500 hover:bg-gray-700 whitespace-nowrap font-medium shadow-lg"
                    onClick={handleCustomAmountPurchase}
                  >
                    <Target className="mr-2 w-4 h-4" />
                    {isProcessing ? "Patientez..." : "Payer personnalisé"}
                  </Button>
                </div>

                {customAmountNumber > 0 && (
                  <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-sm font-medium text-gray-300">
                      Vous recevrez environ{" "}
                      <span className="font-bold text-yellow-300">
                        {customTotalCoins.toLocaleString()}{" "}
                        Crédits
                      </span>
                      {customBonusCoins > 0 && (
                        <span className="text-green-400 ml-2">
                          + {customBonusPercent}% de bonus (+
                          {customBonusCoins.toLocaleString()} pièces)
                        </span>
                      )}
                    </p>
                    {customAmountNumber > 0 &&
                      (customAmountNumber < CUSTOM_PURCHASE_MIN_FCFA ||
                        customAmountNumber > CUSTOM_PURCHASE_MAX_FCFA) && (
                        <p className="text-xs text-amber-400 mt-2">
                          Achat personnalisé possible entre{" "}
                          {CUSTOM_PURCHASE_MIN_FCFA.toLocaleString("fr-FR")} et{" "}
                          {CUSTOM_PURCHASE_MAX_FCFA.toLocaleString("fr-FR")} FCFA.
                        </p>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-2xl bg-gray-900 border border-gray-800"
        >
          <div className="relative p-8 text-center">
            <div className="inline-flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-green-400" />
              <h3 className="text-xl font-bold text-white">
                Pourquoi choisir nos packs ?
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <div className="space-y-2">
                <div className="text-yellow-400 font-bold">
                  📈 Participer à tous les événements
                </div>
                <p className="text-sm text-gray-400">
                  Après votre dépôt, vous pouvez participer à tous les
                  événements disponibles sur la plateforme
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-yellow-400 font-bold">
                  ⚡ Crédits immédiats
                </div>
                <p className="text-sm text-gray-400">
                  Rechargez et utilisez vos crédits sans délai
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-yellow-400 font-bold">
                  🎁 Bonus exclusifs
                </div>
                <p className="text-sm text-gray-400">
                  Plus vous achetez, plus vous économisez
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CreditPacksPage;