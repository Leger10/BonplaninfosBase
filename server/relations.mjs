// Résolution des embeds : colonne FK (ex. organizer_id) -> table cible (profiles).
// Aucune FK déclarée : mapping par convention + table de correspondance.
import { allModels, scalarColumns } from './db.mjs';

// Heuristique : une colonne *_id référence la table homonyme si elle existe,
// sinon profiles pour les "personnes", sinon fallback explicite.
const PROFILE_LIKE = new Set([
  'user_id', 'organizer_id', 'admin_id', 'actor_id', 'target_id',
  'creator_id', 'secretary_id', 'influencer_id', 'caller_id', 'profile_id',
  'creditor_id', 'debitor_id', 'reverser_id', 'participant_id', 'partner_id',
  'buyer_user_id', 'user_id_to', 'target_user_id', 'owner_id',
]);

let tableByName = null;

function tables() {
  if (!tableByName) tableByName = new Set(allModels());
  return tableByName;
}

// Cible d'une FK par convention : profils pour les personnes, sinon table homonyme.
export function resolveTarget(table, fkColumn, alias) {
  const names = tables();
  // cas explicite déjà connu (contrainte) :
  if (fkColumn === 'candidate_id' || fkColumn === 'contest_id') {
    if (names.has('candidates') && fkColumn === 'candidate_id') return fkColumn === 'candidate_id' ? 'candidates' : 'contests';
  }
  if (fkColumn === 'contest_id') return 'contests';
  if (fkColumn === 'candidate_id') return 'candidates';
  if (fkColumn === 'video_id' && names.has('videos')) return 'videos';
  if (fkColumn === 'event_id' && names.has('events')) return 'events';
  if (fkColumn === 'category_id') {
    if (names.has('event_categories')) return 'event_categories';
    if (names.has('categories')) return 'categories';
  }
  if (fkColumn === 'license_id') {
    if (names.has('licenses')) return 'licenses';
    if (names.has('partner_licenses')) return 'partner_licenses';
    if (names.has('admin_licences')) return 'admin_licences';
  }
  if (fkColumn === 'location_id' && names.has('locations')) return 'locations';
  if (fkColumn === 'ticket_id' && names.has('tickets')) return 'tickets';
  if (fkColumn === 'promo_code_id' && names.has('promo_codes')) return 'promo_codes';
  if (fkColumn === 'sponsor_id' && names.has('sponsors')) return 'sponsors';
  if (fkColumn === 'stand_id' && names.has('stands')) return 'stands';
  if (fkColumn === 'stand_type_id' && names.has('stand_types')) return 'stand_types';
  if (fkColumn === 'raffle_id' && names.has('raffles')) return 'raffles';
  if (fkColumn === 'announcement_id' && names.has('announcements')) return 'announcements';

  if (PROFILE_LIKE.has(fkColumn)) return 'profiles';

  // homonyme : organizer_id -> organizer(*) ; sinon strip _id
  const base = fkColumn.endsWith('_id') ? fkColumn.slice(0, -3) : fkColumn;
  if (names.has(base)) return base;
  if (names.has(base + 's')) return base + 's';
  // personne inconnue -> profiles (profil utilisateur), prudente
  return 'profiles';
}

// Construit l'objet embed résolu : { alias, fk, table, cols, inner }
export async function resolveEmbed(table, embed, modelCols) {
  if (embed.constraint) {
    // "profiles!pin_reset_requests_user_id_fkey(...)" — extraire la colonne FK depuis la contrainte.
    let fk = null;
    const c = embed.constraint.replace(/_fkey$/, '');
    for (const col of modelCols) {
      if (col.endsWith('_id') && c.includes(col)) fk = col;
    }
    if (!fk) fk = listFkCandidates(table).find((col) => c.includes(col)) || 'user_id';
    return { alias: embed.alias, fk, table: embed.alias, cols: embed.cols, inner: embed.inner };
  }
  const target = resolveTarget(table, embed.fk, embed.alias);
  return { alias: embed.alias, fk: embed.fk, table: target, cols: embed.cols, inner: embed.inner };
}

function listFkCandidates(table) {
  return (scalarColumns(table) || []).filter((c) => c.endsWith('_id'));
}