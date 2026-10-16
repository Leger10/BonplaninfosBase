import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useData } from '@/contexts/DataContext';
import { Loader2, Upload, RefreshCcw, Database, Clock, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ResetDataModal from './ResetDataModal';
import LicenseConfiguration from './LicenseConfiguration';
import WithdrawalScheduleSettings from './WithdrawalScheduleSettings';
import PinResetRequestsManager from './PinResetRequestsManager';
const ConfigTab = () => {
  const { appSettings, loading, refreshData } = useData();
  const { user } = useAuth();
  
  const [configForm, setConfigForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [lastResetTime, setLastResetTime] = useState(null);

  useEffect(() => {
    if (appSettings) {
      setConfigForm(appSettings);
      setLogoUrl(appSettings.logo_url || '');
    }
    fetchLastResetTime();
  }, [appSettings]);

  const fetchLastResetTime = async () => {
    try {
      const { data } = await supabase
        .from('admin_logs')
        .select('created_at')
        .eq('action_type', 'reset_data')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (data) {
        setLastResetTime(new Date(data.created_at));
      }
    } catch (e) {
      console.error("Failed to fetch reset log", e);
    }
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `public/logo-${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('media').upload(fileName, file, { upsert: true });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
      setLogoUrl(publicUrl);
      setConfigForm(prev => ({ ...prev, logo_url: publicUrl }));
      toast({ title: 'Logo téléversé avec succès' });
    } catch (error) {
      toast({ title: 'Erreur de téléversement', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    if (!configForm) return;

    const { id, ...updateData } = configForm;

    const numericData = {
      ...updateData,
      coin_to_fcfa_rate: Number(updateData.coin_to_fcfa_rate) || 10,
      min_withdrawal_pi: Number(updateData.min_withdrawal_pi) || 50,
      platform_fee_percentage: Number(updateData.platform_fee_percentage) > 0 ? Number(updateData.platform_fee_percentage) : 5,
      // Convention unique : FCFA pour 1 € / 1 $ (lue telle quelle par
      // AdminCreditsTab). Avant, ce formulaire stockait l'inverse (0.0015 EUR
      // pour 1 FCFA), ce qui divisait les conversions par ~430 000.
      currency_eur_rate: Number(updateData.currency_eur_rate) > 0 ? Number(updateData.currency_eur_rate) : 650,
      currency_usd_rate: Number(updateData.currency_usd_rate) > 0 ? Number(updateData.currency_usd_rate) : 550,
      logo_url: logoUrl,
    };

    delete numericData.coin_packs;
    delete numericData.promotion_packs;
    delete numericData.created_at;
    delete numericData.updated_at;
    delete numericData.updated_by;
    // Commission rates are now handled in the LicenseConfiguration component
    delete numericData.commission_rate_starter;
    delete numericData.commission_rate_business;
    delete numericData.commission_rate_premium;

    try {
      let error;
      if (id) {
        const { error: updateError } = await supabase.from('app_settings').update(numericData).eq('id', id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('app_settings').insert([numericData]);
        error = insertError;
      }

      if (error) throw error;

      toast({ title: "Configuration mise à jour", description: "Les paramètres ont été sauvegardés.", variant: "success" });
      if (refreshData) refreshData();
    } catch (error) {
      toast({ title: "Erreur lors de la mise à jour", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetApplication = async () => {
    setIsResetting(true);
    try {
      const { data, error } = await supabase.rpc('reset_application_data', { p_admin_id: user.id });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast({ title: "Application Réinitialisée !", description: data.message, duration: 9000 });
      window.location.reload();
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  };

  if (loading && !configForm) {
    return (
        <div className="flex flex-col justify-center items-center p-12 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Chargement de la configuration...</p>
        </div>
    );
  }

  const handleInputChange = (key, value) => {
    setConfigForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Card className="shadow-lg rounded-xl">
        <CardHeader><CardTitle>Configuration de la plateforme</CardTitle></CardHeader>
        <CardContent className="space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="logo">Logo de la page d'accueil</Label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                    <img src={logoUrl} alt="Logo actuel" className="w-16 h-16 object-contain rounded-md bg-gray-100 p-1 border" />
                ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center text-gray-400 border">
                        <Upload className="w-6 h-6" />
                    </div>
                )}
                <Input id="logo" type="file" onChange={(e) => handleLogoUpload(e.target.files[0])} className="hidden" />
                <Button asChild variant="outline">
                  <Label htmlFor="logo" className="cursor-pointer">
                    {uploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Changer le logo
                  </Label>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platformFee">Frais de plateforme sur les transactions (%)</Label>
              <Input id="platformFee" type="number" value={configForm?.platform_fee_percentage || 5} onChange={(e) => handleInputChange('platform_fee_percentage', e.target.value)} />
            </div>
          </div>

          <h3 className="text-lg font-semibold pt-4 border-t mt-6">Valeurs Monétaires</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label>Conversion Pièces</Label>
              <div className="flex items-center gap-2">
                <span>1 Pièce =</span>
                <Input type="number" value={configForm?.coin_to_fcfa_rate || 10} onChange={(e) => handleInputChange('coin_to_fcfa_rate', e.target.value)} className="w-24" />
                <span>FCFA</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minWithdrawal">Retrait minimum (pièces)</Label>
              <Input id="minWithdrawal" type="number" value={configForm?.min_withdrawal_pi || 50} onChange={(e) => handleInputChange('min_withdrawal_pi', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eurRate">Taux EUR (FCFA pour 1 €)</Label>
              <Input id="eurRate" type="number" min="1" step="1" value={configForm?.currency_eur_rate || 650} onChange={(e) => handleInputChange('currency_eur_rate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usdRate">Taux USD (FCFA pour 1 $)</Label>
              <Input id="usdRate" type="number" min="1" step="1" value={configForm?.currency_usd_rate || 550} onChange={(e) => handleInputChange('currency_usd_rate', e.target.value)} />
            </div>
          </div>

          <Button onClick={handleSaveConfig} disabled={isSaving || uploadingLogo} className="w-full md:w-auto mt-4">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sauvegarder la configuration
          </Button>
        </CardContent>
      </Card>

      {/* License Configuration Section */}
      <LicenseConfiguration onUpdate={refreshData} />

      {/* Withdrawal Schedule Settings */}
      <WithdrawalScheduleSettings />
      <PinResetRequestsManager />

      {/* Danger Zones */}
      <Card className="border-orange-500/50 shadow-lg rounded-xl mt-8 bg-orange-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-600"><Database className="h-5 w-5" /> Nettoyage des Données</CardTitle>
          <CardDescription>
            Supprime les transactions et remet à zéro les compteurs, mais <strong>garde les utilisateurs et les événements</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lastResetTime && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
              <Clock className="w-3 h-3" /> Dernier nettoyage : {lastResetTime.toLocaleString('fr-FR')}
            </p>
          )}
          <Button 
            variant="outline" 
            className="border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white"
            onClick={() => setShowResetModal(true)}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Nettoyer les Transactions & Données
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive shadow-lg rounded-xl mt-8 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Zone de danger absolue</CardTitle>
          <CardDescription>
            Suppression totale de l'application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Cette action supprimera <strong>TOUT</strong> : utilisateurs (sauf admins), événements, configurations, historiques.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Réinitialiser TOTALEMENT l'Application</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Êtes-vous absolument certain ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est <strong>IRREVERSIBLE</strong>. Elle supprimera définitivement toutes les données.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetApplication} disabled={isResetting} className="bg-destructive hover:bg-destructive/90">
                  {isResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Oui, TOUT supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <ResetDataModal 
        open={showResetModal} 
        onOpenChange={setShowResetModal} 
        onSuccess={() => {
          fetchLastResetTime();
          if (refreshData) refreshData();
        }}
      />
    </div>
  );
};

export default ConfigTab;