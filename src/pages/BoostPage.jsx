import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowLeft,
  Zap,
  Coins,
  CheckCircle,
  Loader2,
  AlertCircle,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import { toast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/customSupabaseClient";
import { dbService } from "@/services/dbService";
import WalletInfoModal from "@/components/WalletInfoModal";
import { CoinService } from "@/services/CoinService";
import { Badge } from "@/components/ui/badge";

const BoostPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { adminConfig, forceRefreshUserProfile } = useData();
  const [loading, setLoading] = useState(false);
  const [userEvents, setUserEvents] = useState([]);
  const [selectedContent, setSelectedContent] = useState("");
  const [selectedPack, setSelectedPack] = useState("");
  const [showWalletInfoModal, setShowWalletInfoModal] = useState(false);
  const [isFetchingContent, setIsFetchingContent] = useState(true);
  const [packs, setPacks] = useState([]);
  const [isFetchingPacks, setIsFetchingPacks] = useState(false);

  // Récupérer les packs de promotion avec déduplication
  useEffect(() => {
    const fetchPromotionPacks = async () => {
      setIsFetchingPacks(true);
      try {
        const { data: packsData, error: packsError } = await supabase
          .from("promotion_packs")
          .select("*")
          .eq("is_active", true)
          .order("duration_days", { ascending: true });

        if (packsError) throw packsError;

        // Déduplication basée sur la durée (garder le pack le moins cher pour chaque durée)
        const durationMap = new Map();

        packsData?.forEach((pack) => {
          const existing = durationMap.get(pack.duration_days);
          if (!existing || pack.cost_pi < existing.cost_pi) {
            durationMap.set(pack.duration_days, pack);
          }
        });

        // Convertir map en array et trier par durée
        const deduplicatedPacks = Array.from(durationMap.values()).sort(
          (a, b) => a.duration_days - b.duration_days,
        );

        setPacks(deduplicatedPacks);

        // Si un seul pack est disponible, le sélectionner automatiquement
        if (deduplicatedPacks.length === 1) {
          setSelectedPack(deduplicatedPacks[0].id);
        }
      } catch (error) {
        console.error("Error fetching promotion packs:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les packs de promotion.",
          variant: "destructive",
        });
      } finally {
        setIsFetchingPacks(false);
      }
    };

    fetchPromotionPacks();
  }, []);

  // Récupérer les événements de l'utilisateur
  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const fetchUserContent = async () => {
      setIsFetchingContent(true);
      try {
        // Récupérer tous les événements actifs de l'utilisateur
        let eventsData = null;
        try {
          const rows = await dbService.getEventsByOrganizer(user.id);
          eventsData = rows.length > 0 ? rows : null;
        } catch (dbErr) {
          console.warn("dbService indisponible, fallback Supabase:", dbErr.message);
        }

        if (eventsData === null) {
          const { data, error } = await supabase
            .from("events")
            .select(
              "id, title, event_type, is_promoted, promoted_until, status, cover_image"
            )
            .eq("organizer_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false });

          if (error) throw error;
          eventsData = data || [];
        }

        // Filtrer les événements éligibles
        const now = new Date();
        const eligibleEvents = eventsData?.filter((event) => {
          // Si l'événement n'est pas promu, il est éligible
          if (!event.is_promoted) return true;

          // Si l'événement a une date de promotion expirée, il est éligible
          if (event.promoted_until && new Date(event.promoted_until) < now) {
            return true;
          }

          // L'événement a une promotion active
          return false;
        }) || [];

        // Formater pour le Select
        const formattedEvents = eligibleEvents.map((event) => ({
          value: event.id,
          label: `${event.title} (${event.event_type})`,
          event,
          isPromoted: event.is_promoted && event.promoted_until > now,
        }));

        setUserEvents(formattedEvents);

        // Pré-sélection si passé depuis la navigation
        if (location.state?.eventId) {
          const preselectedEvent = formattedEvents.find(
            (e) => e.value === location.state.eventId
          );
          if (preselectedEvent) {
            setSelectedContent(preselectedEvent.value);
          }
        }

        // Auto-sélection si un seul événement
        if (formattedEvents.length === 1 && !selectedContent) {
          setSelectedContent(formattedEvents[0].value);
        }
      } catch (error) {
        console.error("Error fetching user content:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger vos événements.",
          variant: "destructive",
        });
      } finally {
        setIsFetchingContent(false);
      }
    };

    fetchUserContent();
  }, [user, navigate, location.state, selectedContent]);

  const selectedEvent = userEvents.find(
    (event) => event.value === selectedContent
  )?.event;
  const selectedPackInfo = packs?.find((p) => p.id === selectedPack);

  const handleWalletModalProceed = () => {
    setShowWalletInfoModal(false);
    navigate("/packs");
  };

  // Fonction pour formater les features
  const formatFeatures = (features) => {
    if (!features) return [];

    try {
      // Si features est un tableau JSON
      if (Array.isArray(features)) {
        return features;
      }

      // Si features est une chaîne JSON
      if (typeof features === "string" && features.startsWith("[")) {
        return JSON.parse(features);
      }

      // Si features est une chaîne séparée par des virgules
      if (typeof features === "string") {
        return features.split(",").map((f) => f.trim());
      }

      return [];
    } catch (error) {
      console.error("Error parsing features:", error);
      return [];
    }
  };

  // Calculer le coût en FCFA
  const calculateFcfaCost = (coins) => {
    return coins * (adminConfig?.coin_to_fcfa_rate || 10);
  };

  const handleBoost = async () => {
    if (!selectedContent || !selectedPackInfo) {
      toast({
        title: "Erreur",
        description:
          "Veuillez sélectionner un événement et un pack de promotion.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const onSuccess = async () => {
      try {
        // 1. Débiter les coins
        const debitResult = await CoinService.debitCoins(
          user.id,
          selectedPackInfo.cost_pi,
          `Boost: ${selectedPackInfo.name} - ${selectedEvent?.title}`,
          selectedContent,
          "event"
        );

        // 2. Calculer les dates
        const startDate = new Date().toISOString();
        const endDate = new Date(
          Date.now() + selectedPackInfo.duration_days * 24 * 60 * 60 * 1000
        ).toISOString();

        // 3. Créer la promotion
        const promotionData = {
          event_id: selectedContent,
          organizer_id: user.id,
          promotion_pack_id: selectedPackInfo.id,
          start_date: startDate,
          event_end_at: endDate,
          cost_pi: selectedPackInfo.cost_pi,
          status: "active",
          payment_status: "paid",
        };

        // Ajouter les colonnes optionnelles si elles existent dans debitResult
        if (debitResult && typeof debitResult === "object") {
          if (debitResult.freeCoinsUsed !== undefined) {
            promotionData.free_coins_used = debitResult.freeCoinsUsed;
          }
          if (debitResult.paidCoinsUsed !== undefined) {
            promotionData.paid_coins_used = debitResult.paidCoinsUsed;
          }
        }

        // Insertion avec gestion d'erreur
        const { error: promotionError } = await supabase
          .from("event_promotions")
          .insert(promotionData);

        if (promotionError) {
          console.error("Promotion insert error:", promotionError);

          // Fallback: créer sans les colonnes problématiques
          const fallbackData = { ...promotionData };
          delete fallbackData.free_coins_used;
          delete fallbackData.paid_coins_used;

          const { error: fallbackError } = await supabase
            .from("event_promotions")
            .insert(fallbackData);

          if (fallbackError) throw fallbackError;
        }

        // 4. Mettre à jour l'événement
        const updateData = {
          is_promoted: true,
          promoted_until: endDate,
        };

        const { error: eventUpdateError } = await supabase
          .from("events")
          .update(updateData)
          .eq("id", selectedContent);

        if (eventUpdateError) {
          console.error("Event update error:", eventUpdateError);

          // Fallback: essayer sans promoted_until si erreur
          const fallbackUpdateData = {
            is_promoted: true,
          };

          const { error: fallbackUpdateError } = await supabase
            .from("events")
            .update(fallbackUpdateData)
            .eq("id", selectedContent);

          if (fallbackUpdateError) throw fallbackUpdateError;
        }

        toast({
          title: "🎉 Promotion activée !",
          description: `Votre événement est maintenant mis en avant pour ${selectedPackInfo.duration_days} jours.`,
          className: "bg-green-500 text-white",
        });

        await forceRefreshUserProfile?.();
        navigate(`/event/${selectedContent}`);
      } catch (error) {
        console.error("Boost error details:", error);

        // Gestion spécifique des erreurs de colonne
        if (
          error.message?.includes("schema cache") ||
          error.message?.includes("column")
        ) {
          toast({
            title: "Erreur de base de données",
            description:
              "Une mise à jour de la structure de la base de données est nécessaire. Contactez l'administrateur.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Erreur lors du boost",
            description:
              error.message ||
              "Une erreur est survenue lors de la promotion de l'événement.",
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    await CoinService.handleAction({
      userId: user.id,
      requiredCoins: selectedPackInfo.cost_pi,
      onSuccess,
      onInsufficientBalance: () => {
        setShowWalletInfoModal(true);
        setLoading(false);
      },
    });
  };

  // Si aucun événement n'est disponible
  if (!isFetchingContent && userEvents.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full glass-effect border-primary/30">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <AlertCircle className="w-6 h-6" />
              Aucun événement disponible
            </CardTitle>
            <CardDescription>
              Créez un nouvel événement ou vérifiez vos événements existants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center p-4">
              <p className="text-muted-foreground mb-6">
                Tous vos événements sont déjà en promotion active ou vous n'avez
                pas encore créé d'événements.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant="outline"
                onClick={() => navigate("/my-events")}
                className="flex-1"
              >
                Mes événements
              </Button>
              <Button
                onClick={() => navigate("/create-event")}
                className="flex-1"
                variant="premium"
              >
                Créer un événement
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-background">
      <Helmet>
        <title>Booster la Visibilité - BonPlaninfos</title>
        <meta
          name="description"
          content="Mettez en avant vos événements et promotions pour atteindre une plus large audience."
        />
      </Helmet>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-primary mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full">
              <Zap className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 mb-2">
                Booster la Visibilité
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Augmentez la visibilité de vos événements et atteignez plus de
                participants avec nos packs de promotion.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Colonne gauche : Événements */}
          <div className="lg:col-span-1">
            <Card className="glass-effect border-primary/30 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
                    1
                  </span>
                  Événement à booster
                </CardTitle>
                <CardDescription>
                  Sélectionnez un événement actif
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isFetchingContent ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
                      <span className="text-muted-foreground">
                        Chargement...
                      </span>
                    </div>
                  ) : (
                    <>
                      <Select
                        onValueChange={setSelectedContent}
                        value={selectedContent}
                      >
                        <SelectTrigger className="h-12 text-left">
                          <SelectValue placeholder="Sélectionnez un événement" />
                        </SelectTrigger>
                        <SelectContent>
                          {userEvents.map((event) => (
                            <SelectItem key={event.value} value={event.value}>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary"></div>
                                <div className="flex flex-col">
                                  <span className="font-medium truncate max-w-[200px]">
                                    {event.label}
                                  </span>
                                  {event.isPromoted && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs mt-1"
                                    >
                                      Promotion expirée
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedEvent && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
                          <div className="flex items-start gap-3">
                            {selectedEvent.cover_image && (
                              <img
                                src={selectedEvent.cover_image}
                                alt={selectedEvent.title}
                                className="w-16 h-16 object-cover rounded"
                              />
                            )}
                            <div className="flex-1">
                              <h4 className="font-bold text-lg mb-1">
                                {selectedEvent.title}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Type: {selectedEvent.event_type}
                              </p>
                              {selectedEvent.is_promoted && (
                                <Badge variant="secondary" className="mt-2">
                                  <Star className="w-3 h-3 mr-1" />
                                  Déjà promu
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Colonne centrale : Packs */}
          <div className="lg:col-span-2">
            <Card className="glass-effect border-primary/30 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <span className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">
                    2
                  </span>
                  Pack de promotion
                </CardTitle>
                <CardDescription>
                  Choisissez la durée et les avantages
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isFetchingPacks ? (
                  <div className="flex items-center justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
                    <span className="text-muted-foreground">
                      Chargement des packs...
                    </span>
                  </div>
                ) : packs.length === 0 ? (
                  <div className="text-center p-12">
                    <AlertCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Aucun pack de promotion disponible.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {packs.map((pack) => {
                      const features = formatFeatures(pack.features);
                      const isSelected = selectedPack === pack.id;

                      return (
                        <motion.div
                          key={pack.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div
                            onClick={() => setSelectedPack(pack.id)}
                            className={`h-full p-5 flex flex-col rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                              isSelected
                                ? "border-primary bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/30 shadow-lg"
                                : "border-border hover:border-primary/40 hover:bg-card/70"
                            }`}
                          >
                            {/* En-tête du pack */}
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h3 className="font-bold text-lg mb-1">
                                  {pack.name}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {pack.duration_days} jours
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                              )}
                            </div>

                            {/* Description */}
                            <div className="mb-4 flex-1">
                              <p className="text-sm text-muted-foreground mb-4">
                                {pack.description ||
                                  `Boost de ${pack.duration_days} jours`}
                              </p>

                              {/* Avantages */}
                              {features.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-primary">
                                    Avantages inclus :
                                  </p>
                                  <ul className="space-y-1">
                                    {features.map((feature, index) => (
                                      <li
                                        key={index}
                                        className="flex items-start text-xs text-muted-foreground"
                                      >
                                        <Zap className="w-3 h-3 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
                                        {feature}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Prix */}
                            <div className="pt-4 border-t border-border/50">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Coins className="w-5 h-5 text-amber-500 mr-2" />
                                  <span className="text-xl font-bold">
                                    {pack.cost_pi} pièces
                                  </span>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium">
                                    ≈{" "}
                                    {calculateFcfaCost(
                                      pack.cost_pi
                                    ).toLocaleString("fr-FR")}{" "}
                                    FCFA
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {Math.round(
                                      (pack.cost_pi / pack.duration_days) * 10
                                    ) / 10}{" "}
                                    pièces/ jour
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Pack sélectionné - Détails */}
                {selectedPackInfo && (
                  <div className="mt-8 p-6 bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold mb-2">
                          Pack sélectionné : {selectedPackInfo.name}
                        </h3>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center">
                            <Zap className="w-4 h-4 text-primary mr-2" />
                            <span>
                              Durée :{" "}
                              <strong>
                                {selectedPackInfo.duration_days} jours
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center">
                            <Coins className="w-4 h-4 text-amber-500 mr-2" />
                            <span>
                              Coût :{" "}
                              <strong>{selectedPackInfo.cost_pi} pièces</strong>{" "}
                              (
                              {calculateFcfaCost(
                                selectedPackInfo.cost_pi
                              ).toLocaleString("fr-FR")}{" "}
                              FCFA)
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Promotion active jusqu'au{" "}
                          {new Date(
                            Date.now() +
                              selectedPackInfo.duration_days *
                                24 *
                                60 *
                                60 *
                                1000
                          ).toLocaleDateString("fr-FR", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bouton d'action */}
        <div className="mt-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={handleBoost}
              disabled={
                loading ||
                !selectedContent ||
                !selectedPack ||
                isFetchingContent ||
                isFetchingPacks
              }
              className="px-12 py-7 text-lg rounded-full shadow-xl hover:shadow-2xl transition-shadow"
              variant="premium"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                  Activation en cours...
                </>
              ) : (
                <>
                  <Zap className="mr-3 h-5 w-5" />
                  Activer la promotion
                  {selectedPackInfo && (
                    <span className="ml-3 bg-white/20 px-3 py-1 rounded-full text-sm">
                      {selectedPackInfo.cost_pi} pièces
                    </span>
                  )}
                </>
              )}
            </Button>

            {selectedEvent && selectedPackInfo && (
              <p className="text-sm text-muted-foreground mt-4 max-w-2xl mx-auto">
                En cliquant, vous confirmez la promotion de{" "}
                <strong>"{selectedEvent.title}"</strong>
                avec le pack <strong>{selectedPackInfo.name}</strong> pendant{" "}
                {selectedPackInfo.duration_days} jours pour un coût de{" "}
                {selectedPackInfo.cost_pi} pièces (
                {calculateFcfaCost(selectedPackInfo.cost_pi).toLocaleString(
                  "fr-FR"
                )}{" "}
                FCFA).
              </p>
            )}
          </motion.div>
        </div>
      </main>

      <WalletInfoModal
        isOpen={showWalletInfoModal}
        onClose={() => setShowWalletInfoModal(false)}
        onProceed={handleWalletModalProceed}
      />
    </div>
  );
};

export default BoostPage;