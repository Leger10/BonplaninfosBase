// server/queryPolicy.mjs
// Ce qu'un appelant a le droit d'écrire via POST /api/query.
//
// Le point de départ : `requireActorForWrites` demandait une session, ce qui
// suffisait à interdire l'anonyme mais pas à empêcher un utilisateur de
// s'attribuer un rôle. Mesuré : un POST /api/query avec
// { table: 'profiles', method: 'update', body: { user_type: 'super_admin' } }
// et .eq('id', <son id>) réussissait, et un simple .update({ coin_balance })
// permit de s créditer des pièces à la main.
//
// Le principe retenu : ne pas vérifier la requête, la CONTRAINDRE. Pour une
// table dont l'acteur est le propriétaire, on injecte le filtre du propriétaire
// dans la requête : quel que soit le filtre envoyé par le client, l'intersection
// ne peut porter que sur ses propres lignes. Un filtre qui visait la ligne
// d'autrui ne retourne plus rien au lieu d'écrire ailleurs.
//
// Trois niveaux, du plus ouvert au plus fermé :
//   service  : clé interne (fonction Netlify) — contournement total assumé,
//              cette clé est aussi sensible que la base.
//   admin    : super_admin / admin / secretary.
//   proprietaire : l'appelant, uniquement sur ses propres lignes.
//
// Toute table absente de la liste est interdite à l'appelant : le refus par
// défaut est ici un choix de sécurité, pas une omission.
import { getDb } from './db.mjs';

const ADMIN_ROLES = ['super_admin', 'admin', 'secretary'];

// ---------------------------------------------------------------------------
// Portée : à qui appartient la ligne.
//
//   { id: true }                       -> la ligne EST le compte (profiles)
//   { column: 'user_id' }              -> ligne.user_id === acteur.id
//   { column: 'organizer_id' }         -> ligne.organizer_id === acteur.id
//   { event: 'event_id' }              -> l'événement lié appartient à l'acteur
// ---------------------------------------------------------------------------
export const OWNER_SCOPES = {
  profiles: { id: true },

  // Le compte de l'appelant
  notifications: { column: 'user_id' },
  push_tokens: { column: 'user_id' },
  pwa_installs: { column: 'user_id' },
  user_interactions: { column: 'user_id' },
  event_comments: { column: 'user_id' },
  event_shares: { column: 'user_id' },
  support_tickets: { column: 'user_id' },
  contract_submissions: { column: 'user_id' },
  user_contract_acceptances: { column: 'user_id' },
  tickets: { column: 'user_id' },
  payments: { column: 'user_id' },
  // Les codes promo appartiennent à l'influenceur qui les a générés
  // (PromoCodeGenerator.jsx crée/active/désactive ses propres codes).
  promo_codes: { column: 'influencer_id' },
  // Les coupons de parrainage appartiennent à leur propriétaire
  // (CouponService.createCoupon / /coupons). Lecture publique : un acheteur
  // doit pouvoir valider un code par son nom (CoinPacksPage).
  coupons: { column: 'user_id' },
  event_community_verifications: { column: 'user_id' },
  content_reports: { column: 'reporter_id' },
  pin_reset_requests: { column: 'user_id' },
  reactivation_requests: { column: 'user_id' },

  // Les événements de l'appelant
  events: { column: 'organizer_id' },
  event_promotions: { column: 'organizer_id' },
  raffle_events: { column: 'organizer_id' },
  pending_withdrawals: { column: 'organizer_id' },

  // Tables liées à un événement dont l'appelant est l'organisateur
  event_settings: { event: 'event_id' },
  event_promo_config: { event: 'event_id' },
  ticket_types: { event: 'event_id' },
  ticketing_events: { event: 'event_id' },
  stand_types: { event: 'event_id' },
  stand_events: { event: 'event_id' },
  raffle_prizes: { event: 'event_id' },
  candidates: { event: 'event_id' },
  event_validation_status: { event: 'event_id' },
};

