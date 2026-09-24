import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Loader2, ServerCrash, Users, Coins, Info, Sparkles, TrendingUp, Star } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { locationService } from '@/services/locationService';
import { useToast } from '@/components/ui/use-toast';
import EventCard from './EventCard';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import WalletInfoModal from '@/components/WalletInfoModal';

// Simple retry helper
const fetchWithRetry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(fn, retries - 1, delay * 1.5);
  }
};

const NearbyEvents = () => {
  const [localEvents, setLocalEvents] = useState([]);
  const [unlockedEvents, setUnlockedEvents] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);
  const { user } = useAuth();
  const { userProfile, forceRefreshUserProfile, adminConfig } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [confirmation, setConfirmation] = useState({ isOpen: false, event: null, cost: 0, costFcfa: 0, onConfirm: null });
  const [showWalletInfoModal, setShowWalletInfoModal] = useState(false);
  const [headerMessage, setHeaderMessage] = useState('');

  // Liste des messages variés pour le header
  const headerMessages = useMemo(() => [
    { text: (city) => `À la une à ${city}`, icon: Sparkles, color: 'text-primary' },
    { text: (city) => `Les incontournables de ${city}`, icon: Star, color: 'text-amber-500' },
    { text: (city) => `Les plus populaires à ${city}`, icon: TrendingUp, color: 'text-green-500' },
    { text: (city) => `Découvrez cet événement à ${city}`, icon: MapPin, color: 'text-blue-500' },
    { text: (city) => `L'actualité à ${city}`, icon: Sparkles, color: 'text-purple-500' },
    { text: (city) => `Les événements du moment à ${city}`, icon: Users, color: 'text-pink-500' },
    { text: (city) => `Les bons plans à ${city}`, icon: Coins, color: 'text-yellow-500' },
    { text: (city) => `${city} vous attend`, icon: Star, color: 'text-red-500' },
    { text: (city) => `Les tendances à ${city}`, icon: TrendingUp, color: 'text-indigo-500' },
    { text: (city) => `Explorez ${city}`, icon: MapPin, color: 'text-teal-500' }
  ], []);

  const getRandomHeaderMessage = useCallback((city) => {
    const randomIndex = Math.floor(Math.random() * headerMessages.length);
    const message = headerMessages[randomIndex];
    return { text: message.text(city), Icon: message.icon, color: message.color };
  }, [headerMessages]);

  // Base de requête : events de la zone où la participation est encore possible
  // (statut actif/protégé, non annulés, date de fin dans le futur), triés
  // priorités promus puis date de début croissante.
  const buildLocalQuery = useCallback(({ city, country }) => {
    const now = new Date().toISOString();
    let query = supabase
      .from('events')
      .select(`
        id,
        title,
        event_start_at,
        event_end_at,
        city,
        country,
        full_address,
        cover_image,
        event_type,
        is_promoted,
        interactions_count,
        created_at,
        organizer_id,
        category:event_categories (name, slug),
        organizer:profiles!organizer_id (full_name)
      `)
      .in('status', ['active', 'protected'])
      .eq('is_cancelled', false)
      .gte('event_end_at', now)
      .order('is_promoted', { ascending: false })
      .order('event_start_at', { ascending: true })
      .limit(8);
    if (city) query = query.ilike('city', `%${city.trim().toLowerCase()}%`);
    if (country) query = query.ilike('country', `%${country.trim().toLowerCase()}%`);
    return query;
  }, []);

  const transformEvents = useCallback((events) => events.map((event) => ({
    event_id: event.id,
    title: event.title,
    event_start_at: event.event_start_at,
    event_end_at: event.event_end_at,
    city: event.city,
    country: event.country,
    full_address: event.full_address,
    cover_image: event.cover_image,
    category_name: event.category?.name,
    category_slug: event.category?.slug,
    organizer_id: event.organizer_id,
    organizer_name: event.organizer?.full_name,
    event_type: event.event_type,
    is_promoted: event.is_promoted,
    interactions_count: event.interactions_count,
    created_at: event.created_at,
    id: event.id,
  })), []);

  const fetchLocalEvents = useCallback(async (city, country) => {
    setLoading(true);
    setError(null);
    try {
      // 1) Events de la ville exacte de l'utilisateur
      let { data, error } = await fetchWithRetry(() =>
        buildLocalQuery({ city, country }).limit(8)
      );
      if (error) throw error;

      // 2) Fallback : si rien dans la ville, chercher dans tout le pays
      //    (la ville où les tendances sont actives s'affiche alors en priorité)
      let fallbackCity = null;
      if (!data || data.length === 0) {
        const { data: countryData, error: countryError } = await fetchWithRetry(() =>
          buildLocalQuery({ city: null, country }).limit(8)
        );
        if (countryError) throw countryError;
        if (countryData && countryData.length > 0) {
          fallbackCity = countryData[0].city;
          data = countryData;
        }
      }

      const transformedEvents = transformEvents(data || []);
      setLocalEvents(transformedEvents);

      if (transformedEvents.length > 0) {
        const displayCity = fallbackCity || city;
        const newMessage = getRandomHeaderMessage(displayCity);
        if (fallbackCity) {
          newMessage.fallback = true;
          newMessage.userCity = city;
        }
        setHeaderMessage(newMessage);
      } else if (city) {
        // Rien dans la ville ni dans le pays : message neutre, pas d'erreur
        setHeaderMessage({
          text: `Aucun événement à proximité de ${city} pour le moment`,
          Icon: MapPin,
          color: 'text-muted-foreground',
        });
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des événements locaux:', err);
      setLocalEvents([]);
      setError('Impossible de charger les événements à proximité.');
    } finally {
      setLoading(false);
    }
  }, [buildLocalQuery, transformEvents, getRandomHeaderMessage]);
  
  const fetchUnlockedEvents = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await fetchWithRetry(() => 
        supabase
          .from('protected_event_access')
          .select('event_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
      );
      if (error) throw error;
      setUnlockedEvents(new Set(data.map(item => item.event_id)));
    } catch (err) {
      console.error('Error fetching unlocked events:', err);
    }
  }, [user]);

  useEffect(() => {
    const init = async () => {
      let userLocation;
      if (userProfile?.city && userProfile?.country) {
        userLocation = { city: userProfile.city, country: userProfile.country };
      } else {
        userLocation = await locationService.detectUserLocation();
      }

      if (userLocation.city && userLocation.country) {
        setLocation(userLocation);
        fetchLocalEvents(userLocation.city, userLocation.country);
      } else {
        setLoading(false);
      }
      fetchUnlockedEvents();
    };
    init();
  }, [userProfile, fetchLocalEvents, fetchUnlockedEvents]);
  
  const refreshHeaderMessage = useCallback(() => {
    if (location?.city) {
      const newMessage = getRandomHeaderMessage(location.city);
      setHeaderMessage(newMessage);
    }
  }, [location, getRandomHeaderMessage]);

  const executeUnlock = async (event) => {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('access_protected_event', { 
        p_event_id: event.id, 
        p_user_id: user.id 
      });
      if (rpcError) throw rpcError;
      
      if (!rpcData.success) {
        if (rpcData.message?.includes('Solde insuffisant')) {
          setShowWalletInfoModal(true);
          return;
        }
        throw new Error(rpcData.message);
      }

      const amountPaid = rpcData.amount_paid || 2;
      toast({ 
        title: "Contenu débloqué!", 
        description: `Vous avez dépensé ${amountPaid} pièces. 1 pièce a été transféré à l'organisateur.`,
        duration: 3000
      });
      
      forceRefreshUserProfile();
      setUnlockedEvents(prev => new Set(prev).add(event.id));
      navigate(`/event/${event.id}`);
    } catch (error) {
      console.error('Erreur lors du déblocage:', error);
      if (!error.message?.includes('Solde insuffisant')) {
        toast({ 
          title: "Erreur lors du déblocage", 
          description: error.message || "Une erreur inattendue est survenue", 
          variant: "destructive",
          duration: 5000
        });
      }
    }
  };

  // ✅ Gestion du clic sur une carte - ACCÈS PUBLIC
  const handleCardClick = (event) => {
    const eventId = event.id || event.event_id;
    
    // ✅ Vérifier si l'utilisateur est connecté
    if (!user) {
      // 🔥 ACCÈS PUBLIC - Rediriger vers la page de l'événement sans connexion
      navigate(`/event/${eventId}`);
      return;
    }
    
    const isAdmin = userProfile && ['super_admin', 'admin', 'secretary'].includes(userProfile.user_type);
    const isUnlocked = unlockedEvents.has(eventId) || event.organizer_id === user?.id || isAdmin;

    // Gérer les événements protégés
    if (event.event_type === 'protected' && !isUnlocked) {
      const cost = 2;
      const costFcfa = cost * (adminConfig?.coin_to_fcfa_rate || 10);
      
      setConfirmation({
        isOpen: true,
        event: { ...event, id: eventId },
        cost,
        costFcfa,
        onConfirm: () => executeUnlock({ ...event, id: eventId }),
      });
    } else {
      // ✅ ACCÈS AUTORISÉ - Navigation vers l'événement
      navigate(`/event/${eventId}`);
    }
  };

  const memoizedLocalEvents = useMemo(() => localEvents, [localEvents]);

  // 🔄 Rendu en chargement
  if (loading) {
    return (
      <section className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center font-heading">
            <MapPin className="mr-2 text-primary" />
            Événements à proximité
          </h2>
        </div>
        <div className="flex justify-center items-center h-48 bg-card rounded-lg border border-border">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  // 🔄 Rendu en erreur
  if (error) {
    return (
      <section className="mb-12">
        <h2 className="text-2xl font-bold flex items-center font-heading mb-4">
          <MapPin className="mr-2 text-primary" />
          Événements à {location?.city || 'proximité'}
        </h2>
        <div className="text-center py-16 bg-card rounded-lg border-dashed border-destructive/50">
          <ServerCrash className="w-16 h-16 text-destructive/50 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-destructive mb-2">Oops! Une erreur est survenue.</h3>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </section>
    );
  }

  // 🔄 Aucun événement : on affiche le message neutre si l'utilisateur a une zone
  if (localEvents.length === 0) {
    if (headerMessage.text && location?.city) {
      return (
        <section className="mb-12">
          <h2 className="text-2xl font-bold flex items-center font-heading mb-4">
            {headerMessage.Icon && <headerMessage.Icon className={`mr-2 ${headerMessage.color}`} />}
            {headerMessage.text}
          </h2>
        </section>
      );
    }
    return null;
  }

  // ✅ Rendu principal
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-12"
    >
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <button 
            onClick={refreshHeaderMessage}
            className="p-1 hover:bg-muted rounded-full transition-colors"
            title="Changer le message"
            aria-label="Changer le message d'en-tête"
          >
            <Sparkles className="w-4 h-4 text-muted-foreground" />
          </button>
          <h2 className="text-2xl font-bold flex items-center font-heading">
            {headerMessage.Icon && <headerMessage.Icon className={`mr-2 ${headerMessage.color}`} />}
            <span>
              {headerMessage.text || `À la une à ${location?.city}`}
              {headerMessage.fallback && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  Aucun événement à {headerMessage.userCity}, voici les tendances
                </span>
              )}
            </span>
          </h2>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {memoizedLocalEvents.map(event => {
          const isAdmin = userProfile && ['super_admin', 'admin', 'secretary'].includes(userProfile.user_type);
          const eventId = event.id || event.event_id;
          const isUnlocked = unlockedEvents.has(eventId) || (user && event.organizer_id === user.id) || isAdmin;
          
          return (
            <EventCard
              key={eventId}
              event={{...event, id: eventId}}
              onClick={() => handleCardClick(event)}
              isUnlocked={isUnlocked}
            />
          );
        })}
      </div>
      
      {/* ✅ Wallet Info Modal */}
      <WalletInfoModal 
        isOpen={showWalletInfoModal} 
        onClose={() => setShowWalletInfoModal(false)}
        onProceed={() => {
          setShowWalletInfoModal(false);
          navigate('/wallet');
        }}
      />
      
      {/* ✅ Alert Dialog pour la confirmation de déblocage */}
      <AlertDialog 
        open={confirmation.isOpen} 
        onOpenChange={(isOpen) => !isOpen && setConfirmation({ isOpen: false, event: null, cost: 0, costFcfa: 0, onConfirm: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Débloquer cet événement ?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="flex flex-col items-center justify-center text-center p-4">
                <Coins className="w-12 h-12 text-primary mb-4" />
                <p className="text-lg">
                  Voir les détails de "<strong className="text-foreground">{confirmation.event?.title}</strong>" vous coûtera{' '}
                  <strong className="text-foreground">{confirmation.cost} pièces</strong> ({confirmation.costFcfa?.toLocaleString('fr-FR')} FCFA).
                </p>
                <div className="mt-4 text-sm text-muted-foreground p-4 bg-muted rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-primary" />
                    <div className="text-left">
                      <p className="font-medium mb-2 text-foreground">Comment fonctionne la rémunération :</p>
                      <ul className="space-y-2 text-xs md:text-sm">
                        <li className="flex items-center gap-2">
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">2 pièces</span>
                          <span>sont déduits de votre solde</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-semibold">1 pièce</span>
                          <span>est transféré à l'organisateur</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded font-semibold">1 pièce</span>
                          <span>reste dans l'écosystème BonPlanInfos</span>
                        </li>
                      </ul>
                      <p className="mt-3 text-xs italic">En débloquant cet événement, vous soutenez directement l'organisateur !</p>
                    </div>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="mt-2 sm:mt-0">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmation.onConfirm} className="bg-primary hover:bg-primary/90">
              Confirmer et Payer {confirmation.cost} pièces
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  );
};

export default NearbyEvents;