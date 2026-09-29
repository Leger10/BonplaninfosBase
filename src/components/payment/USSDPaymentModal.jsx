import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";
import {
  Copy,
  Check,
  Smartphone,
  Phone,
  Loader2,
  X,
  ShieldCheck,
  Wallet,
  ArrowRight,
  Upload,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// ─── Configuration marchand USSD (mobile money direct) ───
export const USSD_MERCHANT = "46598281";
export const USSD_PREFIX = "*144*10*";
export const USSD_QR_IMAGE = import.meta.env?.VITE_USSD_QR_IMAGE_URL || "";
export const buildUSSDCode = (amount) =>
  `${USSD_PREFIX}${USSD_MERCHANT}*${Number(amount) || 0}#`;
export const buildUSSDTelLink = (amount) =>
  `tel:${buildUSSDCode(amount).replace(/#$/, "%23")}`;

// ─── Relance WhatsApp Bonplaninfos (abandon de paiement USSD) ───
export const Bonplaninfos_WHATSAPP_NUMBER = "22654329299"; // 0022654329299 (Burkina Faso)
export const buildBonplaninfosRelanceMessage = (amountFcfa, date = new Date()) => {
  const amount = Number(amountFcfa) || 0;
  const d = date instanceof Date && !isNaN(date) ? date : new Date();
  const dateStr = d.toLocaleDateString("fr-FR");
  const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return [
    "Bonjour Monsieur/Madame, nous espérons que vous allez bien.",
    "Je suis le support client Bonplaninfos.",
    `Nous vous contactons concernant un paiement de ${amount.toLocaleString("fr-FR")} effectué le ${dateStr} à ${timeStr} qui n'a pas abouti.`,
    "Pouvez-vous nous indiquer le problème afin que nous puissions vous assister.",
    "Merci d'utiliser bonplaninfos.",
  ].join(" ");
};

// Export the function with the name expected by TicketingInterface
export const openBonplaninfosRelance = (amountFcfa) => {
  const message = buildBonplaninfosRelanceMessage(amountFcfa);
  window.open(
    `https://wa.me/${Bonplaninfos_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer"
  );
};



const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
};

const USSDPaymentModal = ({
  open,
  onClose,
  amountFcfa,
  title = "Paiement Mobile Money",
  subtitle = "Payez par USSD puis confirmez avec la capture d'écran du dépôt.",
  submitLabel = "Valider mon paiement",
  requirePhone = false,
  initialPhone = "",
  onConfirm, // async (proofDataUrl, phone) => { ... }
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState(0); // 0 = instructions, 1 = confirmation, 2 = succès
  const [phone, setPhone] = useState(initialPhone || "");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofDataUrl, setProofDataUrl] = useState("");
  const [processingProof, setProcessingProof] = useState(false);

  const amount = Number(amountFcfa) || 0;
  const ussdCode = buildUSSDCode(amount);

  const reset = () => {
    setStep(0);
    setPhone(initialPhone || "");
    setCopied(false);
    setSubmitting(false);
    setProofFile(null);
    setProofDataUrl("");
    setProcessingProof(false);
  };

  // Compression locale de la capture d'écran (envoyée ensuite au serveur qui l'upload)
  const processProofFile = async (file) => {
    const readAsDataUrl = (blob) =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Lecture du fichier échouée"));
        r.readAsDataURL(blob);
      });
    const blob = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Compression de l'image échouée"))),
            "image/jpeg",
            0.8
          );
        };
        img.onerror = () => reject(new Error("Image illisible"));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
      reader.readAsDataURL(file);
    });
    const dataUrl = await readAsDataUrl(blob);
    return { blob, dataUrl };
  };

  const handleProofSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Format invalide",
        description: "Veuillez choisir une capture d'écran (image).",
        variant: "destructive",
      });
      return;
    }
    setProcessingProof(true);
    try {
      const { blob, dataUrl } = await processProofFile(file);
      setProofDataUrl(dataUrl);
      setProofFile(URL.createObjectURL(blob));
      toast({
        title: "📸 Image prête",
        description: "La capture d'écran sera envoyée à la confirmation du paiement.",
        className: "bg-green-600 text-white",
      });
    } catch (err) {
      console.error("❌ Erreur traitement preuve:", err);
      toast({
        title: "Erreur",
        description: err.message || "Impossible de traiter la capture d'écran.",
        variant: "destructive",
      });
    } finally {
      setProcessingProof(false);
      e.target.value = "";
    }
  };

  const handleRemoveProof = () => {
    setProofDataUrl("");
    setProofFile(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose?.();
  };

  const handleCopy = async () => {
    const ok = await copyText(ussdCode);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: ok ? "✅ Code copié !" : "Erreur de copie",
      description: ok
        ? "Composez ce code dans votre application mobile money."
        : "Veuillez copier manuellement le code.",
      variant: ok ? "default" : "destructive",
    });
  };

  const handleLaunch = () => {
    try {
      window.location.href = buildUSSDTelLink(amount);
    } catch (e) {
      toast({
        title: "Ouverture impossible",
        description: "Composez manuellement le code ci-dessus.",
        variant: "destructive",
      });
    }
  };

  const handleConfirm = async () => {
    if (requirePhone) {
      const clean = phone.replace(/\D/g, "");
      if (clean.length < 8 || clean.length > 12) {
        toast({
          title: "Numéro de téléphone invalide",
          description:
            "Veuillez saisir le numéro qui a effectué le paiement (8 à 12 chiffres). Ex: 73790978",
          variant: "destructive",
        });
        return;
      }
    }
    if (!proofDataUrl) {
      toast({
        title: "Capture d'écran requise",
        description: "Téléversez la capture d'écran de votre dépôt pour confirmer le paiement (obligatoire).",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await onConfirm?.(proofDataUrl, phone.trim());
      if (result === false) {
        setSubmitting(false);
        return;
      }
      setStep(2);
    } catch (err) {
      console.error("❌ Erreur confirmation USSD:", err);
      toast({
        title: "Erreur",
        description: err.message || "Impossible de valider le paiement.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gray-900 rounded-2xl p-6 sm:p-8 max-w-md w-full border border-yellow-500/40 shadow-2xl max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-full flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-black" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white leading-tight">{title}</h3>
                <p className="text-xs text-gray-400">{subtitle}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={submitting}
              className="text-gray-400 hover:text-white transition-colors disabled:opacity-40"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── ÉTAPE 0 : Instructions USSD ── */}
          {step === 0 && (
            <div className="space-y-4">
              {/* Montant */}
              <div className="text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Montant à payer</p>
                <p className="text-3xl font-extrabold text-white mt-1">
                  {amount.toLocaleString()}{" "}
                  <span className="text-sm font-medium text-gray-400">FCFA</span>
                </p>
              </div>

              {/* QR + Code */}
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white rounded-xl p-3">
                  {USSD_QR_IMAGE ? (
                    <img
                      src={USSD_QR_IMAGE}
                      alt="QR code Mobile Money"
                      className="w-[150px] h-[150px] rounded-lg object-contain"
                    />
                  ) : (
                    <QRCodeCanvas value={ussdCode} size={140} level="M" />
                  )}
                </div>
                <div className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-gray-500 mb-2">Votre code USSD</p>
                  <p className="font-mono text-xl sm:text-2xl font-bold text-yellow-400 tracking-wider break-all select-all">
                    {ussdCode}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <Button
                      onClick={handleCopy}
                      variant="outline"
                      className="flex-1 border-gray-700 text-gray-200 hover:bg-gray-800"
                    >
                      {copied ? <Check className="w-4 h-4 mr-2 text-green-400" /> : <Copy className="w-4 h-4 mr-2" />}
                      {copied ? "Copié !" : "Copier le code"}
                    </Button>
                    <Button
                      onClick={handleLaunch}
                      className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold"
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Lancer le paiement
                    </Button>
                  </div>
                </div>
              </div>

              {/* Rappel opérateur */}
              <div className="p-3 bg-green-600/10 border border-green-500/30 rounded-lg flex items-start gap-2">
                <Wallet className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-green-300">
                  Composez <strong className="font-mono">{ussdCode}</strong> sur votre téléphone,
                  validez avec votre code secret, puis appuyez sur suivre.
                </p>
              </div>

              <Button
                onClick={() => setStep(1)}
                className="w-full bg-gray-800 border border-gray-700 text-white hover:bg-gray-700"
              >
                J'ai effectué le paiement <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ── ÉTAPE 1 : Confirmation par capture d'écran du dépôt ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-600/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-300">
                  Confirmez votre paiement en téléversant la <strong>capture d'écran de votre dépôt</strong>{" "}
                  (obligatoire). Un administrateur vérifie la capture et valide vos billets.
                </p>
              </div>

              {requirePhone && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Numéro de téléphone (mobile money){" "}
                    <span className="text-red-400">· requis</span>
                  </label>
                  <Input
                    type="tel"
                    placeholder="Ex: 73790978"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white text-lg font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Le numéro avec lequel vous avez effectué le paiement USSD.
                  </p>
                </div>
              )}

              {/* Capture d'écran du dépôt (OBLIGATOIRE) */}
              <div className="p-3 bg-violet-600/10 border border-violet-500/30 rounded-lg">
                <p className="text-xs text-violet-300 mb-2">
                  📸 <strong className="text-violet-200">Capture d'écran du dépôt (obligatoire)</strong> —prenez la capture de
                  votre dépôt (transfert validé) puis téléversez-la pour confirmer le paiement.
                </p>
                {proofFile ? (
                  <div className="relative">
                    <img
                      src={proofFile}
                      alt="Preuve de paiement"
                      className="w-full max-h-56 object-contain rounded-lg border border-gray-700 bg-black/40"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveProof}
                      disabled={processingProof}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 hover:bg-red-700 disabled:opacity-50"
                      aria-label="Retirer la capture"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed border-gray-600 rounded-lg py-6 cursor-pointer hover:border-violet-400 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProofSelect}
                      disabled={processingProof}
                    />
                    {processingProof ? (
                      <Loader2 className="w-6 h-6 animate-spin text-violet-300" />
                    ) : (
                      <Upload className="w-6 h-6 text-violet-300" />
                    )}
                    <span className="text-xs text-violet-200">
                      {processingProof ? "Traitement de l'image..." : "Choisir / prendre la capture d'écran"}
                    </span>
                  </label>
                )}
                {proofDataUrl && (
                  <p className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Capture du dépôt sélectionnée — sera envoyée à la confirmation.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setStep(0)}
                  disabled={submitting}
                  variant="outline"
                  className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={submitting || !proofDataUrl}
                  className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Vérification...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 mr-2" /> {submitLabel}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── ÉTAPE 2 : Succès ── */}
          {step === 2 && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Paiement enregistré ! 🎉</h3>
                <p className="text-sm text-gray-400 mt-2">
                  Votre commande de <strong className="text-yellow-400">{amount.toLocaleString()} FCFA</strong> a été
                  prise en compte.
                </p>
                <p className="text-xs text-gray-500 mt-3 bg-gray-800/60 rounded-lg p-3">
                  🔍 Votre paiement est <strong className="text-yellow-400">en attente de validation</strong>. Un
                  administrateur vérifie la capture d'écran de votre dépôt, puis vos billets / crédits sont activés.
                </p>
              </div>
              <Button
                onClick={handleClose}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-bold"
              >
                Fermer
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default USSDPaymentModal;