// Colonnes qu'un appelant ne peut pas écrire même sur ses propres lignes.
// L'argent ne se déplace que par RPC : ni le solde, ni les cumuls, ni son
// identité, ni son statut, ni le code de parrainage (il rapporte des gains).
// Ces colonnes restent modifiables par un administrateur, qui en a l'usage
// (activation de compte, remboursement de secrétaire via SecretaryRefundModal).
const PROTECTED_COLUMNS = new Set([
  'user_type',
  'admin_type',
  'is_active',
  'is_verified',
  'is_blacklisted',
  'blacklist_reason',
  'blacklist_date',
  'identity_verified',
  'identity_verified_at',
  'phone_verified',
  'phone_verified_at',
  'appointed_by',
  'appointed_by_super_admin',
  'commission_wallet',
  'license_type',
  'license_status',
  'license_expires_at',
  'coin_balance',
  'free_coin_balance',
  'total_earnings',
  'available_earnings',
  'total_pi_spent',
  'total_video_rewards_earned',
  'mandatory_videos_completed',
  'referral_count',
  'affiliate_code',
]);

// Tables que l'appelant ne peut pas écrire du tout, mais qui ont une colonne
// « propriétaire » : le cas est traité pour ne pas se fier au nom de la table.
const NEVER = new Set(['coin_transactions', 'user_coin_transactions', 'transactions']);

// Au-delà, un organisateur doit passer par une liste paginée : on refuse
// d'écrire plutôt que d'écrire sur une sélection incomplète.
const MAX_OWNED_EVENTS = 500;

// ---------------------------------------------------------------------------
// POLITIQUE DE LECTURE.
// Les écritures étaient contraies ; les LECTURES restaient publiques : tout
// visiteur pouvait lire les RIB (admin_payment_info), les salaires
// (admin_salaries), les logs (admin_logs)… La lecture suit désormais la même
// règle que l'écriture pour les données sensibles :
//   - READ_ADMIN_ONLY : lecture réservée à l'administration (et à la clé
//     interne) — refus pour tout autre ;
//   - READ_OWNER_SCOPES : l'appelant ne voit que ses propres lignes (le filtre
//     propriétaire est INJECTÉ dans la requête, comme pour les écritures).
// Toute autre table reste publique (pages publiques du site).
// ---------------------------------------------------------------------------
export const READ_ADMIN_ONLY = new Set([
  'admin_payment_info', // RIB des comptes
  'admin_salaries', // salaires
  'admin_logs', // journaux d'administration
  'admin_users_summary',
  'admin_withdrawal_requests',
  'secretary_actions',
  'platform_earnings',
  'platform_wallet',
  'monthly_creator_pools',
  'audit_logs',
  // app_settings et admin_withdrawal_config ne sont PAS ici : ce sont des
  // réglages publics de la plateforme (taux coin/FCFA, e-mails de contact,
  // maintenance_mode, dates de retrait). DataContext.jsx les lit sur chaque
  // page, WithdrawalTab/WithdrawalModal lit les dates de retrait : les exclure
  // de la lecture cassait le site pour tout utilisateur non admin (403 au
  // rendu). LEUR ÉCRITURE reste admin-only (absentes de OWNER_SCOPES).
]);

export const READ_OWNER_SCOPES = {
  pending_withdrawals: { column: 'organizer_id' },
  withdrawal_requests: { column: 'user_id' },
  organizer_withdrawal_requests: { column: 'organizer_id' },
  organizer_earnings: { column: 'organizer_id' },
  payments: { column: 'user_id' },
  transactions: { column: 'user_id' },
  event_tickets: { column: 'user_id' },
  contract_submissions: { column: 'user_id' },
  user_contract_acceptances: { column: 'user_id' },
};

/**
 * À appeler avant runQuery pour TOUTE requête de lecture (select/head).
 * Renvoie { ok: true, query } avec le filtre propriétaire injecté pour les
 * tables sensibles — ou { ok: false, status, body }.
 */
