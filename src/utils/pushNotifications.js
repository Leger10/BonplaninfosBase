// utils/pushNotifications.js
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

// ============================================
// 1. FONCTIONS DE BASE
// ============================================

const hashToken = async (token) => {
  const msgBuffer = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

const arrayBufferToBase64 = (buffer) => {
  if (!buffer) return 'pending';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// ✅ EXPORT: isPushSupported
export const isPushSupported = () => {
  return 'serviceWorker' in navigator && 'PushManager' in window;
};

// ✅ EXPORT: askNotificationPermission
export const askNotificationPermission = async () => {
  try {
    if (!('Notification' in window)) {
      console.warn('Ce navigateur ne supporte pas les notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      console.log('Permission deja accordee');
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('Permission refusee par l\'utilisateur');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Erreur lors de la demande de permission:', error);
    return false;
  }
};

// ✅ EXPORT: urlBase64ToUint8Array
export const urlBase64ToUint8Array = (base64String) => {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Base64 string invalide ou vide');
  }

  try {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (error) {
    console.error('Erreur de conversion base64:', base64String, error);
    throw new Error(`Clé VAPID mal encodee : ${error.message}`);
  }
};

// ✅ EXPORT: getVapidPublicKey
export const getVapidPublicKey = async () => {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  
  if (envKey && envKey.trim() !== '' && envKey !== 'undefined') {
    console.log('Clé VAPID trouvee dans .env');
    return envKey.trim();
  }

  console.warn('Aucune clé VAPID configurée dans .env');
  return null;
};

// ============================================
// 2. FONCTIONS INTERNES (non exportées)
// ============================================

const getValidSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    console.error('Session Supabase invalide ou inexistante');
    return null;
  }
  
  console.log('Session valide pour:', session.user.id);
  return session;
};

// ============================================
// 3. FONCTIONS PRINCIPALES EXPORTEES
// ============================================

// ✅ EXPORT: subscribeToPushNotifications
export const subscribeToPushNotifications = async () => {
  if (!isPushSupported()) {
    throw new Error('Push non supporte par ce navigateur.');
  }

  try {
    const session = await getValidSession();
    if (!session) {
      throw new Error('Vous devez être connecte pour activer les notifications');
    }

    const granted = await askNotificationPermission();
    if (!granted) {
      throw new Error('Permission refusee');
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = await getVapidPublicKey();

    let subscription = null;
    
    if (vapidPublicKey) {
      try {
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
          console.log('Desabonnement de l\'ancien abonnement...');
          await existingSubscription.unsubscribe();
        }

        console.log('Souscription au PushManager avec VAPID...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
        
        console.log('Abonnement Push complet reussi !');
      } catch (vapidError) {
        console.warn('Erreur VAPID, fallback vers notifications basiques:', vapidError);
        subscription = { basic: true };
      }
    } else {
      console.log('Mode notifications basiques (sans VAPID)');
      subscription = { basic: true };
      
      try {
        registration.showNotification('Notifications activees !', {
          body: 'Vous recevrez des alertes pour les evenements',
          icon: '/favicon.ico',
          silent: false
        });
      } catch (e) {
        console.warn('Impossible d\'afficher la notification test:', e);
      }
    }

    if (subscription && !subscription.basic) {
      await savePushTokenToSupabase(subscription);
    }
    
    toast({
      title: "Notifications activees !",
      description: vapidPublicKey 
        ? "Vous recevrez toutes les alertes"
        : "Alertes basiques activees",
      className: "bg-green-600 text-white",
    });
    
    return subscription;
  } catch (error) {
    console.error('Subscription Error:', error);
    toast({
      title: "Information",
      description: error.message || "Notifications non disponibles",
      variant: "default",
    });
    return null;
  }
};

// ✅ EXPORT: savePushTokenToSupabase
export const savePushTokenToSupabase = async (subscription) => {
  if (!subscription || subscription.basic) return { success: true, skipped: true };

  const session = await getValidSession();
  if (!session) {
    console.error('Impossible de sauvegarder: utilisateur non authentifie');
    return { error: 'Non authentifie' };
  }

  const user = session.user;
  console.log('Sauvegarde pour l\'utilisateur:', user.id);

  try {
    const tokenHash = await hashToken(JSON.stringify(subscription));
    const deviceType = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
    const now = new Date().toISOString();

    // Suppression de l'ancien token
    console.log('Suppression de l\'ancien token...');
    const { error: deleteError } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id);

    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('Erreur lors de la suppression:', deleteError);
    }

    // Insertion du nouveau token
    console.log('Insertion du nouveau token...');
    const { error: insertError } = await supabase
      .from('push_tokens')
      .insert({
        user_id: user.id,
        token: tokenHash,
        endpoint: subscription.endpoint,
        p256dh: subscription.getKey ? arrayBufferToBase64(subscription.getKey('p256dh')) : 'pending',
        auth: subscription.getKey ? arrayBufferToBase64(subscription.getKey('auth')) : 'pending',
        device_type: deviceType,
        is_active: true,
        device_info: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        },
        last_used_at: now,
        created_at: now,
      });

    if (insertError) {
      console.error('Erreur insertion:', insertError);
      return { error: insertError.message };
    }
    
    console.log('Token sauvegarde avec succes');
    return { success: true };
  } catch (err) {
    console.error('Save token error:', err);
    return { error: err.message };
  }
};

