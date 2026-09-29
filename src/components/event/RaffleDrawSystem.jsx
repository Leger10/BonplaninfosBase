import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Trophy, Sparkles, X, Shuffle, Loader2, Star, Target, Calendar, CheckCircle, Users, Award, Gift, AlertTriangle, Check, AlertCircle, Eye, Share2, Wallet, Coins, Zap, TrendingUp, GiftIcon, Rocket, TargetIcon, Dice5, Medal } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from 'react-router-dom';

// Dans le composant Podium, modifiez pour utiliser displayRank
const Podium = ({ winners }) => {
  if (!winners || winners.length === 0) return null;
  
  // Trier les gagnants par displayRank (1er, 2ème, 3ème)
  const sortedWinners = [...winners]
    .filter(w => w.displayRank <= 3)
    .sort((a, b) => a.displayRank - b.displayRank);
  
  const first = sortedWinners.find(w => w.displayRank === 1);
  const second = sortedWinners.find(w => w.displayRank === 2);
  const third = sortedWinners.find(w => w.displayRank === 3);

  return (
    <div className="flex justify-center items-end gap-2 sm:gap-4 my-8 min-h-[250px]">
      {/* 2ème Place */}
      {second && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }} 
          animate={{ height: '140px', opacity: 1 }} 
          transition={{ delay: 0.5, duration: 0.5 }}
          className="flex flex-col items-center w-24 sm:w-32 order-2"
        >
          <div className="mb-2 text-center">
            {second.profiles?.avatar_url ? (
              <img 
                src={second.profiles.avatar_url} 
                alt={second.profiles.full_name || "2ème place"} 
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 border-gray-300 object-cover" 
              />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center font-bold text-white text-xl">
                {second.profiles?.full_name?.charAt(0) || '2'}
              </div>
            )}
            <p className="text-xs sm:text-sm text-white font-bold mt-1 truncate max-w-[100px]">
              {second.profiles?.full_name || "2ème Place"}
            </p>
            <div className="text-[10px] text-gray-300">Ticket #{second.ticket_number}</div>
          </div>
          <div className="w-full h-full bg-gradient-to-t from-gray-700 to-gray-500 rounded-t-lg flex flex-col items-center justify-end p-2 border-t-4 border-gray-300 shadow-[0_0_15px_rgba(192,192,192,0.3)]">
            <span className="text-3xl font-bold text-gray-200">{second.displayRank}</span>
            <span className="text-xs text-gray-300 mt-1">🥈</span>
          </div>
        </motion.div>
      )}

      {/* 1ère Place */}
      {first && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }} 
          animate={{ height: '180px', opacity: 1 }} 
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex flex-col items-center w-28 sm:w-40 z-10 order-1"
        >
          <div className="mb-2 text-center relative">
            <Crown className="w-8 h-8 text-yellow-400 absolute -top-8 left-1/2 -translate-x-1/2 animate-bounce" />
            {first.profiles?.avatar_url ? (
              <img 
                src={first.profiles.avatar_url} 
                alt={first.profiles.full_name || "1ère place"} 
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-yellow-400 object-cover shadow-lg" 
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center font-bold text-yellow-900 text-2xl shadow-lg">
                {first.profiles?.full_name?.charAt(0) || '1'}
              </div>
            )}
            <p className="text-sm sm:text-base text-yellow-300 font-bold mt-1 truncate max-w-[120px]">
              {first.profiles?.full_name || "1ère Place"}
            </p>
            <div className="text-xs text-yellow-200">Ticket #{first.ticket_number}</div>
          </div>
          <div className="w-full h-full bg-gradient-to-t from-yellow-700 to-yellow-500 rounded-t-lg flex flex-col items-center justify-end p-2 border-t-4 border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.5)]">
            <span className="text-5xl font-bold text-yellow-100">{first.displayRank}</span>
            <span className="text-sm text-yellow-200 mt-1">🏆</span>
          </div>
        </motion.div>
      )}

      {/* 3ème Place */}
      {third && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }} 
          animate={{ height: '110px', opacity: 1 }} 
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex flex-col items-center w-24 sm:w-32 order-3"
        >
          <div className="mb-2 text-center">
            {third.profiles?.avatar_url ? (
              <img 
                src={third.profiles.avatar_url} 
                alt={third.profiles.full_name || "3ème place"} 
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-4 border-amber-600 object-cover" 
              />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center font-bold text-amber-100 text-xl">
                {third.profiles?.full_name?.charAt(0) || '3'}
              </div>
            )}
            <p className="text-xs sm:text-sm text-white font-bold mt-1 truncate max-w-[100px]">
              {third.profiles?.full_name || "3ème Place"}
            </p>
            <div className="text-[10px] text-amber-300">Ticket #{third.ticket_number}</div>
          </div>
          <div className="w-full h-full bg-gradient-to-t from-amber-800 to-amber-600 rounded-t-lg flex flex-col items-center justify-end p-2 border-t-4 border-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.3)]">
            <span className="text-3xl font-bold text-amber-200">{third.displayRank}</span>
            <span className="text-xs text-amber-300 mt-1">🥉</span>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// Composant pour afficher la liste des gagnants (4ème et suivants)