export async function checkReadPolicy(q, actor) {
  const table = String(q.table || '');
  const method = String(q.method || 'select').toLowerCase();
  if (method !== 'select' && method !== 'head') return { ok: true, query: q };
  if (!table) return { ok: true, query: q };
  if (actor?.source === 'internal') return { ok: true, query: q };
  if (ADMIN_ROLES.includes(actor?.user_type)) return { ok: true, query: q };

  if (READ_ADMIN_ONLY.has(table)) {
    return denied(`Lecture de ${table} réservée à l'administration`, 403, 'read_forbidden');
  }

  const scope = READ_OWNER_SCOPES[table];
  if (scope) {
    // Sans session, impossible de prouver la propriété : on refuse.
    if (!actor?.id) {
      return denied(`Authentification requise pour lire ${table}`, 401, 'not_authenticated');
    }
    const filter = ownerFilter(scope, actor.id);
    if (!filter) return denied(`Portée non gérée pour ${table}`);
    return { ok: true, query: { ...q, filters: [...(q.filters || []), filter] } };
  }

  return { ok: true, query: q };
}

const denied = (message, status = 403, code = 'forbidden') => ({
  ok: false,
  status,
  body: { data: null, error: { message, code, details: null, hint: null } },
});

function bodyColumns(q) {
  const raw = q.method === 'insert' || q.method === 'upsert'
    ? (Array.isArray(q.body) ? q.body[0] : q.body)
    : q.body;
  if (!raw || typeof raw !== 'object') return [];
  return Object.keys(raw).filter((k) => k !== '__typename');
}

function ownerFilter(scope, actorId) {
  if (scope.id) return { column: 'id', op: 'eq', value: actorId };
  if (scope.column) return { column: scope.column, op: 'eq', value: actorId };
  return null;
}

function ownerBodyValue(scope, actorId) {
  if (scope.id) return { id: actorId };
  if (scope.column) return { [scope.column]: actorId };
  return null;
}

// Ligne visée par l'écriture, telle que l'appelant la désigne.
function targetIdOf(q) {
  const eq = (q.filters || []).find((f) => f?.column === 'id' && (f.op === 'eq' || !f.op));
  if (eq) return eq.value;
  const body = Array.isArray(q.body) ? q.body[0] : q.body;
  return body?.id ?? null;
}

// Vérifie que les événements visés appartiennent à l'appelant. Utilisé pour
// les tables dont la propriété passe par l'événement et non par une colonne
// de la ligne.
async function eventsOwnedBy(eventIds, actorId) {
  const ids = [...new Set(eventIds.filter(Boolean))];
  if (!ids.length) return false;
  if (ids.length > 200) return false; // garde-fou : requête anormalement large
  const rows = await getDb().events.findMany({
    where: { id: { in: ids } },
    select: { id: true, organizer_id: true },
  });
  if (rows.length !== ids.length) return false;
  return rows.every((e) => e.organizer_id === actorId);
}

// Identifiants des événements dont l'appelant est l'organisateur. Le plafond
// évite de charger un historique abnormalement grand.
async function ownedEventIds(actorId) {
  const rows = await getDb().events.findMany({
    where: { organizer_id: actorId },
    select: { id: true },
    orderBy: { created_at: 'desc' },
    take: MAX_OWNED_EVENTS,
  });
  return rows.map((e) => e.id);
}

/**
 * À appeler avant runQuery pour toute écriture (method != select/head).
 * Renvoie { ok: true, query } où `query` est éventuellement restreint au
 * propriétaire — ou { ok: false, status, body }.
 */
