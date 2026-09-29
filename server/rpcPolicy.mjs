// server/rpcPolicy.mjs
// Politique d'autorisation des RPC, appliquée centralement dans server/rpc.mjs
// AVANT le dispatch vers le handler.
//
// Pourquoi une table plutôt qu'un `if` dans chaque handler : les contrôleurs
// étaient dispersés — certains vérifiaient un rôle, d'autres un id fourni
// par l'appelant, beaucoup ne vérifiaient rien. Une table unique rend la règle
// lisible et impossible à contourner par oubli.
//
// Trois formes de règles :
//   roles   : rôles autorisés (super_admin, admin, secretary). Un acteur
//             « interne » (fonction Netlify, clé partagée) est toujours
//             accepté : cette clé est aussi sensible que la base.
//   selfArg : nom du paramètre qui doit valoir l'identifiant de l'appelant.
//             Les rôles d'administration restent libres d'agir pour autrui
//             (traitement d'un retrait, remboursement d'un participant).
//   actorArg: paramètre qui désigne « qui fait l'action ». Il est écrasé par
//             l'identité vérifiée du jeton, pour qu'un journal ne puisse pas
//             attribuer l'action à quelqu'un d'autre.
//
// Une quatrième forme, pour le scan : ce que l'appelant a le droit de faire
// dépend de la RESSOURCE visée (le billet), pas de son rôle. Voir
// TICKET_SCAN_RPCS plus bas.
import { getDb } from './db.mjs';

const SUPER = ['super_admin'];
const ADMIN = ['super_admin', 'admin', 'secretary'];

export const RPC_POLICY = {
  // ---------- Administration des comptes ----------
  update_user_role_securely: { roles: SUPER, actorArg: 'p_caller_id' },
  admin_reset_password: { roles: ADMIN, actorArg: 'p_caller_id' },
  delete_user_securely: { roles: ADMIN, actorArg: 'p_caller_id' },

  // ---------- Finances ----------
  // credit_user_coins / debit_user_coins sont des opérations d'ADMINISTRATION
  // (journal admin + notification à l'utilisateur) : un utilisateur normal ne
  // passe jamais par là. Sa dépense de pièces passe par spend_user_coins.
  credit_user_coins: { roles: ADMIN, actorArg: 'p_creditor_id' },
  debit_user_coins: { roles: ADMIN, actorArg: 'p_debitor_id' },
  spend_user_coins: { selfArg: 'p_user_id' },
  increment_user_coins: { roles: ADMIN },
  reverse_credit: { roles: ADMIN, actorArg: 'p_reverser_id' },
  process_organizer_withdrawal: { roles: ADMIN, actorArg: 'p_admin_id' },
  approve_admin_withdrawal: { roles: ADMIN, actorArg: 'p_processed_by' },
  clear_user_transfer_history: { roles: ADMIN },
  clear_all_user_transactions: { roles: ADMIN },
  restore_user_transactions: { roles: ADMIN },

  // ---------- Remises à zéro, statistiques internes, annonces ----------
  reset_admin_stats_only: { roles: ADMIN },
  reset_country_stats_only: { roles: ADMIN },
  reset_all_countries_stats_only: { roles: ADMIN },
  reset_application_data: { roles: ADMIN },
  reset_granular_user_data: { roles: ADMIN },
  reset_zone_data: { roles: ADMIN },
  reset_all_zones: { roles: ADMIN },
  reset_transactional_data: { roles: ADMIN },
  get_audit_log_stats: { roles: ADMIN },
  get_super_admin_dashboard_stats: { roles: ADMIN },
  get_global_analytics: { roles: ADMIN },
  send_announcement_to_users: { roles: ADMIN },
  delete_location: { roles: ADMIN },
  // Vote « nu » sans débit : laissé à l'administration uniquement (corrections
  // manuelles). Tout vote payant utilisateur passe par cast_contest_votes.
  increment_vote_count: { roles: ADMIN },

  // ---------- Limité à son propre compte ----------
  purchase_tickets_v2: { selfArg: 'p_user_id' },
  cast_votes: { selfArg: 'p_user_id' },
  cast_contest_votes: { selfArg: 'p_user_id' },
  rent_stand: { selfArg: 'p_user_id' },
  purchase_raffle_tickets: { selfArg: 'p_user_id' },
  access_protected_event: { selfArg: 'p_user_id' },
  convert_coins_to_earnings: { selfArg: 'p_user_id' },
  transfer_pending_earnings_to_available: { selfArg: 'p_user_id' },
  update_user_profile: { selfArg: 'p_user_id' },

  // ---------- Vidéos récompense : uniquement pour soi, récompense servie
  // depuis le serveur (voir credit_user_for_video). ----------
  get_todays_mandatory_video: { selfArg: 'user_uuid' },
  complete_mandatory_video: { selfArg: 'user_uuid' },
  credit_user_for_video: { selfArg: 'p_user_id' },

  // ---------- Gains & finances : chaque créateur ne lit que le sien ; les
  // opérations qui créditent ou exposent la masse salariale sont ADMIN. ----------
  get_organizer_earnings_summary: { selfArg: 'p_organizer_id' },
  get_withdrawable_balances: { selfArg: 'p_organizer_id' },
  credit_organizer_earnings: { roles: ADMIN },
  get_admin_salary_stats: { roles: ADMIN },
  get_secretary_salary_stats: { roles: ADMIN },
  get_today_performance: { roles: ADMIN },
  get_zones_stats: { roles: ADMIN },
  // Coupons & influenceur : l'acheteur enregistre l'usage de SON coupon
  // (la commission va au propriétaire du code), le crédit de commission est
  // purement administratif, et le journal promo ne concerne que l'acheteur.
  credit_coupon_earnings: { selfArg: 'p_buyer_user_id' },
  add_commission_to_user: { roles: ADMIN },
  process_promo_usage: { selfArg: 'p_user_id' },
};

