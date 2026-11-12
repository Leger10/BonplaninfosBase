import contractTemplate from './contractTemplate.md?raw';

/**
 * Champs affichés dans le formulaire du contrat de partenariat.
 * Les clés correspondent aux jetons {{cle}} du modèle tokenisé.
 */
export const FIELD_GROUPS = [
  {
    id: 'partie-a',
    title: 'Partie A — La plateforme',
    description: 'BonPlanInfos ou la société qui exploite la plateforme.',
    fields: [
      { key: 'partieA.nom', label: 'Nom / raison sociale', placeholder: 'Ex. BonPlanInfos SARL', autoComplete: 'organization' },
      { key: 'partieA.forme', label: 'Forme juridique', placeholder: 'SARL, SAS, entreprise individuelle…' },
      { key: 'partieA.siege', label: 'Siège / adresse', placeholder: 'Ville, pays', autoComplete: 'street-address' },
      { key: 'partieA.rccm', label: 'RCCM / IFU / N° fiscal', placeholder: 'Numéro d’immatriculation' },
      { key: 'partieA.representant', label: 'Représentée par', placeholder: 'Nom et fonction du signataire' },
      { key: 'partieA.piece', label: 'Pièce d’identité', placeholder: 'Type et numéro' },
      { key: 'partieA.email', label: 'Email', type: 'email', placeholder: 'contact@exemple.com', autoComplete: 'email' },
      { key: 'partieA.telephone', label: 'Téléphone / WhatsApp', type: 'tel', placeholder: '+226 …', autoComplete: 'tel' },
    ],
  },
  {
    id: 'partie-b',
    title: 'Partie B — Le partenaire',
    description: 'Le partenaire promotion, communication et développement.',
    fields: [
      { key: 'partieB.nom', label: 'Nom / raison sociale', placeholder: 'Nom du partenaire ou de sa société', autoComplete: 'organization' },
      { key: 'partieB.forme', label: 'Forme juridique', placeholder: 'SARL, SAS, entreprise individuelle…' },
      { key: 'partieB.siege', label: 'Siège / adresse', placeholder: 'Ville, pays', autoComplete: 'street-address' },
      { key: 'partieB.rccm', label: 'RCCM / IFU / N° fiscal', placeholder: 'Numéro d’immatriculation' },
      { key: 'partieB.representant', label: 'Représenté par', placeholder: 'Nom et fonction du signataire' },
      { key: 'partieB.piece', label: 'Pièce d’identité', placeholder: 'Type et numéro' },
      { key: 'partieB.email', label: 'Email', type: 'email', placeholder: 'contact@exemple.com', autoComplete: 'email' },
      { key: 'partieB.telephone', label: 'Téléphone / WhatsApp', type: 'tel', placeholder: '+226 …', autoComplete: 'tel' },
    ],
  },
  {
    id: 'conditions',
    title: 'Conditions du partenariat',
    description: 'Les champs laissés vides restent affichés entre crochets dans le document.',
    fields: [
      { key: 'dateEffet', label: 'Date de prise d’effet', type: 'date' },
      { key: 'dureeMois', label: 'Durée initiale (mois)', type: 'number', min: 1, max: 120, placeholder: '12 ou 24' },
      { key: 'essaiMois', label: 'Période d’essai (mois)', type: 'number', min: 0, max: 24, placeholder: '3' },
      { key: 'territoire', label: 'Territoire', placeholder: 'Burkina Faso / Cameroun / autres pays' },
      { key: 'exclusivite', label: 'Exclusivité pendant l’essai', type: 'select', hint: 'Le modèle recommande de rester non exclusif pendant la période d’essai.', options: [
        { value: 'non', label: 'Non exclusive (recommandé)' },
        { value: 'oui', label: 'Exclusive' },
      ] },
      { key: 'preavisRenouvellementJours', label: 'Préavis de renouvellement (jours)', type: 'number', min: 0, placeholder: '60' },
      { key: 'preavisEssaiJours', label: 'Préavis pendant l’essai (jours)', type: 'number', min: 0, placeholder: '15' },
      { key: 'droitApplicable', label: 'Droit applicable', placeholder: 'burkinabè' },
      { key: 'juridiction', label: 'Juridiction compétente', placeholder: 'Tribunal de commerce de Ouagadougou / arbitrage CCJA' },
      { key: 'arbitrage', label: 'Médiation / arbitrage', placeholder: 'l’arbitrage de la CCJA / la juridiction compétente de Ouagadougou' },
    ],
  },
  {
    id: 'signature',
    title: 'Signature',
    description: 'Coordonnées de signature. Le nom de chaque partie est repris si le champ est vide.',
    fields: [
      { key: 'villeSignature', label: 'Fait à (ville)', placeholder: 'Ouagadougou' },
      { key: 'dateSignature', label: 'Date de signature', type: 'date' },
      { key: 'signatureNomA', label: 'Partie A — Nom du signataire', placeholder: 'Nom et prénom' },
      { key: 'signatureFonctionA', label: 'Partie A — Fonction', placeholder: 'Fondateur, Directeur général…' },
      { key: 'signatureNomB', label: 'Partie B — Nom du signataire', placeholder: 'Nom et prénom' },
      { key: 'signatureFonctionB', label: 'Partie B — Fonction', placeholder: 'Gérant, Directeur…' },
    ],
  },
  {
    id: 'annexe-1',
    title: 'Annexe 1 — Relevé mensuel (optionnel)',
    description: 'Les montants du relevé restent à compléter chaque mois ; seuls le mois et la date peuvent être préparés ici.',
    fields: [
      { key: 'annexe1.mois', label: 'Mois de référence', type: 'month' },
      { key: 'annexe1.date', label: 'Relevé établi le', type: 'date' },
    ],
  },
  {
    id: 'delais',
    title: 'Délais et paramètres avancés',
    description: 'Valeurs proposées dans le contrat. Laissez vide pour conserver les options entre crochets.',
    collapsed: true,
    fields: [
      { key: 'delaiValidationJours', label: 'Validation des contenus (jours)', type: 'number', min: 0, placeholder: '5' },
      { key: 'seuilReport', label: 'Seuil de report du RD (FCFA)', placeholder: '10 000' },
      { key: 'nonSollicitationMois', label: 'Non-sollicitation après le terme (mois)', type: 'number', min: 0, placeholder: '12' },
      { key: 'forceMajeureJours', label: 'Force majeure — résiliation (jours)', type: 'number', min: 0, placeholder: '30' },
      { key: 'delaiRemedeJours', label: 'Délai de correction d’un manquement (jours)', type: 'number', min: 0, placeholder: '15' },
      { key: 'moisObjectifsManques', label: 'Mois consécutifs sans KPI', type: 'number', min: 0, placeholder: '2' },
      { key: 'preavisKpiJours', label: 'Préavis en cas de KPI non atteints (jours)', type: 'number', min: 0, placeholder: '30' },
      { key: 'preavisSansMotifJours', label: 'Préavis de résiliation sans motif (jours)', type: 'number', min: 0, placeholder: '60' },
      { key: 'delaiReleveFinalJours', label: 'Relevé final après résiliation (jours)', type: 'number', min: 0, placeholder: '30' },
      { key: 'delaiAmiableJours', label: 'Règlement amiable (jours)', type: 'number', min: 0, placeholder: '30' },
    ],
  },
];

