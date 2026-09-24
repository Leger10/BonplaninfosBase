import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { dbService } from "@/services/dbService";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useToast } from "@/components/ui/use-toast";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { checkSoundFile } from "@/lib/soundHelper";

const DataContext = createContext({});

export const useData = () => useContext(DataContext);

// Utilitaire de réessai avec backoff exponentiel
const fetchWithRetry = async (fn, retries = 3, delay = 1000, fallbackValue = null) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      if (import.meta.env.DEV) {
        console.error("All fetch retries failed:", error);
      }
      return { data: fallbackValue, error };
    }
    if (import.meta.env.DEV) {
      console.warn(`Fetch failed, retrying in ${delay}ms... (${retries} attempts left)`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(fn, retries - 1, delay * 1.5, fallbackValue);
  }
};

const safeTime = (label) => {
  if (import.meta.env.DEV) {
    try { console.time(label); } catch (e) { }
  }
};

const safeTimeEnd = (label) => {
  if (import.meta.env.DEV) {
    try { console.timeEnd(label); } catch (e) { }
  }
};

export const DataProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { playNotificationSound } = useNotificationSound();

  // Références pour éviter les doubles appels
  const isFetchingProfile = useRef(false);
  const isFetchingNotifications = useRef(false);
  const isFetchingSettings = useRef(false);
  const isFetchingPopups = useRef(false);
  const mountCount = useRef(0);

  // Cache pour le profil
  const profileCache = useRef({ data: null, userId: null, timestamp: 0 });
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // États principaux
  const [userProfile, setUserProfile] = useState(null);
  const [welcomePopups, setWelcomePopups] = useState([]);
 const [appSettings, setAppSettings] = useState({
  app_name: "BonPlanInfos",
  maintenance_mode: false,
  coin_to_fcfa_rate: 10,
  min_withdrawal_pi: 50,
  currency_eur_rate: 650,
  currency_usd_rate: 550,
  transaction_fee_percent: 0,
  contact_email: "bonplaninfos@gmail.com",
  support_email: "support@bonplaninfos.net",
});
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [notificationBellAnimation, setNotificationBellAnimation] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [visualEffects, setVisualEffects] = useState([]);
  const [soundEffect, setSoundEffect] = useState(null);

  // --- Gestion des effets visuels/sonores (indépendants) ---
  const addVisualEffect = useCallback((type) => {
    const id = Math.random().toString(36).substr(2, 9);
    setVisualEffects(prev => [...prev, { id, type }]);
  }, []);

  const removeVisualEffect = useCallback((id) => {
    setVisualEffects(prev => prev.filter(effect => effect.id !== id));
  }, []);

  const triggerSoundEffect = useCallback((effectName) => {
    setSoundEffect(effectName);
  }, []);

  const clearSoundEffect = useCallback(() => {
    setSoundEffect(null);
  }, []);

  // --- Fonctions de chargement (fetch) ---
  const fetchUserProfile = useCallback(async () => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    if (isFetchingProfile.current) return;

    const now = Date.now();
    const isCacheValid =
      profileCache.current.data &&
      profileCache.current.userId === user.id &&
      now - profileCache.current.timestamp < CACHE_DURATION;

    if (isCacheValid && refreshTrigger === 0) {
      setUserProfile(profileCache.current.data);
      return;
    }

    setLoadingProfile(true);
    isFetchingProfile.current = true;
    safeTime("fetchUserProfile");

    try {
      const { data, error } = await fetchWithRetry(
        () => supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        3, 500, null
      );

      if (error) {
        if (import.meta.env.DEV) {
          console.error("Error fetching profile:", error);
        }
      } else if (data) {
        setUserProfile(data);
        profileCache.current = { data, userId: user.id, timestamp: Date.now() };
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Exception fetching profile:", err);
      }
    } finally {
      safeTimeEnd("fetchUserProfile");
      setLoadingProfile(false);
      isFetchingProfile.current = false;
    }
  }, [user, refreshTrigger]);

 const fetchAppSettings = useCallback(async () => {
  if (isFetchingSettings.current) return;
  isFetchingSettings.current = true;
  safeTime("fetchAppSettings");

  try {
    const { data, error } = await fetchWithRetry(
      () => supabase.from("app_settings").select("*").limit(1).maybeSingle(),
      2, 1000, {}
    );
    
    if (!error && data) {
      // S'assurer que toutes les colonnes nécessaires ont des valeurs par défaut
      const defaultSettings = {
        app_name: "BonPlanInfos",
        maintenance_mode: false,
        coin_to_fcfa_rate: 10,
        min_withdrawal_pi: 50,
        currency_eur_rate: 650,
        currency_usd_rate: 550,
        transaction_fee_percent: 0,
        contact_email: "contact@bonplaninfos.com",
        support_email: "support@bonplaninfos.net",
        ...data
      };
      setAppSettings(prev => ({ ...prev, ...defaultSettings }));
    } else if (!data) {
      // Si pas de données, créer une ligne par défaut
      const { error: insertError } = await supabase
        .from("app_settings")
        .insert({
          app_name: "BonPlanInfos",
          coin_to_fcfa_rate: 10,
          min_withdrawal_pi: 50,
          currency_eur_rate: 650,
          currency_usd_rate: 550,
          contact_email: "contact@bonplaninfos.com",
          maintenance_mode: false
        });
      
      if (!insertError) {
        // Recharger après insertion
        const { data: newData } = await supabase
          .from("app_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        
        if (newData) {
          setAppSettings(prev => ({ ...prev, ...newData }));
        }
      }
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("Exception fetching app_settings:", err);
    }
  } finally {
    safeTimeEnd("fetchAppSettings");
    isFetchingSettings.current = false;
  }
}, []);

  const fetchWelcomePopups = useCallback(async () => {
    if (isFetchingPopups.current) return;
    isFetchingPopups.current = true;
    safeTime("fetchWelcomePopups");

    try {
      const { data, error } = await fetchWithRetry(
        () => supabase.from("welcome_popups").select("*").eq("is_active", true).order("created_at", { ascending: false }),
        2, 1000, []
      );
      if (!error && data) setWelcomePopups(data);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("Exception fetching welcome_popups:", err);
      }
    } finally {
      safeTimeEnd("fetchWelcomePopups");
      isFetchingPopups.current = false;
    }
  }, []);

  const fetchNotificationCount = useCallback(async () => {
    if (!user) return;
    if (isFetchingNotifications.current) return;

    isFetchingNotifications.current = true;
    safeTime("fetchNotificationCount");

    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (!error) {
        if (import.meta.env.DEV) {
          console.info(`[DataContext] 🔄 Mise à jour du compteur de notifications: ${count}`);
        }
        setNotificationCount(count || 0);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Error fetching notification count:", err);
      }
    } finally {
      safeTimeEnd("fetchNotificationCount");
      isFetchingNotifications.current = false;
    }
  }, [user]);

  // --- Fonctions qui dépendent des fetch ---
  const updateUserProfile = useCallback(async (userId, updates) => {
    setLoadingProfile(true);
    safeTime("updateUserProfile");

    try {
      const { data, error } = await supabase.rpc("update_user_profile", {
        p_user_id: userId,
        p_full_name: updates.full_name,
        p_email: updates.email,
        p_phone: updates.phone,
        p_city: updates.city,
        p_country: updates.country,
        p_bio: updates.bio,
        p_avatar_url: updates.avatar_url,
      });

      if (error) throw error;

      await fetchUserProfile();
      profileCache.current = { ...profileCache.current, timestamp: 0 };
      setRefreshTrigger(prev => prev + 1);

      return { success: true, data };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Profile update error:", error);
      }
      return { success: false, error };
    } finally {
      safeTimeEnd("updateUserProfile");
      setLoadingProfile(false);
    }
  }, [fetchUserProfile]);

  // --- Fonctions utilitaires (définies avant leur utilisation dans d'autres callbacks) ---
  const forceRefreshUserProfile = useCallback(() => {
    profileCache.current = { ...profileCache.current, timestamp: 0 };
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const triggerNotificationAnimation = useCallback(() => {
    setNotificationBellAnimation(true);
    setTimeout(() => setNotificationBellAnimation(false), 2000);
  }, []);

  const getEvents = useCallback(async (filters = {}) => {
    safeTime("getEvents");
    try {
      let events;
      try {
        events = await dbService.getAllEvents(filters);
      } catch (dbErr) {
        if (import.meta.env.DEV) {
          console.warn("dbService indisponible, fallback Supabase:", dbErr.message);
        }
      }
      if (events) return events;

      let query = supabase.from("events").select("*").eq("status", "active").order("created_at", { ascending: false });
      if (filters.organizer_id) query = query.eq("organizer_id", filters.organizer_id);
      if (filters.country) query = query.eq("country", filters.country);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error fetching events:", error);
      }
      return [];
    } finally {
      safeTimeEnd("getEvents");
    }
  }, []);

  const getPromotions = useCallback(async () => {
    safeTime("getPromotions");
    try {
      let promotions;
      try {
        promotions = await dbService.getPromotions();
      } catch (dbErr) {
        if (import.meta.env.DEV) {
          console.warn("dbService indisponible, fallback Supabase:", dbErr.message);
        }
      }
      if (promotions) return promotions;

      const { data, error } = await supabase
        .from("event_promotions")
        .select("*, organizer:organizer_id(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error fetching promotions:", error);
      }
      return [];
    } finally {
      safeTimeEnd("getPromotions");
    }
  }, []);

  const refreshData = useCallback(() => {
    fetchAppSettings();
    fetchWelcomePopups();
    forceRefreshUserProfile();
    fetchNotificationCount();
  }, [fetchAppSettings, fetchWelcomePopups, forceRefreshUserProfile, fetchNotificationCount]);

  // --- Chargement initial ---
  useEffect(() => {
    mountCount.current += 1;
    if (mountCount.current > 1) return;

    let isMounted = true;

    const loadGlobalData = async () => {
      if (!navigator.onLine) {
        toast({ title: "Mode hors ligne", description: "Vérifiez votre connexion internet.", variant: "warning" });
      }

      setLoading(true);
      safeTime("loadGlobalData");

      try {
        await Promise.all([
          fetchAppSettings(),
          fetchWelcomePopups(),
          checkSoundFile(),
        ]);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error("Global data load error:", e);
        }
      } finally {
        if (isMounted) setLoading(false);
        safeTimeEnd("loadGlobalData");
      }
    };

    loadGlobalData();
    return () => { isMounted = false; };
  }, [fetchAppSettings, fetchWelcomePopups, toast]);

  // --- Chargement dépendant de l'utilisateur ---
  useEffect(() => {
    if (!user) return;
    let isActive = true;
    const loadUserData = async () => {
      if (!isActive) return;
      await fetchUserProfile();
      await fetchNotificationCount();
    };
    loadUserData();
    return () => { isActive = false; };
  }, [user?.id, fetchUserProfile, fetchNotificationCount]);

  // --- Abonnements en temps réel ---
  useEffect(() => {
    if (!user) return;

    if (import.meta.env.DEV) {
      console.info(`[Realtime] 🔌 Initialisation de la souscription pour user_id: [FILTERED]`);
    }

    const profileChannel = supabase
      .channel("public:profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => {
          profileCache.current = { ...profileCache.current, timestamp: 0 };
          fetchUserProfile();
        }
      )
      .subscribe();

    const notificationChannel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (import.meta.env.DEV) {
            // Ne pas logger tout le payload, seulement un résumé sans données sensibles
            console.info("[Realtime] ⚡ Nouvelle notification reçue (ID masqué)");
          }

          const newNotification = payload.new;
          const type = newNotification?.type || 'default';

          // Jouer le son approprié
          playNotificationSound(type);

          // Mettre à jour le compteur
          fetchNotificationCount();

          // Animer la cloche
          setNotificationBellAnimation(true);
          setTimeout(() => setNotificationBellAnimation(false), 2000);

          // Afficher un toast avec emoji
          const emojiMap = {
            event: '🎉',
            credit: '💰',
            purchase: '🎟️',
            admin: '🛡️',
            default: '🔔'
          };
          const emoji = emojiMap[type] || emojiMap.default;

          toast({
            title: `${emoji} ${newNotification?.title || 'Nouvelle notification'}`,
            description: newNotification?.message || 'Vous avez une nouvelle notification',
          });
        }
      )
      .subscribe((status) => {
        if (import.meta.env.DEV) {
          console.info(`[Realtime] Statut de souscription notifications: ${status}`);
        }
      });

    return () => {
      if (import.meta.env.DEV) {
        console.info(`[Realtime] 🔌 Nettoyage des souscriptions pour user_id: [FILTERED]`);
      }
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(notificationChannel);
    };
  }, [user, fetchUserProfile, fetchNotificationCount, playNotificationSound, toast]);

  // Valeur du contexte
  const value = {
    userProfile,
    welcomePopups,
    appSettings,
    loading,
    loadingProfile,
    notificationBellAnimation,
    notificationCount,
    fetchNotificationCount,
    forceRefreshUserProfile,
    updateUserProfile,
    triggerNotificationAnimation,
    refreshData,
    getEvents,
    getPromotions,
    visualEffects,
    addVisualEffect,
    removeVisualEffect,
    soundEffect,
    triggerSoundEffect,
    clearSoundEffect,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};