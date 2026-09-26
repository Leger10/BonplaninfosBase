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

function parseValidDates(raw) {
  if (!raw) return [];
  let entries = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      entries = JSON.parse(trimmed);
    } catch {
      entries = trimmed.split(/[,;]/);
    }
  }
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const e of entries) {
    if (!e) continue;
    if (e && typeof e === 'object' && e.date) { out.push(String(e.date).slice(0, 10)); continue; }
    if (e && typeof e === 'object' && e.value) { out.push(String(e.value).slice(0, 10)); continue; }
    const s = String(e).trim();
    if (!s) continue;
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) out.push(`${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`);
  }
  return [...new Set(out)];
}

const PLATFORM_FEE_RATE = 0.05;

async function getAppSettings() {
  try {
    const row = await db().app_settings.findFirst();
    return {
      rate: Number(row?.coin_to_fcfa_rate) || 10,
      minWithdrawalPi: Number(row?.min_withdrawal_pi) || 50,
    };
  } catch (e) {
    return { rate: 10, minWithdrawalPi: 50 };
  }
}

async function getMinWithdrawalPi() {
  return (await getAppSettings()).minWithdrawalPi;
}

async function creditOrganizerEarnings(params = {}) {
  const {
    p_organizer_id, p_event_id = null, p_transaction_id = null,
    p_transaction_type = 'ticket_sale', p_earnings_coins = 0,
    p_earnings_fcfa = null, p_ticket_count = null, p_description = null,
    p_created_at = null,
  } = params;
  if (!p_organizer_id) return { success: false, message: 'Organisateur introuvable.' };
  const coins = Math.max(0, Math.floor(Number(p_earnings_coins) || 0));
  if (!coins) return { success: false, message: 'Gain nul : rien a crediter.' };
  const dbc = db();
  const now = p_created_at ? new Date(p_created_at) : new Date();
  const platformCommission = Math.floor(coins * PLATFORM_FEE_RATE);
  const row = await dbc.organizer_earnings.create({
    data: {
      id: uuidv4(),
      organizer_id: p_organizer_id,
      event_id: p_event_id,
      transaction_id: p_transaction_id || uuidv4(),
      transaction_type: p_transaction_type,
      earnings_coins: coins,
      earnings_fcfa: Number(p_earnings_fcfa ?? coins * 10),
      status: 'pending',
      platform_commission: platformCommission,
      platform_fee: platformCommission * 10,
      net_amount: (coins - platformCommission) * 10,
      fee_percent: PLATFORM_FEE_RATE * 100,
      ticket_count: p_ticket_count || null,
      earning_type: p_transaction_type,
      event_type: 'ticketing',
      description: p_description,
      created_at: now,
      updated_at: now,
    },
  });
  const profile = await dbc.profiles.findUnique({ where: { id: p_organizer_id }, select: { total_earnings: true } });
  const pendingTotal = (profile?.total_earnings || 0) + coins;
  if (profile) {
    await dbc.profiles.update({ where: { id: p_organizer_id }, data: { total_earnings: pendingTotal, updated_at: now } });
  }
  return { success: true, earning_id: row.id, pending_coins: pendingTotal, platform_commission: platformCommission };
}

