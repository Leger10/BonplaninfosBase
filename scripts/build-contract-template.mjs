import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Génère la copie tokenisée du contrat utilisée par l'application
 * (aperçu + génération PDF).
 *
 * Source juridique de référence :
 *   docs/contrat-partenariat-strategique-bonplaninfos.md
 *
 * Sortie :
 *   src/lib/contract/contractTemplate.md
 *
 * Relancer ce script après toute modification du contrat :
 *   node scripts/build-contract-template.mjs
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'docs/contrat-partenariat-strategique-bonplaninfos.md');
const target = resolve(root, 'src/lib/contract/contractTemplate.md');

let md = (await readFile(source, 'utf8')).replace(/\r\n/g, '\n');

function replaceOnce(label, search, replacement) {
  const first = md.indexOf(search);
  if (first === -1) throw new Error(`[${label}] texte introuvable`);
  if (md.indexOf(search, first + 1) !== -1) {
    throw new Error(`[${label}] texte ambigu : plusieurs occurrences trouvées`);
  }
  md = md.slice(0, first) + replacement + md.slice(first + search.length);
}

/* ------------------------------------------------------------------ */
/* Fiche des conditions essentielles                                   */
/* ------------------------------------------------------------------ */

replaceOnce(
  'term-sheet-partie-a',
  '| Partie A (Fondateur / Plateforme) | `[Nom / Société]` |',
  '| Partie A (Fondateur / Plateforme) | `{{partieA.nom|Nom / Société}}` |',
);

replaceOnce(
  'term-sheet-partie-b',
  '| Partie B (Partenaire Promotion & Communication) | `[Nom / Société]` |',
  '| Partie B (Partenaire Promotion & Communication) | `{{partieB.nom|Nom / Société}}` |',
);

replaceOnce(
  'term-sheet-territoires',
  '| Territoires | `[Burkina Faso / Cameroun / autres pays]` |',
  '| Territoires | `{{territoire|Burkina Faso / Cameroun / autres pays}}` |',
);

replaceOnce(
  'term-sheet-duree',
  "| Durée initiale | `[12 / 24]` mois, avec période d'essai de `[3]` mois |",
  "| Durée initiale | `{{dureeMois|12 / 24}}` mois, avec période d'essai de `{{essaiMois|3}}` mois |",
);

replaceOnce(
  'term-sheet-renouvellement',
  '| Renouvellement | Par écrit, `[60]` jours avant l\'échéance |',
  '| Renouvellement | Par écrit, `{{preavisRenouvellementJours|60}}` jours avant l\'échéance |',
);

replaceOnce(
  'term-sheet-exclusivite',
  '| Exclusivité | `[ ] Non exclusive` (recommandé pendant l\'essai) / `[ ] Exclusive` (après objectifs atteints) |',
  '| Exclusivité | `[{{excluNonCase| }}] Non exclusive` (recommandé pendant l\'essai) / `[{{excluOuiCase| }}] Exclusive` (après objectifs atteints) |',
);

replaceOnce(
  'term-sheet-droit',
  '| Droit applicable | Droit `[burkinabè]` |',
  '| Droit applicable | Droit `{{droitApplicable|burkinabè}}` |',
);

replaceOnce(
  'term-sheet-juridiction',
  '| Juridiction | `[Tribunal de commerce de Ouagadougou / arbitrage CCJA]` |',
  '| Juridiction | `{{juridiction|Tribunal de commerce de Ouagadougou / arbitrage CCJA}}` |',
);

/* ------------------------------------------------------------------ */
/* Identification des parties                                          */
/* ------------------------------------------------------------------ */

replaceOnce(
  'partie-a-identite',
  `**PARTIE A — LA PLATEFORME / LE FONDATEUR**
- Nom / raison sociale : \`[____________________]\`
- Forme juridique (le cas échéant) : \`[____________________]\`
- Siège / adresse : \`[____________________]\`
- RCCM / IFU / N° fiscal : \`[____________________]\`
- Représentée par : \`[Nom, fonction]\`
- Pièce d'identité : \`[____________________]\`
- Email : \`[____________________]\`
- Téléphone / WhatsApp : \`[____________________]\``,
  `**PARTIE A — LA PLATEFORME / LE FONDATEUR**
- Nom / raison sociale : \`{{partieA.nom|____________________}}\`
- Forme juridique (le cas échéant) : \`{{partieA.forme|____________________}}\`
- Siège / adresse : \`{{partieA.siege|____________________}}\`
- RCCM / IFU / N° fiscal : \`{{partieA.rccm|____________________}}\`
- Représentée par : \`{{partieA.representant|Nom, fonction}}\`
- Pièce d'identité : \`{{partieA.piece|____________________}}\`
- Email : \`{{partieA.email|____________________}}\`
- Téléphone / WhatsApp : \`{{partieA.telephone|____________________}}\``,
);