const isAdminRole = (actor) => ADMIN.includes(actor.user_type);

function forbidden(message) {
  return {
    data: null,
    error: { message, code: 'forbidden', details: null, hint: null },
  };
}

// ---------------------------------------------------------------------------
// Scan de billets : le droit dépend de l'événement du billet, pas du rôle.
//
// Mesuré avant ce garde : `verify_ticket_direct` et `reset_ticket` ne
// recevaient ni acteur ni événement. Le front
// (TicketScannerDialog.jsx, VerifyTicketPage.jsx) n'envoyait que le code du
// billet, donc TOUT compte enregistré pouvait valider l'entrée de n'importe
// quel événement, et même annuler un check-in avec reset_ticket.
//
// Modèle retenu, validé côté métier :
//   - délégation PAR ORGANISATEUR : un agent ajouté une fois scanne tous les
//     événements de cet organisateur (table organizer_scan_agents) ;
//   - l'organisateur scanne toujours ses propres événements, sans délégation ;
//   - la RÉINITIALISATION d'un billet reste réservée à l'organisateur, car elle
//     efface une trace de passage.
// ---------------------------------------------------------------------------
const TICKET_SCAN_RPCS = {
  verify_ticket_direct: { ownerOnly: false },
  reset_ticket: { ownerOnly: true },
};

const TICKET_LOOKUP = {
  id: 'id',
  qr_code: 'qr_code',
  ticket_number: 'ticket_number',
  ticket_code_short: 'ticket_code_short',
  transaction_reference: 'transaction_reference',
};

// Retrouve l'organisateur d'un billet : events.organizer_id en direct, ou via
// ticketing_events pour les billets dont l'evenement est une entree billetterie.
// Renvoie null si l'evenement est introuvable : on refuse alors.
async function ticketOrganizerId(ticket) {
  if (!ticket?.event_id) return null;
  const db = getDb();
  const direct = await db.events.findFirst({
    where: { id: ticket.event_id },
    select: { id: true, organizer_id: true },
  });
  if (direct) return direct.organizer_id;
  const ticketing = await db.ticketing_events.findFirst({
    where: { id: ticket.event_id },
    select: { event_id: true },
  });
  if (!ticketing?.event_id) return null;
  const parent = await db.events.findFirst({
    where: { id: ticketing.event_id },
    select: { organizer_id: true },
  });
  return parent?.organizer_id ?? null;
}

async function checkTicketScanAccess(identifier, actor, rule) {
  if (!identifier) return { ok: true }; // le handler signalera le paramètre manquant
  const db = getDb();
  const ticket = await db.tickets.findFirst({
    where: {
      OR: Object.entries(TICKET_LOOKUP).map(([column]) => ({ [column]: identifier })),
    },
    select: { id: true, event_id: true },
  });
  // Billet inconnu : on laisse le handler répondre « introuvable », il ne
  // modifie rien. On ne divulgue pas non plus l'existence d'un billet étranger.
  if (!ticket) return { ok: true };

  const organizerId = await ticketOrganizerId(ticket);
  if (!organizerId) {
    return { ok: false, message: 'Événement introuvable pour ce billet : scan refusé' };
  }
  if (organizerId === actor.id) return { ok: true };

  if (rule.ownerOnly) {
    return { ok: false, message: 'Seul l\'organisateur peut réinitialiser un billet' };
  }

  const delegation = await db.organizer_scan_agents.findFirst({
    where: { organizer_id: organizerId, user_id: actor.id, is_active: true },
    select: { id: true },
  });
  if (!delegation) {
    return { ok: false, message: 'Vous n\'êtes pas autorisé à scanner les billets de cet événement' };
  }
  return { ok: true, delegationId: delegation.id, organizerId };
}

// Retourne { ok: true, args } ou { ok: false, status, body }.
// `args` peut avoir été modifié (actorArg écrasé par l'identité vérifiée).
export async function checkPolicy(name, args, actor) {
  if (!actor) return { ok: true, args };
  if (actor.source === 'internal') return { ok: true, args };

  const policy = RPC_POLICY[name];
  if (policy) {
    if (policy.roles && !policy.roles.includes(actor.user_type)) {
      return {
        ok: false,
        status: 403,
        body: forbidden(`Droits insuffisants pour ${name} (rôle ${actor.user_type})`),
      };
    }

    if (policy.selfArg && !isAdminRole(actor)) {
      const target = args[policy.selfArg];
      if (target && target !== actor.id) {
        return {
          ok: false,
          status: 403,
          body: forbidden(`${name} ne peut pas être exécuté pour le compte d'un autre utilisateur`),
        };
      }
    }

    if (policy.actorArg) args[policy.actorArg] = actor.id;
  }

  // Le garde scan s'applique même aux RPC sans entrée de table : c'est
  // justement celles-là qui n'avaient aucune protection.
  const scanRule = TICKET_SCAN_RPCS[name];
  if (scanRule) {
    const verdict = await checkTicketScanAccess(args.p_ticket_identifier, actor, scanRule);
    if (!verdict.ok) {
      return { ok: false, status: 403, body: forbidden(verdict.message) };
    }
  }

  return { ok: true, args };
}