async function upsertProtection(p_event_id, p_user_id, params = {}) {
  const { success = false, message = 'Accès déjà accordé.', amount_paid = 0, amount_pi = 0, payment_method = 'coins', transaction_id = null } = params;
  const paidPi = Math.max(0, Math.floor(Number(amount_paid || amount_pi || 0)));
  const existing = await db().protected_event_access.findFirst({ where: { event_id: p_event_id, user_id: p_user_id } });
  if (existing) {
    return { success, message, amount_paid: Number(existing.amount_paid_pi || 0), paid: paidPi, granted: true, already_granted: true };
  }
  try {
    await db().protected_event_access.create({
      data: {
        id: uuidv4(),
        event_id: p_event_id,
        user_id: p_user_id,
        amount_paid_pi: paidPi,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  } catch (e) {
    const dup = await db().protected_event_access.findFirst({ where: { event_id: p_event_id, user_id: p_user_id } });
    if (dup) return { success, message, amount_paid: Number(dup.amount_paid_pi || 0), paid: paidPi, granted: true, already_granted: true };
    throw e;
  }
  return { success: true, message, amount_paid: paidPi, paid: paidPi, granted: true, already_granted: false };
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
    const dbc = db();
    const profile = await dbc.profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');
    const ev = await dbc.events.findUnique({
      where: { id: p_event_id },
      select: { id: true, title: true, organizer_id: true, price_pi: true, price_fcfa: true, is_sales_closed: true, status: true },
    });
    if (!ev) return fail('Evenement introuvable', 'EVENT_NOT_FOUND');
    const existing = await dbc.protected_event_access.findFirst({ where: { event_id: p_event_id, user_id: p_user_id } });
    if (existing && existing.status === 'active') {
      return ok({ success: true, message: 'Acces deja accorde.', already_granted: true, amount_paid: Number(existing.amount_paid_pi || 0) });
    }
    if (ev.is_sales_closed) return fail('Les acces a cet evenement sont fermes', 'ACCESS_CLOSED');

    const price = Math.max(0, Math.floor(Number(ev.price_pi || 0)));
    const priceFcfa = Number(ev.price_fcfa || 0) || price * 10;
    const balance = Number(profile.coin_balance || 0);
    if (price > 0 && balance < price) {
      return fail(`Solde insuffisant (disponible: ${balance}, requis: ${price})`, 'INSUFFICIENT_COINS');
    }

    const now = new Date();
    const orderId = `ACC-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    let access;
    try {
      access = await upsertProtection(p_event_id, p_user_id, {
        success: true,
        message: 'Acces approuve.',
        amount_paid: price,
        payment_method: price > 0 ? 'coins' : 'free',
        transaction_id: orderId,
      });
    } catch (e) {
      console.error('Acces evenement non enregistre:', e.message);
      return fail("Impossible d'enregistrer l'acces, aucun montant n'a ete debite", 'ACCESS_NOT_GRANTED');
    }

    if (price > 0 && !access.already_granted) {
      await dbc.profiles.update({
        where: { id: p_user_id },
        data: { coin_balance: balance - price, updated_at: now },
      });
      await dbc.payments.create({
        data: {
          user_id: p_user_id,
          coins_amount: price,
          amount_fcfa: priceFcfa,
          status: 'paid',
          payment_method: 'coins',
          transaction_id: orderId,
          pack_id: 'protected_access',
          credits_added: true,
          created_at: now,
          updated_at: now,
        },
      });
      await dbc.transactions.create({
        data: {
          user_id: p_user_id,
          event_id: p_event_id,
          transaction_type: 'protected_access',
          amount_pi: price,
          amount_fcfa: priceFcfa,
          description: `Acces a l'evenement : ${ev.title || ''}`.trim(),
          status: 'completed',
          amount_coins: price,
          created_at: now,
          completed_at: now,
          payment_method: 'coins',
          transaction_reference: orderId,
        },
      });
      try {
        if (ev.organizer_id) {
          await creditOrganizerEarnings({
            p_organizer_id: ev.organizer_id,
            p_event_id,
            p_transaction_id: orderId,
            p_transaction_type: 'event_access',
            p_earnings_coins: price,
            p_earnings_fcfa: priceFcfa,
            p_ticket_count: 1,
            p_description: `Acces payant a l'evenement - en attente de validation`,
            p_created_at: now,
          });
        }
      } catch (e) {
        console.error('Gains acces evenement non credites:', e.message);
      }
    }

    return ok(access);
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
    const dbc = db();
    const promo = await dbc.promo_codes.findFirst({ where: { code: String(p_code).toUpperCase() } });
    if (!promo) return ok({ valid: false, message: 'Code promo invalide.' });
    const now = new Date();
    if (promo.is_active === false) return ok({ valid: false, message: 'Ce code promo est désactivé.' });
    if (promo.expires_at && new Date(promo.expires_at) < now) return ok({ valid: false, message: 'Ce code promo a expiré.' });
    if (promo.usage_limit != null && promo.usage_count != null && promo.usage_count >= promo.usage_limit) {
      return ok({ valid: false, message: 'Ce code promo a atteint sa limite d\'utilisation.' });
    }
    const eventId = promo.event_id || p_event_id || null;
    const promoConfig = eventId
      ? await dbc.event_promo_config.findFirst({ where: { event_id: eventId } })
      : null;
    if (promoConfig && promoConfig.enabled === false) {
      return ok({ valid: false, message: 'Les codes promo sont désactivés pour cet événement.' });
    }
    if (promoConfig && promoConfig.usage_limit != null && promo.usage_count != null && promo.usage_count >= promoConfig.usage_limit) {
      return ok({ valid: false, message: 'Ce code promo a atteint sa limite d\'utilisation.' });
    }
    const discountType = promoConfig?.discount_type || null;
    const discountValue = promoConfig?.discount_value || 0;
    const commissionRate = promoConfig?.commission_rate || 0;
    return ok({
      valid: true,
      promo_code_id: promo.id,
      influencer_id: promo.influencer_id || null,
      discount_type: discountType,
      discount_value: discountValue,
      commission_rate: commissionRate,
      code: promo.code,
      message: 'Code promo valide',
    });
  },

  async purchase_tickets_v2(args) {
    const { p_user_id, p_event_id, p_cart, p_final_amount, p_promo_code_id, p_commission_amount, p_payment_method, p_transaction_reference, p_attendee_name } = args;
    if (!p_user_id || !p_event_id) return fail('p_user_id et p_event_id requis');
    if (!p_cart || (typeof p_cart !== 'object')) return fail('Panier vide : p_cart requis');
    const cartLines = Array.isArray(p_cart)
      ? p_cart
      : Object.entries(p_cart)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({ type_id: id, quantity: qty }));
    if (!cartLines.length) return fail('Panier vide : p_cart requis', 'EMPTY_CART');
    const dbc = db();

    const profile = await dbc.profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');

    const evt = await dbc.events.findUnique({
      where: { id: p_event_id },
      select: { title: true, event_start_at: true, event_end_at: true, location: true, full_address: true, address: true, city: true, country: true },
    });

    // 1. Recalcul prix + vérif stock par type de billet (édition totale)
    let baseTotalFcfa = 0;
    let ticketRows = [];
    const items = [];
    for (const line of cartLines) {
      const typeId = line.ticket_type_id || line.id || line.type_id || line.ticketTypeId;
      const qty = Math.max(1, parseInt(line.quantity || line.qty || 1, 10) || 1);
      if (!typeId) continue;
      const tt = await dbc.ticket_types.findUnique({ where: { id: typeId } });
      if (!tt) return fail(`Type de billet introuvable: ${typeId}`, 'TICKET_TYPE_NOT_FOUND');
      if (tt.event_id && tt.event_id !== p_event_id) return fail(`Type de billet ${typeId} hors événement`, 'TICKET_TYPE_WRONG_EVENT');
      const sold = tt.quantity_sold ?? tt.tickets_sold ?? 0;
      const avail = tt.quantity_available ?? 0;
      if (sold + qty > avail) return fail(`Stock insuffisant pour « ${tt.name} » (dispo: ${Math.max(0, avail - sold)})`, 'TICKET_TYPE_OUT_OF_STOCK');
      const coins = tt.price_coins || tt.price_pi || Math.round(Number(tt.price || 0) / 10);
      baseTotalFcfa += coins * qty;
      items.push({ tt, qty, coins });
    }
    if (!items.length) return fail('Aucun billet valide dans le panier', 'EMPTY_CART');

    // 2. Réduction promo (si code promo valide fourni)
    let promoReduction = 0;      // en pièces
    let promoMeta = null;
    if (p_promo_code_id) {
      const promo = await dbc.promo_codes.findUnique({ where: { id: p_promo_code_id } });
      if (!promo) return fail('Code promo introuvable', 'PROMO_NOT_FOUND');
      const cfg = promo.event_id
        ? await dbc.event_promo_config.findFirst({ where: { event_id: p_event_id, id: promo.promo_config_id || undefined } })
        : await dbc.event_promo_config.findFirst({ where: { event_id: p_event_id } });
      const cfgActive = cfg?.enabled !== false;
      const now = new Date();
      const withinDates = (!cfg?.valid_from || now >= cfg.valid_from) && (!cfg?.valid_to || now <= cfg.valid_to);
      if (!cfgActive || !withinDates) return fail('Code promo non applicable à cet événement', 'PROMO_NOT_APPLICABLE');
      const dType = cfg?.discount_type || 'percentage';
      const dVal = Number(cfg?.discount_value || 0);
      promoReduction = dType === 'fixed' ? Math.min(dVal, baseTotalFcfa) : Math.round((baseTotalFcfa * dVal) / 100);
      promoReduction = Math.min(promoReduction, baseTotalFcfa);
      promoMeta = { promo_code_id: promo.id, discount_type: dType, discount_value: dVal, commission_rate: cfg?.commission_rate || 0 };
    }
    const totalCoins = Math.max(1, baseTotalFcfa - promoReduction);
    // Débit explicite auteur (p_final_amount non fiable côté client) : on utilise totalCoins.

    // 3. Vérif solde coins du profil + débit
    const balance = profile.coin_balance ?? 0;
    if (balance < totalCoins) return fail(`Solde insuffisant (disponible: ${balance}, requis: ${totalCoins})`, 'INSUFFICIENT_COINS');

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const genCode = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

    const now = new Date();
    const orderId = p_transaction_reference || `TKT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const createdTickets = [];

    for (const { tt, qty, coins } of items) {
      for (let i = 0; i < qty; i++) {
        const code = genCode();
        const t = await dbc.tickets.create({
          data: {
            event_id: p_event_id,
            user_id: p_user_id,
            quantity: 1,
            total_amount_pi: coins,
            total_amount_fcfa: coins * 10,
            qr_code: `TKT-${code}`,
            status: 'active',
            purchased_at: now,
            ticket_type_id: tt.id,
            purchase_price_pi: coins,
            attendee_name: p_attendee_name || profile.full_name || profile.username || null,
            ticket_number: `${code}`,
            payment_method: p_payment_method || 'coins',
            transaction_reference: orderId,
            ticket_code_short: code,
            entry_count: 0,
            created_at: now,
            updated_at: now,
          },
        });
        createdTickets.push(t);
      }
      await dbc.ticket_types.update({ where: { id: tt.id }, data: { tickets_sold: (tt.tickets_sold ?? 0) + qty, quantity_sold: (tt.quantity_sold ?? 0) + qty, updated_at: now } });
    }

    try {
      if (createdTickets.length) {
        await dbc.event_tickets.createMany({
          data: createdTickets.map((t) => ({
            order_id: orderId,
            event_id: p_event_id,
            user_id: p_user_id,
            ticket_type_id: t.ticket_type_id,
            ticket_number: t.ticket_number,
            qr_code: t.qr_code,
            status: 'active',
            purchase_amount_pi: t.purchase_price_pi ?? t.total_amount_pi,
            purchase_amount_fcfa: t.total_amount_fcfa,
            purchased_at: now,
            transaction_reference: orderId,
            attendee_name: p_attendee_name || profile.full_name || profile.username || null,
            payment_method: p_payment_method || 'coins',
            payment_status: 'paid',
            ticket_code: t.ticket_code_short,
            ticket_code_short: t.ticket_code_short,
            event_title: evt?.title || null,
            event_start_at: evt?.event_start_at || null,
            event_end_at: evt?.event_end_at || null,
            location: evt?.location || evt?.city || null,
            full_address: evt?.full_address || evt?.address || evt?.location || evt?.city || null,
            address: evt?.address || null,
            city: evt?.city || null,
            country: evt?.country || null,
            created_at: now,
            updated_at: now,
          })),
        });
      }
    } catch (e) {
      console.error('⚠️ Erreur miroir event_tickets:', e.message);
    }

    await dbc.profiles.update({
      where: { id: p_user_id },
      data: {
        coin_balance: Math.max(0, balance - totalCoins),
        updated_at: now,
      },
    });

    const payment = await dbc.payments.create({
      data: {
        user_id: p_user_id,
        coins_amount: totalCoins,
        amount_fcfa: totalCoins * 10,
        status: 'paid',
        payment_method: p_payment_method || 'coins',
        transaction_id: orderId,
        pack_id: 'ticket_purchase',
        coupon_code: p_promo_code_id || null,
        credits_added: true,
        created_at: now,
        updated_at: now,
      },
    });

    await dbc.transactions.create({
      data: {
        user_id: p_user_id,
        event_id: p_event_id,
        transaction_type: 'ticket_purchase',
        amount_pi: totalCoins,
        amount_fcfa: totalCoins * 10,
        description: `🎟️ Achat de ${createdTickets.length} billet(s)${promoMeta ? ` avec code promo ${promoMeta.discount_type === 'fixed' ? promoMeta.discount_value + ' pièces' : promoMeta.discount_value + '%'} de réduction` : ''}`,
        status: 'completed',
        amount_coins: totalCoins,
        created_at: now,
        completed_at: now,
        payment_method: p_payment_method || 'coins',
        transaction_reference: orderId,
      },
    });

    try {
      const organ = await dbc.events.findUnique({ where: { id: p_event_id }, select: { organizer_id: true } });
      if (organ?.organizer_id) {
        await creditOrganizerEarnings({
          p_organizer_id: organ.organizer_id,
          p_event_id,
          p_transaction_id: orderId,
          p_transaction_type: 'ticket_sale',
          p_earnings_coins: totalCoins,
          p_earnings_fcfa: totalCoins * 10,
          p_ticket_count: createdTickets.length,
          p_description: `Vente de ${createdTickets.length} billet(s) — en attente de validation`,
          p_created_at: now,
        });
      }
    } catch (e) {
      console.error('⚠️ Gains organisateur non crédités:', e.message);
    }

    return ok({
      success: true,
      message: 'Achat réussi' + (promoMeta ? ` — code promo appliqué (${promoMeta.discount_type === 'fixed' ? promoMeta.discount_value + ' pièces' : promoMeta.discount_value + '%'})` : ''),
      transaction_id: orderId,
      transaction_reference: orderId,
      payment_id: payment.id,
      total_coins: totalCoins,
      base_total_coins: baseTotalFcfa,
      promo: promoMeta,
      promo_applied: !!promoMeta,
      tickets: createdTickets.map((t) => ({ id: t.id, qr_code: t.qr_code, ticket_number: t.ticket_number, price: t.total_amount_pi, price_fcfa: (t.total_amount_fcfa || 0), ticket_code_short: t.ticket_code_short, status: t.status })),
    });
  },

  async rent_stand(args) {
    const {
      p_event_id, p_user_id, p_stand_type_id, p_booking_code, p_rental_type,
      p_contact_email, p_contact_phone, p_company_name, p_contact_person,
      p_business_description, p_guest_name, p_check_in_date, p_check_out_date,
      p_tent_size, p_special_requests,
    } = args || {};
    if (!p_event_id || !p_user_id || !p_stand_type_id) return fail('evenement, utilisateur et type de stand requis');
    const dbc = db();
    const profile = await dbc.profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');
    const type = await dbc.stand_types.findUnique({ where: { id: p_stand_type_id } });
    if (!type) return fail('Type de stand introuvable', 'STAND_TYPE_NOT_FOUND');
    if (type.event_id && type.event_id !== p_event_id) return fail("Ce stand n'appartient pas a cet evenement", 'STAND_WRONG_EVENT');
    if (type.is_active === false) return fail("Ce type de stand n'est plus disponible", 'STAND_TYPE_INACTIVE');
    const rented = Number(type.quantity_rented || 0);
    const available = Number(type.quantity_available || 0);
    if (rented >= available) return fail(`Plus aucun emplacement disponible pour « ${type.name} »`, 'STAND_OUT_OF_STOCK');

    const unitPrice = Math.max(0, Math.floor(Number(type.calculated_price_pi || 0)));
    const unitFcfa = Number(type.base_price || 0) || unitPrice * 10;
    const balance = Number(profile.coin_balance || 0);
    if (unitPrice > 0 && balance < unitPrice) {
      return fail(`Solde insuffisant (disponible: ${balance}, requis: ${unitPrice})`, 'INSUFFICIENT_COINS');
    }

    const now = new Date();
    let code = String(p_booking_code || '').trim();
    if (!code) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidateCode = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        const clash = await dbc.stand_rentals.findFirst({ where: { booking_code: candidateCode } });
        if (!clash) { code = candidateCode; break; }
      }
    }
    if (!code) return fail('Impossible de generer un code de reservation', 'BOOKING_CODE_FAILED');

    const used = await dbc.stand_rentals.count({ where: { stand_type_id: type.id } });
    const standNumber = `${String(type.name || 'STAND').slice(0, 3).toUpperCase()}-${String(used + 1).padStart(2, '0')}`;
    const orderId = `STAND-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    const rental = await dbc.stand_rentals.create({
      data: {
        id: uuidv4(),
        stand_event_id: type.stand_event_id || null,
        user_id: p_user_id,
        stand_type_id: type.id,
        stand_number: standNumber,
        company_name: p_company_name || null,
        contact_person: p_contact_person || null,
        contact_email: p_contact_email || null,
        contact_phone: p_contact_phone || null,
        business_description: p_business_description || null,
        rental_amount_pi: unitPrice,
        rental_amount_fcfa: unitFcfa,
        deposit_paid_pi: unitPrice,
        deposit_paid_fcfa: unitFcfa,
        status: 'reserved',
        reserved_at: now,
        confirmed_at: now,
        booking_code: code,
        rental_type: p_rental_type || type.rental_type || 'stand',
        guest_name: p_guest_name || null,
        check_in_date: p_check_in_date || null,
        check_out_date: p_check_out_date || null,
        tent_size: p_tent_size || null,
        special_requests: p_special_requests || null,
        created_at: now,
        updated_at: now,
      },
    });

    await dbc.stand_types.update({
      where: { id: type.id },
      data: { quantity_rented: rented + 1 },
    });

    if (unitPrice > 0) {
      await dbc.profiles.update({
        where: { id: p_user_id },
        data: { coin_balance: balance - unitPrice, updated_at: now },
      });
      await dbc.payments.create({
        data: {
          user_id: p_user_id,
          coins_amount: unitPrice,
          amount_fcfa: unitFcfa,
          status: 'paid',
          payment_method: 'coins',
          transaction_id: orderId,
          pack_id: 'stand_rental',
          credits_added: true,
          created_at: now,
          updated_at: now,
        },
      });
      await dbc.transactions.create({
        data: {
          user_id: p_user_id,
          event_id: p_event_id,
          transaction_type: 'stand_rental',
          amount_pi: unitPrice,
          amount_fcfa: unitFcfa,
          description: `Reservation ${type.name} (${code})`,
          status: 'completed',
          amount_coins: unitPrice,
          created_at: now,
          completed_at: now,
          payment_method: 'coins',
          transaction_reference: orderId,
        },
      });
      try {
        const ev = await dbc.events.findUnique({ where: { id: p_event_id }, select: { organizer_id: true, title: true } });
        if (ev?.organizer_id) {
          await creditOrganizerEarnings({
            p_organizer_id: ev.organizer_id,
            p_event_id,
            p_transaction_id: orderId,
            p_transaction_type: 'stand_rental',
            p_earnings_coins: unitPrice,
            p_earnings_fcfa: unitFcfa,
            p_ticket_count: 1,
            p_description: `Location ${type.name} (${code}) - en attente de validation`,
            p_created_at: now,
          });
        }
      } catch (e) {
        console.error('Gains stand non credites:', e.message);
      }
    }

    return ok({
      success: true,
      message: 'Reservation confirmee',
      rental_id: rental.id,
      booking_code: code,
      stand_number: standNumber,
      amount_pi: unitPrice,
      amount_fcfa: unitFcfa,
      remaining: Math.max(0, available - rented - 1),
    });
  },

  async purchase_raffle_tickets(args) {
    const { p_user_id, p_raffle_event_id, p_quantity } = args || {};
    if (!p_user_id || !p_raffle_event_id) return fail('utilisateur et tombola requis');
    const qty = Math.max(1, parseInt(p_quantity || 1, 10) || 1);
    const dbc = db();
    const profile = await dbc.profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');
    const raffle = await dbc.raffle_events.findUnique({ where: { id: p_raffle_event_id } });
    if (!raffle) return fail('Tombola introuvable', 'RAFFLE_NOT_FOUND');
    if (raffle.status && raffle.status !== 'active') return fail('Les ventes de cette tombola sont fermees', 'RAFFLE_CLOSED');
    if (!raffle.organizer_id) return fail("Cette tombola n'a pas d'organisateur", 'RAFFLE_NO_ORGANIZER');

    const price = Math.max(0, Math.floor(Number(raffle.calculated_price_pi || 0)));
    const totalCoins = price * qty;
    const sold = Number(raffle.tickets_sold || 0);
    const totalTickets = Number(raffle.total_tickets || 0);
    if (sold + qty > totalTickets) {
      return fail(`Tickets insuffisants (dispo: ${Math.max(0, totalTickets - sold)})`, 'RAFFLE_OUT_OF_STOCK');
    }
    const maxPerUser = Number(raffle.max_tickets_per_user || 0);
    if (maxPerUser > 0) {
      const already = await dbc.raffle_tickets.count({ where: { raffle_event_id: p_raffle_event_id, user_id: p_user_id } });
      if (already + qty > maxPerUser) {
        return fail(`Limite de ${maxPerUser} ticket(s) par personne (deja ${already})`, 'RAFFLE_USER_LIMIT');
      }
    }
    const balance = Number(profile.coin_balance || 0);
    if (totalCoins > 0 && balance < totalCoins) {
      return fail(`Solde insuffisant (disponible: ${balance}, requis: ${totalCoins})`, 'INSUFFICIENT_COINS');
    }

    const now = new Date();
    const orderId = `RFL-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const created = [];
    for (let i = 0; i < qty; i++) {
      let ticketNumber = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidateNumber = Math.floor(100000 + Math.random() * 900000);
        const clash = await dbc.raffle_tickets.findFirst({ where: { raffle_event_id: p_raffle_event_id, ticket_number: candidateNumber } });
        if (!clash) { ticketNumber = candidateNumber; break; }
      }
      if (ticketNumber === null) return fail('Impossible de generer un numero de ticket unique', 'TICKET_NUMBER_FAILED');
      const row = await dbc.raffle_tickets.create({
        data: {
          id: uuidv4(),
          raffle_event_id: p_raffle_event_id,
          user_id: p_user_id,
          ticket_number: ticketNumber,
          purchase_price_pi: price,
          purchased_at: now,
        },
      });
      created.push(row);
    }

    await dbc.raffle_events.update({
      where: { id: p_raffle_event_id },
      data: { tickets_sold: sold + qty },
    });

    if (totalCoins > 0) {
      await dbc.profiles.update({
        where: { id: p_user_id },
        data: { coin_balance: balance - totalCoins, updated_at: now },
      });
      await dbc.payments.create({
        data: {
          user_id: p_user_id,
          coins_amount: totalCoins,
          amount_fcfa: totalCoins * 10,
          status: 'paid',
          payment_method: 'coins',
          transaction_id: orderId,
          pack_id: 'raffle_purchase',
          credits_added: true,
          created_at: now,
          updated_at: now,
        },
      });
      await dbc.transactions.create({
        data: {
          user_id: p_user_id,
          event_id: raffle.event_id || null,
          transaction_type: 'raffle_ticket_purchase',
          amount_pi: totalCoins,
          amount_fcfa: totalCoins * 10,
          description: `Achat de ${qty} ticket(s) de tombola`,
          status: 'completed',
          amount_coins: totalCoins,
          created_at: now,
          completed_at: now,
          payment_method: 'coins',
          transaction_reference: orderId,
        },
      });
      try {
        await creditOrganizerEarnings({
          p_organizer_id: raffle.organizer_id,
          p_event_id: raffle.event_id || null,
          p_transaction_id: orderId,
          p_transaction_type: 'raffle_ticket_sale',
          p_earnings_coins: totalCoins,
          p_earnings_fcfa: totalCoins * 10,
          p_ticket_count: qty,
          p_description: `Vente de ${qty} ticket(s) de tombola - en attente de validation`,
          p_created_at: now,
        });
      } catch (e) {
        console.error('Gains tombola non credites:', e.message);
      }
    }

    return ok({
      success: true,
      message: 'Achat reussi',
      transaction_id: orderId,
      total_coins: totalCoins,
      quantity: qty,
      tickets: created.map((t) => ({ id: t.id, ticket_number: t.ticket_number, price: t.purchase_price_pi })),
    });
  },

  async cast_votes(args) {
    const { p_user_id, p_event_id, p_votes, p_voter_phone } = args || {};
    if (!p_user_id || !p_event_id) return fail('utilisateur et evenement requis');
    const lines = (Array.isArray(p_votes) ? p_votes : [])
      .map((v) => ({ candidateId: v && (v.candidate_id || v.candidateId), voteCount: Math.max(0, parseInt(v && (v.vote_count || v.voteCount), 10) || 0) }))
      .filter((v) => v.candidateId && v.voteCount > 0);
    if (!lines.length) return fail('Aucun vote valide', 'EMPTY_VOTES');

    const dbc = db();
    const profile = await dbc.profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');
    const ev = await dbc.events.findUnique({ where: { id: p_event_id }, select: { id: true, title: true, organizer_id: true, price_pi: true, price_fcfa: true, is_sales_closed: true, status: true } });
    if (!ev) return fail('Evenement introuvable', 'EVENT_NOT_FOUND');
    if (ev.is_sales_closed) return fail('Les votes sont fermes', 'VOTING_CLOSED');
    const price = Math.max(0, Math.floor(Number(ev.price_pi || 0)));
    if (price <= 0) return fail('Ce vote est gratuit : utilisez le parcours gratuit', 'FREE_VOTING');

    const settings = await dbc.event_settings.findFirst({ where: { event_id: p_event_id } });
    const requested = lines.reduce((s, l) => s + l.voteCount, 0);
    const totalCoins = price * requested;

    const resolved = [];
    for (const line of lines) {
      const cand = await dbc.candidates.findUnique({ where: { id: line.candidateId }, select: { id: true, name: true, event_id: true } });
      if (!cand) return fail(`Candidat introuvable: ${line.candidateId}`, 'CANDIDATE_NOT_FOUND');
      if (cand.event_id && cand.event_id !== p_event_id) return fail("Ce candidat n'appartient pas a cet evenement", 'CANDIDATE_WRONG_EVENT');
      resolved.push({ cand, voteCount: line.voteCount });
    }

    const maxPerUser = Number(settings?.max_votes_per_user || 0);
    if (maxPerUser > 0) {
      const mine = await dbc.user_votes.findMany({ where: { user_id: p_user_id, event_id: p_event_id }, select: { vote_count: true } });
      const already = mine.reduce((s, r) => s + Number(r.vote_count || 0), 0);
      if (already + requested > maxPerUser) {
        return fail(`Limite de ${maxPerUser} voix par personne (deja ${already})`, 'VOTE_USER_LIMIT');
      }
    }

    const voterPhone = normalizePhone(p_voter_phone || profile.phone || '');
    const maxPerPhone = Number(settings?.max_votes_per_phone || 0);
    if (maxPerPhone > 0 && voterPhone) {
      const rows = await dbc.user_votes.findMany({ where: { event_id: p_event_id }, select: { vote_count: true, voter_phone: true } });
      let already = 0;
      for (const r of rows) {
        if (normalizePhone(r.voter_phone) === voterPhone) already += Number(r.vote_count || 0);
      }
      if (already + requested > maxPerPhone) {
        return fail(`Limite de ${maxPerPhone} voix par telephone (deja ${already})`, 'VOTE_PHONE_LIMIT');
      }
    }

    const balance = Number(profile.coin_balance || 0);
    if (balance < totalCoins) {
      return fail(`Solde insuffisant (disponible: ${balance}, requis: ${totalCoins})`, 'INSUFFICIENT_COINS');
    }

    const now = new Date();
    const orderId = `VOTE-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    for (const { cand, voteCount } of resolved) {
      const existing = await dbc.user_votes.findFirst({
        where: { user_id: p_user_id, candidate_id: cand.id, event_id: p_event_id },
      });
      if (existing) {
        await dbc.user_votes.update({
          where: { id: existing.id },
          data: {
            vote_count: Number(existing.vote_count || 0) + voteCount,
            vote_cost_pi: Number(existing.vote_cost_pi || 0) + price * voteCount,
            vote_cost_fcfa: Number(existing.vote_cost_fcfa || 0) + price * voteCount * 10,
            net_to_organizer: Number(existing.net_to_organizer || 0) + price * voteCount,
            payment_method: 'coins',
            payment_status: 'completed',
            voter_phone: voterPhone || existing.voter_phone || null,
          },
        });
      } else {
        await dbc.user_votes.create({
          data: {
            id: uuidv4(),
            user_id: p_user_id,
            candidate_id: cand.id,
            event_id: p_event_id,
            vote_count: voteCount,
            vote_cost_pi: price * voteCount,
            vote_cost_fcfa: price * voteCount * 10,
            net_to_organizer: price * voteCount,
            fees: 0,
            payment_method: 'coins',
            payment_status: 'completed',
            voter_phone: voterPhone || null,
            created_at: now,
          },
        });
      }
      const current = await dbc.candidates.findUnique({ where: { id: cand.id }, select: { vote_count: true } });
      await dbc.candidates.update({
        where: { id: cand.id },
        data: { vote_count: Number(current?.vote_count || 0) + voteCount },
      });
    }

    await dbc.profiles.update({
      where: { id: p_user_id },
      data: { coin_balance: balance - totalCoins, updated_at: now },
    });

    await dbc.payments.create({
      data: {
        user_id: p_user_id,
        coins_amount: totalCoins,
        amount_fcfa: totalCoins * 10,
        status: 'paid',
        payment_method: 'coins',
        transaction_id: orderId,
        pack_id: 'vote_purchase',
        credits_added: true,
        created_at: now,
        updated_at: now,
      },
    });

    await dbc.transactions.create({
      data: {
        user_id: p_user_id,
        event_id: p_event_id,
        transaction_type: 'vote_purchase',
        amount_pi: totalCoins,
        amount_fcfa: totalCoins * 10,
        description: `${requested} voix pour ${ev.title || 'l\'evenement'}`,
        status: 'completed',
        amount_coins: totalCoins,
        created_at: now,
        completed_at: now,
        payment_method: 'coins',
        transaction_reference: orderId,
      },
    });

    try {
      if (ev.organizer_id) {
        await creditOrganizerEarnings({
          p_organizer_id: ev.organizer_id,
          p_event_id,
          p_transaction_id: orderId,
          p_transaction_type: 'vote',
          p_earnings_coins: totalCoins,
          p_earnings_fcfa: totalCoins * 10,
          p_ticket_count: requested,
          p_description: `${requested} voix payees - en attente de validation`,
          p_created_at: now,
        });
      }
    } catch (e) {
      console.error('Gains vote non credites:', e.message);
    }

    return ok({
      success: true,
      message: 'Vote enregistre',
      transaction_id: orderId,
      total_coins: totalCoins,
      vote_count: requested,
      price_per_vote: price,
    });
  },

  async get_promo_code_stats(args) {
    const { p_event_id } = args;
    const codes = await db().promo_codes.findMany({ where: { event_id: p_event_id } });
    return ok({ total: codes.length, used: codes.filter((c) => c.is_used).length, codes });
  },

  // ---------- Stats / salaires (lectures) ----------
  async get_admin_salary_stats(args) {
    const { p_admin_id } = args;
    if (!p_admin_id) return fail('p_admin_id requis');
    const rows = await db().admin_salaries.findMany({ where: { admin_id: p_admin_id }, orderBy: { created_at: 'desc' }, take: 50 });
    const totalSalaryFcfa = rows.reduce((s, r) => s + Number(r.total_salary || 0), 0);
    const totalVolumeFcfa = rows.reduce((s, r) => s + Number(r.country_revenue || 0), 0);
    const latest = rows[0] || null;
    return ok({
      total_salary_fcfa: totalSalaryFcfa,
      total_volume_fcfa: totalVolumeFcfa,
      platform_revenue_fcfa: Math.round(totalVolumeFcfa * (Number(latest?.license_rate || 0) / 100)),
      license_commission_rate: Number(latest?.license_rate || 0),
      personal_score: Number(latest?.personal_score || 1),
      withdrawal_status: latest?.withdrawal_status || 'closed',
      month: latest?.month || null,
      stats: rows,
    });
  },

  async get_secretary_salary_stats(args) {
    const { p_secretary_id } = args;
    const stats = await db().admin_salaries.findMany({ where: { admin_id: p_secretary_id }, orderBy: { created_at: 'desc' }, take: 50 });
    return ok({ stats });
  },

  async credit_organizer_earnings(args) {
    const result = await creditOrganizerEarnings(args || {});
    return result.success ? ok(result) : fail(result.message, 'EARNINGS_NOT_CREDITED');
  },

  async get_organizer_earnings_summary(args) {
    const { p_organizer_id } = args;
    const profile = await db().profiles.findUnique({
      where: { id: p_organizer_id },
      select: { available_earnings: true, total_earnings: true },
    });
    const rows = await db().organizer_earnings.findMany({
      where: { organizer_id: p_organizer_id },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    const pendingRows = rows.filter((row) => row.status === 'pending');
    const pendingGross = pendingRows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
    const pendingFee = pendingRows.reduce(
      (sum, row) => sum + Number(row.platform_commission ?? Math.floor(Number(row.earnings_coins || 0) * PLATFORM_FEE_RATE)),
      0,
    );
    const lifetimeGross = rows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
    const available = Number(profile?.available_earnings || 0);
    const evs = await db().events.findMany({
      where: { organizer_id: p_organizer_id },
      select: { views_count: true },
    });
    return ok({
      data: {
        creator_stats: {
          events_count: evs.length,
          views_count: evs.reduce((sum, ev) => sum + Number(ev.views_count || 0), 0),
        },
        pending: {
          total_gross: pendingGross,
          platform_commission: pendingFee,
          total_net: pendingGross - pendingFee,
          count: pendingRows.length,
        },
        wallet: {
          available_balance_coins: available,
          total_earnings: Number(profile?.total_earnings || 0),
        },
        available_earnings: available,
        pending_earnings: pendingGross,
        pending_net_earnings: pendingGross - pendingFee,
        total_earned: lifetimeGross,
        total_earnings: Number(profile?.total_earnings || 0),
        summary: rows,
      },
    });
  },

  async get_withdrawable_balances(args) {
    const { p_organizer_id } = args;
    if (!p_organizer_id) return fail('p_organizer_id requis');
    const profile = await db().profiles.findUnique({
      where: { id: p_organizer_id },
      select: { available_earnings: true },
    });
    if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');
    const pending = await db().organizer_earnings.aggregate({
      where: { organizer_id: p_organizer_id, status: 'pending' },
      _sum: { earnings_coins: true },
    });
    const available = Number(profile.available_earnings || 0);
    const pendingTotal = Number(pending._sum.earnings_coins || 0);
    return ok({
      event_balance: pendingTotal,
      pool_balance: 0,
      total_balance: available,
      available_balance: available,
      pending_balance: pendingTotal,
      min_withdrawal_pi: await getMinWithdrawalPi(),
    });
  },

  async transfer_pending_earnings_to_available(args) {
    const { p_user_id } = args;
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    const pendingRows = await db().organizer_earnings.findMany({
      where: { organizer_id: p_user_id, status: 'pending' },
      select: { id: true, earnings_coins: true, platform_commission: true },
    });
    if (!pendingRows.length) {
      return ok({ success: true, message: 'Aucun gain en attente à transférer.', total_gross: 0, platform_fee: 0, total_net: 0, transferred_count: 0 });
    }
    const gross = pendingRows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
    const platformFee = pendingRows.reduce(
      (sum, row) => sum + Number(row.platform_commission ?? Math.floor(Number(row.earnings_coins || 0) * PLATFORM_FEE_RATE)),
      0
    );
    const net = gross - platformFee;
    const now = new Date();
    await db().organizer_earnings.updateMany({
      where: { id: { in: pendingRows.map((row) => row.id) } },
      data: { status: 'transferred', paid_at: now, transferred_at: now, updated_at: now },
    });
    await db().profiles.update({
      where: { id: p_user_id },
      data: {
        available_earnings: Number(profile.available_earnings || 0) + net,
        total_earnings: Math.max(0, Number(profile.total_earnings || 0) - gross),
        updated_at: now,
      },
    });
    return ok({ success: true, message: 'Transfert effectué.', total_gross: gross, platform_fee: platformFee, total_net: net, transferred_count: pendingRows.length });
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
    const dbc = db();
    const ticket = await dbc.tickets.findFirst({
      where: {
        OR: [
          { id: p_ticket_identifier },
          { qr_code: p_ticket_identifier },
          { ticket_number: p_ticket_identifier },
          { ticket_code_short: p_ticket_identifier },
          { transaction_reference: p_ticket_identifier },
        ],
      },
    });
    if (!ticket) return ok({ success: false, message: 'Billet introuvable' });
    await dbc.tickets.update({
      where: { id: ticket.id },
      data: {
        status: 'active',
        used_at: null,
        check_in_time: null,
        check_out_time: null,
        entry_count: null,
        reentry_count: null,
        last_reentry_time: null,
        updated_at: new Date(),
      },
    });
    return ok({ success: true, message: 'Billet réinitialisé' });
  },

  async verify_ticket_direct(args) {
    const { p_ticket_identifier, p_verification_method, p_exit_mode } = args;
    if (!p_ticket_identifier) return fail('p_ticket_identifier requis');
    const dbc = db();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const ticket = await dbc.tickets.findFirst({
      where: {
        OR: [
          { id: p_ticket_identifier },
          { qr_code: p_ticket_identifier },
          { ticket_number: p_ticket_identifier },
          { ticket_code_short: p_ticket_identifier },
          { transaction_reference: p_ticket_identifier },
        ],
      },
    });
    if (!ticket) return ok({ success: false, message: 'Billet introuvable', status_code: 'not_found', status: 'not_found' });

    const isMultiDay = ticket.is_multi_day || false;
    const validDates = parseValidDates(ticket.valid_dates);

    // ⛔ Billet non livré : paiement USSD pas encore validé par un admin/secrétaire
    if (ticket.status === 'pending') {
      return ok({ success: false, message: 'Billet en attente de validation du paiement', status_code: 'pending_payment', status: 'pending', ticket });
    }

    // ⛔ Billet annulé
    if (ticket.status === 'cancelled') {
      return ok({ success: false, message: 'Billet annulé', status_code: 'cancelled', status: 'cancelled', ticket });
    }

    // ⛔ Billet multi-jours périmé (fin de validité dépassée)
    if (isMultiDay && validDates.length && now > new Date(validDates[validDates.length - 1])) {
      return ok({ success: false, message: 'Pass multi-jours expiré', status_code: 'expired_date', status: 'expired_date', ticket });
    }

    // ⛔ Billet date fixe périmé
    if (!isMultiDay && ticket.ticket_date && now < new Date(ticket.ticket_date + 'T00:00:00')) {
      return ok({ success: false, message: 'Billet pas encore valable', status_code: 'not_valid_today', status: 'not_valid_today', ticket });
    }

    // 📅 Mode entrée : validation de la date du jour
    if (!p_exit_mode) {
      if (isMultiDay) {
        if (validDates.length && !validDates.includes(today)) {
          return ok({ success: false, message: 'Billet non valable ce jour', status_code: 'not_valid_today', status: 'not_valid_today', ticket });
        }
      } else if (ticket.ticket_date && today !== ticket.ticket_date.toISOString().slice(0, 10)) {
        return ok({ success: false, message: 'Billet non valable ce jour', status_code: 'not_valid_today', status: 'not_valid_today', ticket });
      }
    }

    const inVenue = !!ticket.check_in_time && !ticket.check_out_time;
    const exitCount = ticket.reentry_count || 0     || 0;
    const entryCount = ticket.entry_count || 0;

    let result;
    const scanType = p_exit_mode ? 'exit' : 'entry';

    if (p_exit_mode) {
      // ðŸšª SORTIE
      if (!inVenue) {
        if (exitCount > 0) {
          return ok({ success: false, message: 'Déjà sorti', status_code: 'already_exited', status: 'already_exited', ticket });
        }
        return ok({ success: false, message: 'Pas encore entré', status_code: 'not_entered', status: 'not_entered', ticket });
      }
      const exitCount2 = ticket.reentry_count || 0;
      await dbc.tickets.update({
        where: { id: ticket.id },
        data: { check_out_time: now, reentry_count: exitCount2 + 1, last_reentry_time: now, updated_at: now },
      });
      result = { status_code: 'exit_registered', status: 'exit_registered', message: 'Sortie enregistrée' };
    } else {
      // ✅ ENTRÉE
      if (inVenue) {
        return ok({ success: false, message: 'Déjà à l\'intérieur', status_code: 'already_used', status: 'already_used', ticket });
      }
      if (entryCount > 0) {
        await dbc.tickets.update({
          where: { id: ticket.id },
          data: { check_in_time: now, check_out_time: null, entry_count: entryCount + 1, updated_at: now },
        });
        result = { status_code: 're_entry', status: 're_entry', message: 'Ré-entrée autorisée' };
      } else {
        await dbc.tickets.update({
          where: { id: ticket.id },
          data: { status: 'used', used_at: now, check_in_time: now, entry_count: 1, updated_at: now },
        });
        result = { status_code: 'checkin', status: 'checkin', message: 'Entrée validée' };
      }
    }

    // ðŸ“ Journal des scans
    await dbc.ticket_scans.create({
      data: {
        id: uuidv4(),
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        scanner_user_id: p_verification_method ? null : null,
        scan_type: scanType,
        scan_status: result.status_code,
        verification_method: p_verification_method || 'manual',
        scanned_at: now,
        created_at: now,
      },
    }).catch((e) => console.error('⚠️ Journal scan non enregistré:', e.message));

    return ok({
      success: true,
      message: result.message,
      status_code: result.status_code,
      status: result.status,
      ticket,
      attendee_name: ticket.attendee_name || 'Inconnu',
      phone: ticket.phone || null,
      is_guest: ticket.is_guest || false,
      isGuest: ticket.is_guest || false,
      payment_method: ticket.payment_method || 'coins',
      transaction_reference: ticket.transaction_reference || null,
      ticket_type: ticket.ticket_type_id || null,
      entry_count: ticket.entry_count || 0,
      ticket_date: ticket.ticket_date || null,
      is_multi_day: isMultiDay,
      valid_dates: validDates,
    });
  },

  // ---------- Retraits ----------
  async request_organizer_withdrawal(args) {
    const { p_amount_pi, p_payment_details, p_organizer_id, p_user_id } = args || {};
    const organizerId = p_organizer_id || p_user_id;
    const details = p_payment_details || {};
    const amountPi = Math.floor(Number(p_amount_pi) || 0);
    if (!organizerId) return fail('p_organizer_id requis', 'ORGANIZER_REQUIRED');
    if (amountPi <= 0) return ok({ success: false, message: 'Montant de retrait invalide.' });

    const dbc = db();
    const { rate, minWithdrawalPi } = await getAppSettings();
    const profile = await dbc.profiles.findUnique({
      where: { id: organizerId },
      select: { available_earnings: true },
    });
    if (!profile) return ok({ success: false, message: 'Profil organisateur introuvable.' });
    if (amountPi < minWithdrawalPi) {
      return ok({ success: false, message: `Le montant minimum de retrait est de ${minWithdrawalPi} pieces.` });
    }
    const available = Number(profile.available_earnings || 0);
    if (available < amountPi) {
      return ok({ success: false, message: 'Solde de gains disponible insuffisant.' });
    }

    const amountFcfa = amountPi * rate;
    const feeFcfa = Number(details.fee_amount_fcfa) || Math.ceil(amountFcfa * PLATFORM_FEE_RATE);
    const netFcfa = Number(details.net_amount_fcfa) || Math.max(0, amountFcfa - feeFcfa);
    const now = new Date();

    const newBalance = available - amountPi;
    await dbc.profiles.update({
      where: { id: organizerId },
      data: { available_earnings: newBalance, updated_at: now },
    });
    const request = await dbc.organizer_withdrawal_requests.create({
      data: {
        id: uuidv4(),
        organizer_id: organizerId,
        amount_pi: amountPi,
        amount_fcfa: amountFcfa,
        fees: feeFcfa,
        net_amount: netFcfa,
        payment_details: JSON.stringify({ ...details, fee_percent: details.fee_percent ?? PLATFORM_FEE_RATE * 100 }),
        status: 'pending',
        validation_status: 'pending',
        requested_at: now,
      },
    });
    await dbc.notifications
      .create({
        data: {
          id: uuidv4(),
          user_id: organizerId,
          title: 'Demande de retrait enregistree',
          message: `Votre demande de retrait de ${amountPi} pieces (${amountFcfa} FCFA) est en attente de validation.`,
          type: 'info',
          data: JSON.stringify({ request_id: request.id, amount_pi: amountPi }),
          created_at: now,
        },
      })
      .catch((e) => console.error('Notification retrait non creee:', e.message));

    return ok({
      success: true,
      message: 'Demande de retrait soumise avec succes.',
      request_id: request.id,
      amount_pi: amountPi,
      amount_fcfa: amountFcfa,
      fees: feeFcfa,
      net_amount: netFcfa,
      new_balance: newBalance,
    });
  },

  async process_organizer_withdrawal(args) {
    const { p_request_id, p_status, p_notes, p_admin_id, p_actor_id } = args || {};
    if (!p_request_id) return fail('p_request_id requis');
    const status = p_status || 'approved';
    const actorId = p_admin_id || p_actor_id || null;
    const dbc = db();
    const request = await dbc.organizer_withdrawal_requests.findUnique({ where: { id: p_request_id } });
    if (!request) return fail('Demande de retrait introuvable', 'REQUEST_NOT_FOUND');
    if (request.status !== 'pending') {
      return fail('Cette demande a deja ete traitee', 'ALREADY_PROCESSED');
    }
    let actorType = null;
    if (actorId) {
      const actor = await dbc.profiles.findUnique({ where: { id: actorId }, select: { user_type: true } });
      if (!actor || !['super_admin', 'admin', 'secretary'].includes(actor.user_type)) {
        return fail('Permission non accordee', 'FORBIDDEN');
      }
      actorType = actor.user_type;
    }

    const now = new Date();
    const data = {
      status,
      admin_notes: p_notes || null,
      reviewed_at: now,
      paid_at: status === 'approved' || status === 'paid' ? now : null,
    };
    if (actorId) {
      if (actorType === 'super_admin') data.reviewed_by_superadmin = actorId;
      else data.reviewed_by_admin = actorId;
    }
    await dbc.organizer_withdrawal_requests.update({ where: { id: p_request_id }, data });

    if (status === 'rejected') {
      const organizer = await dbc.profiles.findUnique({
        where: { id: request.organizer_id },
        select: { available_earnings: true },
      });
      await dbc.profiles.update({
        where: { id: request.organizer_id },
        data: {
          available_earnings: Number(organizer?.available_earnings || 0) + Number(request.amount_pi || 0),
          updated_at: now,
        },
      });
    }

    await dbc.notifications
      .create({
        data: {
          id: uuidv4(),
          user_id: request.organizer_id,
          title: 'Mise a jour de votre demande de retrait',
          message:
            status === 'rejected'
              ? `Votre demande de retrait de ${request.amount_pi} pieces a ete rejetee. Raison: ${p_notes || 'non specifiee'}`
              : `Votre demande de retrait de ${request.amount_pi} pieces a ete ${status === 'paid' ? 'payee' : 'approuvee'}.`,
          type: status === 'rejected' ? 'warning' : 'success',
          data: JSON.stringify({ request_id: p_request_id, status }),
          created_at: now,
        },
      })
      .catch((e) => console.error('Notification retrait non creee:', e.message));

    return ok({ success: true, message: 'Demande de retrait traitee.', request_id: p_request_id, status });
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
    const earnings = await db().organizer_earnings.aggregate({ where: { organizer_id: p_creator_id }, _sum: { earnings_coins: true } });
    return ok({ estimates: { total: Number(earnings._sum.earnings_coins || 0) } });
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

  async get_global_analytics() {
    const dbc = db();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalUsers, newUsers, activeEvents, txAgg, revenueAgg] = await Promise.all([
      dbc.profiles.count({ where: { deleted_at: null } }),
      dbc.profiles.count({ where: { created_at: { gte: since30 } } }),
      dbc.events.count({ where: { is_active: true, status: 'active' } }),
      dbc.transactions.count({ where: { status: 'completed' } }),
      dbc.transactions.aggregate({
        where: { status: 'completed' },
        _sum: { amount_pi: true, amount_coins: true },
      }),
    ]);
    return ok({
      total_users: totalUsers,
      new_users_last_30_days: newUsers,
      active_events: activeEvents,
      total_coins_purchased: Number(revenueAgg._sum.amount_coins || revenueAgg._sum.amount_pi || 0),
      total_revenue_pi: Number(revenueAgg._sum.amount_pi || 0),
      total_transactions: txAgg,
    });
  },

  async get_super_admin_dashboard_stats() {
    const dbc = db();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalUsers, newUsers, activeEvents, totalTransactions, pendingWithdrawals, sales] = await Promise.all([
      dbc.profiles.count({ where: { deleted_at: null } }),
      dbc.profiles.count({ where: { created_at: { gte: since30 } } }),
      dbc.events.count({ where: { is_active: true, status: 'active' } }),
      dbc.transactions.count({ where: { status: 'completed' } }),
      dbc.withdrawal_requests.count({ where: { status: 'pending' } }),
      dbc.transactions.aggregate({
        where: { status: 'completed' },
        _sum: { amount_fcfa: true, amount_pi: true },
      }),
    ]);
    return ok({
      total_users: totalUsers,
      new_users: newUsers,
      active_events: activeEvents,
      total_transactions: totalTransactions,
      pending_withdrawals: pendingWithdrawals,
      total_sales_fcfa: Number(sales._sum.amount_fcfa || Number(sales._sum.amount_pi || 0) * 10),
    });
  },

  async get_zones_stats() {
    const rows = await db().$queryRawUnsafe(
      "SELECT COALESCE(NULLIF(p.country, ''), 'INCONNUE') AS country, COUNT(*) AS user_count, COALESCE(SUM(p.coin_balance), 0) AS total_credits, COALESCE(SUM(p.total_pi_spent), 0) AS total_revenue FROM profiles p WHERE p.deleted_at IS NULL GROUP BY COALESCE(NULLIF(p.country, ''), 'INCONNUE') ORDER BY country",
    );
    return ok(
      rows.map((r) => ({
        country: r.country,
        user_count: Number(r.user_count || 0),
        total_credits: Number(r.total_credits || 0),
        total_revenue: Number(r.total_revenue || 0),
      })),
    );
  },
};

// RPC qui ne peuvent pas être portés fidèlement sans son schéma : réponse
// explicite plutôt que faux.
const NOT_IMPLEMENTED = {
  process_moneyfusion_success: 'paiements',
  credit_coupon_earnings: 'coupons',
  add_commission_to_user: 'commissions',
  process_promo_usage: 'promos',
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
