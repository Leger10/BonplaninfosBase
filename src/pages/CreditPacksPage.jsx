import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/customSupabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  X,
  Users,
  Shield,
  Clock,
  Wallet,
  Gift,
  Flame,
  TrendingUp,
  Smartphone,
  Lock,
  MessageCircle,
  Phone,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import MultilingualSeoHead from "@/components/MultilingualSeoHead";
import { CouponService } from "@/services/CouponService";
import USSDPaymentModal, { openBonplaninfosRelance } from "@/components/payment/USSDPaymentModal";

const CREDIT_PACKS = [
  {
    id: "pack_debutant",
    name: "Pack Débutant",
    amount: 500,
    coins: 50,
    features: ["50 Crédits", "Idéal pour tester", "Validité illimitée", "Sans engagement"],
    icon: Coins,
    color: "text-yellow-400",
    popular: false,
  },
  {
    id: "pack_intermediaire",
    name: "Pack Standard",
    amount: 1000,
    coins: 100,
    features: ["100 Crédits", "Participation simple", "Support standard", "Recharge rapide"],
    icon: Zap,
    color: "text-blue-400",
    popular: true,
  },
  {
    id: "pack_standard",
    name: "Pack Start",
    amount: 5000,
    coins: 500,
    features: ["500 Crédits", "Création d'événements", "Boost léger", "Support prioritaire"],
    icon: Star,
    color: "text-indigo-400",
    badge: "🔥 Choix intelligent",
    popular: true,
  },
  {
    id: "pack_premium",
    name: "Pack Premium",
    amount: 10000,
    coins: 1000,
    features: ["1000 Crédits", "Visibilité accrue", "Support prioritaire", "Badge exclusif"],
    icon: Sparkles,
    color: "text-purple-400",
    badge: "🚀 Le plus acheté",
    popular: true,
  },
  {
    id: "pack_vip",
    name: "Pack VIP",
    amount: 25000,
    coins: 2500,
    features: ["2500 Crédits", "Statut VIP", "Support dédié", "Accès anticipé"],
    icon: Crown,
    color: "text-red-400",
    badge: "👑 Élite",
    popular: false,
  },
  {
    id: "pack_king",
    name: "Pack King",
    amount: 50000,
    coins: 5000,
    features: ["5000 Crédits", "Boost Maximum", "Partenariat exclusif", "Compte prioritaire"],
    icon: Crown,
    color: "text-orange-400",
    badge: "🏆 Ultime",
    popular: false,
  },
];

const CreditPacksPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customAmount, setCustomAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [userPhone, setUserPhone] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [tempPhone, setTempPhone] = useState("");
  const [pendingPurchase, setPendingPurchase] = useState(null);
  const [totalRecharges, setTotalRecharges] = useState(0);
  const [recentRecharges, setRecentRecharges] = useState([]);
  const [showUSSDModal, setShowUSSDModal] = useState(false);
  const [ussdAmount, setUssdAmount] = useState(0);
  const [ussdCoins, setUssdCoins] = useState(0);
  const [ussdPack, setUssdPack] = useState(null);
  const [ussdSuccess, setUssdSuccess] = useState(false);

  // Récupération des statistiques
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { count } = await supabase
          .from("payments")
          .select("*", { count: "exact", head: true })
          .eq("status", "completed");

        setTotalRecharges(count || 0);

        const { data } = await supabase
          .from("payments")
          .select("amount_fcfa, created_at, user_id")
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(5);

        if (data) {
          const formatted = data.map(p => ({
            amount: p.amount_fcfa,
            time: new Date(p.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
          }));
          setRecentRecharges(formatted);
        }
      } catch (err) {
        console.error("Erreur stats:", err);
      }
    };

    fetchStats();
  }, []);

  // Récupération du téléphone utilisateur
  useEffect(() => {
    const fetchUserPhone = async () => {
      if (user?.id) {
        const { data, error } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();

        if (data && !error) {
          const phone = data.phone || "";
          setUserPhone(phone);
          setTempPhone(phone);
        }
      }
    };

    fetchUserPhone();
  }, [user?.id]);

  // Récupération du coupon sauvegardé
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
      const { valid, coupon, error } = await CouponService.validateCoupon(
        couponCode.trim().toUpperCase(),
      );

      if (!valid) throw new Error(error);

      const { data: ownerData } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", coupon.user_id)
        .maybeSingle();

      setAppliedCoupon({
        code: coupon.code,
        ownerEmail: ownerData?.email || "Propriétaire",
        ownerName: ownerData?.full_name || "Propriétaire",
        ownerId: coupon.user_id,
        commissionRate: 1,
      });

      localStorage.setItem(
        "appliedCoupon",
        JSON.stringify({
          code: coupon.code,
          ownerEmail: ownerData?.email || "Propriétaire",
          ownerName: ownerData?.full_name || "Propriétaire",
          ownerId: coupon.user_id,
          commissionRate: 1,
        }),
      );

      toast({
        title: "✅ Code appliqué !",
        description: `${coupon.code} est valide ! Votre parrain recevra 1% de commission.`,
        variant: "default",
        className: "bg-green-600 text-white",
      });
    } catch (err) {
      toast({
        title: "Code invalide",
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
      description: "Vous pouvez recharger sans code ou en appliquer un autre.",
      variant: "default",
    });
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

    setUserPhone(phone);
    return true;
  };

  const initPayment = async (amountFcfa, coinsAmount, packId) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Veuillez vous connecter pour acheter des crédits.",
        variant: "destructive",
      });
      navigate("/auth?redirect=/packs");
      return;
    }

    if (!userPhone || userPhone.trim() === "") {
      setPendingPurchase({ amountFcfa, coinsAmount, packId });
      setShowPhoneModal(true);
      return;
    }

    await startUSSDFlow(amountFcfa, coinsAmount, packId);
  };

