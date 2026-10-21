import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  isPushSupported,
  isFirebaseConfigured,
  askNotificationPermission,
  subscribeToPushNotifications,
  syncSubscription,
  onForegroundMessage,
  getPushStatus,
} from '@/utils/pushNotifications';
import { Button } from '@/components/ui/button';
import { BellRing, X, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const PushNotificationManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionState, setPermissionState] = useState('default');
  const [activeDevices, setActiveDevices] = useState(0);

  useEffect(() => {
    if (!isPushSupported()) return;
    setPermissionState(Notification.permission);

    if (!user) {
      setShowPrompt(false);
      return undefined;
    }

    let cancelled = false;
    const sync = async () => {
      if (Notification.permission === 'granted') {
        await syncSubscription().catch(() => null);
      }
      const status = await getPushStatus();
      if (!cancelled) setActiveDevices(Number(status?.active) || 0);
    };
    sync();

    if (Notification.permission === 'default') {
      const dismissed = sessionStorage.getItem('push_prompt_dismissed') === 'true';
      if (!dismissed) {
        const timer = setTimeout(() => setShowPrompt(true), 3000);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }
    }
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Affiche un toast si une notification arrive application ouverte.
  useEffect(() => {
    if (!user || !isPushSupported()) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};
    onForegroundMessage(({ title, body }) => {
      toast({ title, description: body });
    })
      .then((fn) => {
        if (typeof fn === 'function') {
          if (cancelled) fn();
          else unsubscribe = fn;
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, toast]);

  const handleEnableNotifications = async () => {
    if (!isFirebaseConfigured()) {
      toast({
        title: 'Configuration manquante',
        description: 'Les notifications ne sont pas encore configurées.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      const granted = await askNotificationPermission();
      setPermissionState(granted ? 'granted' : 'denied');
      if (!granted) {
        toast({
          title: 'Notifications bloquées',
          description: 'Autorisez les notifications dans les paramètres de votre navigateur.',
          variant: 'destructive',
        });
        setShowPrompt(false);
        return;
      }
      await subscribeToPushNotifications();
      const status = await getPushStatus();
      setActiveDevices(Number(status?.active) || 0);
      sessionStorage.removeItem('push_prompt_dismissed');
      setShowPrompt(false);
      toast({
        title: 'Notifications activées !',
        description: 'Vous serez informé des événements et rappels de la plateforme.',
        className: 'bg-green-600 text-white',
      });
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast({
        title: 'Activation impossible',
        description: error?.message || 'Erreur inconnue',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('push_prompt_dismissed', 'true');
  };

  if (!isPushSupported()) return null;
  if (permissionState === 'denied') return null;
  if (permissionState === 'granted' && activeDevices > 0) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-4 right-4 z-[60] w-full max-w-sm"
        >
          <div className="bg-background/95 backdrop-blur-md border border-primary/20 p-4 rounded-xl shadow-2xl flex items-start gap-4">
            <div className="p-2 bg-primary/10 rounded-full">
              <BellRing className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">Ne ratez aucun événement !</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Activez les notifications pour recevoir les annonces de publication, les rappels
                (la veille et le jour même à 6 h) ainsi que vos confirmations de billets, votes et
                stands.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleEnableNotifications}
                  disabled={isLoading}
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Activation...
                    </>
                  ) : (
                    'Activer'
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 text-xs">
                  Plus tard
                </Button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PushNotificationManager;
