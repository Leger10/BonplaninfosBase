import React, { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, BellRing, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  sendTestNotification,
  getPushStatus,
  unsubscribeFromPushNotifications,
  isPushSupported,
} from '@/utils/pushNotifications';

const defaultSettings = {
  push_notifications_enabled: true,
  new_events_notification: true,
  promoted_events_notification: true,
  nearby_events_notification: true,
};

const parseSettings = (raw) => {
  if (!raw) return defaultSettings;
  if (typeof raw === 'object') return { ...defaultSettings, ...raw };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...defaultSettings, ...parsed } : defaultSettings;
  } catch (e) {
    return defaultSettings;
  }
};

const NotificationSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pushStatus, setPushStatus] = useState({ active: 0, configured: false });

  const refreshStatus = useCallback(async () => {
    const status = await getPushStatus();
    setPushStatus({
      active: Number(status?.active) || 0,
      configured: Boolean(status?.configured),
    });
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_settings')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setSettings(parseSettings(data?.notification_settings));
      await refreshStatus();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les paramètres de notification.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, refreshStatus]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_settings: JSON.stringify(settings) })
        .eq('id', user.id);

      if (error) throw error;
      if (!settings.push_notifications_enabled && isPushSupported()) {
        await unsubscribeFromPushNotifications();
      }
      await refreshStatus();
      toast({ title: 'Succès', description: 'Paramètres de notification enregistrés.' });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: "Impossible d'enregistrer les paramètres.",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await sendTestNotification();
      await refreshStatus();
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <Card className="glass-effect border-primary/20">
        <CardHeader>
          <CardTitle className="text-foreground">Paramètres de notification</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect border-primary/20">
      <CardHeader>
        <CardTitle className="text-foreground">Paramètres de notification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-1 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <BellRing className="h-4 w-4 text-primary" />
            <span>
              {pushStatus.active > 0
                ? `${pushStatus.active} appareil(s) abonné(s)`
                : 'Aucun appareil abonné'}
            </span>
          </div>
          <span className="text-muted-foreground">
            {pushStatus.configured ? 'Service push actif' : 'Service push non configuré'}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="push_notifications_enabled" className="font-medium text-foreground">
                Activer les notifications Push
              </Label>
              <p className="text-sm text-muted-foreground">
                Recevoir les annonces et rappels sur vos appareils.
              </p>
            </div>
            <Switch
              id="push_notifications_enabled"
              checked={settings.push_notifications_enabled}
              onCheckedChange={() => handleToggle('push_notifications_enabled')}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="new_events_notification" className="font-medium text-foreground">
                Nouveaux événements
              </Label>
              <p className="text-sm text-muted-foreground">
                Être informé dès qu'un événement est publié.
              </p>
            </div>
            <Switch
              id="new_events_notification"
              checked={settings.new_events_notification}
              onCheckedChange={() => handleToggle('new_events_notification')}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="promoted_events_notification" className="font-medium text-foreground">
                Événements promus
              </Label>
              <p className="text-sm text-muted-foreground">
                Recevoir les rappels des événements mis en avant.
              </p>
            </div>
            <Switch
              id="promoted_events_notification"
              checked={settings.promoted_events_notification}
              onCheckedChange={() => handleToggle('promoted_events_notification')}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="nearby_events_notification" className="font-medium text-foreground">
                Événements à proximité
              </Label>
              <p className="text-sm text-muted-foreground">
                Recevoir les rappels des événements près de chez vous.
              </p>
            </div>
            <Switch
              id="nearby_events_notification"
              checked={settings.nearby_events_notification}
              onCheckedChange={() => handleToggle('nearby_events_notification')}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={saving} className="gradient-red text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Sauvegarder
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || pushStatus.active === 0}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Envoyer un test
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