const startUSSDFlow = async (amountFcfa, coinsAmount, packId) => {
    setUssdSuccess(false);
    setUssdAmount(amountFcfa);
    setUssdCoins(coinsAmount);
    setUssdPack(packId);
    setShowUSSDModal(true);
  };

  const confirmUSSD = async (proofDataUrl) => {
    const txnId = `ussd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const response = await fetch('/.netlify/functions/ussd-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          type: 'credits',
          proofDataUrl: proofDataUrl || null,
          amountFcfa: ussdAmount,
          phone: userPhone,
          transactionId: txnId,
          userId: user?.id,
          coinsAmount: ussdCoins,
          packId: ussdPack,
          couponCode: appliedCoupon?.code || null,
          userEmail: user?.email || null
        })
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('Le serveur a renvoyé une réponse invalide.');
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Erreur HTTP ${response.status}`);
      }

      toast({
        title: "✅ Compte crédité !",
        description: `+${result.coins_added || ussdCoins} crédits · ${result.message || 'Paiement en attente de validation'}`,
        className: "bg-green-600 text-white",
      });
      setUssdSuccess(true);
      return true;
    } catch (err) {
      console.error("❌ Erreur paiement USSD:", err);
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
      throw err;
    }
  };

  const handlePhoneSubmit = async () => {
    if (!tempPhone || tempPhone.trim() === "") {
      toast({
        title: "Numéro requis",
        description: "Veuillez entrer votre numéro de téléphone.",
        variant: "destructive",
      });
      return;
    }

    let cleanPhone = tempPhone.replace(/\D/g, "");

    if (cleanPhone.length > 12) {
      cleanPhone = cleanPhone.slice(-12);
    }

    if (cleanPhone.startsWith("226") && cleanPhone.length > 8) {
      cleanPhone = cleanPhone.substring(3);
    }

    if (cleanPhone.startsWith("0") && cleanPhone.length === 9) {
      cleanPhone = cleanPhone.substring(1);
    }

    if (cleanPhone.length < 8 || cleanPhone.length > 12) {
      toast({
        title: "Numéro invalide",
        description: "Veuillez entrer un numéro valide (8 à 12 chiffres). Ex: 73790978",
        variant: "destructive",
      });
      return;
    }

    const saved = await saveUserPhone(cleanPhone);
    if (saved && pendingPurchase) {
      setShowPhoneModal(false);
      await startUSSDFlow(
        pendingPurchase.amountFcfa,
        pendingPurchase.coinsAmount,
        pendingPurchase.packId,
      );
      setPendingPurchase(null);
    }
  };

  const handlePurchase = (pack) => {
    initPayment(pack.amount, pack.coins, pack.id);
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

    const estimatedCoins = Math.floor(amount / 10);
    initPayment(amount, estimatedCoins, "custom");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 py-12 px-4 text-gray-100">
      <MultilingualSeoHead
        pageData={{
          title: "Acheter des Crédits - Recharge BonPlanInfos",
          description: "Rechargez votre compte en crédits BonPlanInfos. Paiement sécurisé par Orange Money, Moov Money. Crédits immédiats.",
        }}
      />

      {/* Modal numéro de téléphone */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 rounded-2xl p-8 max-w-md w-full mx-4 border border-yellow-500/50 shadow-2xl"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-yellow-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                📱 Numéro de téléphone requis
              </h3>
              <p className="text-gray-400">
                Pour effectuer un paiement par USSD (mobile money), nous avons besoin de votre numéro.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Votre numéro WhatsApp / Mobile
              </label>
              <Input
                type="tel"
                placeholder="Ex: 73790978"
                value={tempPhone}
                onChange={(e) => setTempPhone(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white text-lg"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Format: 8 à 12 chiffres (sans espaces ni indicatif)
              </p>
              <p className="text-xs text-yellow-500 mt-1">
                🔒 Ce numéro est sécurisé et ne sera partagé qu'avec bonplaninfos pour le paiement.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowPhoneModal(false);
                  setPendingPurchase(null);
                }}
                variant="outline"
                className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Annuler
              </Button>
              <Button
                onClick={handlePhoneSubmit}
                className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold"
              >
                <Lock className="w-4 h-4 mr-2" />
                Paiement sécurisé
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header amélioré avec preuve sociale */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-6"
        >
          <div className="flex justify-center gap-2 flex-wrap">
            <Badge className="bg-green-600/20 text-green-400 border-green-500/30 px-3 py-1">
              <Flame className="w-3 h-3 mr-1" /> Populaire
            </Badge>
            <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30 px-3 py-1">
              <Zap className="w-3 h-3 mr-1" /> Ultra-rapide
            </Badge>
            <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 px-3 py-1">
              <Shield className="w-3 h-3 mr-1" /> 100% sécurisé
            </Badge>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            💳 Recharge de crédits
          </h1>
          
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Rechargez votre compte en <strong className="text-yellow-400">moins de 30 secondes</strong>.
            Crédits disponibles <strong className="text-green-400">immédiatement</strong>.
          </p>

          {/* Preuve sociale - Statistiques */}
          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2 bg-gray-800/50 px-4 py-2 rounded-full">
              <Users className="w-4 h-4 text-yellow-400" />
              <span><strong className="text-white">{totalRecharges || 1250}+</strong> recharges effectuées</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-800/50 px-4 py-2 rounded-full">
              <Shield className="w-4 h-4 text-green-400" />
              <span>Paiement sécurisé</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-800/50 px-4 py-2 rounded-full">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <span>Support 24/7</span>
            </div>
          </div>

          {/* Témoignage récent */}
          {recentRecharges.length > 0 && (
            <div className="max-w-md mx-auto mt-4 p-3 bg-gray-800/30 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 flex items-center justify-center gap-2">
                <TrendingUp className="w-3 h-3 text-green-400" />
                <span>⭐ Recharge de {recentRecharges[0]?.amount?.toLocaleString()} FCFA • Il y a quelques minutes</span>
              </p>
            </div>
          )}
        </motion.div>

        {/* Section code promo améliorée */}
        <div className="max-w-xl mx-auto">
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-xl border border-yellow-500/50 p-6">
            
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl animate-bounce">🎁</span>
              <h2 className="text-xl font-bold text-white">Code promo <span className="text-sm text-gray-400">(optionnel)</span></h2>
            </div>

            {/* Message rassurant */}
            <Alert className="mb-4 bg-blue-900/30 border-blue-500/30">
              <Smartphone className="w-4 h-4 text-blue-400" />
              <AlertDescription className="text-xs text-blue-300">
                💡 <strong>Vous n'avez pas de code ?</strong> Pas de souci ! Vous pouvez recharger directement sans code promo.
                Les codes sont optionnels et permettent seulement d'offrir une commission (1%) à votre parrain.
              </AlertDescription>
            </Alert>

            {/* Info commission */}
            {!appliedCoupon && (
              <div className="mb-4 p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <p className="text-xs text-center text-yellow-400 flex items-center justify-center gap-2">
                  <Gift className="w-3 h-3" />
                  💰 Avec un code promo, votre parrain reçoit <strong className="text-yellow-300">1% de commission</strong> sur votre recharge
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Entrez un code promo (optionnel)"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  disabled={!!appliedCoupon}
                  className="bg-gray-800 border-gray-700 text-white uppercase"
                />
              </div>

              {!appliedCoupon ? (
                <Button
                  onClick={validateCoupon}
                  disabled={validatingCoupon || !couponCode.trim()}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                >
                  {validatingCoupon ? "Vérification..." : "Appliquer le code"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={removeCoupon}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  <X className="w-4 h-4 mr-2" /> Retirer le code
                </Button>
              )}
            </div>

            {/* Message si code appliqué */}
            {appliedCoupon && (
              <div className="mt-4 p-3 bg-green-900/40 border border-green-500/50 rounded-lg animate-in fade-in zoom-in duration-300">
                <p className="text-green-300 font-medium flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span className="font-mono font-bold">{appliedCoupon.code}</span> activé avec succès !
                </p>
                <p className="text-gray-300 text-xs mt-1">
                  👤 Parrain : {appliedCoupon.ownerName || appliedCoupon.ownerEmail}
                </p>
                <p className="text-yellow-400 text-xs mt-1">
                  🎁 Votre parrain recevra <strong className="text-yellow-300">1% de commission</strong> sur votre dépôt (après validation)
                </p>
                <p className="text-green-400 text-[10px] mt-2">
                  ✅ Exemple : Pour 1000 FCFA rechargés → 1 pièce (10 FCFA) pour votre parrain
                </p>
              </div>
            )}

            {/* Message encouragement */}
            {!appliedCoupon && (
              <div className="mt-4 p-3 bg-gray-800/50 rounded-lg text-center">
                <p className="text-gray-300 text-sm flex items-center justify-center gap-2">
                  <Wallet className="w-4 h-4 text-yellow-400" />
                  Rechargez dès maintenant
                </p>
                <p className="text-gray-500 text-[10px] mt-2">
                  🔒 Paiement sécurisé par Orange Money / Moov Money • Crédits immédiats
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Packs Grid avec effets améliorés */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {CREDIT_PACKS.map((pack, index) => {
            const Icon = pack.icon;
            const totalCoins = pack.coins;
            const valueInFcfa = totalCoins * 10;

            return (
              <motion.div
                key={pack.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative group bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden border flex flex-col
                  ${pack.popular ? 'border-yellow-500/50 shadow-yellow-500/10' : 'border-gray-800'}
                  hover:scale-105 hover:shadow-xl hover:border-yellow-500/50`}
              >
                {/* Badge populaire */}
                {pack.popular && !pack.badge && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-500 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg z-10 flex items-center gap-1">
                    <Flame className="w-3 h-3" /> Populaire
                  </div>
                )}

                {pack.badge && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-pink-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg z-10">
                    {pack.badge}
                  </div>
                )}

                <div className="p-6 text-center border-b border-gray-800 bg-gray-950">
                  <div
                    className={`w-16 h-16 mx-auto bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center mb-4 ${pack.color} group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{pack.name}</h3>
                  <div className="flex items-baseline justify-center mb-2">
                    <span className="text-3xl md:text-4xl font-extrabold text-white">
                      {pack.amount.toLocaleString()}
                    </span>
                    <span className="text-sm font-medium text-gray-400 ml-1">FCFA</span>
                  </div>
                  <div className="inline-flex items-center bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 text-yellow-300 px-3 py-1 rounded-full text-xs font-bold">
                    <Coins className="w-3 h-3 mr-1" />
                    {totalCoins.toLocaleString()} Crédits
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    (Soit {valueInFcfa.toLocaleString()} FCFA)
                  </div>
                </div>

                <div className="p-4 bg-gray-900 flex-1 flex flex-col">
                  <ul className="space-y-2 mb-4">
                    {pack.features.map((feature, i) => (
                      <li key={i} className="flex items-start text-xs text-gray-300">
                        <Check className="w-3 h-3 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    disabled={isProcessing}
                    className={`w-full font-bold text-sm transition-all duration-300 ${
                      pack.badge
                        ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        : "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black"
                    }`}
                    onClick={() => handlePurchase(pack)}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                      <span className="flex items-center justify-center">
                        <Rocket className="mr-2 w-4 h-4" />
                        Recharger maintenant
                      </span>
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Montant Personnalisé amélioré */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-2xl mx-auto"
        >
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-gray-800 p-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-shrink-0 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-4 rounded-full">
                <Calculator className="w-8 h-8 text-yellow-400" />
              </div>
              <div className="flex-grow text-center md:text-left">
                <h3 className="text-lg font-bold text-white mb-1">
                  Montant Personnalisé
                </h3>
                <p className="text-gray-400 text-xs mb-4">
                  Vous avez un budget spécifique ? Rechargez le montant exact de votre choix.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative w-full">
                    <Input
                      type="number"
                      placeholder="Montant en FCFA"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="pr-16 bg-gray-800 border-gray-700 text-white h-11"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      FCFA
                    </span>
                  </div>
                  <Button
                    disabled={isProcessing}
                    className="bg-gradient-to-r from-gray-700 to-gray-800 border border-gray-600 text-white hover:border-yellow-500 h-11 transition-all duration-300"
                    onClick={handleCustomAmountPurchase}
                  >
                    <Target className="mr-2 w-4 h-4" />
                    Recharger
                  </Button>
                </div>
                {customAmount && parseInt(customAmount) > 0 && (
                  <div className="mt-3 p-2 bg-gray-800/50 rounded-lg animate-in fade-in duration-300">
                    <p className="text-xs font-medium text-gray-300">
                      Vous recevrez{" "}
                      <span className="font-bold text-yellow-300 text-base">
                        {Math.floor(parseInt(customAmount) / 10).toLocaleString()}
                      </span>{" "}
                      crédits
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Section informations améliorée */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 rounded-xl border border-gray-800 p-6">
            <h3 className="text-white font-bold mb-4 text-center flex items-center justify-center gap-2">
              <Smartphone className="w-5 h-5 text-yellow-400" />
              Comment ça fonctionne ?
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <span className="text-yellow-400 font-bold block">1. Rechargez</span>
                  <p className="text-gray-400 text-xs">
                    Choisissez votre pack ou montant personnalisé
                  </p>
                  <p className="text-gray-500 text-[10px] mt-1">
                    → Pas besoin de code promo
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <span className="text-green-400 font-bold block">2. Payez</span>
                  <p className="text-gray-400 text-xs">
                    Orange Money, Moov Money
                  </p>
                  <p className="text-gray-500 text-[10px] mt-1">
                    → Paiement sécurisé
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto bg-purple-500/20 rounded-full flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <span className="text-purple-400 font-bold block">3. Utilisez</span>
                  <p className="text-gray-400 text-xs">
                    Crédits disponibles immédiatement
                  </p>
                  <p className="text-gray-500 text-[10px] mt-1">
                    → Sur tous les événements
                  </p>
                </div>
              </div>
            </div>

            {/* Badges de sécurité */}
            <div className="mt-6 pt-4 border-t border-gray-800 flex flex-wrap justify-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-green-400" />
                <span>Paiement 100% sécurisé</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-400" />
                <span>Crédits immédiats</span>
              </div>
              <div className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3 text-orange-400" />
                <span>Support 24/7</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              💡 Tous les prix affichés sont TTC. Les frais de transaction sont inclus.
            </p>
            <p className="text-xs text-yellow-600 text-center mt-2">
              🎁 Les codes promo sont optionnels. Vous pouvez recharger à tout moment sans code.
            </p>
          </div>
        </motion.div>

        {/* Modal paiement USSD */}
        <USSDPaymentModal
          open={showUSSDModal}
          onClose={() => {
            setShowUSSDModal(false);
            if (ussdSuccess) {
              setUssdSuccess(false);
            } else {
              openBonplaninfosRelance(ussdAmount);
            }
          }}
          amountFcfa={ussdAmount}
          title="Recharge par USSD"
          subtitle="Payez par mobile money puis confirmez avec la référence reçue par SMS."
          onConfirm={confirmUSSD}
        />
      </div>
    </div>
  );
};

export default CreditPacksPage;