replaceOnce(
  'partie-b-identite',
  `**PARTIE B — LE PARTENAIRE PROMOTION & COMMUNICATION**
- Nom / raison sociale : \`[____________________]\`
- Forme juridique (le cas échéant) : \`[____________________]\`
- Siège / adresse : \`[____________________]\`
- RCCM / IFU / N° fiscal : \`[____________________]\`
- Représenté par : \`[Nom, fonction]\`
- Pièce d'identité : \`[____________________]\`
- Email : \`[____________________]\`
- Téléphone / WhatsApp : \`[____________________]\``,
  `**PARTIE B — LE PARTENAIRE PROMOTION & COMMUNICATION**
- Nom / raison sociale : \`{{partieB.nom|____________________}}\`
- Forme juridique (le cas échéant) : \`{{partieB.forme|____________________}}\`
- Siège / adresse : \`{{partieB.siege|____________________}}\`
- RCCM / IFU / N° fiscal : \`{{partieB.rccm|____________________}}\`
- Représenté par : \`{{partieB.representant|Nom, fonction}}\`
- Pièce d'identité : \`{{partieB.piece|____________________}}\`
- Email : \`{{partieB.email|____________________}}\`
- Téléphone / WhatsApp : \`{{partieB.telephone|____________________}}\``,
);

/* ------------------------------------------------------------------ */
/* Clauses avec paramètres                                             */
/* ------------------------------------------------------------------ */

replaceOnce(
  'article-3-1',
  '3.1 **Durée initiale** : le contrat prend effet le `[__/__/____]` pour une durée de `[12 / 24]` mois, renouvelable par écrit.',
  '3.1 **Durée initiale** : le contrat prend effet le `{{dateEffet|__/__/____}}` pour une durée de `{{dureeMois|12 / 24}}` mois, renouvelable par écrit.',
);

replaceOnce(
  'article-3-2',
  "3.2 **Période d'essai** : les `[3]` premiers mois constituent une période d'essai. Pendant cette période, chaque Partie peut mettre fin au contrat moyennant un préavis écrit de `[15]` jours, sans pénalité, sous réserve du paiement des sommes déjà dues.",
  "3.2 **Période d'essai** : les `{{essaiMois|3}}` premiers mois constituent une période d'essai. Pendant cette période, chaque Partie peut mettre fin au contrat moyennant un préavis écrit de `{{preavisEssaiJours|15}}` jours, sans pénalité, sous réserve du paiement des sommes déjà dues.",
);

replaceOnce(
  'article-3-3',
  "3.3 **Territoire** : `[Burkina Faso / Cameroun / pays de l'UEMOA / autre]`. Toute extension nécessite un avenant écrit.",
  "3.3 **Territoire** : `{{territoire|Burkina Faso / Cameroun / pays de l'UEMOA / autre}}`. Toute extension nécessite un avenant écrit.",
);

replaceOnce(
  'article-3-4',
  "3.4 **Exclusivité** : le partenariat est `[non exclusif / exclusif]` pendant la période d'essai.",
  "3.4 **Exclusivité** : le partenariat est `{{exclusiviteTexte|non exclusif / exclusif}}` pendant la période d'essai.",
);

replaceOnce(
  'article-5-2',
  '5.2 **Validation** : elle valide les contenus et campagnes dans un délai raisonnable (au plus `[5]` jours ouvrés), afin de ne pas bloquer la communication.',
  '5.2 **Validation** : elle valide les contenus et campagnes dans un délai raisonnable (au plus `{{delaiValidationJours|5}}` jours ouvrés), afin de ne pas bloquer la communication.',
);

replaceOnce(
  'article-6-6',
  '6.6 **Seuil de report** : si le RD est inférieur à `[10 000]` FCFA, le montant est reporté au mois suivant et ajouté au RD suivant.',
  '6.6 **Seuil de report** : si le RD est inférieur à `{{seuilReport|10 000}}` FCFA, le montant est reporté au mois suivant et ajouté au RD suivant.',
);

replaceOnce(
  'article-11-1',
  "11.1 Pendant la durée du contrat et pendant `[12]` mois après son terme,",
  "11.1 Pendant la durée du contrat et pendant `{{nonSollicitationMois|12}}` mois après son terme,",
);

replaceOnce(
  'article-12-5',
  "Si l'événement dure plus de `[30]` jours, chaque Partie peut résilier le contrat.",
  "Si l'événement dure plus de `{{forceMajeureJours|30}}` jours, chaque Partie peut résilier le contrat.",
);

