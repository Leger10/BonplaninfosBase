import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import MultilingualSeoHead from '@/components/MultilingualSeoHead';
import { Loader2, Download, FileText, CheckCircle2, UploadCloud, AlertTriangle, ShieldCheck, Smartphone, Upload, X, Copy } from 'lucide-react';
import { PurchaseService } from '@/services/purchaseService';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { generateContractPDF } from '@/utils/contractGenerator';
import { useTranslation } from 'react-i18next';
import { buildUSSDCode } from '@/components/payment/USSDPaymentModal';
import '@/styles/LicensePurchase.css';

const coverageLabel = (t) => {
  const v = String(t || '').toLowerCase();
  if (v === 'ville') return 'Ville';
  if (v === 'region' || v === 'région') return 'Région / Ville';
  if (v === 'pays') return 'Pays entier';
  return t || 'Zone';
};

const LicensePurchase = ({ user, userLicenses, licenses, purchaseLoading, uploading, onPurchase, onDownloadContract, onUploadContract }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatDuration = (days) => {
    const d = Number(days || 0);
    const years = Math.floor(d / 365);
    if (years > 0) return `${years} An${years > 1 ? 's' : ''}`;
    const months = Math.floor(d / 30);
    return `${months || 1} Mois`;
  };

  return (
    <div className="license-purchase px-2 sm:px-0">
      <AnimatePresence>
        {userLicenses && userLicenses.length > 0 && (
          <motion.section className="active-licenses" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-white text-lg sm:text-xl md:text-2xl flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
              {t('partner_signup.your_licenses_title') || 'Vos licences'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userLicenses.map(license => {
                const isPendingUssd = license.status === 'pending_payment';
                const isActive = license.status === 'active';
                const isPending = license.submission_status === 'pending';
                const isApproved = license.submission_status === 'approved';
                const isRejected = license.submission_status === 'rejected';
                const needsUpload = isActive && ((license.submission_status === 'pending_upload') || license.submission_status === 'rejected');

                return (
                  <div key={license.id} className="license-card bg-gray-900 border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white">
                    <div className="license-header mb-4">
                      <h3 className="text-white bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent font-bold text-base sm:text-lg truncate">
                        {license.partner_license_packs?.name || license.pack?.name || 'Licence'}
                      </h3>
                      <span className="license-status text-xs sm:text-sm mt-1 inline-block px-2 py-1 rounded-full bg-gray-800">
                        {isPendingUssd ? '🟡 Paiement USSD en validation (super admin)' :
                         isActive && isApproved ? '🟢 Active' :
                         isActive && isRejected ? '🔴 Contrat rejeté' :
                         isActive && isPending ? '🟡 Contrat en examen' :
                         isActive ? '⚪ Active (contrat à soumettre)' : `⚪ ${license.status || '—'}`}
                      </span>
                    </div>
                    <div className="license-details text-gray-300 text-sm space-y-2">
                      <p><strong className="text-amber-300 text-xs sm:text-sm">{t('partner_signup.license_card.revenue_share', { percent: license.revenue_share_percent ?? license.partner_license_packs?.revenue_share_percent }) || `Part: ${license.revenue_share_percent ?? ''}%`}</strong></p>
                      <p><strong className="text-cyan-300 text-xs sm:text-sm">Achetée le</strong> {formatDate(license.purchase_date)}</p>
                      {license.expiry_date && <p><strong className="text-emerald-300 text-xs sm:text-sm">Expire le</strong> {formatDate(license.expiry_date)}</p>}
                      {isPendingUssd && (
                        <Alert className="mt-3 bg-yellow-900/20 border-yellow-800 p-3">
                          <Smartphone className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-400" />
                          <AlertTitle className="text-yellow-200 text-xs sm:text-sm">En attente de validation</AlertTitle>
                          <AlertDescription className="text-yellow-100/80 text-xs sm:text-sm">Votre paiement USSD a été enregistré. Le <strong>super administrateur</strong> vérifie le dépôt puis valide le pack et procède à votre nomination (admin/partenaire) selon la zone de votre pack.</AlertDescription>
                        </Alert>
                      )}
                      {isRejected && license.admin_notes && (
                        <Alert variant="destructive" className="mt-3 bg-red-900/30 border-red-800 p-3">
                          <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-red-400" />
                          <AlertTitle className="text-red-200 text-xs sm:text-sm">Dossier rejeté</AlertTitle>
                          <AlertDescription className="text-red-300 text-xs sm:text-sm truncate">{license.admin_notes}</AlertDescription>
                        </Alert>
                      )}
                      {needsUpload && (
                        <div className="bg-orange-900/30 p-3 rounded-lg border border-orange-800 space-y-2 mt-3">
                          <p className="text-xs sm:text-sm font-medium text-orange-300 flex items-center gap-2"><AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" /> Contrat (option/action requise)</p>
                          <div className="flex flex-col gap-2">
                            <Button size="sm" variant="outline" onClick={() => onDownloadContract(license)} className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white h-8 sm:h-9 text-xs">
                              <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2" /> 1. Télécharger
                            </Button>
                            <div className="relative">
                              <input type="file" accept="application/pdf" className="hidden" id={`upload-${license.id}`} onChange={(e) => onUploadContract(e, license)} ref={fileInputRef} />
                              <Button size="sm" className="bg-indigo-900 hover:bg-indigo-800 w-full text-white h-8 sm:h-9 text-xs" onClick={() => document.getElementById(`upload-${license.id}`).click()} disabled={uploading}>
                                {uploading ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin mr-2" /> : <UploadCloud className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />} 2. Envoyer
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      {isPending && !isPendingUssd && (
                        <div className="mt-3 text-xs sm:text-sm text-gray-400">
                          <p className="italic">Contrat en cours d'examen.</p>
                          {license.contract_url && <a href={license.contract_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1 mt-1"><FileText className="w-3 h-3" /> Voir document</a>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="available-licenses mt-8 sm:mt-12">
        <h2 className="text-white text-lg sm:text-xl md:text-2xl mb-2">🚀 {t('partner_signup.available_licenses_title') || 'Packs partenaires'}</h2>
        <p className="license-subtitle text-gray-400 text-sm sm:text-base mb-6">
          Paiement par <strong className="text-white">USSD (Mobile Money)</strong>. Après validation du dépôt par le <strong className="text-white">super administrateur</strong>, votre pack est activé et vous êtes nommé administrateur/partenaire sur la <strong className="text-white">ville</strong> ou le <strong className="text-white">pays</strong> défini par votre pack.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {(licenses || []).map((license, index) => {
            const benefits = Array.isArray(license?.features) ? license.features : (Array.isArray(license?.benefits) ? license.benefits : []);
            const licenseName = String(license?.name || '');
            const isPopular = licenseName.toUpperCase().includes('BUSINESS');
            const isPremium = licenseName.toUpperCase().includes('PREMIUM');
            return (
              <motion.div key={license.id} className="license-pack-card bg-gray-900 border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 relative" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                {(isPopular || isPremium) && (
                  <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-bold ${isPopular ? 'bg-emerald-600 text-white' : 'bg-purple-600 text-white'}`}>{isPopular ? 'Recommandé' : 'Premium'}</div>
                )}
                <div className="license-pack-header mb-4">
                  <Badge variant="outline" className="mb-2 text-xs sm:text-sm border-blue-500 text-blue-300 bg-blue-500/10">{coverageLabel(license.coverage_type)}</Badge>
                  <h3 className="text-white font-bold text-lg sm:text-xl md:text-2xl">{license.name}</h3>
                  <div className="license-price text-amber-300 font-bold text-xl sm:text-2xl md:text-3xl mt-2">
                    {Number(license?.fcfa_price || 0).toLocaleString()} FCFA
                    <span className="text-sm font-normal text-gray-300 block mt-1">Paiement unique (USSD)</span>
                  </div>
                </div>
                <div className="revenue-share mt-3 sm:mt-4">
                  <div className="revenue-percent text-emerald-400 font-bold text-3xl sm:text-4xl">{license.revenue_share_percent}%</div>
                  <div className="revenue-label text-emerald-300 font-medium text-sm">de la commission</div>
                </div>
                <div className="bg-gray-800 p-2 sm:p-3 rounded-lg border border-gray-700 mt-3">
                  <div className="flex items-center justify-center gap-2 text-white font-medium text-sm sm:text-base">{formatDuration(license.duration_days)}</div>
                </div>
                <div className="license-features mt-4">
                  <h4 className="text-gray-300 font-semibold text-sm sm:text-base mb-2">Fonctionnalités :</h4>
                  <ul className="space-y-1 sm:space-y-2">
                    {benefits.map((feature, idx) => (
                      <li key={idx} className="text-gray-300 text-xs sm:text-sm flex items-start"><CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" /><span className="text-gray-200">{feature}</span></li>
                    ))}
                  </ul>
                </div>
                <Button onClick={() => onPurchase(license)} className="buy-license-button mt-4 sm:mt-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 shadow-lg h-10 sm:h-12 w-full text-sm sm:text-base" disabled={purchaseLoading === license.id}>
                  {purchaseLoading === license.id ? <Loader2 className="animate-spin w-4 h-4" /> : (<><Smartphone className="mr-2 w-4 h-4" /> Payer par USSD</>)}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Lecture du fichier échouée'));
  r.readAsDataURL(file);
});

const compressImageDataUrl = async (file) => {
  const dataUrl = await readFileAsDataUrl(file);
  const blob = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1200; let { width, height } = img;
      if (width > maxDim || height > maxDim) { const ratio = Math.min(maxDim / width, maxDim / height); width = Math.round(width * ratio); height = Math.round(height * ratio); }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Compression échouée"))), 'image/jpeg', 0.8);
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = dataUrl;
  });
  return readFileAsDataUrl(blob);
};

const PartnerSignupPage = () => {
  const { user } = useAuth();
  const { userProfile, loadingProfile } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const subscriptionRef = useRef(null);

  const [licenses, setLicenses] = useState([]);
  const [userLicenses, setUserLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [ussdOpen, setUssdOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState(null);
  const [ussdPhone, setUssdPhone] = useState('');
  const [ussdCountry, setUssdCountry] = useState('');
  const [ussdCity, setUssdCity] = useState('');
  const [ussdProof, setUssdProof] = useState('');
  const [ussdProofName, setUssdProofName] = useState('');
  const [ussdSubmitting, setUssdSubmitting] = useState(false);

  const fetchData = useCallback(async (showToast = false) => {
    if (!showToast) setLoading(true);
    try {
      const packs = await PurchaseService.getLicensePacks();
      setLicenses(packs);

      if (user) {
        // Toutes les licences utilisateur (inclut pending_payment USSD), pas seulement actives
        const { data: myLicenses } = await supabase
          .from('user_partner_licenses')
          .select('*, partner_license_packs(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        const { data: submissions } = await supabase
          .from('contract_submissions')
          .select('*')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false });
        const licensesWithStatus = (myLicenses || []).map(lic => {
          const submission = submissions?.find(s => s.license_id === lic.id) || submissions?.find(s => s.license_pack_id === lic.license_pack_id);
          return {
            ...lic,
            partner_license_packs: lic.partner_license_packs || null,
            submission_status: submission ? submission.status : 'pending_upload',
            submission_date: submission ? submission.submitted_at : null,
            admin_notes: submission ? submission.admin_notes : null,
            contract_url: submission ? submission.contract_file_url : null,
          };
        });
        setUserLicenses(licensesWithStatus);
      }

      if (showToast) toast({ title: 'Mise à jour', description: 'Les offres ont été mises à jour.', variant: 'info' });
    } catch (error) {
      console.error('Error fetching partner data:', error);
      toast({ title: 'Erreur', description: 'Impossible de charger les données.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('public:partner_license_packs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_license_packs' }, () => fetchData(true))
      .subscribe();
    subscriptionRef.current = channel;
    return () => { if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current); };
  }, [fetchData]);

  useEffect(() => {
    if (userProfile) {
      setUssdCountry((c) => c || userProfile.country || '');
      setUssdCity((c) => c || userProfile.city || '');
      setUssdPhone((p) => p || userProfile.phone || '');
    }
  }, [userProfile]);

  const openUssdPurchase = (license) => {
    if (!user) {
      toast({ title: 'Connexion requise', description: 'Veuillez vous connecter.', variant: 'warning' });
      navigate('/auth?redirect=/partner-signup');
      return;
    }
    setSelectedPack(license);
    setUssdProof('');
    setUssdProofName('');
    setUssdOpen(true);
  };

  const handleProofPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      toast({ title: 'Format invalide', description: "Veuillez choisir une capture d'écran (image).", variant: 'destructive' });
      return;
    }
    try {
      const dataUrl = await compressImageDataUrl(file);
      setUssdProof(dataUrl);
      setUssdProofName(file.name);
    } catch (err) {
      toast({ title: 'Erreur', description: err.message || "Impossible de lire l'image.", variant: 'destructive' });
    }
  };

  const submitUssdLicense = async () => {
    if (!user || !selectedPack) return;
    const amountFcfa = Number(selectedPack.fcfa_price || 0);
    const phone = String(ussdPhone || '').replace(/[^\d+]/g, '');
    const country = String(ussdCountry || '').trim();
    const ctype = String(selectedPack.coverage_type || '').toLowerCase();
    const needsCity = ctype === 'ville' || ctype === 'region' || ctype === 'région';
    const city = String(ussdCity || '').trim();
    if (!country) { toast({ title: 'Zone requise', description: 'Indiquez le pays de votre zone.', variant: 'destructive' }); return; }
    if (needsCity && !city) { toast({ title: 'Zone requise', description: 'Indiquez la ville de votre zone (selon votre pack).', variant: 'destructive' }); return; }
    if (phone.replace(/\D/g, '').length < 8) { toast({ title: 'Téléphone requis', description: 'Numéro Mobile Money invalide.', variant: 'destructive' }); return; }
    if (!ussdProof) { toast({ title: 'Capture requise', description: "Ajoutez la capture d'écran du dépôt USSD.", variant: 'destructive' }); return; }

    setUssdSubmitting(true);
    setPurchaseLoading(selectedPack.id);
    try {
      const transactionId = `BPI-LIC-USSD-${selectedPack.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const cities = (ctype === 'pays') ? [] : (city ? [city] : []);
      const res = await fetch('/.netlify/functions/ussd-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          type: 'partner_license',
          userId: user.id,
          license_pack_id: selectedPack.id,
          amountFcfa,
          phone,
          proofDataUrl: ussdProof,
          transactionId,
          coverage: { country, cities },
        }),
      });
      const text = await res.text();
      let result = null;
      try { result = JSON.parse(text); } catch (_) {}
      if (!result) throw new Error("Service USSD injoignable. Vérifiez que le serveur est démarré.");
      if (!res.ok || !result.success) throw new Error(result.message || `Erreur HTTP ${res.status}`);

      toast({ title: 'Paiement USSD enregistré', description: result.message || 'En attente de validation du super administrateur.', className: 'bg-green-600 text-white' });
      setUssdOpen(false);
      setSelectedPack(null);
      fetchData();
    } catch (error) {
      console.error('USSD license submit error:', error);
      toast({ title: 'Erreur', description: error.message || "Échec de l'envoi du paiement USSD.", variant: 'destructive' });
    } finally {
      setUssdSubmitting(false);
      setPurchaseLoading(null);
    }
  };

  const handleDownloadContract = (license) => {
    try {
      const packName = (license.partner_license_packs?.name || license.pack?.name || '').toLowerCase();
      let tier = 'starter';
      if (packName.includes('business')) tier = 'business';
      if (packName.includes('premium')) tier = 'premium';
      generateContractPDF(tier, userProfile);
    } catch (e) {
      console.error(e);
      toast({ title: 'Erreur', description: 'Erreur lors de la génération du PDF.', variant: 'destructive' });
    }
  };

  const handleFileUpload = async (event, license) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast({ title: 'Format invalide', description: 'Veuillez uploader un fichier PDF uniquement.', variant: 'destructive' }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: 'Fichier trop volumineux', description: 'La taille maximale est de 10 Mo.', variant: 'destructive' }); return; }
    setUploading(true);
    try {
      const fileName = `contracts/${user.id}/${license.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('contracts').upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName);
      const { error: dbError } = await supabase.from('contract_submissions').insert({
        user_id: user.id,
        license_pack_id: license.partner_license_packs?.id || license.license_pack_id,
        license_id: license.id,
        contract_file_url: publicUrl,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });
      if (dbError) throw dbError;
      toast({ title: 'Contrat envoyé !', description: 'Votre contrat a été soumis et est en attente de validation.', variant: 'success' });
      fetchData();
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Erreur d'envoi", description: "Impossible d'envoyer le fichier.", variant: 'destructive' });
    } finally {
      setUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-center p-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-4">{t('partner_signup.unauthorized_title') || 'Connexion requise'}</h1>
          <p className="text-gray-400 mb-6 text-sm sm:text-base">{t('partner_signup.unauthorized_desc') || 'Connectez-vous pour devenir partenaire.'}</p>
          <Button onClick={() => navigate('/auth')} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white h-10 sm:h-12 text-sm sm:text-base">{t('partner_signup.unauthorized_cta') || 'Se connecter'}</Button>
        </div>
      </div>
    );
  }

  if (loading || loadingProfile) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 animate-spin text-blue-400 mx-auto" />
          <p className="mt-4 text-gray-300 text-sm sm:text-base">Chargement des offres partenaires...</p>
        </div>
      </div>
    );
  }

  const ussdCode = selectedPack ? buildUSSDCode(Number(selectedPack.fcfa_price || 0)) : '';
  const ctype = String(selectedPack?.coverage_type || '').toLowerCase();
  const needsCity = ctype === 'ville' || ctype === 'region' || ctype === 'région';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <MultilingualSeoHead pageData={{ title: t('partner_signup.meta_title') || 'Devenir partenaire', description: t('partner_signup.meta_description') || 'Packs partenaires BonPlanInfos' }} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="container mx-auto px-3 sm:px-4 py-8 sm:py-12 md:py-20">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Devenir Partenaire BonPlanInfos</h1>
          <p className="text-gray-300 max-w-2xl mx-auto text-sm sm:text-base md:text-lg px-2">Achetez votre pack par <strong>USSD</strong>. Le super administrateur valide le paiement, puis vous nomme administrateur/partenaire sur la zone (ville ou pays) prévue par votre pack.</p>
        </div>

        <LicensePurchase user={userProfile} userLicenses={userLicenses} licenses={licenses} purchaseLoading={purchaseLoading} uploading={uploading} onPurchase={openUssdPurchase} onDownloadContract={handleDownloadContract} onUploadContract={handleFileUpload} />
      </motion.div>

      <Dialog open={ussdOpen} onOpenChange={(v) => { if (!ussdSubmitting) { setUssdOpen(v); if (!v) setSelectedPack(null); } }}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-amber-400" /> Paiement USSD — {selectedPack?.name}</DialogTitle>
            <DialogDescription className="text-slate-400">Payez par Mobile Money, envoyez la capture du dépôt. Le super administrateur validera et activera votre nomination selon votre pack.</DialogDescription>
          </DialogHeader>
          {selectedPack && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm text-amber-200/90">Montant à payer</div>
                <div className="text-2xl font-bold text-amber-300">{Number(selectedPack.fcfa_price || 0).toLocaleString()} FCFA</div>
                <div className="mt-2 text-sm text-slate-300">Code USSD :</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white break-all">{ussdCode}</code>
                  <Button type="button" variant="outline" className="border-slate-700" onClick={async () => { try { await navigator.clipboard.writeText(ussdCode); toast({ title: 'Code copié' }); } catch (_) {} }}><Copy className="w-4 h-4" /></Button>
                </div>
                <div className="text-xs text-slate-400 mt-2">Composez ce code sur votre téléphone Mobile Money et effectuez le paiement du montant exact.</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200">Pays (zone) *</Label>
                  <Input value={ussdCountry} onChange={(e) => setUssdCountry(e.target.value)} placeholder="Ex: Burkina Faso" className="bg-slate-900 border-slate-700 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200">{ctype === 'pays' ? 'Ville (optionnel, pays entier)' : 'Ville (zone) *'}</Label>
                  <Input value={ussdCity} onChange={(e) => setUssdCity(e.target.value)} placeholder={ctype === 'pays' ? 'Laisser vide = pays entier' : 'Ex: Ouagadougou'} className="bg-slate-900 border-slate-700 text-white" />
                  <p className="text-[11px] text-slate-500">Pack « {coverageLabel(selectedPack.coverage_type)} » : {ctype === 'pays' ? 'nomination sur tout le pays.' : 'nomination sur la ville indiquée.'}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-200">Numéro Mobile Money (dépôt) *</Label>
                <Input value={ussdPhone} onChange={(e) => setUssdPhone(e.target.value)} placeholder="Ex: 70 00 00 00" className="bg-slate-900 border-slate-700 text-white" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-200">Capture d'écran du dépôt *</Label>
                <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-900/60 px-4 py-6 cursor-pointer hover:border-amber-500/50 transition-colors">
                  <input type="file" accept="image/*" className="hidden" onChange={handleProofPick} />
                  <Upload className="w-5 h-5 text-slate-400" />
                  <span className="text-sm text-slate-300">{ussdProofName || "Choisir la capture d'écran"}</span>
                </label>
                {ussdProof && <img src={ussdProof} alt="Preuve" className="mt-2 max-h-40 rounded-lg border border-slate-700 object-contain" />}
              </div>

              <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs text-slate-400">
                Après validation par le <strong className="text-slate-200">super administrateur</strong> : pack activé, profil nommé <strong className="text-slate-200">administrateur</strong> et zone partenaire définie ({ctype === 'pays' ? 'pays' : 'ville'}) selon ce pack.
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="outline" className="border-slate-700 text-slate-200" onClick={() => setUssdOpen(false)} disabled={ussdSubmitting}>Annuler</Button>
                <Button type="button" onClick={submitUssdLicense} disabled={ussdSubmitting} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  {ussdSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Envoyer pour validation
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerSignupPage;