// ✅ EXPORT: syncSubscription
export const syncSubscription = async () => {
  if (!isPushSupported()) return null;
  
  const session = await getValidSession();
  if (!session) return null;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription && !subscription.basic) {
      return await savePushTokenToSupabase(subscription);
    }
  } catch (error) {
    console.error('Sync subscription error:', error);
  }
  return null;
};

// ✅ EXPORT: testSupabaseConnection
export const testSupabaseConnection = async () => {
  console.log('Test de connexion Supabase...');
  
  const session = await getValidSession();
  if (!session) {
    console.error('Aucune session active');
    return { success: false, error: 'Non connecte' };
  }
  
  console.log('Session active pour:', session.user.email);
  
  try {
    const { error: testError } = await supabase
      .from('push_tokens')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.warn('Test table push_tokens:', testError.message);
    } else {
      console.log('Table push_tokens accessible');
    }
  } catch (e) {
    console.warn('Test table push_tokens:', e.message);
  }
  
  return { success: true, user: session.user };
};

// ✅ EXPORT: unsubscribeFromPushNotifications
export const unsubscribeFromPushNotifications = async () => {
  if (!isPushSupported()) return false;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription && !subscription.basic) {
      await subscription.unsubscribe();
      console.log('Desabonnement reussi');
    }
    
    const session = await getValidSession();
    if (session) {
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', session.user.id);
      
      if (error) {
        console.error('Erreur suppression token:', error);
      }
    }
    
    toast({
      title: "Notifications desactivees",
      description: "Vous ne recevrez plus d'alertes",
    });
    
    return true;
  } catch (error) {
    console.error('Erreur lors du desabonnement:', error);
    return false;
  }
};

// ✅ EXPORT: sendTestNotification
export const sendTestNotification = async () => {
  if (!('Notification' in window)) {
    toast({
      title: "Non supporte",
      description: "Votre navigateur ne supporte pas les notifications",
      variant: "destructive",
    });
    return false;
  }
  
  if (Notification.permission !== 'granted') {
    toast({
      title: "Permission requise",
      description: "Activez d'abord les notifications",
      variant: "destructive",
    });
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Test de notification', {
      body: 'Si vous voyez ce message, les notifications fonctionnent !',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
    });
    
    toast({
      title: "Test envoye",
      description: "Une notification devrait apparaitre",
    });
    return true;
  } catch (error) {
    console.error('Erreur envoi test:', error);
    toast({
      title: "Erreur",
      description: "Impossible d'envoyer la notification test",
      variant: "destructive",
    });
    return false;
  }
};