replaceOnce(
  'article-13-2',
  "Si le manquement n'est pas corrigé dans un délai de `[15]` jours, elle peut résilier le contrat de plein droit.",
  "Si le manquement n'est pas corrigé dans un délai de `{{delaiRemedeJours|15}}` jours, elle peut résilier le contrat de plein droit.",
);

replaceOnce(
  'article-13-3',
  'si les KPI de l\'Annexe 3 ne sont pas atteints pendant `[2]` mois consécutifs, chaque Partie peut résilier avec un préavis écrit de `[30]` jours.',
  'si les KPI de l\'Annexe 3 ne sont pas atteints pendant `{{moisObjectifsManques|2}}` mois consécutifs, chaque Partie peut résilier avec un préavis écrit de `{{preavisKpiJours|30}}` jours.',
);

replaceOnce(
  'article-13-4',
  '13.4 **Sans motif** : après la période d\'essai, chaque Partie peut résilier sans motif moyennant un préavis écrit de `[60]` jours.',
  '13.4 **Sans motif** : après la période d\'essai, chaque Partie peut résilier sans motif moyennant un préavis écrit de `{{preavisSansMotifJours|60}}` jours.',
);

replaceOnce(
  'article-13-6',
  "- établissement d'un relevé final dans les `[30]` jours ;",
  "- établissement d'un relevé final dans les `{{delaiReleveFinalJours|30}}` jours ;",
);

replaceOnce(
  'article-14-1',
  '14.1 **Droit applicable** : le présent contrat est régi par le droit `[burkinabè]`, sans préjudice des règles impératives applicables.',
  '14.1 **Droit applicable** : le présent contrat est régi par le droit `{{droitApplicable|burkinabè}}`, sans préjudice des règles impératives applicables.',
);

replaceOnce(
  'article-14-2',
  '14.2 **Règlement amiable** : en cas de litige, les Parties tentent de bonne foi de trouver une solution amiable dans un délai de `[30]` jours à compter de la notification écrite du désaccord.',
  '14.2 **Règlement amiable** : en cas de litige, les Parties tentent de bonne foi de trouver une solution amiable dans un délai de `{{delaiAmiableJours|30}}` jours à compter de la notification écrite du désaccord.',
);

replaceOnce(
  'article-14-3',
  "ou, à défaut, à `[l'arbitrage de la CCJA / la juridiction compétente de Ouagadougou]`.",
  "ou, à défaut, à `{{arbitrage|l'arbitrage de la CCJA / la juridiction compétente de Ouagadougou}}`.",
);

/* ------------------------------------------------------------------ */
/* Signatures                                                          */
/* ------------------------------------------------------------------ */

replaceOnce(
  'signature-lieu-date',
  '**Fait à `[Ville]`, le `[__/__/____]`.**',
  '**Fait à `{{villeSignature|Ville}}`, le `{{dateSignature|__/__/____}}`.**',
);

replaceOnce(
  'signature-partie-a',
  `**PARTIE A — LA PLATEFORME / LE FONDATEUR**

Nom : \`[____________________]\`
Fonction : \`[____________________]\``,
  `**PARTIE A — LA PLATEFORME / LE FONDATEUR**

Nom : \`{{signatureNomA|____________________}}\`
Fonction : \`{{signatureFonctionA|____________________}}\``,
);

replaceOnce(
  'signature-partie-b',
  `**PARTIE B — LE PARTENAIRE PROMOTION & COMMUNICATION**

Nom : \`[____________________]\`
Fonction : \`[____________________]\``,
  `**PARTIE B — LE PARTENAIRE PROMOTION & COMMUNICATION**

Nom : \`{{signatureNomB|____________________}}\`
Fonction : \`{{signatureFonctionB|____________________}}\``,
);

/* ------------------------------------------------------------------ */
/* Annexe 1 (en-tête seulement, les montants restent à remplir)        */
/* ------------------------------------------------------------------ */

replaceOnce(
  'annexe-1-mois',
  '**Mois de référence :** `[__/____]`',
  '**Mois de référence :** `{{annexe1.mois|__/____}}`',
);

replaceOnce(
  'annexe-1-date',
  '**Établi le :** `[__/__/____]`',
  '**Établi le :** `{{annexe1.date|__/__/____}}`',
);

const tokenCount = (md.match(/\{\{[a-zA-Z0-9_.]+(?:\|[^}]*)?\}\}/g) || []).length;
if (tokenCount < 30) {
  throw new Error(`Seulement ${tokenCount} jetons générés : la source a probablement changé.`);
}

await mkdir(dirname(target), { recursive: true });
await writeFile(target, md, 'utf8');

console.log(`OK: ${target}`);
console.log(`${tokenCount} jetons générés depuis ${source}`);
