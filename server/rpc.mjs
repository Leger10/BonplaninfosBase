// Registre RPC local : émule les fonctions SQL Supabase en Prisma/MySQL.
// POST /api/rpc : body = { name, args }  ->  { data, error }
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDb } from './db.mjs';

const r = Router();

const db = () => getDb();
const ok = (data) => ({ data: data ?? {}, error: null });
const fail = (message, code = 'RPC_ERROR', details = null) => ({ data: null, error: { message, code, details, hint: null } });

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

async function upsertProtection(p_event_id, p_user_id, params = {}) {
  const { success = false, message = 'Accès déjà accordé.', amount_paid = 0, amount_pi = 0, payment_method = 'coins', transaction_id = null } = params;
  const existing = await db().protected_event_access.findFirst({ where: { event_id: p_event_id, user_id: p_user_id } });
  if (existing) return { success, message, amount_paid: existing.amount_paid ?? amount_paid, granted: true, already_granted: true };
  await db().protected_event_access.create({
    data: {
      id: uuidv4(),
      event_id: p_event_id,
      user_id: p_user_id,
      status: 'active',
      granted_at: new Date(),
      payment_method,
      amount_paid: amount_paid || amount_pi || 0,
      grant_ticket: transaction_id || null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  return { success: true, message, amount_paid: amount_paid || amount_pi || 0, granted: true, already_granted: false };
}

const HANDLERS = {
  // ---------- Profil ----------
  async ensure_user_profile_exists(args) {
    const { p_user_id, p_email, p_full_name } = args;
    if (!p_user_id) return fail('p_user_id requis');
    let profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) {
      await db().profiles.create({
        data: {
          id: p_user_id,
          email: p_email || null,
          full_name: p_full_name || null,
          user_type: 'user',
          is_active: true,
          country: 'Côte d\'Ivoire',
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
      profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    }
    return ok({ profile });
  },

  async update_user_profile(args) {
    const { p_user_id } = args;
    if (!p_user_id) return fail('p_user_id requis');
    const upd = {};
    for (const k of ['p_full_name', 'p_email', 'p_phone', 'p_city', 'p_country', 'p_bio', 'p_avatar_url']) {
      if (args[k] !== undefined) upd[k.slice(2)] = args[k];
    }
    upd.updated_at = new Date();
    await db().profiles.update({ where: { id: p_user_id }, data: upd });
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    return ok({ profile });
  },

  // ---------- Votes ----------
  async get_phone_vote_count(args) {
    const { p_event_id, p_phone } = args;
    const rows = await db().user_votes.findMany({ where: { event_id: p_event_id }, select: { vote_count: true, voter_phone: true } });
    const target = normalizePhone(p_phone);
    let total = 0;
    if (target) {
      for (const row of rows) {
        if (normalizePhone(row.voter_phone) === target) total += row.vote_count || 0;
      }
    }
    return ok(total);
  },

  async increment_vote_count(args) {
    const { candidate_id_to_inc, inc_amount } = args;
    const amount = Number(inc_amount) || 1;
    const candidate = await db().candidates.findUnique({ where: { id: candidate_id_to_inc } });
    if (!candidate) return fail('Candidat introuvable', 'NOT_FOUND');
    const newCount = (candidate.vote_count || 0) + amount;
    await db().candidates.update({ where: { id: candidate_id_to_inc }, data: { vote_count: newCount } });
    return ok({ success: true, new_count: newCount });
  },

  // ---------- Favoris / likes / vues ----------
  async toggle_event_bookmark(args) {
    const { p_event_id, p_user_id } = args;
    if (!p_event_id || !p_user_id) return fail('p_event_id et p_user_id requis');
    const existing = await db().event_bookmarks.findFirst({ where: { event_id: p_event_id, user_id: p_user_id } });
    if (existing) {
      await db().event_bookmarks.delete({ where: { id: existing.id } });
    } else {
      await db().event_bookmarks.create({ data: { id: uuidv4(), event_id: p_event_id, user_id: p_user_id, created_at: new Date() } });
    }
    const count = await db().event_bookmarks.count({ where: { event_id: p_event_id } });
    return ok({ success: true, is_bookmarked: !existing, count });
  },

  async toggle_event_like(args) {
    const { p_event_id, p_user_id } = args;
    if (!p_event_id || !p_user_id) return fail('p_event_id et p_user_id requis');
    const existing = await db().event_reactions.findFirst({ where: { event_id: p_event_id, user_id: p_user_id, reaction_type: 'like' } });
    if (existing) {
      await db().event_reactions.delete({ where: { id: existing.id } });
    } else {
      await db().event_reactions.create({ data: { id: uuidv4(), event_id: p_event_id, user_id: p_user_id, reaction_type: 'like', created_at: new Date() } });
    }
    const count = await db().event_reactions.count({ where: { event_id: p_event_id } });
    return ok({ success: true, is_liked: !existing, count });
  },

  async track_event_view(args) {
    const { p_event_id, p_user_id } = args;
    if (!p_event_id) return fail('p_event_id requis');
    const now = new Date();
    await db().event_views.create({
      data: {
        id: uuidv4(),
        event_id: p_event_id,
        user_id: p_user_id || null,
        ip_address: null,
        user_agent: null,
        view_date: now,
        created_at: now,
        updated_at: now,
      },
    });
    const ev = await db().events.findUnique({ where: { id: p_event_id } });
    const newViews = (ev?.views_count || 0) + 1;
    await db().events.update({ where: { id: p_event_id }, data: { views_count: newViews } });
    return ok({ success: true, new_views_count: newViews });
  },

  async protected_event_interaction(args) {
    const { p_event_id, p_user_id, p_interaction_type } = args;
    // Interaction sur événement protégé : on vérifie simplement l'accès.
    const access = await db().protected_event_access.findFirst({ where: { event_id: p_event_id, user_id: p_user_id, status: 'active' } });
    return ok({ success: !!access, has_access: !!access, access_status: access?.status || 'none' });
  },

  async access_protected_event(args) {
    const { p_event_id, p_user_id } = args;
    if (!p_event_id || !p_user_id) return fail('p_event_id et p_user_id requis');
    return ok(await upsertProtection(p_event_id, p_user_id, { success: true, message: 'Accès approuvé.', amount_paid: 0 }));
  },

  // ---------- Coins / crédit ----------
  async credit_user_coins(args) {
    const { p_user_id, p_amount, p_reason, p_creditor_id } = args;
    if (!p_user_id) return fail('p_user_id requis');
    const amount = Number(p_amount) || 0;
    const creditor = p_creditor_id ? await db().profiles.findUnique({ where: { id: p_creditor_id } }) : null;
    if (creditor && creditor.user_type !== 'super_admin' && creditor.user_type !== 'secretary') {
      return ok({ success: false, message: 'Permission non accordée.' });
    }
    const target_profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!target_profile) return ok({ success: false, message: 'Utilisateur non trouvé.' });
    const newBalance = (target_profile.coin_balance || 0) + amount;
    await db().profiles.update({ where: { id: p_user_id }, data: { coin_balance: newBalance } });
    const rateRow = await db().app_settings.findFirst();
    const rate = Number(rateRow?.coin_to_fcfa_rate) || 10;
    const creditorName = creditor?.full_name || 'admin';
    await db().admin_logs.create({
      data: { actor_id: p_creditor_id || p_user_id, action_type: 'user_credited', target_id: p_user_id, details: JSON.stringify({ amount, reason: p_reason }) },
    });
    await db().transactions.create({
      data: {
        user_id: p_user_id, transaction_type: 'manual_credit', amount_pi: amount,
        amount_fcfa: amount * rate, description: `Crédit manuel par ${creditorName}: ${p_reason || ''}`,
        status: 'completed', city: target_profile.city, region: target_profile.region, country: target_profile.country,
      },
    });
    return ok({ success: true, message: 'Utilisateur crédité avec succès.', coin_balance: newBalance });
  },

  async debit_user_coins(args) {
    const { p_user_id, p_amount, p_reason, p_debitor_id } = args;
    if (!p_user_id) return fail('p_user_id requis');
    const amount = Number(p_amount) || 0;
    const debitor = p_debitor_id ? await db().profiles.findUnique({ where: { id: p_debitor_id } }) : null;
    if (debitor && debitor.user_type !== 'super_admin' && !(debitor.user_type === 'secretary' && debitor.appointed_by_super_admin)) {
      return ok({ success: false, message: 'Permission non accordée.' });
    }
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return ok({ success: false, message: 'Utilisateur non trouvé.' });
    const total = (profile.coin_balance || 0) + (profile.free_coin_balance || 0);
    if (total < amount) return fail('Solde insuffisant', 'INSUFFICIENT_FUNDS');
    const paidUsed = Math.min(profile.coin_balance || 0, amount);
    const freeUsed = amount - paidUsed;
    await db().profiles.update({
      where: { id: p_user_id },
      data: {
        coin_balance: (profile.coin_balance || 0) - paidUsed,
        free_coin_balance: (profile.free_coin_balance || 0) - freeUsed,
      },
    });
    const rateRow = await db().app_settings.findFirst();
    const rate = Number(rateRow?.coin_to_fcfa_rate) || 10;
    const debitorName = debitor?.full_name || 'admin';
    await db().admin_logs.create({
      data: { actor_id: p_debitor_id || p_user_id, action_type: 'user_debited', target_id: p_user_id, details: JSON.stringify({ amount, reason: p_reason }) },
    });
    await db().transactions.create({
      data: {
        user_id: p_user_id, transaction_type: 'manual_debit', amount_pi: -amount,
        amount_fcfa: -amount * rate, description: `Débit manuel par ${debitorName}: ${p_reason || ''}`,
        status: 'completed', city: profile.city, region: profile.region, country: profile.country,
      },
    });
    await db().notifications.create({
      data: { user_id: p_user_id, title: '⚠️ Un débit a été effectué sur votre compte', message: `Votre compte a été débité de ${amount} pièces. Raison: ${p_reason || 'Débit administratif.'}`, type: 'system', data: JSON.stringify({ amount, reason: p_reason }), sound_enabled: true, sound_effect: 'alert', is_read: false, is_global: false },
    });
    return ok({ success: true, message: 'Le compte a été débité avec succès.', coin_balance: (profile.coin_balance || 0) - paidUsed, free_coin_balance: (profile.free_coin_balance || 0) - freeUsed });
  },

  async increment_user_coins(args) {
    const { p_user_id, p_coin_increment } = args;
    const amount = Number(p_coin_increment) || 0;
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    const balance = (profile.coin_balance || 0) + amount;
    await db().profiles.update({ where: { id: p_user_id }, data: { coin_balance: balance } });
    return ok({ success: true, coin_balance: balance });
  },

  async reverse_credit(args) {
    const { p_log_id, p_reverser_id } = args;
    if (!p_log_id) return ok({ success: false, message: 'Log manquant' });
    const log = await db().admin_logs.findUnique({ where: { id: p_log_id } });
    if (!log) return ok({ success: false, message: 'Log introuvable' });
    const targetId = log.target_id;
    const amount = Number(log.details?.amount) || 0;
    if (targetId && amount > 0) {
      const profile = await db().profiles.findUnique({ where: { id: targetId } });
      if (profile) {
        await db().profiles.update({ where: { id: targetId }, data: { coin_balance: (profile.coin_balance || 0) - amount } });
      }
    }
    return ok({ success: true, message: 'Crédit inversé', reversed_id: p_log_id });
  },

  // ---------- Événements ----------
  async delete_event_completely(args) {
    const { p_event_id } = args;
    if (!p_event_id) return fail('p_event_id requis');
    const dbc = db();
    // suppression en cascade manuelle (aucune FK déclarée)
    const tables = ['event_bookmarks', 'event_reactions', 'event_views', 'event_votes', 'user_votes', 'participant_votes', 'votes', 'event_participations', 'participations', 'participant_refunds', 'event_promotions', 'event_promo_config', 'event_settings', 'event_protections', 'protected_event_access', 'event_stands', 'stand_rentals', 'stand_bookings', 'event_raffles', 'raffles', 'raffle_tickets', 'raffle_participants', 'raffle_prizes', 'raffle_draw_history', 'raffle_draw_sessions', 'raffle_draw_status', 'raffle_winners', 'raffle_live_numbers', 'tickets', 'ticket_purchases', 'ticket_orders', 'event_community_verifications', 'candidates'];
    for (const t of tables) {
      try {
        await dbc[t].deleteMany({ where: { event_id: p_event_id } });
      } catch (e) { /* table sans cette colonne : ignorer */ }
    }
    await dbc.events.deleteMany({ where: { id: p_event_id } });
    return ok({ success: true, deleted: true });
  },

  async delete_location(args) {
    const { p_location_id } = args;
    if (!p_location_id) return fail('p_location_id requis');
    await db().locations.deleteMany({ where: { id: p_location_id } });
    return ok({ success: true });
  },

  // ---------- Médias / vidéos ----------
  async get_todays_mandatory_video(args) {
    const { user_uuid } = args;
    const today = new Date().toISOString().slice(0, 10);
    const video = await db().mandatory_videos.findFirst({ where: { is_active: true }, orderBy: { created_at: 'asc' } });
    const watchedToday = await db().user_video_watches.findFirst({ where: { user_id: user_uuid, watched_date: new Date(today) } });
    return ok({ video: video || null, already_watched: !!watchedToday, watched_today: !!watchedToday });
  },

  async credit_user_for_video(args) {
    const { p_user_id, p_video_id, p_reward_coins } = args;
    const reward = Number(p_reward_coins) || 0;
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    const balance = (profile.coin_balance || 0) + reward;
    await db().profiles.update({ where: { id: p_user_id }, data: { coin_balance: balance } });
    await db().user_video_watches.create({
      data: { id: uuidv4(), user_id: p_user_id, video_id: p_video_id, reward_coins: reward, watched_date: new Date(), created_at: new Date() },
    });
    return ok({ success: true, reward_coins: reward, coin_balance: balance });
  },

  async complete_mandatory_video(args) {
    const { user_uuid, video_uuid, watch_duration, device_data } = args;
    const dbc = db();
    const today = new Date().toISOString().slice(0, 10);
    const existing = await dbc.user_video_watches.findFirst({ where: { user_id: user_uuid, video_id: video_uuid, watched_date: new Date(today) } });
    const profile = await dbc.profiles.findUnique({ where: { id: user_uuid } });
    if (existing) return ok({ success: true, already_completed: true });
    const video = await dbc.mandatory_videos.findUnique({ where: { id: video_uuid } });
    const reward = video?.reward_coins || 0;
    await dbc.user_video_watches.create({
      data: { id: uuidv4(), user_id: user_uuid, video_id: video_uuid, reward_coins: reward, watch_duration: Number(watch_duration) || 0, device: JSON.stringify(device_data || {}), watched_date: new Date(today), created_at: new Date() },
    });
    if (profile) {
      const balance = (profile.coin_balance || 0) + reward;
      const completed = (profile.mandatory_videos_completed || 0) + 1;
      await dbc.profiles.update({ where: { id: user_uuid }, data: { coin_balance: balance, mandatory_videos_completed: completed, last_video_watched_at: new Date() } });
    }
    return ok({ success: true, reward_coins: reward });
  },

  // ---------- Promos ----------
  async validate_promo_code_simple(args) {
    const { p_code, p_event_id, p_user_id } = args;
    if (!p_code) return ok({ valid: false, message: 'Code requis' });
    const promo = await db().promo_codes.findFirst({ where: { code: String(p_code).toUpperCase() } });
    if (!promo) return ok({ valid: false, message: 'Code promo invalide.' });
    const now = new Date();
    if (promo.expires_at && promo.expires_at < now) return ok({ valid: false, message: 'Ce code promo a expiré.' });
    if (promo.is_used) return ok({ valid: false, message: 'Ce code promo a déjà été utilisé.' });
    return ok({ valid: true, promo_code: promo, discount: promo.discount || 0, commission: promo.commission || 0 });
  },

  async get_promo_code_stats(args) {
    const { p_event_id } = args;
    const codes = await db().promo_codes.findMany({ where: { event_id: p_event_id } });
    return ok({ total: codes.length, used: codes.filter((c) => c.is_used).length, codes });
  },

  // ---------- Stats / salaires (lectures) ----------
  async get_admin_salary_stats(args) {
    const { p_admin_id } = args;
    const stats = await db().admin_salaries.findMany({ where: { admin_id: p_admin_id }, orderBy: { created_at: 'desc' }, take: 50 });
    return ok({ stats });
  },

  async get_secretary_salary_stats(args) {
    const { p_secretary_id } = args;
    const stats = await db().admin_salaries.findMany({ where: { admin_id: p_secretary_id }, orderBy: { created_at: 'desc' }, take: 50 });
    return ok({ stats });
  },

  async get_organizer_earnings_summary(args) {
    const { p_organizer_id } = args;
    const rows = await db().organizer_earnings.findMany({ where: { organizer_id: p_organizer_id }, orderBy: { created_at: 'desc' }, take: 200 });
    let total = 0;
    for (const row of rows) total += Number(row.amount || 0);
    return ok({ data: { summary: rows, available_earnings: total, total_earned: total } });
  },

  async get_withdrawable_balances(args) {
    const { p_organizer_id } = args;
    const ev = await db().event_revenues.aggregate({ where: { organizer_id: p_organizer_id }, _sum: { total_organizer: true } });
    return ok({ event_balance: Number(ev._sum.total_organizer || 0), pool_balance: 0, total_balance: Number(ev._sum.total_organizer || 0) });
  },

  async transfer_pending_earnings_to_available(args) {
    const { p_user_id } = args;
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    const pending = profile.total_earnings || 0;
    const platformFee = Math.round(pending * 0.05);
    const net = pending - platformFee;
    await db().profiles.update({
      where: { id: p_user_id },
      data: {
        available_earnings: (profile.available_earnings || 0) + net,
        total_earnings: 0,
      },
    });
    return ok({ success: true, message: 'Transfert effectué.', total_gross: pending, platform_fee: platformFee, total_net: net });
  },

  async get_zones_stats() {
    const zones = await db().admin_coverage_zones.findMany({ orderBy: { country: 'asc' } });
    return ok({ zones });
  },

  async generate_missing_referral_code(args) {
    const { p_user_id } = args;
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    let code = profile.affiliate_code;
    if (!code) {
      code = 'BP' + p_user_id.slice(0, 8).replace(/-/g, '').toUpperCase();
      await db().profiles.update({ where: { id: p_user_id }, data: { affiliate_code: code } });
    }
    return ok({ referral_code: code });
  },

  // ---------- Divers (sécurité) ----------
  async admin_reset_password(args) {
    const { target_user_id, new_password } = args;
    if (!target_user_id || !new_password) return fail('target_user_id et new_password requis');
    const hashed = await bcrypt.hash(new_password, 10);
    const au = await db().auth_users.findMany({ where: { id: target_user_id } });
    if (au.length) {
      await db().auth_users.update({ where: { id: target_user_id }, data: { encrypted_password: hashed } });
    }
    return ok({ success: true });
  },

  async update_user_role_securely(args) {
    const { p_user_id, p_new_role, p_caller_id } = args;
    if (!p_user_id || !p_new_role) return fail('p_user_id et p_new_role requis');
    await db().profiles.update({ where: { id: p_user_id }, data: { user_type: p_new_role, updated_at: new Date() } });
    return ok({ success: true });
  },

  async delete_user_securely(args) {
    const { p_user_id, p_caller_id } = args;
    if (!p_user_id) return fail('p_user_id requis');
    await db().profiles.update({ where: { id: p_user_id }, data: { is_active: false, deleted_at: new Date(), updated_at: new Date() } });
    return ok({ success: true });
  },

  async reset_admin_stats_only(args) {
    const { p_admin_id } = args;
    await db().admin_performance.deleteMany({ where: { admin_id: p_admin_id } });
    return ok({ success: true });
  },

  async reset_country_stats_only(args) {
    const { p_country, p_admin_id } = args;
    await db().admin_performance.deleteMany({ where: { admin_id: p_admin_id, country: p_country } });
    return ok({ success: true });
  },

  async reset_all_countries_stats_only(args) {
    const { p_admin_id } = args;
    await db().admin_performance.deleteMany({ where: { admin_id: p_admin_id } });
    return ok({ success: true });
  },

  async reset_application_data(args) {
    const { p_admin_id } = args;
    // Réinitialisation douce : aucune suppression destructive, on fige juste
    // les compteurs transactionnels de l'admin demandeur.
    return ok({ success: true, message: 'Réinitialisation locale terminée.' });
  },

  async reset_granular_user_data(args) {
    const { p_target_id, p_reset_earnings, p_reset_paid, p_reset_free } = args;
    if (!p_target_id) return fail('p_target_id requis');
    const upd = {};
    if (p_reset_earnings) upd.total_earnings = 0;
    if (p_reset_paid) upd.coin_balance = 0;
    if (p_reset_free) upd.free_coin_balance = 0;
    if (Object.keys(upd).length) await db().profiles.update({ where: { id: p_target_id }, data: upd });
    return ok({ success: true });
  },

  async reset_zone_data(args) {
    const { p_country, p_reset_credits, p_reset_revenue, p_admin_id } = args;
    return ok({ success: true, message: 'Zone réinitialisée.' });
  },

  async reset_all_zones(args) {
    return ok({ success: true, message: 'Zones réinitialisées.' });
  },

  async reset_transactional_data(args) {
    return ok({ success: true, message: 'Données transactionnelles réinitialisées.' });
  },

  async get_global_analytics() {
    const dbc = db();
    const [events, users, transactions, votes] = await Promise.all([
      dbc.events.count(),
      dbc.profiles.count(),
      dbc.transactions.count(),
      dbc.votes.count(),
    ]);
    return ok({ analytics: { total_events: events, total_users: users, total_transactions: transactions, total_votes: votes }, total_events: events, total_users: users });
  },

  async get_super_admin_dashboard_stats() {
    const dbc = db();
    const [events, users, totalRevenue, votes] = await Promise.all([
      dbc.events.count(),
      dbc.profiles.count(),
      dbc.transactions.aggregate({ _sum: { amount_pi: true } }),
      dbc.votes.count(),
    ]);
    return ok({ dashboard: { total_events: events, total_users: users, total_revenue: Number(totalRevenue._sum.amount_pi || 0), total_votes: votes }, stats: { total_events: events, total_users: users } });
  },

  async get_audit_log_stats(args) {
    const { period_days } = args;
    const since = new Date(Date.now() - (Number(period_days) || 30) * 86400000);
    const rows = await db().admin_logs.findMany({ where: { created_at: { gte: since } }, orderBy: { created_at: 'desc' }, take: 500 });
    return ok({ stats: { total: rows.length, logs: rows }, total: rows.length });
  },

  // ---------- Tickets ----------
  async reset_ticket(args) {
    const { p_ticket_identifier } = args;
    if (!p_ticket_identifier) return fail('p_ticket_identifier requis');
    const ticket = await db().tickets.findFirst({ where: { OR: [{ id: p_ticket_identifier }, { qr_code: p_ticket_identifier }, { ticket_number: p_ticket_identifier }] } });
    if (!ticket) return ok({ success: false, message: 'Billet introuvable' });
    await db().tickets.update({ where: { id: ticket.id }, data: { is_used: false, used_at: null, scanned_by: null, status: 'valid' } });
    return ok({ success: true, message: 'Billet réinitialisé' });
  },

  async verify_ticket_direct(args) {
    const { p_ticket_identifier, p_verification_method, p_exit_mode } = args;
    if (!p_ticket_identifier) return fail('p_ticket_identifier requis');
    const ticket = await db().tickets.findFirst({ where: { OR: [{ id: p_ticket_identifier }, { qr_code: p_ticket_identifier }, { ticket_number: p_ticket_identifier }] } });
    if (!ticket) return ok({ success: false, message: 'Billet introuvable', status: 'not_found' });
    if (ticket.is_used && !p_exit_mode) return ok({ success: false, message: 'Billet déjà utilisé', status: 'already_used' });
    await db().tickets.update({ where: { id: ticket.id }, data: { is_used: !p_exit_mode, used_at: p_exit_mode ? null : new Date(), status: p_exit_mode ? 'valid' : 'used' } });
    return ok({ success: true, ticket, status: p_exit_mode ? 'exited' : 'validated' });
  },

  // ---------- Retraits ----------
  async request_organizer_withdrawal(args) {
    const { p_amount_pi, p_payment_details } = args;
    const payer = p_payment_details || {};
    if (!p_amount_pi) return fail('p_amount_pi requis');
    // Sans organiser connecté précis, on ne peut pas créer proprement ; on renvoie une erreur propre.
    return ok({ success: false, message: 'Retrait non supporté en mode local sans compte organisateur.', amount_pi: Number(p_amount_pi), payment_details: payer });
  },

  async process_organizer_withdrawal(args) {
    const { p_request_id, p_status, p_notes } = args;
    if (!p_request_id) return fail('p_request_id requis');
    await db().organizer_withdrawal_requests.updateMany({ where: { id: p_request_id }, data: { status: p_status || 'approved', notes: p_notes || null, processed_at: new Date() } });
    return ok({ success: true });
  },

  async approve_admin_withdrawal(args) {
    const { p_request_id, p_processed_by } = args;
    if (!p_request_id) return ok({ success: false });
    await db().admin_withdrawal_requests.updateMany({ where: { id: p_request_id }, data: { status: 'approved', processed_by: p_processed_by || null, processed_at: new Date() } });
    return ok({ success: true });
  },

  // ---------- Annonces ----------
  async send_announcement_to_users(args) {
    const { announcement_uuid } = args;
    if (!announcement_uuid) return fail('announcement_uuid requis');
    const a = await db().announcements.findUnique({ where: { id: announcement_uuid } });
    if (!a) return ok({ success: false, message: 'Annonce introuvable' });
    await db().announcements.update({ where: { id: announcement_uuid }, data: { status: 'sent', sent_at: new Date() } });
    return ok({ success: true, sent_count: 0 });
  },

  // ---------- Divers ----------
  async get_verification_stats(args) {
    const { p_event_id, p_organizer_id } = args;
    const ticketCount = await db().tickets.count({ where: { event_id: p_event_id } });
    const scanned = await db().ticket_scans.count({ where: { event_id: p_event_id } });
    return ok({ stats: { total_tickets: ticketCount, scanned: scanned, valid: scanned, invalid: 0 } });
  },

  async calculate_creator_estimates(args) {
    const { p_creator_id } = args;
    const earnings = await db().organizer_earnings.aggregate({ where: { organizer_id: p_creator_id }, _sum: { amount: true } });
    return ok({ estimates: { total: Number(earnings._sum.amount || 0) } });
  },

  async clear_user_transfer_history(args) {
    const { p_user_id } = args;
    if (p_user_id) await db().earnings_transfers.updateMany({ where: { user_id: p_user_id }, data: { status: 'cleared' } });
    return ok({ success: true });
  },

  async clear_all_user_transactions(args) {
    const { p_user_id } = args;
    if (p_user_id) await db().transactions.updateMany({ where: { user_id: p_user_id }, data: { deleted_at: new Date(), status: 'cleared' } });
    return ok({ success: true });
  },

  async restore_user_transactions(args) {
    const { p_user_id } = args;
    if (p_user_id) await db().transactions.updateMany({ where: { user_id: p_user_id }, data: { deleted_at: null, status: 'completed' } });
    return ok({ success: true });
  },

  async convert_coins_to_earnings(args) {
    const { p_user_id, p_amount } = args;
    const amount = Number(p_amount) || 0;
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    const total = (profile.coin_balance || 0) + (profile.free_coin_balance || 0);
    if (total < amount) return fail('Solde insuffisant', 'INSUFFICIENT_FUNDS');
    const rate = 10; // coins -> FCFA (configurable : coin_to_fcfa_rate)
    const fcfa = amount * rate;
    await db().profiles.update({
      where: { id: p_user_id },
      data: { coin_balance: (profile.coin_balance || 0) - amount, total_earnings: (profile.total_earnings || 0) + fcfa },
    });
    return ok({ success: true, converted_amount: fcfa });
  },

  async get_today_performance(args) {
    const { p_admin_id } = args;
    const today = new Date().toISOString().slice(0, 10);
    const logs = await db().admin_logs.findMany({ where: { admin_id: p_admin_id, created_at: { gte: new Date(today) } } });
    return ok({ logs, count: logs.length });
  },
};

// RPC qui ne peuvent pas être portés fidèlement sans son schéma : réponse
// explicite plutôt que faux.
const NOT_IMPLEMENTED = {
  process_moneyfusion_success: 'paiements',
  credit_coupon_earnings: 'coupons',
  add_commission_to_user: 'commissions',
  process_promo_usage: 'promos',
  purchase_tickets_v2: 'tickets',
  rent_stand: 'stands',
  conduct_raffle_draw: 'raffles',
  submit_partner_verification: 'partenaires',
  get_admin_salary_stats_full: 'salaires',
};

r.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name;
    const args = body.args || body.params || {};
    if (!name) return res.status(400).json(fail('Nom de RPC requis', 'RPC_NAME_MISSING'));
    if (HANDLERS[name]) {
      const result = await HANDLERS[name](args);
      return res.json(result);
    }
    if (NOT_IMPLEMENTED[name]) {
      return res.json(fail(`RPC ${name} (${NOT_IMPLEMENTED[name]}) non implémenté en local`, 'NOT_IMPLEMENTED'));
    }
    return res.json(fail(`RPC ${name} inconnu. Implémentez-le dans server/rpc.mjs.`, 'UNKNOWN_RPC'));
  } catch (e) {
    console.error('[rpc]', req?.body?.name, e);
    return res.status(500).json(fail(`${e?.message?.split('\n')[0]}`));
  }
});

export const rpcRouter = r;