import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  Printer,
  ShieldCheck,
} from "lucide-react";
import ContractDocument from "@/components/contract/ContractDocument";
import ContractForm from "@/components/contract/ContractForm";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useData } from "@/contexts/DataContext";
import {
  ALL_FIELDS,
  CONTRACT_STORAGE_KEY,
  renderContract,
} from "@/lib/contract/fields";
import "@/styles/contract.css";

const SAVE_DELAY_MS = 400;

function loadDraft() {
  try {
    const raw = window.localStorage.getItem(CONTRACT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      ALL_FIELDS.filter((field) => typeof parsed[field.key] === "string").map(
        (field) => [field.key, parsed[field.key]],
      ),
    );
  } catch {
    return {};
  }
}

const PartnershipContractPage = () => {
  const { toast } = useToast();
  const { userProfile } = useData();
  const [initialDraft] = useState(loadDraft);
  const [values, setValues] = useState(initialDraft);
  const [savedAt, setSavedAt] = useState(() =>
    Object.keys(initialDraft).length > 0 ? new Date() : null,
  );
  const [downloading, setDownloading] = useState(false);

  const renderedContract = useMemo(() => renderContract(values), [values]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(CONTRACT_STORAGE_KEY, JSON.stringify(values));
        setSavedAt(new Date());
      } catch {
        // Stockage indisponible (navigation privée, quota) : la saisie reste en mémoire.
      }
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [values]);

  const handleChange = useCallback((key, value) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    const confirmed = window.confirm(
      "Effacer toutes les informations saisies dans ce navigateur ?",
    );
    if (!confirmed) return;

    window.localStorage.removeItem(CONTRACT_STORAGE_KEY);
    setValues({});
    setSavedAt(null);
    toast({ title: "Formulaire réinitialisé" });
  }, [toast]);

  const handlePrefillProfile = useCallback(() => {
    const profile = userProfile || {};
    const siege = [profile.city, profile.country].filter(Boolean).join(", ");
    const suggestions = {
      "partieA.nom": profile.full_name,
      "partieA.email": profile.email,
      "partieA.telephone": profile.phone,
      "partieA.siege": siege,
      "partieA.representant": profile.full_name,
      signatureNomA: profile.full_name,
    };

    setValues((previous) => {
      const next = { ...previous };
      Object.entries(suggestions).forEach(([key, value]) => {
        if (!next[key] && value) next[key] = value;
      });
      return next;
    });

    toast({
      title: "Partie A pré-remplie",
      description:
        "Les champs déjà saisis ont été conservés. Vérifiez les informations avant de générer le PDF.",
    });
  }, [toast, userProfile]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const { downloadContractPdf } = await import("@/lib/contract/contractPdf");
      const fileName = downloadContractPdf(values);
      toast({
        title: "PDF généré",
        description: `Le fichier ${fileName} a été téléchargé.`,
      });
    } catch (error) {
      console.error("Erreur de génération du contrat PDF :", error);
      toast({
        title: "Génération impossible",
        description:
          "Le PDF n’a pas pu être créé. Utilisez « Imprimer » puis « Enregistrer au format PDF ».",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }, [toast, values]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const filledCount = ALL_FIELDS.filter((field) => {
    const value = values[field.key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }).length;

  return (
    <div className="min-h-screen bg-muted/30">
      <Helmet>
        <title>Contrat de partenariat stratégique — BonPlanInfos</title>
        <meta
          name="description"
          content="Lire, compléter et télécharger en PDF le contrat de partenariat stratégique de BonPlanInfos : 20 % de fonds de survie, 80 % partagés à parts égales."
        />
      </Helmet>

      <section className="border-b bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 text-white">
        <div className="container py-8 lg:py-10">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l’accueil
          </Link>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70">
                <FileText className="h-4 w-4" />
                Document contractuel
              </p>
              <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                Contrat de partenariat stratégique
              </h1>
              <p className="mt-2 text-sm text-white/85 sm:text-base">
                Promotion, communication et partage de revenus. Lisez le contrat,
                complétez les informations utiles, puis téléchargez votre exemplaire
                en PDF prêt à signer.
              </p>
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/20">
                <p className="text-xl font-bold">20 %</p>
                <p className="text-[11px] leading-tight text-white/75">
                  Fonds de survie
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/20">
                <p className="text-xl font-bold">80 %</p>
                <p className="text-[11px] leading-tight text-white/75">
                  À partager
                </p>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/20">
                <p className="text-xl font-bold">40/40</p>
                <p className="text-[11px] leading-tight text-white/75">
                  Partie A / Partie B
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="bg-white text-indigo-700 hover:bg-white/90"
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Télécharger le PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimer
            </Button>
            <a
              href="/docs/contrat-partenariat-strategique-bonplaninfos.docx"
              className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-white/85 underline-offset-4 hover:text-white hover:underline"
              download
            >
              Version Word (à faire relire)
            </a>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs text-white/75">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Modèle à faire valider par un avocat et un comptable avant signature.
            Aucune information saisie ici n’est envoyée à un serveur.
          </p>
        </div>
      </section>

      <div className="container py-6 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
            <ContractForm
              values={values}
              onChange={handleChange}
              onPrefillProfile={handlePrefillProfile}
              onReset={handleReset}
              canPrefillProfile={Boolean(userProfile?.full_name || userProfile?.email)}
            />

            <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {filledCount > 0
                  ? "Brouillon enregistré dans ce navigateur"
                  : "Aucune donnée saisie pour le moment"}
              </span>
              {savedAt && (
                <span>
                  {savedAt.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Le PDF reprend exactement l’aperçu ci-contre. Les champs laissés
                  vides restent entre crochets afin de pouvoir être complétés à la
                  main avant signature.
                </span>
              </p>
            </div>
          </div>

          <div id="contract-preview" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Aperçu du contrat
              </h2>
              <span className="text-xs text-muted-foreground">
                {filledCount} champ{filledCount > 1 ? "s" : ""} complété
                {filledCount > 1 ? "s" : ""} sur {ALL_FIELDS.length}
              </span>
            </div>

            <div className="contract-paper">
              <div className="contract-paper-inner">
                <ContractDocument markdown={renderedContract} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <div id="contract-print-root">
            <ContractDocument markdown={renderedContract} />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default PartnershipContractPage;
