// components/PromotionalBanner.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';
import { promotionalMessages } from '@/config/promotionalMessages';
import { cn } from '@/lib/utils';

const PromotionalBanner = ({ userProfile, onClose }) => {
  const location = useLocation();
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const timeoutRef = useRef(null);

  const routeMessages = promotionalMessages[location.pathname] || [];
  const filteredMessages = routeMessages.filter(message => 
    message.targetUserTypes.includes(userProfile?.user_type || 'user')
  );

  // Auto-collapse après 3 secondes
  useEffect(() => {
    if (!userDismissed && isVisible && !isCollapsed) {
      timeoutRef.current = setTimeout(() => {
        setIsCollapsed(true);
      }, 3000);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [isVisible, isCollapsed, userDismissed]);

  // Changer le message toutes les 15 secondes (plus lent)
  useEffect(() => {
    if (filteredMessages.length === 0 || userDismissed) {
      setIsVisible(false);
      return;
    }

    const messageInterval = setInterval(() => {
      setCurrentMessageIndex(prev => (prev + 1) % filteredMessages.length);
      // Se déplie brièvement quand le message change
      setIsCollapsed(false);
      setTimeout(() => setIsCollapsed(true), 3000);
    }, 15000); // 15 secondes

    return () => clearInterval(messageInterval);
  }, [filteredMessages.length, location.pathname, userDismissed]);

  const handleClose = () => {
    setUserDismissed(true);
    setIsVisible(false);
    // Sauvegarder dans localStorage
    localStorage.setItem('bannerDismissed', 'true');
    setTimeout(() => onClose?.(), 300);
  };

  const handleAction = () => {
    const currentMsg = filteredMessages[currentMessageIndex];
    if (currentMsg && currentMsg.action) {
      currentMsg.action();
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Vérifier si l'utilisateur a déjà fermé la bannière
  useEffect(() => {
    const dismissed = localStorage.getItem('bannerDismissed');
    if (dismissed === 'true') {
      setUserDismissed(true);
      setIsVisible(false);
    }
  }, []);

  if (!isVisible || filteredMessages.length === 0 || userDismissed) return null;

  // currentMessageIndex peut etre superieur au nombre de messages de la route
  // courante apres une navigation (la banniere reste montee). Sans ce module,
  // currentMsg vaut undefined et currentMsg.icon fait planter le rendu.
  const currentMsg = filteredMessages[currentMessageIndex % filteredMessages.length];
  if (!currentMsg || !currentMsg.icon) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 w-[95vw] max-w-md">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMessageIndex}
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ 
            opacity: 1, 
            y: 0,
            scale: 1,
            transition: {
              type: "spring",
              stiffness: 300,
              damping: 25
            }
          }}
          exit={{ 
            opacity: 0, 
            y: -20,
            scale: 0.95,
            transition: { duration: 0.2 }
          }}
          className={cn(
            `bg-gradient-to-r ${currentMsg.color}`,
            "rounded-xl shadow-lg border border-white/10 backdrop-blur-md overflow-hidden",
            isCollapsed ? "shadow-sm" : "shadow-lg"
          )}
        >
          {/* Version dépliée */}
          <AnimatePresence>
            {!isCollapsed ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-white bg-white/20 p-1.5 rounded-full">
                          {React.cloneElement(currentMsg.icon, { 
                            className: "w-4 h-4" 
                          })}
                        </div>
                        <h3 className="text-white font-bold text-sm leading-tight">
                          {currentMsg.title}
                        </h3>
                      </div>
                      <p className="text-white/90 text-xs leading-relaxed mb-3">
                        {currentMsg.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <Button 
                          onClick={handleAction}
                          size="sm"
                          className="bg-white text-gray-900 hover:bg-white/90 font-semibold text-xs px-3 h-7"
                        >
                          {currentMsg.button} <ChevronRight className="ml-1 w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClose}
                          className="text-white/70 hover:text-white hover:bg-white/10 text-xs h-7"
                        >
                          Plus tard
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleClose}
                      className="text-white hover:bg-white/20 flex-shrink-0 w-6 h-6 mt-0.5"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                {/* Barre de progression */}
                <motion.div
                  className="h-0.5 bg-white/20 relative overflow-hidden"
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ 
                    duration: 15, 
                    ease: "linear" 
                  }}
                >
                  <div className="h-full bg-white/70 absolute top-0 left-0 w-full" />
                </motion.div>
              </motion.div>
            ) : (
              // Version réduite (badge flottant)
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={toggleCollapse}
                className="cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div className="px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-white bg-white/20 p-1 rounded-full">
                      <Sparkles className="w-3 h-3" />
                    </div>
                    <span className="text-white text-xs font-medium truncate max-w-[120px]">
                      {currentMsg.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      onClick={handleAction}
                      className="bg-white/20 hover:bg-white/30 text-white h-6 w-6"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClose();
                      }}
                      className="text-white/50 hover:text-white hover:bg-white/10 h-6 w-6"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PromotionalBanner;