export const ALL_FIELDS = FIELD_GROUPS.flatMap((group) => group.fields);

export const CONTRACT_STORAGE_KEY = 'bpi.partnership-contract.v1';

const DATE_KEYS = new Set(['dateEffet', 'dateSignature', 'annexe1.date']);
const MONTH_KEYS = new Set(['annexe1.mois']);

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoMonth(value) {
  return /^\d{4}-\d{2}$/.test(value);
}

export function formatContractValue(key, rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  const value = String(rawValue).trim();
  if (!value) return '';

  if (DATE_KEYS.has(key) && isIsoDate(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  if (MONTH_KEYS.has(key) && isIsoMonth(value)) {
    const [year, month] = value.split('-');
    return `${month}/${year}`;
  }

  return value;
}

/**
 * Ajoute les valeurs calculées (cases à cocher, nom de signature par défaut).
 */
export function resolveContractValues(values = {}) {
  const exclusivite = values.exclusivite === 'oui' || values.exclusivite === 'non' ? values.exclusivite : '';

  return {
    ...values,
    excluNonCase: exclusivite === 'non' ? 'X' : '',
    excluOuiCase: exclusivite === 'oui' ? 'X' : '',
    exclusiviteTexte: exclusivite === 'oui' ? 'exclusif' : exclusivite === 'non' ? 'non exclusif' : '',
    signatureNomA: values.signatureNomA || values['partieA.nom'] || values.partieA?.nom || '',
    signatureNomB: values.signatureNomB || values['partieB.nom'] || values.partieB?.nom || '',
  };
}

/** Échappe les caractères qui casseraient un tableau Markdown. */
function escapeInlineValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * Remplace les jetons du modèle par les valeurs saisies.
 * Une valeur vide conserve le texte de repli prévu dans le modèle.
 */
export function renderContract(values = {}) {
  const data = resolveContractValues(values);

  return contractTemplate.replace(/\{\{([a-zA-Z0-9_.]+)(?:\|([^}]*))?\}\}/g, (_match, key, fallback) => {
    const fallbackText = fallback === undefined ? '[À compléter]' : fallback;
    const formatted = formatContractValue(key, data[key]);
    if (!formatted) return fallbackText;
    return escapeInlineValue(formatted);
  });
}
