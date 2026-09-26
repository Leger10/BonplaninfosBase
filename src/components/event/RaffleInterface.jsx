import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import RaffleDrawSystem from "./RaffleDrawSystem";
import WalletInfoModal from "@/components/WalletInfoModal";
import { supabase } from "@/lib/customSupabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Coins, Wallet, ChevronUp, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const RaffleInterface = ({
  raffleData,
  onPurchaseSuccess,
  isOwner,
  isClosed,
  event,
}) => {
  const { user } = useAuth();
  const { userProfile } = useData();
  const { toast } = useToast();
  
  const [quantity, setQuantity] = useState(1);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [fullEventData] = useState(event || null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [userTickets, setUserTickets] = useState([]);
  const [loadingUserTickets, setLoadingUserTickets] = useState(false);

  if (!raffleData) {
    return (
      <Card className="border-2 border-yellow-500/20 bg-gradient-to-br from-yellow-900/10 to-orange-900/5">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Données manquantes</h3>
          <p className="text-gray-300">
            Les informations de cette tombola n'ont pas pu être chargées. 
            Veuillez rafraîchir la page ou contacter l'organisateur.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [currentRaffleStatus] = useState(raffleData?.status || "active");

  const stats = {
    totalTickets: raffleData?.tickets_sold || 0,
    myTicketsCount: 0,
    participantsCount: 0,
  };

  const isOrganizer =
    isOwner ||
    (user &&
      (user.id === raffleData?.organizer_id ||
       user.id === event?.organizer_id));

  const pricePerTicket = raffleData?.calculated_price_pi || 1;
  const minTicketsRequired = raffleData?.min_tickets_required || 0;
  const isGoalReached = stats.totalTickets >= minTicketsRequired;
  const totalCostPi = useMemo(() => pricePerTicket * quantity, [pricePerTicket, quantity]);

  const liveRaffleData = {
    ...raffleData,
    status: currentRaffleStatus,
    tickets_sold: stats.totalTickets,
  };

  useEffect(() => {
    if (!user || !raffleData?.id) return;
    const loadUserTickets = async () => {
      setLoadingUserTickets(true);
      try {
        const { data, error } = await supabase
          .from('raffle_tickets')
          .select('ticket_number, purchase_price_pi, purchased_at')
          .eq('raffle_event_id', raffleData.id)
          .eq('user_id', user.id)
          .order('ticket_number', { ascending: true });
        if (error) throw error;
        setUserTickets(data || []);
      } catch (err) {
        console.error("Erreur chargement tickets:", err);
      } finally {
        setLoadingUserTickets(false);
      }
    };
    loadUserTickets();
  }, [user, raffleData?.id]);

  // Fonction d'achat corrigée – crédite l'organisateur
  const handlePurchaseTickets = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Veuillez vous connecter pour acheter des tickets",
        variant: "destructive"
      });
      return;
    }
    if (!raffleData || raffleData.status !== 'active') {
      toast({
        title: "Tombola non disponible",
        description: "Cette tombola n'est plus active",
        variant: "destructive"
      });
      return;
    }

    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.rpc('purchase_raffle_tickets', {
        p_user_id: user.id,
        p_raffle_event_id: raffleData.id,
        p_quantity: quantity,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Impossible de compléter l'achat");

      toast({
        title: "🎉 Achat réussi !",
        description: `Vous avez acheté ${data.quantity} ticket(s) pour la tombola "${event?.title || ''}"`,
      });

      if (onPurchaseSuccess) onPurchaseSuccess();

      const { data: newTickets } = await supabase
        .from('raffle_tickets')
        .select('ticket_number, purchase_price_pi, purchased_at')
        .eq('raffle_event_id', raffleData.id)
        .eq('user_id', user.id);
      setUserTickets(newTickets || []);
      setQuantity(1);

    } catch (error) {
      console.error("Erreur lors de l'achat:", error);
      toast({
        title: "Erreur d'achat",
        description: error.message || "Impossible de compléter l'achat",
        variant: "destructive"
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const availableTickets = raffleData?.total_tickets - (raffleData?.tickets_sold || 0);
  const maxTicketsPerUser = Math.min(raffleData?.max_tickets_per_user || 10, availableTickets);
  const showPurchaseInterface = !isOrganizer && raffleData?.status === 'active';

  return (
    <div className="space-y-8">
      <RaffleDrawSystem
        raffleData={liveRaffleData}
        isOrganizer={isOrganizer}
        isGoalReached={isGoalReached}
        minTicketsRequired={minTicketsRequired}
        eventData={fullEventData}
        onDrawComplete={onPurchaseSuccess}
        stats={stats}
        userProfile={userProfile}
      />

      {showPurchaseInterface && (
        <Card className="border-2 border-blue-500/20 bg-gradient-to-br from-blue-900/10 to-indigo-900/5">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Section gauche */}
              <div className="flex-1 space-y-6">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    <Ticket className="w-6 h-6 text-blue-400" />
                    Participer à la tombola
                  </h3>
                  <p className="text-gray-300">Achetez vos tickets pour tenter de gagner de fabuleux lots !</p>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <Ticket className="w-4 h-4" /> Mes tickets
                  </h4>
                  {loadingUserTickets ? (
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400" />
                  ) : userTickets.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Nombre de tickets</span>
                        <span className="text-white font-bold">{userTickets.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Valeur totale</span>
                        <span className="text-yellow-400 font-bold">
                          {userTickets.reduce((sum, t) => sum + (t.purchase_price_pi || pricePerTicket), 0)} π
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {userTickets.slice(0,5).map((t, idx) => (
                          <Badge key={idx} className="bg-blue-500/20 text-blue-300">#{t.ticket_number}</Badge>
                        ))}
                        {userTickets.length > 5 && <Badge>+{userTickets.length-5}</Badge>}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-center py-4">Vous n'avez pas encore acheté de tickets</p>
                  )}
                </div>

                {minTicketsRequired > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Objectif de la tombola</span>
                      <span className={isGoalReached ? "text-green-400" : "text-yellow-400"}>
                        {isGoalReached ? "Atteint ✅" : "En cours..."}
                      </span>
                    </div>
                    <Progress value={Math.min(100, (stats.totalTickets / minTicketsRequired) * 100)} className="h-2" />
                  </div>
                )}
              </div>

              {/* Section droite – achat */}
              <div className="flex-1">
                <div className="bg-white/5 rounded-lg p-6 space-y-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-400 mb-1">Prix du ticket</p>
                    <div className="flex justify-center gap-2">
                      <span className="text-4xl font-bold text-white">{pricePerTicket}</span>
                      <Coins className="w-8 h-8 text-yellow-400" />
                    </div>
                    <p className="text-sm text-gray-400 mt-1">En pièces</p>
                  </div>

                  <div className="space-y-3">
                    <Label>Nombre de tickets</Label>
                    <div className="flex justify-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.max(1, quantity-1))}
                        disabled={quantity<=1}
                        className="h-12 w-12"
                      >
                        <ChevronDown className="w-5 h-5" />
                      </Button>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) => {
                          let val = parseInt(e.target.value) || 1;
                          val = Math.min(maxTicketsPerUser, Math.max(1, val));
                          setQuantity(val);
                        }}
                        className="text-4xl font-bold text-center w-32"
                        min="1"
                        max={maxTicketsPerUser}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.min(maxTicketsPerUser, quantity+1))}
                        disabled={quantity>=maxTicketsPerUser}
                        className="h-12 w-12"
                      >
                        <ChevronUp className="w-5 h-5" />
                      </Button>
                    </div>
                    <p className="text-center text-sm text-gray-400">Max {maxTicketsPerUser} tickets</p>
                  </div>

                  <div className="bg-black/30 rounded-lg p-4 text-center">
                    <span className="text-gray-400">Total à payer :</span>
                    <div className="text-3xl font-bold text-white">{totalCostPi} π</div>
                    <p className="text-sm text-gray-400">{quantity} ticket{quantity>1 ? 's' : ''} × {pricePerTicket} π</p>
                  </div>

                  <Button
                    onClick={handlePurchaseTickets}
                    disabled={isPurchasing || availableTickets<=0 || quantity>availableTickets || quantity>raffleData?.max_tickets_per_user}
                    className="w-full py-6 text-lg font-bold bg-green-600 hover:bg-green-700"
                    size="lg"
                  >
                    {isPurchasing ? <Loader2 className="animate-spin mr-2" /> : <Wallet className="mr-2" />}
                    {isPurchasing ? "Achat en cours..." : `Acheter ${quantity} ticket${quantity>1?'s':''}`}
                  </Button>

                  <div className="text-sm text-gray-400 space-y-1 text-center">
                    <p>✅ Tickets disponibles : {availableTickets}</p>
                    {/* <p>✅ Tickets vendus : {raffleData.tickets_sold || 0}</p> */}
                    <p>✅ Maximum tickets par personne : {raffleData.max_tickets_per_user || 10}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isOrganizer && raffleData?.status === 'active' && (
        <Card className="border-2 border-gray-500/20 bg-gray-800/30">
          <CardContent className="p-6 text-center">
            <p className="text-gray-300">
              Vous êtes l'organisateur de cette tombola. Vous ne pouvez pas acheter de tickets.
              Les participants verront l'interface d'achat ci-dessus.
            </p>
          </CardContent>
        </Card>
      )}

      <WalletInfoModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        requiredAmount={totalCostPi}
        currentBalance={userProfile?.coin_balance || 0}
      />
    </div>
  );
};

export default RaffleInterface;