const WinnersList = ({ winners, currentUserId }) => {
  // Filtrer les gagnants à partir du 4ème rang
  const remainingWinners = winners
    .filter(w => w.rank >= 4)
    .sort((a, b) => a.rank - b.rank);

  // Réindexer les rangs pour qu'ils commencent à 4
  const reindexedWinners = remainingWinners.map((winner, index) => ({
    ...winner,
    displayRank: index + 4 // 4ème, 5ème, 6ème, etc.
  }));

  if (remainingWinners.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">Aucun autre gagnant au-delà du podium.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-400" />
        Autres Gagnants (4ème et suivants)
      </h4>
      
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
        {reindexedWinners.map((entry) => (
          <motion.div
            key={`${entry.user_id}-${entry.displayRank}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: entry.displayRank * 0.03 }}
            className={`flex items-center justify-between p-4 border-b border-white/10 transition-all duration-300 hover:bg-white/5 ${
              currentUserId && entry.profiles?.id === currentUserId 
                ? 'bg-gradient-to-r from-blue-500/10 to-blue-600/10 border-l-4 border-blue-500' 
                : ''
            }`}
          >
            {/* Rang et participant */}
            <div className="flex items-center gap-4">
              <Badge className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-lg ${
                entry.displayRank >= 4 && entry.displayRank <= 10 
                  ? 'bg-gradient-to-br from-purple-600 to-purple-800 text-white' 
                  : 'bg-gradient-to-br from-gray-700 to-gray-900 text-white'
              }`}>
                {entry.displayRank}
              </Badge>
              
              <div className="flex items-center gap-3">
                {/* Avatar */}
                {entry.profiles?.avatar_url ? (
                  <img 
                    src={entry.profiles.avatar_url} 
                    alt={entry.profiles.full_name} 
                    className="w-10 h-10 rounded-full object-cover border-2 border-white/20" 
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white font-bold">
                    {entry.profiles?.full_name?.charAt(0) || '?'}
                  </div>
                )}
                
                {/* Informations */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${
                      entry.displayRank <= 10 ? 'text-blue-200' : 'text-white'
                    }`}>
                      {entry.profiles?.full_name || "Anonyme"}
                    </span>
                    {currentUserId && entry.profiles?.id === currentUserId && (
                      <Badge className="bg-green-600 text-white text-xs px-2 py-0.5">
                        Moi
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    @{entry.profiles?.username || "utilisateur"}
                  </div>
                </div>
              </div>
            </div>

            {/* Numéro de ticket et rang */}
            <div className="text-right">
              <div className="text-sm text-gray-400">Ticket gagnant</div>
              <div className="font-mono text-lg font-bold text-blue-300">
                #{entry.ticket_number}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Rang: <span className="font-bold">{entry.displayRank}ème</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// Composant pour les numéros qui tournent avec effets - AMÉLIORÉ
const SpinningNumber = ({ number, index, isSpinning, finalStage }) => {
  return (
    <motion.div
      key={index}
      initial={{ scale: 0, rotate: -180, opacity: 0 }}
      animate={{ 
        scale: isSpinning ? [1, 1.1, 1] : finalStage ? 1.2 : 1,
        rotate: isSpinning ? [0, 360] : finalStage ? [0, 720] : 0,
        opacity: 1 
      }}
      transition={{ 
        scale: isSpinning ? { repeat: Infinity, duration: 0.3 } : finalStage ? { duration: 0.5 } : {},
        rotate: isSpinning ? { 
          repeat: Infinity, 
          duration: finalStage ? 1 : 2,
          ease: "linear" 
        } : finalStage ? { duration: 0.5 } : {},
        opacity: { duration: 0.5 }
      }}
      className="relative w-20 h-24 sm:w-24 sm:h-28 bg-black/80 rounded-xl border-2 border-yellow-500/70 flex items-center justify-center shadow-[0_0_20px_rgba(234,179,8,0.5)] overflow-hidden group"
    >
      {/* Effet de brillance */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-yellow-500/20 to-transparent animate-pulse"></div>
      
      {/* Effet de rotation intérieur */}
      <motion.div 
        animate={{ rotate: isSpinning ? 360 : 0 }}
        transition={{ 
          rotate: { 
            repeat: Infinity, 
            duration: 3,
            ease: "linear" 
          } 
        }}
        className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent"
      />
      
      {/* Le numéro */}
      <span className="text-4xl sm:text-5xl font-mono font-bold text-yellow-300 tabular-nums relative z-10 drop-shadow-[0_0_10px_rgba(234,179,8,0.7)]">
        {number}
      </span>
      
      {/* Effet de halo */}
      <div className="absolute -inset-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </motion.div>
  );
};
// Modal de diffusion en direct du tirage - VERSION ULTRA DYNAMIQUE
// Modal de diffusion en direct du tirage - VERSION AVEC DURÉE DE 30 SECONDES
const LiveDrawBroadcast = ({ raffleId, eventTitle, onClose, onDrawComplete, isOrganizer }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentNumbers, setCurrentNumbers] = useState(Array(6).fill('0000'));
  const [showResults, setShowResults] = useState(false);
  const [drawMessages, setDrawMessages] = useState(["🎲 Initialisation du tirage..."]);
  const [winners, setWinners] = useState([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [drawStep, setDrawStep] = useState(0);
  const [finalStage, setFinalStage] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [shakeEffect, setShakeEffect] = useState(false);
  const [colorFlash, setColorFlash] = useState('from-yellow-500');
  const [timeLeft, setTimeLeft] = useState(30); // 30 secondes

  // Effet de pulsation de couleur
  useEffect(() => {
    if (drawStep === 1) {
      const colors = [
        'from-yellow-500', 'from-orange-500', 'from-red-500', 
        'from-purple-500', 'from-blue-500', 'from-green-500',
        'from-pink-500', 'from-indigo-500'
      ];
      let colorIndex = 0;
      
      const colorInterval = setInterval(() => {
        colorIndex = (colorIndex + 1) % colors.length;
        setColorFlash(colors[colorIndex]);
      }, 300);

      return () => clearInterval(colorInterval);
    }
  }, [drawStep]);

  // Effet d'intensité croissante et compte à rebours
  useEffect(() => {
    if (drawStep === 1) {
      const startTime = Date.now();
      const totalDuration = 30000; // 30 secondes
      
      const intensityInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newIntensity = Math.min(100, (elapsed / totalDuration) * 100);
        setIntensity(newIntensity);
        setTimeLeft(Math.max(0, Math.ceil((totalDuration - elapsed) / 1000)));
        
        if (newIntensity > 70 && Math.random() > 0.5) {
          setShakeEffect(true);
          setTimeout(() => setShakeEffect(false), 200);
        }
      }, 100);

      return () => clearInterval(intensityInterval);
    }
  }, [drawStep]);

  // Effet de défilement amélioré avec accélération/décélération
  useEffect(() => {
    if (drawStep === 1) {
      let startTime = Date.now();
      const totalDuration = 30000; // 30 secondes
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / totalDuration;
        
        // Calcul de la vitesse avec des variations
        let speed;
        if (progress < 0.1) {
          speed = 80; // Très rapide au début
        } else if (progress < 0.3) {
          speed = 120; // Rapide
        } else if (progress < 0.5) {
          speed = 200; // Moyen
        } else if (progress < 0.7) {
          speed = 300; // Ralentit
        } else if (progress < 0.85) {
          speed = 400; // Très lent
          setFinalStage(true);
        } else {
          speed = 500; // Suspense maximal
        }
        
        // Génération de numéros avec patterns spéciaux
        const newNumbers = Array.from({ length: 6 }, () => {
          if (progress > 0.9) {
            const patterns = [
              '1234', '5678', '9012', '3456', '7890', '1111',
              '2222', '3333', '4444', '5555', '6666', '7777',
              '8888', '9999', '0000'
            ];
            return patterns[Math.floor(Math.random() * patterns.length)];
          } else if (progress > 0.7) {
            const base = Math.floor(Math.random() * 1000);
            return `${base}${base}`.slice(0, 4);
          } else {
            const base = Math.floor(Math.random() * 9000) + 1000;
            return base.toString().padStart(4, '0');
          }
        });
        
        setCurrentNumbers(newNumbers);
        
        // Messages d'ambiance dynamiques sur 30 secondes
        if (progress < 0.1) {
          setDrawMessages(prev => [...prev.slice(-2), "🔥 DÉMARRAGE DU TIRAGE ÉLECTRIQUE..."]);
        } else if (progress < 0.15) {
          setDrawMessages(prev => [...prev.slice(-2), "⚡ LES TICKETS SONT MÉLANGÉS À GRANDE VITESSE..."]);
        } else if (progress < 0.2) {
          setDrawMessages(prev => [...prev.slice(-2), "✨ ACTIVATION DU GÉNÉRATEUR ALÉATOIRE QUANTIQUE..."]);
        } else if (progress < 0.30) {
          setDrawMessages(prev => [...prev.slice(-2), "🎰 LES ROUES TOURNENT... QUI SERA LE GRAND GAGNANT ?"]);
        } else if (progress < 0.3) {
          setDrawMessages(prev => [...prev.slice(-2), "💫 CALCUL DES PROBABILITÉS EN COURS..."]);
        } else if (progress < 0.35) {
          setDrawMessages(prev => [...prev.slice(-2), "🌟 LE SYSTÈME ANALYSE DES MILLIERS DE COMBINAISONS..."]);
        } else if (progress < 0.4) {
          setDrawMessages(prev => [...prev.slice(-2), "🎯 PRÉSÉLECTION DES NUMÉROS FINALISTES..."]);
        } else if (progress < 0.45) {
          setDrawMessages(prev => [...prev.slice(-2), "💥 TENSION MAXIMUM ! LES DERNIERS CALCULS SONT EN COURS..."]);
        } else if (progress < 0.5) {
          setDrawMessages(prev => [...prev.slice(-2), "🎭 LE DESTIN SE JOUE DANS QUELQUES INSTANTS..."]);
        } else if (progress < 0.55) {
          setDrawMessages(prev => [...prev.slice(-2), "⏳ PLUS QUE QUELQUES SECONDES AVANT LA RÉVÉLATION..."]);
        } else if (progress < 0.6) {
          setDrawMessages(prev => [...prev.slice(-2), "🎲 MÉLANGE FINAL DES COMBINAISONS GAGNANTES..."]);
        } else if (progress < 0.65) {
          setDrawMessages(prev => [...prev.slice(-2), "🔮 LA MACHINE À SONS TOURNE À PLEIN RÉGIME..."]);
        } else if (progress < 0.7) {
          setDrawMessages(prev => [...prev.slice(-2), "⚡ L'ÉNERGIE MONTE DANS LA SALLE !"]);
        } else if (progress < 0.75) {
          setDrawMessages(prev => [...prev.slice(-2), "💫 LES CHIFFRES DANSENT SOUS NOS YEUX..."]);
        } else if (progress < 0.8) {
          setDrawMessages(prev => [...prev.slice(-2), "🎯 DERNIÈRE LIGNE DROITE AVANT LA VICTOIRE !"]);
        } else if (progress < 0.85) {
          setDrawMessages(prev => [...prev.slice(-2), "🔥 LA CHALEUR MONTE, LE SUSPENSE EST À SON COMBLE..."]);
        } else if (progress < 0.9) {
          setDrawMessages(prev => [...prev.slice(-2), "🎭 PLUS QUE QUELQUES INSTANTS AVANT LE GRAND MOMENT..."]);
        } else if (progress < 0.95) {
          setDrawMessages(prev => [...prev.slice(-2), "⏰ COMPTE À REBOURS FINAL !"]);
        } else {
          setDrawMessages(prev => [...prev.slice(-2), "🎉 PRÉPAREZ-VOUS ! LES RÉSULTATS VONT APPARAÎTRE !"]);
        }
        
        if (elapsed < totalDuration) {
          setTimeout(animate, speed);
        } else {
          // Effet final spectaculaire
          setCurrentNumbers(['✨✨', '✨✨', '✨✨', '✨✨', '✨✨', '✨✨']);
          
          // Pause dramatique
          setTimeout(() => {
            setCurrentNumbers(['⚡⚡', '⚡⚡', '⚡⚡', '⚡⚡', '⚡⚡', '⚡⚡']);
            
            setTimeout(() => {
              setDrawStep(2);
              fetchWinners();
            }, 1500);
          }, 1000);
        }
      };
      
      animate();
    }
  }, [drawStep]);

  // Récupérer les gagnants
  const fetchWinners = useCallback(async () => {
    setLoadingResults(true);
    try {
      const { data, error } = await supabase
        .from('raffle_tickets')
        .select(`
          rank,
          ticket_number,
          user_id,
          profiles:user_id (
            id,
            full_name,
            username,
            avatar_url
          )
        `)
        .eq('raffle_event_id', raffleId)
        .not('rank', 'is', null)
        .order('rank', { ascending: true });

      if (error) throw error;

      const validatedWinners = (data || [])
        .filter(ticket => ticket.rank !== null && ticket.rank !== undefined)
        .map(ticket => ({
          ...ticket,
          rank: Number(ticket.rank)
        }))
        .sort((a, b) => a.rank - b.rank);

      const winnersMap = new Map();
      
      validatedWinners.forEach(ticket => {
        const userId = ticket.user_id;
        const currentBest = winnersMap.get(userId);
        
        if (!currentBest || ticket.rank < currentBest.rank) {
          winnersMap.set(userId, ticket);
        }
      });

      const sortedWinners = Array.from(winnersMap.values())
        .sort((a, b) => a.rank - b.rank);

      setWinners(sortedWinners);
      setShowResults(true);
      
      toast({
        title: "🎉 RÉSULTATS DISPONIBLES !",
        description: "Les gagnants du tirage ont été révélés !",
        duration: 5000,
        className: "bg-gradient-to-r from-yellow-600 to-orange-600 text-white"
      });
      
      if (onDrawComplete) {
        onDrawComplete();
      }
    } catch (err) {
      console.error("Erreur lors de la récupération des gagnants:", err);
      toast({
        title: "Erreur",
        description: "Impossible de récupérer les résultats du tirage",
        variant: "destructive"
      });
    } finally {
      setLoadingResults(false);
    }
  }, [raffleId, onDrawComplete, toast]);

  // Simulation du processus de tirage
  useEffect(() => {
    if (drawStep === 0) {
      const messages = [
        "🎲 PRÉPARATION DU TIRAGE SPECTACULAIRE...",
        "🔢 VÉRIFICATION DE L'INTÉGRITÉ DES TICKETS...",
        "✨ ACTIVATION DU SYSTÈME ALÉATOIRE HAUTE SÉCURITÉ...",
        "⚡ CONNEXION AU GÉNÉRATEUR QUANTIQUE...",
        "🎯 LE TIRAGE VA COMMENCER DANS QUELQUES INSTANTS...",
        "🔥 LA TENSION MONTE ! PRÊTS POUR L'EXPÉRIENCE ?",
        "⏰ DURÉE DE L'ANIMATION : 30 SECONDES DE SUSPENSE !"
      ];
      
      let i = 0;
      const interval = setInterval(() => {
        if (i < messages.length) {
          setDrawMessages(prev => [...prev.slice(-2), messages[i]]);
          i++;
        } else {
          clearInterval(interval);
          setDrawStep(1);
        }
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [drawStep]);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto transition-all duration-300 ${shakeEffect ? 'animate-shake' : ''}`}
         style={{ background: `rgba(0,0,0,${0.9 + intensity/500})` }}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 15 }}
        className="w-full max-w-6xl relative"
      >
        <Button 
          onClick={onClose} 
          variant="ghost" 
          size="sm"
          className="absolute -top-10 right-0 text-white hover:bg-white/20 z-10"
        >
          <X className="w-5 h-5" />
        </Button>

        <Card className={`border-4 border-yellow-500 bg-gradient-to-br ${colorFlash} via-purple-900 to-black text-white shadow-2xl overflow-hidden transition-all duration-300`}
              style={{ boxShadow: `0 0 ${50 + intensity}px rgba(234,179,8,${0.3 + intensity/200})` }}>
          
          {/* Effet de particules */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(Math.floor(10 + intensity/5))].map((_, i) => (
              <motion.div
                key={i}
                animate={{ 
                  y: [Math.random() * 200, -200],
                  x: [Math.random() * 200, Math.random() * 200 - 100],
                  rotate: [0, 360],
                  opacity: [0, 1, 0]
                }}
                transition={{ 
                  duration: 2 + Math.random() * 3,
                  repeat: Infinity,
                  delay: Math.random() * 2
                }}
                className="absolute w-1 h-1 bg-yellow-400 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
              />
            ))}
          </div>

          <div className="text-center py-6 border-b border-white/10 relative overflow-hidden">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="absolute top-4 left-4"
            >
              <Sparkles className={`w-6 h-6 text-yellow-400 ${drawStep === 1 ? 'animate-spin-slow' : ''}`} />
            </motion.div>
            
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity, delay: 0.3 }}
              className="absolute top-4 right-4"
            >
              <Sparkles className={`w-6 h-6 text-yellow-400 ${drawStep === 1 ? 'animate-spin-slow' : ''}`} />
            </motion.div>

            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
            
            <h2 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-600 uppercase tracking-widest relative z-10">
              {showResults ? "🎉 RÉSULTATS OFFICIELS 🎉" : "🎯 TIRAGE EN DIRECT 🎯"}
            </h2>
            
            {eventTitle && (
              <motion.p 
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-lg sm:text-xl text-gray-300 mt-2 relative z-10"
              >
                {eventTitle}
              </motion.p>
            )}
            
            {!showResults && (
              <motion.p 
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-sm text-yellow-400 mt-2 font-bold relative z-10"
              >
                {drawStep === 0 ? "Préparation en cours..." : 
                 finalStage ? "🔮 MOMENT CRUCIAL - DERNIÈRES SECONDES 🔮" : 
                 "⚡ 30 SECONDES DE SUSPENSE - TENSION MAXIMUM ⚡"}
              </motion.p>
            )}
          </div>

          <CardContent className="p-4 sm:p-6">
            {!showResults ? (
              <div className="flex flex-col items-center justify-center space-y-6 sm:space-y-8 py-6 sm:py-10">
                {/* Messages d'ambiance */}
                <div className="h-20 flex items-center justify-center w-full">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={drawMessages[drawMessages.length - 1]}
                      initial={{ opacity: 0, y: 20, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 1.2 }}
                      transition={{ type: "spring", damping: 12 }}
                      className="text-center"
                    >
                      <motion.p 
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="text-xl sm:text-2xl font-bold text-blue-200 mb-2"
                      >
                        {drawStep === 0 ? "Préparation du tirage" : 
                         finalStage ? "🔥 DERNIÈRES SECONDES 🔥" : 
                         "🎲 TIRAGE EN COURS !"}
                      </motion.p>
                      <p className="text-lg sm:text-xl text-yellow-300 animate-pulse font-mono">
                        {drawMessages[drawMessages.length - 1]}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Compte à rebours principal */}
                {drawStep === 1 && (
                  <div className="w-full max-w-md mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-yellow-400">⏱️ TEMPS RESTANT</span>
                      <span className="text-2xl font-bold text-white font-mono">{timeLeft}s</span>
                    </div>
                    <Progress 
                      value={(30 - timeLeft) * 4} 
                      className="h-3 bg-gray-800"
                      style={{ 
                        background: 'linear-gradient(90deg, #3b82f6, #eab308, #ef4444)'
                      }}
                    />
                  </div>
                )}

                {/* Jauge d'intensité */}
                {drawStep === 1 && (
                  <div className="w-full max-w-md">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-green-400">⚡ DÉBUT</span>
                      <span className="text-yellow-400">⚡ SUSPENSE</span>
                      <span className="text-red-400">⚡ EXPLOSION</span>
                    </div>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                        initial={{ width: "0%" }}
                        animate={{ width: `${intensity}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                  </div>
                )}

                {/* Numéros qui défilent */}
                {drawStep === 1 && (
                  <div className="relative py-4 sm:py-8 w-full">
                    {/* Effets sonores visuels */}
                    <div className="flex flex-wrap justify-center gap-2 mb-4">
                      {['🎵', '🎶', '🔊', '📢', '🎤', '🎧', '⚡', '🔥', '💥', '✨'].map((emoji, i) => (
                        <motion.span
                          key={i}
                          animate={{ 
                            scale: [1, 1.5, 1],
                            rotate: [0, 360],
                            y: [0, -10, 0]
                          }}
                          transition={{ 
                            duration: 0.5,
                            repeat: Infinity,
                            delay: i * 0.1,
                            ease: "easeInOut"
                          }}
                          className="text-2xl sm:text-3xl"
                          style={{ filter: `hue-rotate(${intensity * 3.6}deg)` }}
                        >
                          {emoji}
                        </motion.span>
                      ))}
                    </div>
                    
                    {/* Numéros */}
                    <div className="relative perspective-1000">
                      <div className="flex flex-wrap gap-2 sm:gap-4 justify-center items-center transform-gpu">
                        {currentNumbers.map((num, index) => (
                          <motion.div
                            key={index}
                            animate={{ 
                              scale: [1, 1.2, 1],
                              rotateY: [0, 360],
                              rotateX: [0, finalStage ? 180 : 360],
                              y: [0, -10, 0]
                            }}
                            transition={{ 
                              duration: finalStage ? 0.3 : 0.5,
                              repeat: Infinity,
                              ease: "linear"
                            }}
                            className="relative"
                            style={{ 
                              filter: `drop-shadow(0 0 ${10 + intensity}px rgba(234,179,8,${0.3 + intensity/200}))`,
                              transformStyle: "preserve-3d"
                            }}
                          >
                            <div className={`w-20 h-24 sm:w-24 sm:h-28 bg-gradient-to-br ${
                              index % 2 === 0 ? 'from-purple-900' : 'from-blue-900'
                            } to-black rounded-xl border-2 border-yellow-500/70 flex items-center justify-center overflow-hidden group`}>
                              
                              <motion.div 
                                className="absolute inset-0 bg-gradient-to-t from-transparent via-yellow-500/20 to-transparent"
                                animate={{ y: ['-100%', '200%'] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              />
                              
                              <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent"
                              />
                              
                              <motion.span 
                                animate={{ 
                                  textShadow: [
                                    `0 0 5px rgba(234,179,8,${0.5})`,
                                    `0 0 20px rgba(234,179,8,${0.8})`,
                                    `0 0 5px rgba(234,179,8,${0.5})`
                                  ]
                                }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className="text-3xl sm:text-4xl font-mono font-bold text-yellow-300 tabular-nums relative z-10"
                              >
                                {num}
                              </motion.span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      
                      <motion.div 
                        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 text-center pointer-events-none"
                        animate={{ 
                          scale: [1, 1.2, 1],
                          opacity: [0.7, 1, 0.7]
                        }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      >
                        <div className={`text-4xl sm:text-6xl font-bold ${
                          finalStage ? 'text-red-500' : 'text-yellow-500'
                        } opacity-20 whitespace-nowrap`}>
                          {finalStage ? '⚡⚡⚡' : '🎰🎰🎰'}
                        </div>
                      </motion.div>
                    </div>
                  </div>
                )}

                {/* Progression */}
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-sm text-gray-400 mt-2 font-mono">
                    <motion.span animate={{ color: intensity > 30 ? '#ff0' : '#fff' }}>
                      ⏳ Préparation
                    </motion.span>
                    <motion.span animate={{ color: intensity > 60 ? '#f00' : intensity > 30 ? '#ff0' : '#fff' }}>
                      🔥 Tirage (30s)
                    </motion.span>
                    <motion.span animate={{ color: intensity > 90 ? '#0f0' : '#fff' }}>
                      🎉 Résultats
                    </motion.span>
                  </div>
                </div>

                {drawStep === 0 && (
                  <div className="text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-16 h-16 text-yellow-500 mx-auto" />
                    </motion.div>
                    <p className="text-sm text-gray-400 mt-4 font-mono animate-pulse">
                      Préparation du tirage de 30 secondes...
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // SECTION RÉSULTATS
              <div className="space-y-6 sm:space-y-8">
                {loadingResults ? (
                  <div className="text-center py-8 sm:py-12">
                    <Loader2 className="w-16 h-16 text-yellow-500 animate-spin mx-auto" />
                    <p className="text-xl text-gray-300 mt-4">Chargement des résultats...</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-3">
                      <motion.h3
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                        className="text-2xl sm:text-3xl font-bold text-yellow-400"
                      >
                        FÉLICITATIONS AUX GAGNANTS ! 🎊
                      </motion.h3>
                      <p className="text-gray-300 text-lg">
                        Voici le classement officiel certifié par le système.
                      </p>
                    </div>

                    <div className="mt-6 sm:mt-8">
                      <h4 className="text-xl sm:text-2xl font-bold text-center text-yellow-300 mb-6">
                        🏆 P O D I U M 🏆
                      </h4>
                      <Podium winners={winners} />
                    </div>

                    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden mt-6 sm:mt-8">
                      <div className="p-4 bg-black/30 border-b border-white/10">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Award className="w-5 h-5 text-yellow-400" />
                            <h4 className="font-bold text-lg text-white">Classement Complet</h4>
                          </div>
                          <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                            {winners.length} Gagnants
                          </Badge>
                        </div>
                      </div>

                      <div className="p-4 sm:p-6">
                        <WinnersList winners={winners} currentUserId={user?.id} />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4">
                      <Button
                        onClick={() => {
                          const text = `🎉 J'ai participé au tirage "${eventTitle}" ! Découvrez les résultats ici !`;
                          const url = window.location.href;
                          navigator.clipboard.writeText(`${text} ${url}`);
                          toast({
                            title: "Lien copié !",
                            description: "Le lien des résultats a été copié",
                          });
                        }}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Partager
                      </Button>
                      
                      <Button
                        onClick={onClose}
                        variant="outline"
                        className="border-gray-600 text-gray-300"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Fermer
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

// Dans RaffleDrawSystem.jsx, remplacer la partie où vous utilisez isLiveBroadcast par ceci :

const RaffleDrawSystem = ({ raffleData, eventData, isOrganizer, onDrawComplete, isGoalReached, minTicketsRequired, stats, userProfile }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLiveBroadcast, setIsLiveBroadcast] = useState(false);
    const [isLaunching, setIsLaunching] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false);
    const [showResultsView, setShowResultsView] = useState(false);
    const [winners, setWinners] = useState([]);
    const [loadingWinners, setLoadingWinners] = useState(false);
    const [userTickets, setUserTickets] = useState([]);
    const [loadingUserTickets, setLoadingUserTickets] = useState(false);
    
    // État pour suivre si le tirage est en cours (partagé via Supabase)
    const [drawStatus, setDrawStatus] = useState({
        is_active: false,
        started_at: null,
        broadcast_id: null
    });

    // Charger les tickets de l'utilisateur connecté
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

    // Écouter les changements de statut du tirage en temps réel
    useEffect(() => {
        if (!raffleData?.id) return;

        // Créer un canal unique pour ce tirage
        const channel = supabase
            .channel(`raffle-draw-${raffleData.id}`)
            .on('broadcast', { event: 'draw_started' }, (payload) => {
                console.log('🎲 Tirage démarré!', payload);
                setIsLiveBroadcast(true);
                setDrawStatus({
                    is_active: true,
                    started_at: payload.payload.started_at,
                    broadcast_id: payload.payload.broadcast_id
                });
                
                // Notification pour tous les participants
                toast({
                    title: "🎯 TIRAGE EN DIRECT !",
                    description: "Le tirage au sort a commencé ! Suivez l'animation en direct.",
                    duration: 5000,
                    className: "bg-gradient-to-r from-yellow-600 to-orange-600 text-white"
                });
            })
            .on('broadcast', { event: 'draw_ended' }, (payload) => {
                console.log('🏁 Tirage terminé!', payload);
                setIsLiveBroadcast(false);
                setDrawStatus({
                    is_active: false,
                    started_at: null,
                    broadcast_id: null
                });
                
                // Si les résultats sont inclus, les afficher
                if (payload.payload.results) {
                    setWinners(payload.payload.results);
                    setShowResultsView(true);
                }
                
                if (onDrawComplete) onDrawComplete();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [raffleData?.id, onDrawComplete, toast]);

    // Vérifier si le tirage est actif au chargement initial
    useEffect(() => {
        const checkDrawStatus = async () => {
            try {
                // Vérifier dans une table de statut des tirages (à créer si besoin)
                const { data, error } = await supabase
                    .from('raffle_draw_status')
                    .select('*')
                    .eq('raffle_event_id', raffleData?.id)
                    .eq('is_active', true)
                    .maybeSingle();

                if (data) {
                    setIsLiveBroadcast(true);
                    setDrawStatus({
                        is_active: true,
                        started_at: data.started_at,
                        broadcast_id: data.broadcast_id
                    });
                }
            } catch (err) {
                console.error("Erreur vérification statut tirage:", err);
            }
        };

        if (raffleData?.id && raffleData.status !== 'completed') {
            checkDrawStatus();
        }
    }, [raffleData?.id, raffleData?.status]);

    // Charger les gagnants si le tirage est déjà terminé
    useEffect(() => {
        if (raffleData?.status === 'completed') {
            fetchWinners();
        }
    }, [raffleData]);

    // Calculer si le tirage peut être lancé
    const canLaunchDraw = useMemo(() => {
        if (!raffleData) return false;
        
        if (raffleData.status === 'completed') return false;
        
        const ticketsSold = stats?.totalTickets || raffleData.tickets_sold || 0;
        const hasTickets = ticketsSold > 0;
        
        const now = new Date();
        const endDateStr = raffleData.event_end_at || raffleData.closing_date;
        const endDate = endDateStr ? new Date(endDateStr) : null;
        const isDatePassed = endDate && now >= endDate;
        
        return hasTickets && (isGoalReached || isDatePassed);
    }, [raffleData, isGoalReached, stats]);

    // Obtenir les informations sur l'état du tirage
    const getDrawStatusInfo = useMemo(() => {
        if (!raffleData) return null;
        
        if (raffleData.status === 'completed') {
            return {
                status: 'completed',
                message: 'Le tirage a été effectué avec succès',
                color: 'green',
                icon: <CheckCircle className="w-5 h-5" />
            };
        }
        
        if (canLaunchDraw) {
            return {
                status: 'ready',
                message: 'Prêt à lancer le tirage !',
                color: 'green',
                icon: <Target className="w-5 h-5" />
            };
        }
        
        const now = new Date();
        const endDateStr = raffleData.event_end_at || raffleData.closing_date;
        const endDate = endDateStr ? new Date(endDateStr) : null;
        const isDatePassed = endDate && now >= endDate;
        
        if (isDatePassed) {
            return {
                status: 'date-passed',
                message: 'Date limite dépassée',
                color: 'orange',
                icon: <Calendar className="w-5 h-5" />
            };
        }
        
        return {
            status: 'waiting',
            message: 'En attente des conditions',
            color: 'blue',
            icon: <Loader2 className="w-5 h-5 animate-spin" />
        };
    }, [raffleData, canLaunchDraw]);

    // Récupérer les gagnants
    const fetchWinners = async () => {
        if (!raffleData?.id) return;
        
        setLoadingWinners(true);
        try {
            const { data, error } = await supabase
                .from('raffle_tickets')
                .select(`
                    rank,
                    ticket_number,
                    user_id,
                    profiles:user_id (
                        id,
                        full_name,
                        username,
                        avatar_url
                    )
                `)
                .eq('raffle_event_id', raffleData.id)
                .not('rank', 'is', null)
                .order('rank', { ascending: true });

            if (error) throw error;

            // Valider et trier les gagnants
            const validatedWinners = (data || [])
                .filter(ticket => ticket.rank !== null && ticket.rank !== undefined)
                .map(ticket => ({
                    ...ticket,
                    rank: Number(ticket.rank)
                }))
                .sort((a, b) => a.rank - b.rank);

            // Grouper par utilisateur pour éviter les doublons
            const winnersMap = new Map();
            
            validatedWinners.forEach(ticket => {
                const userId = ticket.user_id;
                const currentBest = winnersMap.get(userId);
                
                if (!currentBest || ticket.rank < currentBest.rank) {
                    winnersMap.set(userId, ticket);
                }
            });

            // Convertir en tableau et réindexer les rangs
            let sortedWinners = Array.from(winnersMap.values())
                .sort((a, b) => a.rank - b.rank);
            
            // Réindexer les rangs pour avoir une séquence continue
            sortedWinners = sortedWinners.map((winner, index) => ({
                ...winner,
                displayRank: index + 1 // 1er, 2ème, 3ème, 4ème, etc.
            }));

            console.log('🏆 Gagnants avec rang corrigé:', sortedWinners.map(w => ({ 
                displayRank: w.displayRank, 
                originalRank: w.rank,
                name: w.profiles?.full_name 
            })));

            setWinners(sortedWinners);
            setShowResultsView(true);
        } catch (err) {
            console.error("Erreur lors de la récupération des gagnants:", err);
            toast({
                title: "Erreur",
                description: "Impossible de charger les résultats",
                variant: "destructive"
            });
        } finally {
            setLoadingWinners(false);
        }
    };

    // Lancer le tirage (organisateur seulement)
    const handleLaunchDraw = async () => {
        if (!isOrganizer || !canLaunchDraw) return;
        
        setIsLaunching(true);
        
        try {
            // Générer un ID unique pour cette diffusion
            const broadcastId = `draw-${raffleData.id}-${Date.now()}`;
            
            // Diffuser le début du tirage à tous les participants via Realtime
            const channel = supabase.channel(`raffle-draw-${raffleData.id}`);
            await channel.send({
                type: 'broadcast',
                event: 'draw_started',
                payload: {
                    started_at: new Date().toISOString(),
                    broadcast_id: broadcastId
                }
            });

            // Lancer le tirage via RPC
            const { data, error } = await supabase.rpc('conduct_raffle_draw', { 
                p_raffle_event_id: raffleData.id 
            });
            
            if (error) throw error;
            
            if (data && data.success) {
                // Récupérer les résultats
                const winners = await fetchWinnersForBroadcast(raffleData.id);
                
                // Diffuser la fin du tirage avec les résultats
                await channel.send({
                    type: 'broadcast',
                    event: 'draw_ended',
                    payload: {
                        ended_at: new Date().toISOString(),
                        results: winners
                    }
                });

                toast({
                    title: "🎉 Tirage terminé !",
                    description: "Les résultats sont maintenant disponibles pour tous.",
                    duration: 5000,
                    className: "bg-gradient-to-r from-green-600 to-emerald-600 text-white"
                });
                
                if (onDrawComplete) {
                    onDrawComplete();
                }
            } else {
                throw new Error(data?.message || "Échec du lancement du tirage");
            }
        } catch (error) {
            console.error("Erreur lors du lancement du tirage:", error);
            toast({
                title: "❌ Erreur",
                description: error.message || "Impossible de lancer le tirage",
                variant: "destructive"
            });
        } finally {
            setIsLaunching(false);
            setShowFinalConfirmDialog(false);
            setIsLiveBroadcast(false);
        }
    };

    // Fonction helper pour récupérer les gagnants pour la diffusion
    const fetchWinnersForBroadcast = async (raffleId) => {
        try {
            const { data, error } = await supabase
                .from('raffle_tickets')
                .select(`
                    rank,
                    ticket_number,
                    user_id,
                    profiles:user_id (
                        id,
                        full_name,
                        username,
                        avatar_url
                    )
                `)
                .eq('raffle_event_id', raffleId)
                .not('rank', 'is', null)
                .order('rank', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Erreur récupération gagnants:", err);
            return [];
        }
    };

    const handleStartConfirmation = () => {
        setShowConfirmDialog(true);
    };

    const handleFinalConfirmation = () => {
        setShowConfirmDialog(false);
        setShowFinalConfirmDialog(true);
    };

    const handleViewResults = () => {
        if (raffleData.status === 'completed') {
            setShowResultsView(true);
        }
    };

    const handleCloseResults = () => {
        setShowResultsView(false);
    };

    const pricePerTicket = raffleData?.calculated_price_pi || 1;
    const userTicketValue = userTickets.reduce((sum, ticket) => sum + (ticket.purchase_price_pi || pricePerTicket), 0);

    return (
        <>
            {/* Diffusion en direct - visible par TOUS si isLiveBroadcast est true */}
            {(isLiveBroadcast || drawStatus.is_active) && (
                <LiveDrawBroadcast 
                    raffleId={raffleData.id} 
                    eventTitle={eventData?.title || "Tombola"}
                    onClose={() => {
                        setIsLiveBroadcast(false);
                        // Ne pas fermer pour l'organisateur si le tirage est encore actif
                        if (isOrganizer && raffleData.status !== 'completed') {
                            // Garder ouvert
                        }
                    }}
                    onDrawComplete={() => {
                        if (onDrawComplete) onDrawComplete();
                    }}
                    isOrganizer={isOrganizer}
                />
            )}
            
            {/* Dialogs de confirmation (uniquement pour l'organisateur) */}
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <DialogContent className="sm:max-w-md border-2 border-yellow-500/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-yellow-500">
                            <AlertTriangle className="w-5 h-5" />
                            Confirmation du lancement
                        </DialogTitle>
                        <DialogDescription className="text-gray-300">
                            Vous êtes sur le point de lancer le tirage au sort.
                            Cette action est <span className="font-bold text-red-400">irréversible</span>.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                <div>
                                    <h4 className="font-semibold text-yellow-400">À vérifier avant de continuer :</h4>
                                    <ul className="mt-2 space-y-2 text-sm text-gray-300">
                                        <li className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-500" />
                                            Tous les participants verront l'animation en direct
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-500" />
                                            Le tirage sera diffusé à tous simultanément
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-500" />
                                            Êtes-vous sûr de vouloir procéder maintenant ?
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-center">
                            <p className="text-sm text-gray-400">
                                Tickets vendus : <span className="font-bold text-white">{stats?.totalTickets || raffleData.tickets_sold || 0}</span>
                            </p>
                            <p className="text-xs text-green-400 mt-2">
                                ✓ L'animation sera visible par tous les participants
                            </p>
                        </div>
                    </div>
                    
                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirmDialog(false)}
                            className="w-full sm:w-auto"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleFinalConfirmation}
                            className="w-full sm:w-auto bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            Je confirme, continuer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
       

<AlertDialog open={showFinalConfirmDialog} onOpenChange={setShowFinalConfirmDialog}>
    <AlertDialogContent className="border-2 border-red-500/50">
        <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-6 h-6" />
                DERNIÈRE CONFIRMATION REQUISE
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
                <div className="space-y-3">
                    {/* Utiliser des divs au lieu de p pour éviter l'imbrication */}
                    <div className="font-bold text-red-300">
                        ⚠️ CETTE ACTION EST DÉFINITIVE ET SERA VISIBLE PAR TOUS !
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <div className="text-sm">
                            Le tirage sera lancé immédiatement et <span className="font-bold text-yellow-400">TOUS LES PARTICIPANTS</span>{' '}
                            verront le déroulement en direct sur leur écran.
                        </div>
                    </div>
                    <div>
                        <span className="font-bold">Veuillez confirmer une dernière fois :</span>
                        {' '}Êtes-vous ABSOLUMENT certain de vouloir lancer le tirage maintenant ?
                    </div>
                </div>
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700">
                Non, annuler
            </AlertDialogCancel>
            <AlertDialogAction
                onClick={handleLaunchDraw}
                disabled={isLaunching}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
            >
                {isLaunching ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Lancement en cours...
                    </>
                ) : (
                    <>
                        <Shuffle className="w-4 h-4 mr-2" />
                        OUI, LANCER LE TIRAGE
                    </>
                )}
            </AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
            {/* Modal des résultats (visible par tous) */}
            {showResultsView && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 overflow-y-auto">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-full max-w-6xl relative"
                    >
                        <Button 
                            onClick={handleCloseResults} 
                            variant="ghost" 
                            size="sm"
                            className="absolute -top-10 right-0 text-white hover:bg-white/20"
                        >
                            <X className="w-5 h-5" />
                        </Button>

                        <Card className="border-4 border-yellow-500 bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white shadow-2xl overflow-hidden">
                            <div className="text-center py-6 border-b border-white/10 relative overflow-hidden">
                                <Sparkles className="absolute top-4 left-4 text-yellow-400 w-6 h-6 animate-spin-slow" />
                                <Sparkles className="absolute top-4 right-4 text-yellow-400 w-6 h-6 animate-spin-slow" />
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent animate-shimmer"></div>
                                
                                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-600 uppercase tracking-widest">
                                    🎉 RÉSULTATS OFFICIELS 🎉
                                </h2>
                                {eventData?.title && (
                                    <p className="text-lg text-gray-300 mt-2">{eventData.title}</p>
                                )}
                                <p className="text-sm text-gray-400 mt-1">
                                    Tirage effectué le {new Date().toLocaleDateString('fr-FR')}
                                </p>
                            </div>

                            <CardContent className="p-4 sm:p-6">
                                {loadingWinners ? (
                                    <div className="text-center py-12">
                                        <Loader2 className="w-16 h-16 text-yellow-500 animate-spin mx-auto" />
                                        <p className="text-xl text-gray-300 mt-4">Chargement des résultats...</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-center space-y-3 mb-6 sm:mb-8">
                                            <h3 className="text-2xl sm:text-3xl font-bold text-yellow-400">
                                                FÉLICITATIONS AUX GAGNANTS ! 🎊
                                            </h3>
                                            <p className="text-gray-300 text-lg">
                                                Voici le classement officiel certifié par le système.
                                            </p>
                                        </div>

                                        <div className="mt-6 sm:mt-8">
                                            <h4 className="text-xl sm:text-2xl font-bold text-center text-yellow-300 mb-6">
                                                🏆 P O D I U M 🏆
                                            </h4>
                                            <Podium winners={winners} />
                                        </div>

                                        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden mt-6 sm:mt-8">
                                            <div className="p-4 bg-black/30 border-b border-white/10">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <Award className="w-5 h-5 text-yellow-400" />
                                                        <h4 className="font-bold text-lg text-white">Classement Complet</h4>
                                                    </div>
                                                    <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                                                        {winners.length} Gagnants
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="p-4 sm:p-6">
                                                <WinnersList winners={winners} currentUserId={user?.id} />
                                            </div>

                                            <div className="p-4 bg-black/20 border-t border-white/10 text-center">
                                                <p className="text-sm text-gray-400">
                                                    <Gift className="w-4 h-4 inline mr-1" />
                                                   🎉 Tirage effectué ! Bravo aux gagnants 🎁 Merci à tous — restez connectés, de nouvelles chances arrivent très vite !
                                                </p>
                                            </div>
                                        </div>

                                        {/* Boutons d'action */}
                                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-6 sm:pt-8">
                                            <Button
                                                onClick={() => {
                                                    const text = `🎉 J'ai participé au tirage "${eventData?.title || 'Tombola'}" ! Découvrez les résultats ici !`;
                                                    const url = window.location.href;
                                                    navigator.clipboard.writeText(`${text} ${url}`);
                                                    toast({
                                                        title: "Lien copié !",
                                                        description: "Le lien des résultats a été copié dans le presse-papier",
                                                    });
                                                }}
                                                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                                                size="sm"
                                            >
                                                <Share2 className="w-4 h-4 mr-2" />
                                                Partager les résultats
                                            </Button>
                                            
                                            <Button
                                                onClick={handleCloseResults}
                                                variant="outline"
                                                className="border-gray-600 text-gray-300 hover:bg-gray-800/50"
                                                size="sm"
                                            >
                                                <X className="w-4 h-4 mr-2" />
                                                Retour à l'événement
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            )}
            
            {/* Interface organisateur */}
            {isOrganizer ? (
                <Card className={`border-2 transition-all duration-300 ${
                    canLaunchDraw 
                        ? 'border-green-500/50 bg-gradient-to-br from-green-900/20 to-emerald-900/10' 
                        : 'border-yellow-500/30 bg-gradient-to-br from-yellow-900/10 to-amber-900/5'
                } shadow-xl`}>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <Crown className={`w-6 h-6 ${
                                    canLaunchDraw ? 'text-green-400' : 'text-yellow-500'
                                }`} />
                                <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                                    Zone Organisateur - Contrôle du tirage
                                </span>
                            </div>
                            {getDrawStatusInfo && (
                                <Badge className={`px-3 py-1 ${
                                    getDrawStatusInfo.color === 'green' 
                                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                        : getDrawStatusInfo.color === 'orange'
                                        ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                        : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                }`}>
                                    {getDrawStatusInfo.status === 'completed' ? 'Terminé' : 
                                     getDrawStatusInfo.status === 'ready' ? 'Prêt' : 
                                     getDrawStatusInfo.status === 'date-passed' ? 'Date Dépassée' : 'En Attente'}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-gray-400">
                            Gestion et lancement du tirage au sort sécurisé
                        </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="space-y-6">
                        {getDrawStatusInfo && (
                            <div className={`p-4 rounded-xl border ${
                                getDrawStatusInfo.color === 'green' 
                                    ? 'bg-green-900/30 border-green-700/50' 
                                    : getDrawStatusInfo.color === 'orange'
                                    ? 'bg-orange-900/30 border-orange-700/50'
                                    : 'bg-blue-900/30 border-blue-700/50'
                            }`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`p-2 rounded-lg ${
                                        getDrawStatusInfo.color === 'green' ? 'bg-green-800/50' :
                                        getDrawStatusInfo.color === 'orange' ? 'bg-orange-800/50' :
                                        'bg-blue-800/50'
                                    }`}>
                                        {getDrawStatusInfo.icon}
                                    </div>
                                    <div>
                                        <p className={`font-bold text-lg ${
                                            getDrawStatusInfo.color === 'green' ? 'text-green-300' :
                                            getDrawStatusInfo.color === 'orange' ? 'text-orange-300' :
                                            'text-blue-300'
                                        }`}>
                                            {getDrawStatusInfo.message}
                                        </p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            {raffleData.status === 'completed' 
                                                ? 'Les résultats sont disponibles pour tous les participants.'
                                                : 'Seul l\'organisateur peut lancer le tirage.'}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* STATISTIQUES ORGANISATEUR */}
                                <div className="mt-4 grid grid-cols-2 gap-4">
                                    <div className="bg-black/30 p-3 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Users className="w-4 h-4 text-blue-400" />
                                            <span className="text-xs text-gray-400">Total tickets vendus</span>
                                        </div>
                                        <div className="text-2xl font-bold text-white">
                                            {stats?.totalTickets || raffleData.tickets_sold || 0}
                                        </div>
                                    
                                    </div>
                                    
                                    <div className="bg-black/30 p-3 rounded-lg">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Target className="w-4 h-4 text-purple-400" />
                                            <span className="text-xs text-gray-400">Objectif</span>
                                        </div>
                                        <div className={`text-xl font-bold ${
                                            isGoalReached ? 'text-green-400' : 'text-yellow-400'
                                        }`}>
                                            {isGoalReached ? 'ATTEINT ✅' : 'EN COURS'}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {minTicketsRequired > 0 
                                                ? `${stats?.totalTickets || raffleData.tickets_sold || 0}/${minTicketsRequired}`
                                                : 'Pas d\'objectif'}
                                        </div>
                                    </div>
                                </div>

                                {/* Message d'info sur la diffusion */}
                                {canLaunchDraw && (
                                    <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                                        <p className="text-sm text-blue-300 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4" />
                                            En lançant le tirage, tous les participants verront l'animation en direct sur leur écran.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Bouton d'action principal */}
                        {raffleData.status !== 'completed' ? (
                            <div className="space-y-4">
                                {canLaunchDraw ? (
                                    <motion.div
                                        initial={{ scale: 0.95 }}
                                        animate={{ scale: 1 }}
                                        whileHover={{ scale: 1.02 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 10 }}
                                    >
                                        <Button 
                                            onClick={handleStartConfirmation}
                                            disabled={isLaunching || isLiveBroadcast}
                                            className="w-full h-16 text-xl font-bold bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-700 hover:via-emerald-600 hover:to-green-700 text-white shadow-2xl shadow-green-500/30 transition-all duration-300 relative overflow-hidden group"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                            
                                            <Shuffle className="w-6 h-6 mr-3" />
                                            {isLiveBroadcast ? 'TIRAGE EN COURS...' : 'LANCER LE TIRAGE AU SORT'}
                                        </Button>
                                        
                                        <p className="text-center text-sm text-green-400/70 mt-2">
                                            Le tirage sera diffusé en direct à tous les participants
                                        </p>
                                    </motion.div>
                                ) : (
                                    <div className="p-6 bg-gradient-to-r from-yellow-900/20 to-amber-900/10 rounded-xl border border-yellow-500/30 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <Target className="w-10 h-10 text-yellow-500" />
                                            <div>
                                                <p className="font-bold text-yellow-300 text-lg mb-1">
                                                    Conditions requises manquantes
                                                </p>
                                                <p className="text-yellow-200/70 text-sm">
                                                    Pour lancer le tirage, vous avez besoin :
                                                </p>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-md mt-2">
                                                <div className={`p-3 rounded-lg border ${
                                                    (stats?.totalTickets || raffleData.tickets_sold || 0) > 0 
                                                        ? 'bg-green-900/20 border-green-500/30' 
                                                        : 'bg-red-900/20 border-red-500/30'
                                                }`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm">Au moins 1 ticket</span>
                                                        {(stats?.totalTickets || raffleData.tickets_sold || 0) > 0 ? (
                                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                                        ) : (
                                                            <X className="w-4 h-4 text-red-400" />
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        {stats?.totalTickets || raffleData.tickets_sold || 0} vendu(s)
                                                    </div>
                                                </div>
                                                
                                                <div className={`p-3 rounded-lg border ${
                                                    isGoalReached 
                                                        ? 'bg-green-900/20 border-green-500/30' 
                                                        : 'bg-yellow-900/20 border-yellow-500/30'
                                                }`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm">Objectif atteint</span>
                                                        {isGoalReached ? (
                                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                                        ) : minTicketsRequired > 0 ? (
                                                            <Target className="w-4 h-4 text-yellow-400" />
                                                        ) : (
                                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-1">
                                                        {minTicketsRequired > 0 
                                                            ? `${stats?.totalTickets || raffleData.tickets_sold || 0}/${minTicketsRequired}`
                                                            : 'Aucun objectif'}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {raffleData.event_end_at && (
                                                <div className="mt-2 text-sm text-gray-400">
                                                    <Calendar className="w-4 h-4 inline mr-1" />
                                                    Date limite : {new Date(raffleData.event_end_at).toLocaleDateString('fr-FR')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/20 rounded-xl border border-green-500/30 text-center">
                                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                                    <p className="text-xl font-bold text-green-300 mb-2">
                                        Tirage terminé avec succès !
                                    </p>
                                    <p className="text-green-200/70">
                                        Les résultats sont disponibles pour tous les participants.
                                    </p>
                                </div>
                                
                                <Button 
                                    onClick={handleViewResults}
                                    className="w-full h-14 text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                                >
                                    <Eye className="w-5 h-5 mr-2" />
                                    VOIR LES RÉSULTATS COMPLETS
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                // INTERFACE PARTICIPANT
                <>
                    {/* Affichage du message si le tirage est en cours */}
                    {isLiveBroadcast && (
                        <Card className="border-2 border-yellow-500/50 bg-gradient-to-br from-yellow-900/30 to-orange-900/20 animate-pulse-slow">
                            <CardContent className="p-6 text-center">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative">
                                        <Sparkles className="w-16 h-16 text-yellow-400 animate-pulse" />
                                        <div className="absolute inset-0 animate-ping bg-yellow-400/20 rounded-full"></div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-2xl text-yellow-300 mb-2">
                                            🎲 TIRAGE EN DIRECT !
                                        </h3>
                                        <p className="text-gray-300 text-lg mb-2">
                                            Le tirage au sort a commencé
                                        </p>
                                        <p className="text-yellow-200">
                                            L'animation se déroule en ce moment même...
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                        <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-3 h-3 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {raffleData.status === 'completed' ? (
                        <Card className="border-2 border-green-500/30 bg-gradient-to-br from-green-900/10 to-emerald-900/5">
                            <CardContent className="p-6 text-center">
                                <div className="flex flex-col items-center gap-4">
                                    <Trophy className="w-12 h-12 text-yellow-400" />
                                    <div>
                                        <h3 className="font-bold text-xl text-green-300 mb-2">
                                            🎉 Le tirage est terminé !
                                        </h3>
                                        <p className="text-gray-300 mb-4">
                                            Découvrez les résultats officiels du tirage.
                                        </p>
                                    </div>
                                    <Button 
                                        onClick={handleViewResults}
                                        className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-bold px-8 py-6 text-lg"
                                    >
                                        <Eye className="w-5 h-5 mr-2" />
                                        CONSULTER LES RÉSULTATS
                                    </Button>
                                    <p className="text-sm text-gray-400 mt-2">
                                        Votre position sera affichée dans la liste des gagnants.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        // Participant - tirage en attente - SEULEMENT MES INFORMATIONS
                        !isLiveBroadcast && (
                            <Card className="border-2 border-blue-500/20 bg-gradient-to-br from-blue-900/10 to-indigo-900/5">
                                <CardContent className="p-6 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <Target className="w-12 h-12 text-blue-400" />
                                        <div>
                                            <h3 className="font-bold text-xl text-white mb-2">
                                                En attente du tirage
                                            </h3>
                                            <p className="text-gray-300">
                                                L'organisateur lancera le tirage une fois l'objectif atteint.
                                            </p>
                                        </div>
                                        
                                        {/* SEULEMENT MES STATISTIQUES PERSONNELLES */}
                                        <div className="w-full max-w-md space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Mes tickets</span>
                                                <span className="text-white font-bold">
                                                    {loadingUserTickets ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        userTickets.length
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Valeur totale</span>
                                                <span className="text-yellow-400 font-bold">
                                                    {loadingUserTickets ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        `${userTicketValue} π`
                                                    )}
                                                </span>
                                            </div>
                                            
                                            {/* Barre de progression seulement pour objectif global */}
                                            <Progress 
                                                value={minTicketsRequired > 0 
                                                    ? Math.min(100, ((stats?.totalTickets || raffleData.tickets_sold || 0) / minTicketsRequired) * 100)
                                                    : 100
                                                } 
                                                className="h-3"
                                            />
                                            {minTicketsRequired > 0 && (
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-400">Objectif global</span>
                                                    <span className={`font-bold ${isGoalReached ? 'text-green-400' : 'text-yellow-400'}`}>
                                                        {isGoalReached ? 'Atteint ✅' : 'En cours...'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <p className="text-sm text-blue-300 mt-2">
                                            Vous serez notifié lorsque le tirage commencera !
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    )}
                </>
            )}
        </>
    );
};
export default RaffleDrawSystem;