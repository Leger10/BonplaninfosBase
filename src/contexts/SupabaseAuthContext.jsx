import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasFetchError, setHasFetchError] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(() => () => { });

  // Références stables : sans elles, un changement d'identité de handleSession
  // (setHasFetchError / setForceRefresh) relançait initSession en boucle et le
  // dashboard "rechargeait" sans jamais s'arrêter.
  const handleSessionRef = useRef(null);
  const hasFetchErrorRef = useRef(false);

  // Helper for retrying promises with exponential backoff
  const retryPromise = useCallback(async (fn, retries = 3, delay = 500, operationName = 'Supabase Operation') => {
    try {
      return await fn();
    } catch (error) {
      const errorMessage = error?.message || '';
      const errorCode = error?.code || '';
      const errorStatus = error?.status || '';
      const apiErrorCode = error?.error_code || ''; // Supabase specific

      const isRefreshTokenError =
        errorMessage.includes('refresh_token_not_found') ||
        errorMessage.includes('Invalid Refresh Token') ||
        errorCode === 'refresh_token_not_found' ||
        apiErrorCode === 'refresh_token_not_found';

      if (isRefreshTokenError) {
        throw new Error('CRITICAL_AUTH_ERROR: Refresh Token Invalid');
      }

      const isAuthError = errorStatus === 400 || errorStatus === 401 || errorStatus === 403 ||
        (errorCode && (errorCode === 403 || errorCode === '403' || errorCode === 'bad_jwt' || errorCode === 'session_not_found')) ||
        (errorMessage && (errorMessage.includes('bad_jwt') || errorMessage.includes('invalid claim') || errorMessage.includes('session_id')));

      if (isAuthError) {
        throw error;
      }

      if (import.meta.env.DEV) {
        console.warn(`[${operationName}] Attempt failed. Retries left: ${retries}. Error:`, {
          message: errorMessage,
          code: errorCode,
          status: errorStatus
        });
      }

      if (retries <= 0) {
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network request failed')) {
          if (import.meta.env.DEV) {
            console.error(`[${operationName}] Network error persisted after retries.`);
          }
          if (!hasFetchErrorRef.current) {
            toast({
              variant: "destructive",
              title: "Erreur de connexion",
              description: "Impossible de se connecter au serveur. Veuillez vérifier votre connexion internet."
            });
          }
        }
        throw error;
      }

      const isNetworkError = errorMessage && (
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Load failed') ||
        errorStatus === 500 ||
        errorStatus === 502 ||
        errorStatus === 503 ||
        errorStatus === 504
      );

      if (isNetworkError) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryPromise(fn, retries - 1, delay * 1.5, operationName);
      }
      throw error;
    }
  }, [toast]);

  const clearSessionData = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log("Cleaning session data due to auth error...");
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-')) {
          localStorage.removeItem(key);
        }
      }
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.clear();

      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("Error clearing storage:", e);
      }
    }

    setUser(null);
    setUserProfile(null);
    setSession(null);
    setLicense(null);
  }, []);

  const fetchLicense = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data: activeLicenseData, error } = await retryPromise(() => supabase
        .from('admin_licences')
        .select('*')
        .eq('admin_id', userId)
        .eq('statut', 'actif'), 3, 500, 'Fetch License');

      if (error) throw error;

      if (activeLicenseData && activeLicenseData.length > 0) {
        const bestLicense = activeLicenseData.sort((a, b) => new Date(b.date_fin) - new Date(a.date_fin))[0];
        setLicense(bestLicense);
        return;
      }

      const { data: anyLicenseData } = await supabase
        .from('admin_licences')
        .select('*')
        .eq('admin_id', userId)
        .limit(1);

      if (anyLicenseData && anyLicenseData.length > 0) {
        setLicense(anyLicenseData[0]);
      } else {
        setLicense(null);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("License fetch error:", err);
      }
    }
  }, [retryPromise]);

  const handleSession = useCallback(async (currentSession, error = null) => {
    const sessionError = error || currentSession?.error;

    if (sessionError) {
      const errorMessage = sessionError.message || '';
      const errorCode = sessionError.code || sessionError.error_code || '';

      if (errorMessage.includes('CRITICAL_AUTH_ERROR') ||
        errorMessage.includes('refresh_token_not_found') ||
        errorMessage.includes('Invalid Refresh Token') ||
        errorCode === 'refresh_token_not_found') {

        if (import.meta.env.DEV) {
          console.error("Critical Auth Error detected. Logging out.");
        }
        clearSessionData();
        setLoading(false);
        return;
      }

      if (errorCode === 'session_not_found' || errorMessage.includes('session_not_found')) {
        clearSessionData();
        setLoading(false);
        return;
      }

      if (errorMessage.includes('session_id claim')) {
        clearSessionData();
        setLoading(false);
        return;
      }

      const isBadJwtError =
        errorMessage.includes('bad_jwt') ||
        errorMessage.includes('invalid claim') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('JWT');

      if (isBadJwtError) {
        clearSessionData();
      } else {
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network request failed')) {
        hasFetchErrorRef.current = true;
        setHasFetchError(true);
      }
      }
      setLoading(false);
      return;
    }

    if (currentSession?.user) {
      const currentUser = currentSession.user;
      let profileData = null;

      try {
        const { data: profile, error: profileError } = await retryPromise(() => supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle(), 3, 500, 'Fetch Profile Status');

        if (profileError) throw profileError;

        if (profile) {
          if (profile.is_active === false) {
            if (import.meta.env.DEV) {
              console.warn("User is deactivated. Logging out.");
            }
            await supabase.auth.signOut();
            clearSessionData();
            setLoading(false);
            return;
          }
          profileData = profile;
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error("Profile active check failed", e);
        }
        if (e.message?.includes('Failed to fetch')) {
          toast({
            variant: "destructive",
            title: "Erreur Réseau",
            description: "Impossible de vérifier le profil utilisateur. Vérifiez votre connexion."
          });
        }
      }

      try {
        if (!profileData) {
          const { data: rpcProfile, error: profileError } = await retryPromise(() => supabase.rpc('ensure_user_profile_exists', {
            p_user_id: currentUser.id,
            p_email: currentUser.email,
            p_full_name: currentUser.user_metadata?.full_name
          }), 2, 500, 'Ensure Profile Exists');

          if (profileError) {
            if (import.meta.env.DEV) {
              console.error("Profile check error:", profileError);
            }
          } else if (rpcProfile?.profile) {
            profileData = rpcProfile.profile;
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error("Profile verification exception:", e);
        }
      }

      setSession(currentSession);
      setUser(currentUser);
      setUserProfile(profileData);
      hasFetchErrorRef.current = false;
      setHasFetchError(false);
      await fetchLicense(currentUser.id);

      if (typeof forceRefresh === 'function') {
        forceRefresh();
      }
    } else {
      setSession(null);
      setUser(null);
      setUserProfile(null);
      setLicense(null);
    }

    setLoading(false);
  }, [forceRefresh, clearSessionData, fetchLicense, retryPromise, toast]);

  useEffect(() => {
    const handleUnhandledRejection = async (event) => {
      const reason = event.reason;

      const isAuthError =
        reason?.message?.includes('AuthSessionMissingError') ||
        reason?.message?.includes('Invalid token') ||
        reason?.message?.includes('Unauthorized') ||
        (reason?.details && reason.details.__isAuthError) ||
        (reason?.name === 'FunctionsHttpError' && reason?.context?.json?.error === 'Unauthorized: Invalid token');

      if (isAuthError) {
        if (import.meta.env.DEV) {
          console.warn("Caught unhandled auth error (likely Edge Function). Attempting recovery...", reason);
        }
        event.preventDefault();

        const { data, error } = await supabase.auth.refreshSession();

        if (error) {
          if (import.meta.env.DEV) {
            console.error("Session refresh failed during recovery. Logging out.");
          }
          clearSessionData();
          window.location.href = '/auth';
        } else if (data.session) {
          if (import.meta.env.DEV) {
            console.log("Session successfully recovered.");
          }
          handleSession(data.session);
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, [clearSessionData, handleSession]);

  // Conserve la dernière version de handleSession pour les effets à
  // dépendances stables (initialisation, abonnement).
  useEffect(() => {
    handleSessionRef.current = handleSession;
  });

  useEffect(() => {
    let mounted = true;

    if (!supabase || !supabase.supabaseUrl || !supabase.supabaseKey) {
      console.error("Supabase client is not properly initialized. Missing URL or Key.");
      toast({
        variant: "destructive",
        title: "Configuration Error",
        description: "Application is missing database configuration. Please contact support."
      });
      setLoading(false);
      return;
    }

    const initSession = async () => {
      try {
        setLoading(true);

        if (!navigator.onLine) {
          if (import.meta.env.DEV) {
            console.warn("Offline detected during initSession");
          }
        }

        const { data: { session: localSession }, error: sessionError } = await retryPromise(
          () => supabase.auth.getSession(),
          3,
          500,
          'Get Session'
        );

        if (sessionError) {
          if (mounted) handleSessionRef.current?.(null, sessionError);
          return;
        }

        if (localSession) {
          const { data: { user: verifiedUser }, error: userError } = await retryPromise(
            () => supabase.auth.getUser(),
            3,
            500,
            'Get User'
          );

          if (userError) {
            if (mounted) handleSessionRef.current?.(null, userError);
          } else {
            if (mounted) handleSessionRef.current?.(localSession);
          }
        } else {
          if (mounted) handleSessionRef.current?.(null);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("Session initialization error:", err);
        }
        if (mounted) handleSessionRef.current?.(null, err);
      }
    };

    initSession();

    return () => {
      mounted = false;
    };
    // L'initialisation doit tourner une seule fois : elle ne dépend que de la
    // première exécution (les appels passent par handleSessionRef, toujours à jour).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abonnement aux changements d'état, isolé de l'initialisation : ses
  // dépendances stables empêchent de relancer initSession().
  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (import.meta.env.DEV) {
          console.log("Auth state change:", event);
        }

        if (event === 'SIGNED_OUT') {
          clearSessionData();
          setLoading(false);
        } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          handleSessionRef.current?.(session);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [clearSessionData]);

  const signUp = useCallback(async (email, password, metadata) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata }
      });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data?.user) {
        const { data: profile, error: profileError } = await retryPromise(() => supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.user.id)
          .maybeSingle(), 3, 500, 'Sign In Profile Check');

        if (profileError) throw profileError;

        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          throw new Error('ACCOUNT_DEACTIVATED');
        }
      }

      return { data, error: null };
    } catch (error) {
      // Personnalisation du message d'erreur pour les problèmes réseau
      let errorMessage = error.message;
      if (error.message && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('Network request failed') ||
        error.message.includes('Load failed')
      )) {
        errorMessage = "erreur de connexion ; veuillez réessayer";
      }
      // Créer une nouvelle erreur avec le message personnalisé
      const customError = new Error(errorMessage);
      // Conserver le code d'erreur original si nécessaire
      customError.code = error.code;
      customError.status = error.status;
      return { data: null, error: customError };
    }
  }, [retryPromise]);

  const signOut = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.log("Logout started");
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        if (error.message?.includes('session_id claim') || error.message?.includes('JWT') || error.status === 403) {
          if (import.meta.env.DEV) {
            console.log("JWT error caught and ignored during logout");
          }
        } else {
          if (import.meta.env.DEV) {
            console.warn("Supabase signOut warning (ignoring):", error.message);
          }
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.log("Logout exception caught and ignored:", error);
      }
    } finally {
      clearSessionData();
      window.location.href = '/auth';
    }
  }, [clearSessionData]);

  const refreshLicense = useCallback(async () => {
    if (user) {
      await fetchLicense(user.id);
    }
  }, [user, fetchLicense]);

  const invokeFunction = useCallback(async (functionName, options = {}) => {
    return retryPromise(async () => {
      try {
        const { data, error } = await supabase.functions.invoke(functionName, options);
        if (error) throw error;
        return { data, error: null };
      } catch (error) {
        if (error.message?.includes('AuthSessionMissingError') || error.context?.json?.error === 'Unauthorized: Invalid token') {
          if (import.meta.env.DEV) {
            console.log("Auth error in invokeFunction, attempting refresh...");
          }
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            return await supabase.functions.invoke(functionName, options);
          }
        }
        throw error;
      }
    }, 3, 500, `Invoke ${functionName}`);
  }, [retryPromise]);

  const value = useMemo(() => ({
    user,
    userProfile,
    session,
    license,
    loading,
    hasFetchError,
    signUp,
    signIn,
    signOut,
    setForceRefresh,
    refreshLicense,
    invokeFunction
  }), [user, userProfile, session, license, loading, hasFetchError, signUp, signIn, signOut, setForceRefresh, refreshLicense, invokeFunction]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Hook named export as requested
export const useSupabaseAuth = () => {
  const context = useAuth();
  return {
    ...context,
    user: context.user,
    userProfile: context.userProfile,
    role: context.userProfile?.user_type,
    created_by: context.userProfile?.appointed_by,
    logout: context.signOut,
    loading: context.loading
  };
};