export async function checkWritePolicy(q, actor) {
  if (actor?.source === 'internal') return { ok: true, query: q };
  const table = String(q.table || '');
  const method = String(q.method || 'select').toLowerCase();
  const isAdmin = ADMIN_ROLES.includes(actor?.user_type);

  if (isAdmin) {
    // Un administrateur garde la main sur les tables d'exploitation. Le seul
    // écart : `user_type` et `appointed_by` passent par le RPC journalisé
    // update_user_role_securely tant que l'appelant est un super administrateur.
    // Un admin ou un secrétaire peut nommer un secretaire (c'est son travail),
    // mais ne peut ni s'attribuer un rôle ni désigner un super_admin — sinon la
    // simple route /api/query rouvre l'escalade que le RPC ferme.
    if (table === 'profiles') {
      const cols = bodyColumns(q);
      if (cols.includes('user_type') || cols.includes('appointed_by')) {
        const targetId = targetIdOf(q);
        const wanted = q.body?.user_type;
        if (actor.user_type !== 'super_admin') {
          if (cols.includes('appointed_by')) {
            return denied('Seul un super administrateur peut renseigner appointed_by');
          }
          if (wanted === 'super_admin') {
            return denied('Seul un super administrateur peut nommer un super_admin');
          }
          if (targetId && targetId === actor.id) {
            return denied('Vous ne pouvez pas modifier votre propre rôle');
          }
        }
      }
    }
    return { ok: true, query: q };
  }

  if (NEVER.has(table)) {
    return denied(`Écriture interdite sur ${table} (mouvement d'argent) : passer par une RPC`, 403, 'write_forbidden');
  }

  const scope = OWNER_SCOPES[table];
  if (!scope) {
    return denied(`Écriture interdite sur ${table}`, 403, 'write_forbidden');
  }

  const hit = bodyColumns(q).filter((c) => PROTECTED_COLUMNS.has(c));
  // Exception : is_active d'un code promo. La colonne reste protégée partout
  // ailleurs (is_active d'un compte = statut du compte), mais l'influenceur
  // doit pouvoir activer/désactiver SES codes (PromoCodeGenerator.jsx).
  const scopedHit = table === 'promo_codes'
    ? hit.filter((c) => c !== 'is_active')
    : hit;
  if (scopedHit.length) {
    return denied(`Colonne protégée : ${scopedHit.join(', ')}`, 403, 'column_forbidden');
  }

  if (scope.event) {
    // Les lignes sont liées à un événement. Plutôt que de reconstituer la
    // sélection du moteur pour deviner les lignes visées — ce qui serait
    // fragile avec neq, nin, gt, like… — on borne la requête elle-même aux
    // événements de l'appelant. Le moteur ne peut alors plus atteindre une
    // ligne étrangère, quel que soit le filtre fourni par le client.
    if (method === 'insert' || method === 'upsert') {
      const body = Array.isArray(q.body) ? q.body[0] : q.body;
      const eventId = body?.[scope.event];
      if (!(await eventsOwnedBy([eventId], actor.id))) {
        return denied(`Vous n'êtes pas l'organisateur de l'événement ${eventId || ''}`.trim());
      }
      return { ok: true, query: { ...q, body: { ...body, [scope.event]: eventId } } };
    }

    const owned = await ownedEventIds(actor.id);
    if (!owned.length) {
      return denied("Vous n'avez aucun événement", 403, 'write_forbidden');
    }
    // Le filtre de l'appelant est conservé : le moteur AND les deux conditions,
    // donc une écriture qui visait un événement tiers ne touche plus rien.
    const filters = [...(q.filters || []), { column: scope.event, op: 'in', value: owned }];
    return { ok: true, query: { ...q, filters } };
  }

  // Portée par une colonne de la ligne : on ajoute le filtre du propriétaire
  // sans retirer celui du client. Le moteur combine les filtres en AND, donc
  // une requête qui visait la ligne d'un tiers ne retourne plus rien — elle ne
  // dérive pas non plus vers la ligne de l'appelant.
  if (method === 'insert' || method === 'upsert') {
    const body = Array.isArray(q.body) ? q.body[0] : q.body;
    const forced = ownerBodyValue(scope, actor.id);
    if (!forced) return denied(`Portée non gérée pour ${table}`);
    // Un corps de tableau reste un tableau.
    const nextBody = Array.isArray(q.body)
      ? [{ ...body, ...forced }]
      : { ...(body || {}), ...forced };
    return { ok: true, query: { ...q, body: nextBody } };
  }

  return { ok: true, query: { ...q, filters: [...(q.filters || []), ownerFilter(scope, actor.id)] } };
}
