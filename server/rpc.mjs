// Registre RPC local : émule les fonctions SQL Supabase en Prisma/MySQL.
// POST /api/rpc : body = { name, args }  ->  { data, error }
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDb } from './db.mjs';
import { requireActorUnless, ADMIN_ROLES } from './session.mjs';
import { checkPolicy } from './rpcPolicy.mjs';
import { afterRpc } from './pushScheduler.mjs';

const r = Router();

const db = () => getDb();
const ok = (data) => ({ data: data ?? {}, error: null });
const fail = (message, code = 'RPC_ERROR', details = null) => ({ data: null, error: { message, code, details, hint: null } });

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

// Droits de LECTURE des statistiques d'un événement : la métadonnée d'un
// événement appartient à son organisateur, aux agents mis à sa disposition
// (organizer_scan_agents actifs) et à l'administration. Tout le reste est
// refusé. Utilisé par get_verification_stats et get_promo_code_stats.
async function canReadEventStats(actor, eventId) {
  if (!actor || !eventId) return false;
  if (actor.source === 'internal') return true;
  if (ADMIN_ROLES.includes(actor.user_type)) return true;
  const ev = await db().events.findUnique({ where: { id: eventId }, select: { organizer_id: true } });
  if (!ev?.organizer_id) return false;
  if (ev.organizer_id === actor.id) return true;
  const delegation = await db().organizer_scan_agents.findFirst({
    where: { organizer_id: ev.organizer_id, user_id: actor.id, is_active: true },
    select: { id: true },
  });
  return !!delegation;
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

// Taux de frais de plateforme par défaut (5%). Le taux réel est lu dans
// app_settings.platform_fee_percentage (onglet Config) : avant, ce réglage
// n'était lu par aucun calcul et le taux restait figé à 5% quoi qu'il arrive.
const DEFAULT_PLATFORM_FEE_RATE = 0.05;
const DEFAULT_WITHDRAWAL_FEE_RATE = 0.05;

async function getAppSettings() {
  try {
    // Plusieurs lignes app_settings peuvent coexister (paramétrage historique).
    // findFirst() sans tri renvoyait un taux aléatoire (0 %, 5 %, 10 %) : on
    // prend toujours la ligne la plus récemment mise à jour.
    const settingsRows = await db().app_settings.findMany({
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
      take: 1,
    });
    const row = settingsRows[0] || null;
    const feePercent = Number(row?.platform_fee_percentage);
    const withdrawalPercent = Number(row?.withdrawal_fee_percentage);
    const partnerPercent = Number(row?.business_partner_commission_percentage);
    const platformFeeRate = Number.isFinite(feePercent) && feePercent > 0 ? feePercent / 100 : DEFAULT_PLATFORM_FEE_RATE;
    const withdrawalFeeRate = Number.isFinite(withdrawalPercent) && withdrawalPercent > 0 ? withdrawalPercent / 100 : DEFAULT_WITHDRAWAL_FEE_RATE;
    const businessPartnerCommissionRate = Number.isFinite(partnerPercent) && partnerPercent >= 0 ? partnerPercent / 100 : 0;
    return {
      rate: Number(row?.coin_to_fcfa_rate) || 10,
      minWithdrawalPi: Number(row?.min_withdrawal_pi) || 50,
      platformFeeRate,
      withdrawalFeeRate,
      businessPartnerCommissionRate,
      platformFeePercentage: Number.isFinite(feePercent) && feePercent > 0 ? feePercent : DEFAULT_PLATFORM_FEE_RATE * 100,
      withdrawalFeePercentage: Number.isFinite(withdrawalPercent) && withdrawalPercent > 0 ? withdrawalPercent : DEFAULT_WITHDRAWAL_FEE_RATE * 100,
      businessPartnerCommissionPercentage: Number.isFinite(partnerPercent) && partnerPercent >= 0 ? partnerPercent : 0,
    };
  } catch (e) {
    return {
      rate: 10,
      minWithdrawalPi: 50,
      platformFeeRate: DEFAULT_PLATFORM_FEE_RATE,
      withdrawalFeeRate: DEFAULT_WITHDRAWAL_FEE_RATE,
      businessPartnerCommissionRate: 0,
      platformFeePercentage: 5,
      withdrawalFeePercentage: 5,
      businessPartnerCommissionPercentage: 0,
    };
  }
}

async function getPlatformFeeRate() {
  return (await getAppSettings()).platformFeeRate;
}

async function getMinWithdrawalPi() {
  return (await getAppSettings()).minWithdrawalPi;
}

// ---------------------------------------------------------------------------
// Revenus d'une zone (CA plateforme) et salaire de l'admin
// ---------------------------------------------------------------------------
// Un gain organisateur devient du revenu plateforme (la commission retenue)
// dès qu'il quitte l'état "pending" : transfert vers le portefeuille, paiement…
// Les anciens flux écrivaient 'paid', les nouveaux 'transferred' ; n'en compter
// qu'un seul laissait le CA de la zone — et donc le salaire — à zéro.
const ACQUIRED_EARNING_STATUSES = ['transferred', 'paid', 'available', 'completed'];
const EXCLUDED_EARNING_STATUSES = ['pending', 'cancelled', 'rejected', 'refunded'];

function normalizeZoneValue(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function zoneCountryGroup(value) {
  const key = normalizeZoneValue(value).replace(/\s+/g, '');
  if (key === 'cameroun' || key === 'cameroon') return 'cameroun';
  if (key === 'cotedivoire' || key === 'ivorycoast') return 'cotedivoire';
  if (key === 'rdc' || key === 'congordc' || key === 'drcongo' || key === 'democraticrepublicofcongo') return 'rdc';
  return key;
}

function isSameCountry(a, b) {
  const ka = zoneCountryGroup(a);
  const kb = zoneCountryGroup(b);
  return !!ka && !!kb && ka === kb;
}

function isSameCity(a, b) {
  const ka = normalizeZoneValue(a).replace(/\s+/g, '');
  const kb = normalizeZoneValue(b).replace(/\s+/g, '');
  return !!ka && !!kb && ka === kb;
}

function zoneCountryCandidates(country) {
  const group = zoneCountryGroup(country);
  if (!group) return [];
  const variants = {
    cameroun: ['Cameroun', 'Cameroon'],
    cotedivoire: ["Côte d'Ivoire", "Cote d'Ivoire", "Côte d’Ivoire", "Cote d’Ivoire", 'Ivory Coast'],
    rdc: ['RDC', 'RD Congo', 'République démocratique du Congo', 'Democratic Republic of the Congo'],
  };
  return [...new Set([country, ...(variants[group] || [])].filter(Boolean))];
}

function toValidDate(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

// Zone de compétence : coverage_zone du partenaire en priorité, sinon profil.
async function resolveAdminZone(admin) {
  let country = admin?.country || null;
  let cities = [];
  let source = 'profile';
  let partner = null;
  try {
    partner = await db().partners.findFirst({
      where: { user_id: admin.id },
      orderBy: { created_at: 'desc' },
      select: { coverage_zone: true, license_id: true, status: true },
    });
    if (partner?.coverage_zone) {
      const parsed = typeof partner.coverage_zone === 'string'
        ? JSON.parse(partner.coverage_zone)
        : partner.coverage_zone;
      if (parsed?.country) {
        country = parsed.country;
        source = 'partner';
      }
      if (Array.isArray(parsed?.cities)) {
        cities = parsed.cities.map((city) => String(city || '').trim()).filter(Boolean);
      } else if (parsed?.city) {
        cities = [String(parsed.city).trim()].filter(Boolean);
      }
    }
  } catch (_) {}
  return { country, cities, source, partner };
}

// Taux de licence de l'admin : admin_salaries, puis licence partenaire, puis
// licence achetée. Aucun taux n'est inventé : s'il est absent, on le signale.
async function resolveAdminLicense(adminId, latestSalary) {
  const fromSalary = Number(latestSalary?.license_rate || 0);
  if (fromSalary > 0) {
    return { rate: fromSalary, name: latestSalary?.license_name || null, source: 'admin_salaries' };
  }
  const dbc = db();
  try {
    const partner = await dbc.partners.findFirst({
      where: { user_id: adminId },
      orderBy: { created_at: 'desc' },
      select: { license_id: true },
    });
    if (partner?.license_id) {
      const license = await dbc.partner_licenses.findUnique({
        where: { id: partner.license_id },
        select: { commission_rate: true, name: true },
      }).catch(() => null);
      const rate = Number(license?.commission_rate || 0);
      if (rate > 0) return { rate, name: license?.name || null, source: 'partner_license' };
    }
  } catch (_) {}
  try {
    const owned = await dbc.user_partner_licenses.findFirst({
      where: { user_id: adminId, status: { in: ['active', 'paid', 'completed'] } },
      orderBy: { purchase_date: 'desc' },
      select: { license_pack_id: true, revenue_share_percent: true, expiry_date: true },
    });
    if (owned) {
      const expired = owned.expiry_date && new Date(owned.expiry_date).getTime() < Date.now();
      if (!expired) {
        let rate = Number(owned.revenue_share_percent || 0);
        let name = null;
        if (rate <= 0 && owned.license_pack_id != null) {
          const packs = await dbc.$queryRawUnsafe(
            'SELECT name, revenue_share_percent FROM partner_license_packs WHERE id = ? LIMIT 1',
            owned.license_pack_id,
          ).catch(() => []);
          const pack = Array.isArray(packs) ? packs[0] : null;
          rate = Number(pack?.revenue_share_percent || 0);
          name = pack?.name || null;
        }
        if (rate > 0) return { rate, name, source: 'user_license' };
      }
    }
  } catch (_) {}
  return { rate: 0, name: null, source: 'none' };
}

function earningFeeRate(row, fallbackRate) {
  const percent = Number(row?.fee_percent || 0);
  return Number.isFinite(percent) && percent > 0 ? percent / 100 : fallbackRate;
}

// Frais (en pièces) d'une ligne de gain. `platform_commission` fait foi quand
// il est renseigné ; `??` ne suffisait pas car la colonne vaut 0 (et non NULL)
// sur de nombreuses lignes, ce qui annulait le CA après transfert.
function resolveEarningFeeCoins(row, fallbackRate) {
  const commission = Number(row?.platform_commission || 0);
  const fee = Number(row?.platform_fee || 0);
  const gross = Number(row?.earnings_coins || 0);
  if (commission > 0) return commission;
  // Lignes héritées : platform_fee y est stocké en pièces.
  if (fee > 0) return Math.round(fee * 100) / 100;
  return Math.floor(gross * earningFeeRate(row, fallbackRate));
}

// Anciens lots 'paid' : le frais du lot est répété à l'identique sur chaque
// ligne. On le compte une seule fois (max) et on ajoute les commissions
// unitaires éventuelles. Sinon un lot de 34 lignes valait 34 fois le frais.
function resolvePaidBatchFeeCoins(rows, fallbackRate, coinRate) {
  const sumCommission = rows.reduce((sum, row) => sum + Number(row.platform_commission || 0), 0);
  const sumGross = rows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
  const maxFee = rows.reduce((max, row) => Math.max(max, Number(row.platform_fee || 0)), 0);
  const expectedCoins = sumGross * earningFeeRate(rows[0], fallbackRate);

  let feeCoins = maxFee;
  if (maxFee > 0 && coinRate > 0) {
    // Certaines lignes stockent le frais du lot en FCFA : on le ramène en pièces
    // quand cette lecture colle mieux au taux de frais attendu.
    const asFcfaCoins = maxFee / coinRate;
    if (Math.abs(asFcfaCoins - expectedCoins) < Math.abs(maxFee - expectedCoins)) {
      feeCoins = asFcfaCoins;
    }
  }
  let coins = Math.max(sumCommission, feeCoins);
  if (coins <= 0) coins = expectedCoins;
  return Math.round(coins * 100) / 100;
}

// CA plateforme d'une zone : commissions acquises (transferts inclus).
// Le CA est TOUJOURS la commission plateforme, jamais les 90 % dus aux
// organisateurs (cf. contrat de partenariat).
async function computeAdminZoneRevenue(admin) {
  const dbc = db();
  const settings = await getAppSettings();
  const coinRate = Number(settings.rate) || 10;
  const platformFeeRate = Number(settings.platformFeeRate) || 0.05;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const zone = await resolveAdminZone(admin);
  const result = {
    month,
    country: zone.country || null,
    cities: zone.cities,
    zone_source: zone.source,
    organizers_count: 0,
    coin_to_fcfa_rate: coinRate,
    platform_fee_rate: platformFeeRate,
    recognized_statuses: ACQUIRED_EARNING_STATUSES,
    excluded_statuses: EXCLUDED_EARNING_STATUSES,
    monthly_commission_coins: 0,
    monthly_revenue_fcfa: 0,
    monthly_gross_coins: 0,
    monthly_gross_fcfa: 0,
    total_commission_coins: 0,
    total_revenue_fcfa: 0,
    total_gross_coins: 0,
    total_gross_fcfa: 0,
    monthly_by_status: {},
    entries: { monthly: 0, total: 0 },
  };
  if (!zone.country) return result;

  const candidates = zoneCountryCandidates(zone.country);
  const profiles = await dbc.profiles.findMany({
    where: candidates.length ? { country: { in: candidates } } : { country: zone.country },
    select: { id: true, country: true, city: true },
  }).catch(() => []);
  const zoneProfiles = profiles.filter((profile) => (
    isSameCountry(profile.country, zone.country)
    && (!zone.cities.length || zone.cities.some((city) => isSameCity(city, profile.city)))
  ));
  result.organizers_count = zoneProfiles.length;
  const zoneProfileIds = zoneProfiles.map((profile) => profile.id).filter(Boolean);
  if (!zoneProfileIds.length) return result;

  const earnings = await dbc.organizer_earnings.findMany({
    where: { organizer_id: { in: zoneProfileIds }, status: { in: ACQUIRED_EARNING_STATUSES } },
    select: {
      id: true, organizer_id: true, status: true,
      earnings_coins: true, platform_commission: true, platform_fee: true,
      fee_percent: true, transaction_type: true, earning_type: true,
      transferred_at: true, paid_at: true, created_at: true, updated_at: true,
    },
  }).catch(() => []);

  const relevant = earnings.filter((row) => {
    const type = String(row.transaction_type || row.earning_type || '').toLowerCase();
    return type !== 'promo_commission';
  });

  const paidBatches = new Map();
  const singleRows = [];
  for (const row of relevant) {
    if (row.status === 'paid') {
      const date = toValidDate(row.paid_at, row.created_at, row.updated_at);
      const key = `${row.organizer_id}|${date ? date.getTime() : 'no-date'}`;
      if (!paidBatches.has(key)) paidBatches.set(key, []);
      paidBatches.get(key).push(row);
    } else {
      singleRows.push(row);
    }
  }

  const addRevenue = ({ status, date, feeCoins, grossCoins }) => {
    const revenueFcfa = feeCoins * coinRate;
    const grossFcfa = grossCoins * coinRate;
    result.total_commission_coins += feeCoins;
    result.total_revenue_fcfa += revenueFcfa;
    result.total_gross_coins += grossCoins;
    result.total_gross_fcfa += grossFcfa;
    result.entries.total += 1;
    if (date && date >= monthStart && date <= monthEnd) {
      result.monthly_commission_coins += feeCoins;
      result.monthly_revenue_fcfa += revenueFcfa;
      result.monthly_gross_coins += grossCoins;
      result.monthly_gross_fcfa += grossFcfa;
      result.entries.monthly += 1;
      const bucket = result.monthly_by_status[status] || { entries: 0, commission_coins: 0, revenue_fcfa: 0 };
      bucket.entries += 1;
      bucket.commission_coins += feeCoins;
      bucket.revenue_fcfa += revenueFcfa;
      result.monthly_by_status[status] = bucket;
    }
  };

  for (const row of singleRows) {
    addRevenue({
      status: row.status,
      date: toValidDate(row.transferred_at, row.paid_at, row.created_at, row.updated_at),
      feeCoins: resolveEarningFeeCoins(row, platformFeeRate),
      grossCoins: Number(row.earnings_coins || 0),
    });
  }
  for (const rows of paidBatches.values()) {
    addRevenue({
      status: 'paid',
      date: toValidDate(rows[0]?.paid_at, rows[0]?.created_at, rows[0]?.updated_at),
      feeCoins: resolvePaidBatchFeeCoins(rows, platformFeeRate, coinRate),
      grossCoins: rows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0),
    });
  }

  const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
  result.monthly_commission_coins = round2(result.monthly_commission_coins);
  result.total_commission_coins = round2(result.total_commission_coins);
  result.monthly_revenue_fcfa = Math.round(result.monthly_revenue_fcfa);
  result.total_revenue_fcfa = Math.round(result.total_revenue_fcfa);
  result.monthly_gross_fcfa = Math.round(result.monthly_gross_fcfa);
  result.total_gross_fcfa = Math.round(result.total_gross_fcfa);
  for (const bucket of Object.values(result.monthly_by_status)) {
    bucket.commission_coins = round2(bucket.commission_coins);
    bucket.revenue_fcfa = Math.round(bucket.revenue_fcfa);
  }
  return result;
}

// Créditer la commission partenaire d'affaires sur les frais retenus (en pièces).
// Idempotent via (partner_id, source_type, source_id). Partenaire = profiles.referred_by de l'organisateur.
async function creditBusinessPartnerFeeCommission({ dbc, organizerId, sourceType, sourceId, grossFeeCoins, metadata }) {
  try {
    const client = dbc || db();
    const feeCoins = Math.max(0, Math.round(Number(grossFeeCoins || 0)));
    if (!organizerId || !sourceType || !sourceId || feeCoins <= 0) return { credited: false, reason: 'invalid' };

    const org = await client.profiles.findUnique({ where: { id: organizerId }, select: { referred_by: true } });
    const partnerId = org?.referred_by;
    if (!partnerId || partnerId === organizerId) return { credited: false, reason: 'no_partner' };

    const settings = await getAppSettings();
    const rate = Number(settings.businessPartnerCommissionRate || 0);
    if (!(rate > 0)) return { credited: false, reason: 'disabled' };

    const commissionCoins = Math.max(0, Math.round(feeCoins * rate));
    if (commissionCoins <= 0) return { credited: false, reason: 'zero' };

    // Idempotence applicative + contrainte unique en base (si migration appliquée)
    const existing = await client.business_partner_commissions.findFirst({
      where: { partner_id: partnerId, source_type: sourceType, source_id: String(sourceId) },
      select: { id: true },
    }).catch(() => null);
    if (existing) return { credited: false, reason: 'duplicate', partnerId, commissionCoins };

    const now = new Date();
    await client.$transaction(async (tx) => {
      await tx.business_partner_commissions.create({
        data: {
          id: uuidv4(),
          partner_id: partnerId,
          organizer_id: organizerId,
          source_type: sourceType,
          source_id: String(sourceId),
          gross_fee_coins: feeCoins,
          commission_percent: Number(settings.businessPartnerCommissionPercentage || 0),
          commission_coins: commissionCoins,
          status: 'credited',
          metadata: metadata ? JSON.stringify(metadata) : null,
          created_at: now,
        },
      });
      await tx.profiles.update({
        where: { id: partnerId },
        data: {
          available_earnings: { increment: commissionCoins },
          updated_at: now,
        },
      });
    });

    await client.notifications.create({
      data: {
        id: uuidv4(),
        user_id: partnerId,
        title: 'Commission partenaire d’affaires',
        message: `Vous avez reçu ${commissionCoins} pièces (partenaire d’affaires) sur les frais retenus.`,
        type: 'success',
        data: JSON.stringify({ source_type: sourceType, source_id: String(sourceId), organizer_id: organizerId, commission_coins: commissionCoins }),
        created_at: now,
      },
    }).catch(() => {});

    return { credited: true, partnerId, commissionCoins };
  } catch (e) {
    console.warn('[business_partner] commission non créditée:', e?.message || e);
    return { credited: false, reason: 'error', error: e?.message };
  }
}

async function creditOrganizerEarnings(params = {}) {
  const {
    p_organizer_id, p_event_id = null, p_transaction_id = null,
    p_transaction_type = 'ticket_sale', p_earnings_coins = 0,
    p_earnings_fcfa = null, p_ticket_count = null, p_description = null,
    p_created_at = null,
    // Client Prisma a utiliser : passez le client de transaction pour que le
    // gain soit ecrit dans la MEME transaction que le debit (votes atomiques).
    p_dbc = null,
    // La commission influenceur est un gain net verse par la plateforme :
    // elle ne doit pas subir une seconde fois les 5% de frais de plateforme.
    p_apply_platform_fee = true,
    p_event_type = 'ticketing',
    p_earning_type = null,
  } = params;
  if (!p_organizer_id) return { success: false, message: 'Organisateur introuvable.' };
  const coins = Math.max(0, Math.floor(Number(p_earnings_coins) || 0));
  if (!coins) return { success: false, message: 'Gain nul : rien a crediter.' };
  const dbc = p_dbc || db();
  const now = p_created_at ? new Date(p_created_at) : new Date();
  const settings = await getAppSettings();
  const platformFeeRate = Number(settings.platformFeeRate) || DEFAULT_PLATFORM_FEE_RATE;
  // Le taux de conversion pièce → FCFA vient des réglages (jamais un * 10 figé).
  const coinRate = Number(settings.rate) || 10;
  // event_id est obligatoire en base : sans identifiant fourni, on rattache le
  // gain au dernier événement de l'organisateur plutôt que de lever une erreur
  // Prisma 500 (l'ancien code plantait avec "event_id must not be null").
  let eventId = p_event_id || null;
  if (!eventId) {
    const fallbackEvent = await dbc.events.findFirst({
      where: { organizer_id: p_organizer_id },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    }).catch(() => null);
    eventId = fallbackEvent?.id || null;
  }
  if (!eventId) {
    return { success: false, message: "Aucun événement associé : impossible de créditer le gain." };
  }
  const platformCommission = p_apply_platform_fee ? Math.floor(coins * platformFeeRate) : 0;
  const row = await dbc.organizer_earnings.create({
    data: {
      id: uuidv4(),
      organizer_id: p_organizer_id,
      event_id: eventId,
      transaction_id: p_transaction_id || uuidv4(),
      transaction_type: p_transaction_type,
      earnings_coins: coins,
      earnings_fcfa: Number(p_earnings_fcfa ?? coins * coinRate),
      status: 'pending',
      platform_commission: platformCommission,
      platform_fee: platformCommission * coinRate,
      net_amount: (coins - platformCommission) * coinRate,
      fee_percent: p_apply_platform_fee ? platformFeeRate * 100 : 0,
      ticket_count: p_ticket_count || null,
      earning_type: p_earning_type || p_transaction_type,
      event_type: p_event_type,
      description: p_description,
      created_at: now,
      updated_at: now,
    },
  });
  // Incrément atomique : deux ventes simultanées ne s'écrasent pas.
  let pendingTotal = coins;
  try {
    const updated = await dbc.profiles.update({
      where: { id: p_organizer_id },
      data: { total_earnings: { increment: coins }, updated_at: now },
      select: { total_earnings: true },
    });
    pendingTotal = Number(updated?.total_earnings ?? coins);
  } catch (e) {
    console.error('�s�️ total_earnings non incrémenté:', e.message);
  }
  return { success: true, earning_id: row.id, pending_coins: pendingTotal, platform_commission: platformCommission };
}

// Commission du code promo versée à l'influenceur (en pièces ET en FCFA).
// Idempotent sur (transaction_id, transaction_type) : un rejeu ne double pas la commission.
async function creditPromoCommissionOnce({ transactionRef, influencerId, eventId, baseCoins, rate, code }) {
  const rateNum = Number(rate) || 0;
  const base = Math.max(0, Math.floor(Number(baseCoins) || 0));
  if (!influencerId || rateNum <= 0 || !base) return { credited: false, reason: 'nothing_to_credit' };
  const coins = Math.floor((base * rateNum) / 100);
  if (coins <= 0) return { credited: false, reason: 'zero_commission' };

  const dbc = db();
  const existing = await dbc.organizer_earnings.findFirst({
    where: { transaction_id: transactionRef, transaction_type: 'promo_commission' },
    select: { id: true },
  });
  if (existing) return { credited: false, reason: 'already_credited', earning_id: existing.id };

  const res = await creditOrganizerEarnings({
    p_organizer_id: influencerId,
    p_event_id: eventId || null,
    p_transaction_id: transactionRef,
    p_transaction_type: 'promo_commission',
    p_earnings_coins: coins,
    p_earnings_fcfa: coins * 10,
    p_ticket_count: null,
    p_description: `Commission code promo ${code} (${rateNum}%)`,
    p_apply_platform_fee: false,
    p_event_type: 'ticketing',
    p_earning_type: 'promo_commission',
  });
  if (!res.success) return { credited: false, reason: res.message };
  return { credited: true, coins, fcfa: coins * 10, rate: rateNum, earning_id: res.earning_id };
}

// Journalise un usage de code promo dans promo_code_usages : c'est la source
// de vérité des statistiques lues par « Mes gains premium » (commissions) et
// par get_promo_code_stats. Idempotent par (promo_code_id, transaction_id) :
// un rejeu du même achat ne duplique pas la ligne.
async function recordPromoUsageOnce({ promoCodeId, userId, discountCoins, commissionCoins, purchaseCoins, transactionRef }) {
  if (!promoCodeId || !userId) return { recorded: false, reason: 'missing_args' };
  const dbc = db();
  if (transactionRef) {
    const existing = await dbc.promo_code_usages.findFirst({
      where: { promo_code_id: promoCodeId, transaction_id: String(transactionRef) },
      select: { id: true },
    });
    if (existing) return { recorded: false, reason: 'already_recorded', usage_id: existing.id };
  }
  const usage = await dbc.promo_code_usages.create({
    data: {
      id: uuidv4(),
      promo_code_id: promoCodeId,
      user_id: userId,
      discount_amount: Math.max(0, Math.floor(Number(discountCoins) || 0)),
      commission_amount: Math.max(0, Math.floor(Number(commissionCoins) || 0)),
      purchase_amount: Math.max(0, Math.floor(Number(purchaseCoins) || 0)),
      transaction_id: transactionRef ? String(transactionRef) : null,
      used_at: new Date(),
    },
  });
  return { recorded: true, usage_id: usage.id };
}

// Ajustement atomique du stock vendu, utilisé par le parcours "pièces"
// (purchase_tickets_v2) et par la validation USSD (ussd-payment.cjs) afin
// qu'il n'existe qu'un seul compteur par type de billet.
//
// Tout se joue dans UNE transaction : le verrou de ligne sur l'événement
// sérialise les ajustements concurrents, chaque type est mis à jour par un
// seul UPDATE conditionnel (contrôle de capacité inclus) et le compteur
// événement est ajusté dans le même lot. Si une ligne échoue, rien n'est
// appliqué (plus de compteurs à moitié mis à jour).
//
// `p_evidence_row_id` rend l'appel idempotent : la ligne de preuve USSD porte
// un marqueur `metadata.ussd.stock_applied` écrit par un UPDATE conditionnel.
// Un rejeu de la validationUSSD retrouve le marqueur et n'incrémente pas
// une seconde fois le stock.
async function adjustTicketStock({ p_event_id, p_lines, p_delta, p_evidence_row_id }) {
  const dbc = db();
  const delta = Math.trunc(Number(p_delta) || 0);
  if (!p_event_id || !delta || (delta !== 1 && delta !== -1)) {
    return { success: false, message: 'Ajustement de stock invalide (delta doit valoir +1 ou -1).' };
  }

  const rawLines = Array.isArray(p_lines) ? p_lines : [];
  const perType = {};
  for (const l of rawLines) {
    const typeId = l && (l.type_id || l.ticket_type_id || l.id);
    const qty = Math.trunc(Number(l && (l.qty ?? l.quantity ?? l.count)) || 0);
    if (!typeId || qty <= 0) continue;
    perType[typeId] = (perType[typeId] || 0) + qty;
  }
  const typeIds = Object.keys(perType);
  if (!typeIds.length) return { success: false, message: 'Aucune ligne de stock à ajuster.' };
  const totalQty = typeIds.reduce((s, id) => s + perType[id], 0);

  try {
    return await dbc.$transaction(async (tx) => {
      // 1. Idempotence : on réclame le marqueur AVANT tout compteur. Si la
      //    colonne existe déjà, l'ajustement a déjà été fait (rejeu).
      if (p_evidence_row_id) {
        const claimed = await tx.$executeRawUnsafe(
          `UPDATE transactions
              SET metadata = JSON_SET(
                    COALESCE(metadata, '{}'),
                    '$.ussd.stock_applied', 'yes',
                    '$.ussd.stock_applied_at', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')
                  )
            WHERE id = ?
              AND JSON_EXTRACT(COALESCE(metadata, '{}'), '$.ussd.stock_applied') IS NULL`,
          p_evidence_row_id,
        );
        if (!claimed) {
          return { success: true, already_applied: true, delta: 0, total: 0, ticket_types: [] };
        }
      }

      // 2. Verrou de l'événement : sérialise les ajustements concurrents.
      await tx.$queryRawUnsafe(
        `SELECT id FROM ticketing_events WHERE event_id = ? FOR UPDATE`,
        p_event_id,
      );

      // 3. Un UPDATE conditionnel par type : le contrôle de capacité est
      //    évalué par MySQL au moment de l'écriture (plus de sur-vente).
      for (const [typeId, qty] of Object.entries(perType)) {
        const guard =
          delta > 0
            ? 'AND GREATEST(COALESCE(quantity_sold,0), COALESCE(tickets_sold,0)) + ? <= COALESCE(quantity_available,0)'
            : 'AND GREATEST(COALESCE(quantity_sold,0), COALESCE(tickets_sold,0)) >= ? AND COALESCE(quantity_sold,0) >= ?';
        const params =
          delta > 0
            ? [delta * qty, delta * qty, typeId, p_event_id, qty]
            : [delta * qty, delta * qty, typeId, p_event_id, qty, qty];
        const applied = await tx.$executeRawUnsafe(
          `UPDATE ticket_types
              SET quantity_sold = COALESCE(quantity_sold,0) + ?,
                  tickets_sold  = COALESCE(tickets_sold,0)  + ?,
                  updated_at    = NOW()
            WHERE id = ?
              AND (event_id = ? OR event_id IS NULL)
              ${guard}`,
          ...params,
        );
        if (!applied) {
          const tt = await tx.ticket_types.findUnique({
            where: { id: typeId },
            select: { name: true, quantity_available: true, quantity_sold: true, tickets_sold: true },
          });
          if (!tt) throw stockError(`Type de billet introuvable: ${typeId}`, 'TICKET_TYPE_NOT_FOUND');
          const sold = Math.max(Number(tt.quantity_sold || 0), Number(tt.tickets_sold || 0));
          const avail = Number(tt.quantity_available || 0);
          throw stockError(
            delta > 0
              ? `Stock insuffisant pour « ${tt.name || typeId} » (dispo: ${Math.max(0, avail - sold)})`
              : `Stock vendu insuffisant pour « ${tt.name || typeId} »`,
            delta > 0 ? 'TICKET_TYPE_OUT_OF_STOCK' : 'TICKET_TYPE_CONFLICT',
          );
        }
      }

      // 4. Compteur événement (ticketing_events n'a pas de colonne updated_at).
      await tx.$executeRawUnsafe(
        `UPDATE ticketing_events
            SET tickets_sold = GREATEST(COALESCE(tickets_sold, 0) + ?, 0)
          WHERE event_id = ?`,
        delta * totalQty,
        p_event_id,
      );

      // 5. Valeurs finales, lues dans la transaction.
      const rows = await tx.$queryRawUnsafe(
        `SELECT id, name, quantity_available, quantity_sold, tickets_sold
           FROM ticket_types
          WHERE id IN (${typeIds.map(() => '?').join(',')})`,
        ...typeIds,
      );

      return {
        success: true,
        already_applied: false,
        delta,
        total: delta * totalQty,
        event_id: p_event_id,
        ticket_types: rows.map((r) => ({
          type_id: r.id,
          name: r.name,
          quantity_available: Number(r.quantity_available || 0),
          quantity_sold: Number(r.quantity_sold || 0),
          tickets_sold: Number(r.tickets_sold || 0),
        })),
      };
    });
  } catch (e) {
    if (e && e.__stock) return { success: false, code: e.code, message: e.message };
    console.error('�O Ajustement de stock échoué:', e?.message);
    return { success: false, code: 'STOCK_UPDATE_FAILED', message: e?.message?.split('\n')[0] || 'Ajustement de stock impossible' };
  }
}

// Erreur métier d'ajustement de stock : porte un code pour être traduite en
// réponse RPC lisible, et déclenche le rollback de la transaction.
function stockError(message, code) {
  const err = new Error(message);
  err.__stock = true;
  err.code = code;
  return err;
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

  // Correction manuelle du total de voix d'un candidat.
  //
  // Remplace l'ancien `increment_vote_count`, qui pouvait etre appelle seul pour
  // fabriquer des voix gratuites (aucun debit, aucune trace). Reserve au
  // super_admin : une competition payante ne doit pas pouvoir etre reorientee
  // par l'administrateur de zone ni par le secretaire.
  //
  // Ce que ce RPC touche : l'agregat `candidates.vote_count` uniquement. Il ne
  // touche NI `user_votes` (l'historique des votants reste exact), NI `payments`,
  // NI `transactions`, NI le solde de personne : c'est une correction de
  // CLASSEMENT, pas un remboursement. Pour rembourser des pièces c'est
  // `reverse_credit`, sur un log de credit existant. Chaque correction est
  // journalisee dans admin_logs (READ_ADMIN_ONLY), jamais cote public.
  async correct_candidate_votes(args, actor) {
    const { p_candidate_id, p_delta, p_reason } = args;
    const candidateId = p_candidate_id;
    if (!candidateId) return fail('p_candidate_id requis', 'BAD_REQUEST');

    const delta = Number(p_delta);
    if (!Number.isInteger(delta) || delta === 0) {
      return fail('p_delta doit etre un entier different de zero', 'BAD_REQUEST');
    }

    const dbc = db();
    const candidate = await dbc.candidates.findUnique({ where: { id: candidateId } });
    if (!candidate) return fail('Candidat introuvable', 'NOT_FOUND');

    const current = Number(candidate.vote_count) || 0;
    const target = current + delta;
    if (target < 0) {
      return fail(
        `Correction impossible : ${candidate.name} n'a que ${current} voix`,
        'NEGATIVE_COUNT',
      );
    }

    // Compare-and-swap : deux corrections simultanees ne peuvent pas s'additionner
    // sur une lecture perimee du total.
    const applied = await dbc.candidates.updateMany({
      where: { id: candidateId, vote_count: candidate.vote_count },
      data: { vote_count: target },
    });
    if (applied.count !== 1) {
      return fail('Total de voix modifie entre-temps, reessayez', 'CONCURRENT_WRITE');
    }

    const reason = String(p_reason || '').trim();
    await dbc.admin_logs.create({
      data: {
        actor_id: actor?.id || '',
        action_type: 'candidate_votes_corrected',
        target_id: candidateId,
        target_name: candidate.name,
        details: JSON.stringify({
          event_id: candidate.event_id,
          delta,
          before: current,
          after: target,
          reason: reason || null,
        }),
      },
    });

    return ok({
      success: true,
      candidate_id: candidateId,
      delta,
      before: current,
      new_count: target,
    });
  },

  // Conserve pour compat : meme comportement, borne au super_admin.
  async increment_vote_count(args, actor) {
    return this.correct_candidate_votes(
      {
        p_candidate_id: args.candidate_id_to_inc,
        p_delta: Number(args.inc_amount) || 1,
        p_reason: args.reason || 'Compat increment_vote_count',
      },
      actor,
    );
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
    const dbc = db();
    const ev = await dbc.events.findUnique({ where: { id: p_event_id }, select: { id: true, views_count: true } });
    if (!ev) return ok({ success: false, event_missing: true, new_views_count: 0 });
    const now = new Date();
    await dbc.event_views.create({
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
    const newViews = (ev.views_count || 0) + 1;
    await dbc.events.update({ where: { id: p_event_id }, data: { views_count: newViews } });
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
    if (!creditor) return fail('Identifiant du créditeur requis', 'CREDITOR_REQUIRED');
    if (creditor.user_type !== 'super_admin' && creditor.user_type !== 'secretary') {
      return fail('Permission non accordée.', 'FORBIDDEN');
    }
    const target_profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!target_profile) return fail('Utilisateur non trouve.', 'USER_NOT_FOUND');
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
    if (!debitor) return fail('Identifiant du débiteur requis', 'DEBITOR_REQUIRED');
    if (debitor.user_type !== 'super_admin' && !(debitor.user_type === 'secretary' && debitor.appointed_by_super_admin)) {
      return fail('Permission non accordée.', 'FORBIDDEN');
    }
    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Utilisateur non trouve.', 'USER_NOT_FOUND');
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
      data: { user_id: p_user_id, title: '�s�️ Un débit a été effectué sur votre compte', message: `Votre compte a été débité de ${amount} pièces. Raison: ${p_reason || 'Débit administratif.'}`, type: 'system', data: JSON.stringify({ amount, reason: p_reason }), sound_enabled: true, sound_effect: 'alert', is_read: false, is_global: false },
    });
    return ok({ success: true, message: 'Le compte a été débité avec succès.', coin_balance: (profile.coin_balance || 0) - paidUsed, free_coin_balance: (profile.free_coin_balance || 0) - freeUsed });
  },

  // Dépense de pièces par l'utilisateur lui-même, pour une action de l'interface
  // (boost, promotion, vote payant). C'est le SEUL chemin de dépense autorisé
  // côté application : `debit_user_coins` reste un débit administratif.
  //
  // Avant, le navigateur appelait `debit_user_coins`, qui refusait un
  // utilisateur normal en renvoyant { success: false } SANS erreur. Les
  // appelants ne testaient que le champ `error` : le débit n'était jamais
  // appliqué et l'action boost/promotion/vote partait quand même, gratuitement.
  // C'est aussi ce qui a laissé `CoinService` se rabattre sur une écriture
  // manuelle de profiles.coin_balance depuis le navigateur.
  async spend_user_coins(args) {
    const { p_user_id, p_amount, p_reason, p_reference_type, p_reference_id } = args;
    if (!p_user_id) return fail('p_user_id requis');
    const amount = Number(p_amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail('Montant invalide', 'INVALID_AMOUNT');
    // La dépense ne peut jamais être négative : sans ce garde-fou, un montant
    // négatif rechargerait le portefeuille au lieu de le débiter.
    if (!p_reason) return fail('Motif requis', 'REASON_REQUIRED');

    const profile = await db().profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Utilisateur introuvable', 'USER_NOT_FOUND');
    if (profile.is_active === false) return fail('Compte inactif', 'ACCOUNT_INACTIVE');

    const freeUsed = Math.min(profile.free_coin_balance || 0, amount);
    const paidUsed = amount - freeUsed;
    const coinBalance = (profile.coin_balance || 0) - paidUsed;
    const freeBalance = (profile.free_coin_balance || 0) - freeUsed;
    if (coinBalance < 0 || freeBalance < 0) return fail('Solde insuffisant', 'INSUFFICIENT_FUNDS');

    // Comparaison-échange : la condition sur les soldes lus fait échouer
    // l'écriture si un autre débit a eu lieu entre-temps, ce qui empêche de
    // dépenser deux fois la même pièce lors de deux requêtes simultanées.
    const applied = await db().profiles.updateMany({
      where: {
        id: p_user_id,
        coin_balance: profile.coin_balance || 0,
        free_coin_balance: profile.free_coin_balance || 0,
      },
      data: { coin_balance: coinBalance, free_coin_balance: freeBalance },
    });
    if (applied.count !== 1) return fail('Solde modifié en cours de traitement', 'CONCURRENT_UPDATE');

    const rateRow = await db().app_settings.findFirst();
    const rate = Number(rateRow?.coin_to_fcfa_rate) || 10;
    await db().transactions.create({
      data: {
        user_id: p_user_id,
        transaction_type: p_reference_type ? `spend_${String(p_reference_type).slice(0, 24)}` : 'spend',
        amount_pi: -amount,
        amount_fcfa: -amount * rate,
        description: p_reason,
        transaction_reference: p_reference_id || null,
        metadata: JSON.stringify({ free_used: freeUsed, paid_used: paidUsed }),
        status: 'completed',
        city: profile.city,
        region: profile.region,
        country: profile.country,
      },
    });

    return ok({
      success: true,
      spent: amount,
      free_used: freeUsed,
      paid_used: paidUsed,
      coin_balance: coinBalance,
      free_coin_balance: freeBalance,
    });
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

  // ---------- �?vénements ----------
  async delete_event_completely(args, actor) {
    const { p_event_id } = args;
    if (!p_event_id) return fail('p_event_id requis');
    const dbc = db();
    // L'organisateur peut supprimer son propre événement (« Mes événements »),
    // l'administration peut supprimer n'importe lequel. Sans session, refus.
    if (!actor || actor.source === 'internal') return fail('Authentification requise', 'FORBIDDEN');
    if (actor.source === 'user' && !ADMIN_ROLES.includes(actor.user_type)) {
      const ev = await dbc.events.findUnique({ where: { id: p_event_id }, select: { organizer_id: true } });
      if (!ev) return fail('�?vénement introuvable', 'NOT_FOUND');
      if (ev.organizer_id !== actor.id) return fail("Vous n'êtes pas l'organisateur de cet événement", 'FORBIDDEN');
    }
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
  async get_todays_mandatory_video(args, actor) {
    // Identité du jeton, jamais du paramètre : impossible de regarder « le
    // visionnage d'aujourd'hui » d'un autre compte.
    const uid = actor?.id || args.user_uuid;
    if (!uid) return fail('Utilisateur requis', 'USER_REQUIRED');
    const video = await db().mandatory_videos.findFirst({ where: { is_active: true }, orderBy: { created_at: 'asc' } });
    // user_video_watches ne porte que rewarded_at (pas de date « visionnage ») :
    // la déduplication se fait par (utilisateur, vidéo).
    const watched = video
      ? await db().user_video_watches.findFirst({ where: { user_id: uid, video_id: video.id } })
      : null;
    return ok({ video: video || null, already_watched: !!watched, watched_today: !!watched });
  },

  // Crédit vidéo : la récompense est LUE sur le serveur (mandatory_videos.
  // reward_coins), jamais acceptée du client. Une seule récompense par
  // (utilisateur, vidéo) : un double clic ne crédite pas deux fois, et un
  // utilisateur ne peut pas inventer un montant.
  async credit_user_for_video(args, actor) {
    const uid = actor?.id || args.p_user_id;
    const { p_video_id } = args;
    if (!uid || !p_video_id) return fail('p_user_id et p_video_id requis', 'PARAMS_MISSING');
    const dbc = db();
    const video = await dbc.mandatory_videos.findUnique({
      where: { id: p_video_id },
      select: { id: true, is_active: true, reward_coins: true },
    });
    if (!video || video.is_active === false) return fail('Vidéo introuvable ou désactivée', 'VIDEO_NOT_ACTIVE');
    const reward = Math.max(0, Math.floor(Number(video.reward_coins || 0)));
    if (reward <= 0) return fail('Cette vidéo ne récompense pas de pièces', 'NO_REWARD');
    const profile = await dbc.profiles.findUnique({ where: { id: uid } });
    if (!profile) return fail('Profil introuvable', 'NOT_FOUND');
    const dup = await dbc.user_video_watches.findFirst({ where: { user_id: uid, video_id: p_video_id } });
    const newBalance = (profile.coin_balance || 0) + reward;
    if (dup) return ok({ success: true, already_credited: true, reward_coins: reward, coin_balance: newBalance });
    await dbc.user_video_watches.create({
      data: { id: uuidv4(), user_id: uid, video_id: p_video_id, rewarded_at: new Date() },
    });
    await dbc.profiles.update({ where: { id: uid }, data: { coin_balance: newBalance } });
    return ok({ success: true, reward_coins: reward, coin_balance: newBalance });
  },

  async complete_mandatory_video(args, actor) {
    const uid = actor?.id || args.user_uuid;
    const { video_uuid } = args;
    if (!uid || !video_uuid) return fail('user_uuid et video_uuid requis', 'PARAMS_MISSING');
    const dbc = db();
    const existing = await dbc.user_video_watches.findFirst({ where: { user_id: uid, video_id: video_uuid } });
    const profile = await dbc.profiles.findUnique({ where: { id: uid } });
    if (existing) return ok({ success: true, already_completed: true });
    const video = await dbc.mandatory_videos.findUnique({ where: { id: video_uuid }, select: { reward_coins: true } });
    const reward = Number(video?.reward_coins || 0);
    await dbc.user_video_watches.create({
      data: { id: uuidv4(), user_id: uid, video_id: video_uuid, rewarded_at: new Date() },
    });
    if (profile && reward > 0) {
      const balance = (profile.coin_balance || 0) + reward;
      const completed = (profile.mandatory_videos_completed || 0) + 1;
      await dbc.profiles.update({ where: { id: uid }, data: { coin_balance: balance, mandatory_videos_completed: completed, last_video_watched_at: new Date() } });
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
      const sold = Math.max(Number(tt.quantity_sold || 0), Number(tt.tickets_sold || 0));
      const avail = Number(tt.quantity_available || 0);
      if (sold + qty > avail) return fail(`Stock insuffisant pour « ${tt.name} » (dispo: ${Math.max(0, avail - sold)})`, 'TICKET_TYPE_OUT_OF_STOCK');
      const coins = tt.price_coins || tt.price_pi || Math.round(Number(tt.price || 0) / 10);
      baseTotalFcfa += coins * qty;
      items.push({ tt, qty, coins });
    }
    if (!items.length) return fail('Aucun billet valide dans le panier', 'EMPTY_CART');

    // 2. Réduction promo (si code promo valide fourni)
    //    La remise est supportée par le gain organisateur : l'organisateur est
    //    crédité du montant R�?ELLEMENT encaissé (base - remise), et la remise
    //    est explicitée dans sa description pour qu'il voie pourquoi.
    let promoReduction = 0;      // en pièces
    let promoMeta = null;
    if (p_promo_code_id) {
      const promo = await dbc.promo_codes.findUnique({ where: { id: p_promo_code_id } });
      if (!promo) return fail('Code promo introuvable', 'PROMO_NOT_FOUND');
      if (promo.is_active === false) return fail('Ce code promo est désactivé', 'PROMO_INACTIVE');
      if (promo.event_id && promo.event_id !== p_event_id) {
        return fail('Code promo non applicable à cet événement', 'PROMO_NOT_APPLICABLE');
      }
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        return fail('Ce code promo a expiré', 'PROMO_EXPIRED');
      }
      // La limite la plus contraignante entre le code et la config de l'événement.
      const promoLimit = promo.usage_limit ?? null;
      const promoUsed = promo.usage_count ?? 0;
      if (promoLimit !== null && promoUsed >= promoLimit) {
        return fail('Ce code promo a atteint sa limite d\'utilisation', 'PROMO_LIMIT_REACHED');
      }
      const cfg = await dbc.event_promo_config.findFirst({ where: { event_id: p_event_id } });
      const cfgActive = cfg?.enabled !== false;
      const now = new Date();
      const withinDates = (!cfg?.valid_from || now >= cfg.valid_from) && (!cfg?.valid_to || now <= cfg.valid_to);
      if (!cfgActive || !withinDates) return fail('Code promo non applicable à cet événement', 'PROMO_NOT_APPLICABLE');
      const cfgLimit = cfg?.usage_limit ?? null;
      if (cfgLimit !== null && promoUsed >= cfgLimit) {
        return fail('Ce code promo a atteint sa limite d\'utilisation', 'PROMO_LIMIT_REACHED');
      }
      const dType = cfg?.discount_type || 'percentage';
      const dVal = Number(cfg?.discount_value || 0);
      promoReduction = dType === 'fixed' ? Math.min(dVal, baseTotalFcfa) : Math.round((baseTotalFcfa * dVal) / 100);
      promoReduction = Math.min(promoReduction, baseTotalFcfa);
      promoMeta = {
        promo_code_id: promo.id,
        code: promo.code,
        influencer_id: promo.influencer_id || null,
        discount_type: dType,
        discount_value: dVal,
        discount_coins: promoReduction,
        base_coins: baseTotalFcfa,
        commission_rate: Number(cfg?.commission_rate || 0),
      };
    }
    const totalCoins = Math.max(1, baseTotalFcfa - promoReduction);
    const orderId = p_transaction_reference || `TKT-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    // Garde-fou anti-double achat : un rejeu du même orderId ne doit pas
    // recréer de billets ni re-débiter le portefeuille. Vérifié AVANT le
    // contrôle de solde pour qu'un double-tap ou une retentative avec un solde
    // déjà débité renvoie DUPLICATE_ORDER (et non « solde insuffisant »).
    if (p_transaction_reference) {
      const already = await dbc.tickets.findFirst({
        where: { transaction_reference: orderId, event_id: p_event_id },
        select: { id: true },
      });
      if (already) {
        return fail('Cette commande a déjà été traitée (billets existants pour cette référence).', 'DUPLICATE_ORDER');
      }
    }

    // 3. Vérif solde coins du profil + débit
    const balance = profile.coin_balance ?? 0;
    if (balance < totalCoins) return fail(`Solde insuffisant (disponible: ${balance}, requis: ${totalCoins})`, 'INSUFFICIENT_COINS');

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const genCode = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

    const now = new Date();
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
    }

    // Décrément du stock : compteur ticket_types + compteur événement.
    // Doit précéder le débit du portefeuille pour ne jamais délivrer de billet gratuit.
    const stockRes = await adjustTicketStock({
      p_event_id: p_event_id,
      p_delta: 1,
      p_lines: items.map(({ tt, qty }) => ({ type_id: tt.id, qty })),
    });
    if (!stockRes.success) {
      // Annulation des billets déjà créés : le client n'a pas encore été débité.
      try {
        await dbc.tickets.deleteMany({ where: { transaction_reference: orderId, event_id: p_event_id } });
      } catch (e) {
        console.error('�s�️ rollback billets:', e.message);
      }
      return fail(stockRes.message, stockRes.code || 'STOCK_UPDATE_FAILED');
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
      console.error('�s�️ Erreur miroir event_tickets:', e.message);
    }

    // Débit atomique conditionné au solde lu : en cas de deux achats
    // simultanés, un seul passe le contrôle `coin_balance >= totalCoins`.
    const debited = await dbc.profiles.updateMany({
      where: { id: p_user_id, coin_balance: { gte: totalCoins } },
      data: { coin_balance: { decrement: totalCoins }, updated_at: now },
    });
    if (!debited.count) {
      await dbc.tickets.deleteMany({ where: { transaction_reference: orderId, event_id: p_event_id } });
      await adjustTicketStock({
        p_event_id,
        p_delta: -1,
        p_lines: items.map(({ tt, qty }) => ({ type_id: tt.id, qty })),
      });
      return fail('Solde insuffisant (paiement concurrent)', 'INSUFFICIENT_COINS');
    }

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
        description: `�YZY️ Achat de ${createdTickets.length} billet(s)${promoMeta ? ` avec code promo ${promoMeta.discount_type === 'fixed' ? promoMeta.discount_value + ' pièces' : promoMeta.discount_value + '%'} de réduction` : ''}`,
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
        // La remise promo est portée par l'organisateur : on explicite les 3 lignes
        // (prix plein / remise code promo / montant net réellement encaissé) pour
        // qu'il voie exactement d'où vient la différence dans son relevé de gains.
        const promoLine = promoMeta && promoMeta.discount_coins > 0
          ? ` �?" prix plein ${baseTotalFcfa} pièces �^' remise code ${promoMeta.code} ${promoMeta.discount_coins} pièces = ${totalCoins} pièces encaissées`
          : '';
        await creditOrganizerEarnings({
          p_organizer_id: organ.organizer_id,
          p_event_id,
          p_transaction_id: orderId,
          p_transaction_type: 'ticket_sale',
          p_earnings_coins: totalCoins,
          p_earnings_fcfa: totalCoins * 10,
          p_ticket_count: createdTickets.length,
          p_description: `Vente de ${createdTickets.length} billet(s)${promoLine}`,
          p_created_at: now,
        });
      }
    } catch (e) {
      console.error('�s�️ Gains organisateur non crédités:', e.message);
    }

    // Commission du code promo à l'influenceur, en pièces ET en FCFA.
    let promoCommission = null;
    if (promoMeta && promoMeta.influencer_id && promoMeta.commission_rate > 0) {
      try {
        promoCommission = await creditPromoCommissionOnce({
          transactionRef: orderId,
          influencerId: promoMeta.influencer_id,
          eventId: p_event_id,
          baseCoins: baseTotalFcfa,
          rate: promoMeta.commission_rate,
          code: promoMeta.code,
        });
      } catch (e) {
        console.error('�s�️ Commission influenceur non créditée:', e.message);
      }
    }

    // Compteur d'usage du code promo ( alimenté uniquement après achat réussi ).
    if (promoMeta) {
      // Journal d'usage : sans cette ligne, « Mes gains premium » affiche 0 FCFA
      // alors que la commission a bien été créditée ci-dessus (elle est lue
      // dans promo_code_usages, pas dans organizer_earnings). On écrit le
      // journal AVANT le compteur pour que les deux ne puissent pas diverger,
      // et on prend `coins` même si la commission était déjà créditée afin que
      // le montant journalisé reste exact.
      let usageRecorded = false;
      try {
        const usageResult = await recordPromoUsageOnce({
          promoCodeId: promoMeta.promo_code_id,
          userId: p_user_id,
          discountCoins: promoReduction,
          commissionCoins: (promoCommission && promoCommission.coins) || 0,
          purchaseCoins: totalCoins,
          transactionRef: orderId,
        });
        usageRecorded = !!(usageResult && usageResult.recorded);
      } catch (e) {
        console.error('⚠️ Journal d\'usage du code promo non enregistré:', e.message);
      }
      // Incrémenté uniquement si le journal a été écrit : un compteur en
      // avance ferait diverger la limite d'usage et les statistiques.
      if (usageRecorded) {
        try {
          await dbc.promo_codes.update({
            where: { id: promoMeta.promo_code_id },
            data: { usage_count: { increment: 1 }, updated_at: now },
          });
        } catch (e) {
          console.error('⚠️ usage_count du code promo non incrémenté:', e.message);
        }
      }
    }

    return ok({
      success: true,
      message: 'Achat réussi' + (promoMeta ? ` �?" code promo appliqué (${promoMeta.discount_type === 'fixed' ? promoMeta.discount_value + ' pièces' : promoMeta.discount_value + '%'})` : ''),
      transaction_id: orderId,
      transaction_reference: orderId,
      payment_id: payment.id,
      total_coins: totalCoins,
      base_total_coins: baseTotalFcfa,
      promo: promoMeta,
      promo_applied: !!promoMeta,
      promo_discount_coins: promoReduction,
      promo_commission: promoCommission,
      tickets: createdTickets.map((t) => ({ id: t.id, qr_code: t.qr_code, ticket_number: t.ticket_number, price: t.total_amount_pi, price_fcfa: (t.total_amount_fcfa || 0), ticket_code_short: t.ticket_code_short, status: t.status })),
    });
  },

  // Stock partagé entre le parcours "pièces" (purchase_tickets_v2) et le parcours
  // USSD (netlify/functions/ussd-payment.cjs) pour garantir un compteur unique.
  // /api/rpc n'est pas authentifié : ce RPC n'est donc réservé qu'aux appels
  // serveur porteurs de la clé interne (INTERNAL_RPC_KEY), jamais au navigateur.
  async adjust_ticket_stock(args) {
    const { p_event_id, p_lines, p_delta, p_evidence_row_id, p_internal_key } = args || {};
    const expectedKey = process.env.INTERNAL_RPC_KEY || '';
    if (!expectedKey) {
      console.error('�O INTERNAL_RPC_KEY absent : adjust_ticket_stock refusé.');
      return fail('Ajustement de stock indisponible (INTERNAL_RPC_KEY non configuré).', 'INTERNAL_RPC_KEY_MISSING');
    }
    if (!p_internal_key || p_internal_key !== expectedKey) {
      return fail("Appel interne non autorisé pour l'ajustement du stock.", 'UNAUTHORIZED');
    }
    const res = await adjustTicketStock({ p_event_id, p_lines, p_delta, p_evidence_row_id });
    return res.success ? ok(res) : fail(res.message, res.code || 'STOCK_UPDATE_FAILED');
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

  // Vote PAYANT atomique (coins). Avant, cast_votes enchaînait des écritures
  // séparées et débitait le solde en DERNIER : une panne en cours de route
  // laissait les voix enregistrées sans débit, et le montant était calculé sur
  // un solde lu hors transaction (deux clics simultanés pouvaient dépasser le
  // solde). Tout est désormais dans une seule transaction Prisma : débit
  // conditionnel (comparaison-échange) + user_votes + candidates + payments +
  // transactions + gain organisateur. Si une seule écriture échoue, tout est
  // annulé et les pièces reviennent.
  //
  // Idempotence : le client fournit p_idempotency_key (un UUID par intention de
  // vote). Si la même clé est rejouée (double clic, retry après timeout), la
  // fonction renvoie le résultat déjà enregistré au lieu de débiter à nouveau.
  async cast_contest_votes(args, actor) {
    const { p_user_id, p_event_id, p_votes, p_voter_phone, p_idempotency_key } = args || {};
    const userId = actor?.id || p_user_id;
    if (!userId || !p_event_id) return fail('utilisateur et evenement requis');
    const lines = (Array.isArray(p_votes) ? p_votes : [])
      .map((v) => ({ candidateId: v && (v.candidate_id || v.candidateId), voteCount: Math.max(0, parseInt(v && (v.vote_count || v.voteCount), 10) || 0) }))
      .filter((v) => v.candidateId && v.voteCount > 0);
    if (!lines.length) return fail('Aucun vote valide', 'EMPTY_VOTES');

    // Cle d'idempotence : deduite d'un UUID du client, unique par intention.
    // Sans elle, on retombe sur un identifiant horodate : utile en dernier
    // recours mais les doublons de clic restent possibles (le front doit la
    // fournir). Transaction_id enregistre dans payments pour rejouer le resultat.
    const orderId = p_idempotency_key
      ? `VOTE-${String(p_idempotency_key).slice(0, 48)}`
      : `VOTE-${Date.now()}-${Math.floor(Math.random() * 99999)}`;

    const dbc = db();
    // Rejeu : si cette intention a deja ete honoree, on renvoie le meme resultat
    // sans debiter. Verifie hors transaction (lecture fraiche) puis re-verifie
    // dans la transaction pour les cas strictement simultanes.
    const prior = await dbc.payments.findFirst({
      where: { user_id: userId, transaction_id: orderId },
      select: { coins_amount: true },
    });
    if (prior) {
      const replayIdem = lines.reduce((s, l) => s + l.voteCount, 0);
      return ok({
        success: true, already_recorded: true, transaction_id: orderId,
        total_coins: Number(prior.coins_amount || 0),
        vote_count: replayIdem,
      });
    }

    try {
      return await dbc.$transaction(async (tx) => {
        // Re-verification idempotence dans la transaction (lecture deja commitee
        // pour les deux requetes vraiment simultanees).
        const alreadyInTx = await tx.payments.findFirst({
          where: { user_id: userId, transaction_id: orderId },
          select: { coins_amount: true },
        });
        if (alreadyInTx) {
          const replayTx = lines.reduce((s, l) => s + l.voteCount, 0);
          return ok({ success: true, already_recorded: true, transaction_id: orderId, total_coins: Number(alreadyInTx.coins_amount || 0), vote_count: replayTx });
        }

        const profile = await tx.profiles.findUnique({ where: { id: userId } });
        if (!profile) return fail('Profil introuvable', 'PROFILE_NOT_FOUND');
        if (profile.is_active === false) return fail('Compte inactif', 'ACCOUNT_INACTIVE');
        const ev = await tx.events.findUnique({ where: { id: p_event_id }, select: { id: true, title: true, organizer_id: true, price_pi: true, price_fcfa: true, is_sales_closed: true, status: true } });
        if (!ev) return fail('Evenement introuvable', 'EVENT_NOT_FOUND');
        if (ev.is_sales_closed) return fail('Les votes sont fermes', 'VOTING_CLOSED');
        const price = Math.max(0, Math.floor(Number(ev.price_pi || 0)));
        if (price <= 0) return fail('Ce vote est gratuit : utilisez le parcours gratuit', 'FREE_VOTING');

        const settings = await tx.event_settings.findFirst({ where: { event_id: p_event_id } });
        const requested = lines.reduce((s, l) => s + l.voteCount, 0);
        const totalCoins = price * requested;

        const resolved = [];
        for (const line of lines) {
          const cand = await tx.candidates.findUnique({ where: { id: line.candidateId }, select: { id: true, name: true, event_id: true } });
          if (!cand) return fail(`Candidat introuvable: ${line.candidateId}`, 'CANDIDATE_NOT_FOUND');
          if (cand.event_id && cand.event_id !== p_event_id) return fail("Ce candidat n'appartient pas a cet evenement", 'CANDIDATE_WRONG_EVENT');
          resolved.push({ cand, voteCount: line.voteCount });
        }

        const maxPerUser = Number(settings?.max_votes_per_user || 0);
        if (maxPerUser > 0) {
          const mine = await tx.user_votes.findMany({ where: { user_id: userId, event_id: p_event_id }, select: { vote_count: true } });
          const already = mine.reduce((s, r) => s + Number(r.vote_count || 0), 0);
          if (already + requested > maxPerUser) {
            return fail(`Limite de ${maxPerUser} voix par personne (deja ${already})`, 'VOTE_USER_LIMIT');
          }
        }

        const voterPhone = normalizePhone(p_voter_phone || profile.phone || '');
        const maxPerPhone = Number(settings?.max_votes_per_phone || 0);
        if (maxPerPhone > 0 && voterPhone) {
          const rows = await tx.user_votes.findMany({ where: { event_id: p_event_id }, select: { vote_count: true, voter_phone: true } });
          let already = 0;
          for (const r of rows) {
            if (normalizePhone(r.voter_phone) === voterPhone) already += Number(r.vote_count || 0);
          }
          if (already + requested > maxPerPhone) {
            return fail(`Limite de ${maxPerPhone} voix par telephone (deja ${already})`, 'VOTE_PHONE_LIMIT');
          }
        }

        // Débit conditionnel : la condition porte sur les soldes LUS à l'instant
        // T. Une seconde requête simultanée voit l'écriture déjà appliquée,
        // sa condition échoue (count 0) et la transaction est annulée : une
        // même pièce ne peut pas être dépensée deux fois. Les pièces gratuites
        // sont consommées en premier, comme spend_user_coins.
        const coinAvail = Number(profile.coin_balance || 0);
        const freeAvail = Number(profile.free_coin_balance || 0);
        if (coinAvail + freeAvail < totalCoins) {
          return fail(`Solde insuffisant (disponible: ${coinAvail + freeAvail}, requis: ${totalCoins})`, 'INSUFFICIENT_COINS');
        }
        const freeUsed = Math.min(freeAvail, totalCoins);
        const paidUsed = totalCoins - freeUsed;
        const applied = await tx.profiles.updateMany({
          where: { id: userId, coin_balance: coinAvail, free_coin_balance: freeAvail },
          data: { coin_balance: coinAvail - paidUsed, free_coin_balance: freeAvail - freeUsed },
        });
        if (applied.count !== 1) throw new Error('Solde modifie en cours de traitement');

        const now = new Date();
        for (const { cand, voteCount } of resolved) {
          const existing = await tx.user_votes.findFirst({
            where: { user_id: userId, candidate_id: cand.id, event_id: p_event_id },
          });
          if (existing) {
            await tx.user_votes.update({
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
            await tx.user_votes.create({
              data: {
                id: uuidv4(),
                user_id: userId,
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
          const current = await tx.candidates.findUnique({ where: { id: cand.id }, select: { vote_count: true } });
          await tx.candidates.update({
            where: { id: cand.id },
            data: { vote_count: Number(current?.vote_count || 0) + voteCount },
          });
        }

        await tx.payments.create({
          data: {
            user_id: userId,
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

        await tx.transactions.create({
          data: {
            user_id: userId,
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
            p_dbc: tx,
          });
        }

        return ok({ success: true, transaction_id: orderId, total_coins: totalCoins, vote_count: requested, price_per_vote: price });
      });
    } catch (e) {
      // Verifie si une transaction concurrente de meme cle a deja commite :
      // dans ce cas la cle est mere, on renvoie le resultat au lieu d'une
      // erreur trompeuse.
      const committed = await dbc.payments.findFirst({
        where: { user_id: userId, transaction_id: orderId },
        select: { coins_amount: true },
      });
      if (committed) {
        const replayC = lines.reduce((s, l) => s + l.voteCount, 0);
        return ok({
          success: true, already_recorded: true, transaction_id: orderId,
          total_coins: Number(committed.coins_amount || 0), vote_count: replayC,
        });
      }
      console.error('[cast_contest_votes]', e?.message);
      return fail(e?.message || 'Vote non enregistre', 'VOTE_FAILED');
    }
  },

  // Compat : le front appelle encore `cast_votes` (VotingInterface). Il délègue
  // au moteur atomique, de sorte qu'il n'existe qu'un seul chemin de paiement.
  async cast_votes(args, actor) {
    return this.cast_contest_votes(args, actor);
  },

  async get_promo_code_stats(args, actor) {
    const { p_event_id } = args;
    if (!p_event_id) return fail('p_event_id requis', 'EVENT_REQUIRED');
    // Lecture réservée : organisateur de l'événement, influenceur propriétaire
    // d'au moins un code actif de l'événement, ou administration. Ni un compte
    // tiers, ni un agent de scan (délégué) ne doit pouvoir lister les
    // codes/parrainages d'un événement : c'est de la donnée financière.
    const ev = await db().events.findUnique({ where: { id: p_event_id }, select: { organizer_id: true } });
    const isOrgOrAdmin =
      actor?.source === 'internal' || ADMIN_ROLES.includes(actor.user_type) ||
      (!!ev && ev.organizer_id === actor?.id);
    if (isOrgOrAdmin) {
      const codes = await db().promo_codes.findMany({ where: { event_id: p_event_id } });
      return ok({ total: codes.length, used: codes.filter((c) => c.is_used).length, codes });
    }
    const isInfluencerOwner = await db().promo_codes.findFirst({
      where: { event_id: p_event_id, influencer_id: actor?.id, is_active: true },
      select: { id: true },
    });
    if (!isInfluencerOwner) {
      return fail("Vous n'êtes pas autorisé à consulter les codes promo de cet événement", 'FORBIDDEN');
    }
    const codes = await db().promo_codes.findMany({ where: { event_id: p_event_id } });
    return ok({ total: codes.length, used: codes.filter((c) => c.is_used).length, codes });
  },

  // ---------- Stats / salaires (lectures) ----------
  async get_admin_salary_stats(args) {
    const { p_admin_id } = args;
    if (!p_admin_id) return fail('p_admin_id requis');
    const dbc = db();
    const admin = await dbc.profiles.findUnique({
      where: { id: p_admin_id },
      select: { id: true, country: true, city: true, user_type: true },
    });
    if (!admin) return fail('Admin introuvable', 'NOT_FOUND');

    const rows = await dbc.admin_salaries.findMany({
      where: { admin_id: p_admin_id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    const latest = rows[0] || null;
    const personalScore = Number(latest?.personal_score || 1);
    const license = await resolveAdminLicense(p_admin_id, latest);
    const licenseCommissionRate = Number(license.rate || 0);
    // CA de la zone : commissions acquises de toutes les lignes reconnues
    // (transferred, paid, available, completed), calculées une seule fois.
    const zone = await computeAdminZoneRevenue(admin);

    // Salaire admin = CA plateforme du mois en cours × Taux de licence × Score
    const salaryBaseFcfa = Math.round(zone.monthly_revenue_fcfa);
    const computedSalaryFcfa = Math.round(salaryBaseFcfa * (licenseCommissionRate / 100) * personalScore);
    const legacySalaryFcfa = rows.reduce((s, r) => s + Number(r.total_salary || 0), 0);
    const totalSalaryFcfa = computedSalaryFcfa > 0 || salaryBaseFcfa > 0 ? computedSalaryFcfa : legacySalaryFcfa;

    return ok({
      // CA zone (cumul + mois en cours)
      zone_revenue_fcfa: Math.round(zone.total_revenue_fcfa),
      monthly_zone_revenue_fcfa: salaryBaseFcfa,
      monthly_zone_revenue_coins: zone.monthly_commission_coins,
      zone_transfer_fees_coins: zone.total_commission_coins,
      zone_transfer_fees_fcfa: Math.round(zone.total_revenue_fcfa),
      zone_platform_fee_tx_coins: 0,
      zone_platform_fee_tx_fcfa: 0,
      salary_base_fcfa: salaryBaseFcfa,
      zone_volume_fcfa: Math.round(zone.total_gross_fcfa),
      zone_organizers_count: zone.organizers_count,
      country: zone.country,
      city: zone.cities.length === 1 ? zone.cities[0] : (admin.city || null),
      license_name: license.name,
      license_source: license.source,
      license_missing: licenseCommissionRate <= 0,
      // Compat UI existante
      total_salary_fcfa: totalSalaryFcfa,
      total_volume_fcfa: Math.round(zone.total_gross_fcfa),
      platform_revenue_fcfa: Math.round(zone.total_revenue_fcfa),
      license_commission_rate: licenseCommissionRate,
      personal_score: personalScore,
      withdrawal_status: latest?.withdrawal_status || 'closed',
      month: zone.month,
      monthly_by_status: zone.monthly_by_status,
      recognized_statuses: zone.recognized_statuses,
      excluded_statuses: zone.excluded_statuses,
      coin_to_fcfa_rate: zone.coin_to_fcfa_rate,
      stats: rows,
    });
  },

  // CA de la zone pour la carte du tableau de bord admin. Même calcul que le
  // salaire (computeAdminZoneRevenue) : une seule source de vérité.
  async get_admin_zone_stats(args = {}, actor) {
    const adminId = args?.p_admin_id || args?.admin_id || actor?.id;
    if (!adminId) return fail('p_admin_id requis');
    const admin = await db().profiles.findUnique({
      where: { id: adminId },
      select: { id: true, country: true, city: true, user_type: true },
    });
    if (!admin) return fail('Admin introuvable', 'NOT_FOUND');
    const zone = await computeAdminZoneRevenue(admin);
    // Alias attendus par la carte du tableau de bord (AdminStats).
    return ok({
      ...zone,
      monthly_zone_revenue_fcfa: zone.monthly_revenue_fcfa,
      zone_revenue_fcfa: zone.total_revenue_fcfa,
      total_volume_fcfa: zone.total_gross_fcfa,
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
    const platformFeeRate = await getPlatformFeeRate();
    const pendingGross = pendingRows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
    const pendingFee = pendingRows.reduce(
      (sum, row) => sum + Number(row.platform_commission ?? Math.floor(Number(row.earnings_coins || 0) * platformFeeRate)),
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
      select: {
        id: true, earnings_coins: true, platform_commission: true,
        platform_fee: true, fee_percent: true, transaction_type: true, earning_type: true,
      },
    });
    if (!pendingRows.length) {
      return ok({ success: true, message: 'Aucun gain en attente à transférer.', total_gross: 0, platform_fee: 0, total_net: 0, transferred_count: 0 });
    }
    const gross = pendingRows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
    const settings = await getAppSettings();
    const platformFeeRate = Number(settings.platformFeeRate) || DEFAULT_PLATFORM_FEE_RATE;
    const coinRate = Number(settings.rate) || 10;
    // Les commissions promo/influenceur sont des gains nets : pas de frais.
    const feeForRow = (row) => {
      const type = String(row.transaction_type || row.earning_type || '').toLowerCase();
      if (type === 'promo_commission') return 0;
      return resolveEarningFeeCoins(row, platformFeeRate);
    };
    const platformFee = pendingRows.reduce((sum, row) => sum + feeForRow(row), 0);
    const net = gross - platformFee;
    const now = new Date();
    // On persiste la commission réellement retenue : sans cela, une ligne à
    // platform_commission = 0 laissait le CA de la zone à zéro après transfert.
    await db().$transaction(pendingRows.map((row) => {
      const rowFee = Math.round(feeForRow(row) * 100) / 100;
      return db().organizer_earnings.update({
        where: { id: row.id },
        data: {
          status: 'transferred',
          paid_at: now,
          transferred_at: now,
          updated_at: now,
          platform_commission: Math.round(rowFee),
          platform_fee: rowFee * coinRate,
          net_amount: (Number(row.earnings_coins || 0) - rowFee) * coinRate,
        },
      });
    }));
    await db().profiles.update({
      where: { id: p_user_id },
      data: {
        available_earnings: Number(profile.available_earnings || 0) + net,
        total_earnings: Math.max(0, Number(profile.total_earnings || 0) - gross),
        updated_at: now,
      },
    });

    // Les commissions partenaire sur les frais de transfert sont créditées dans les gains
    // du partenaire après retrait des fonds du filleul (organisateur), avec les frais de retrait.
    return ok({ success: true, message: 'Transfert effectué.', total_gross: gross, platform_fee: platformFee, total_net: net, transferred_count: pendingRows.length });
  },

  async get_business_partner_dashboard(args) {
    const { p_user_id } = args || {};
    if (!p_user_id) return fail('p_user_id requis');
    const dbc = db();
    const settings = await getAppSettings();
    const rate = Number(settings.rate || 10);

    const organizers = await dbc.profiles.findMany({
      where: { referred_by: p_user_id },
      select: { id: true, full_name: true, email: true, avatar_url: true, created_at: true, user_type: true },
      orderBy: { created_at: 'desc' },
    });

    const rows = [];
    let totals = { organizers: organizers.length, events: 0, participations: 0, transfer_fees_coins: 0, withdrawal_fees_coins: 0, platform_revenue_coins: 0, partner_commission_coins: 0, withdrawn_coins: 0 };

    for (const org of organizers) {
      const events = await dbc.events.findMany({ where: { organizer_id: org.id }, select: { id: true } });
      const eventIds = events.map((e) => e.id);

      let participations = 0;
      if (eventIds.length) {
        participations = await dbc.event_participations.count({ where: { event_id: { in: eventIds } } }).catch(() => 0);
      }

      const earnings = await dbc.organizer_earnings.findMany({
        where: { organizer_id: org.id },
        select: { earnings_coins: true, platform_commission: true, status: true },
      });
      const transferFeesCoins = earnings
        .filter((e) => e.status === 'transferred')
        .reduce((s, e) => s + Number(e.platform_commission ?? Math.floor(Number(e.earnings_coins || 0) * (settings.platformFeeRate || 0.05))), 0);
      const grossCoins = earnings.reduce((s, e) => s + Number(e.earnings_coins || 0), 0);

      const withdrawals = await dbc.organizer_withdrawal_requests.findMany({
        where: { organizer_id: org.id, status: { in: ['approved', 'paid'] } },
        select: { amount_pi: true, amount_fcfa: true, fees: true, net_amount: true, paid_at: true, reviewed_at: true, requested_at: true },
      });
      const withdrawnCoins = withdrawals.reduce((s, w) => s + Number(w.amount_pi || 0), 0);
      const withdrawalFeesCoins = withdrawals.reduce((s, w) => s + Math.max(0, Math.round(Number(w.fees || 0) / rate)), 0);

      const platformRevenueCoins = transferFeesCoins + withdrawalFeesCoins;
      const commissions = await dbc.business_partner_commissions.findMany({
        where: { partner_id: p_user_id, organizer_id: org.id },
        select: { commission_coins: true },
      }).catch(() => []);
      const partnerCommissionCoins = commissions.reduce((s, r) => s + Number(r.commission_coins || 0), 0);

      totals.events += eventIds.length;
      totals.participations += participations;
      totals.transfer_fees_coins += transferFeesCoins;
      totals.withdrawal_fees_coins += withdrawalFeesCoins;
      totals.platform_revenue_coins += platformRevenueCoins;
      totals.partner_commission_coins += partnerCommissionCoins;
      totals.withdrawn_coins += withdrawnCoins;

      rows.push({
        organizer: org,
        stats: {
          events_count: eventIds.length,
          participations_count: participations,
          gross_coins: grossCoins,
          transfer_fees_coins: transferFeesCoins,
          withdrawn_coins: withdrawnCoins,
          withdrawal_fees_coins: withdrawalFeesCoins,
          platform_revenue_coins: platformRevenueCoins,
          partner_commission_coins: partnerCommissionCoins,
        },
      });
    }

    const commissionTotal = await dbc.business_partner_commissions.aggregate({
      where: { partner_id: p_user_id },
      _sum: { commission_coins: true, gross_fee_coins: true },
      _count: { _all: true },
    }).catch(() => null);

    return ok({
      partner_id: p_user_id,
      settings: {
        platform_fee_percentage: settings.platformFeePercentage,
        withdrawal_fee_percentage: settings.withdrawalFeePercentage,
        business_partner_commission_percentage: settings.businessPartnerCommissionPercentage,
      },
      totals: {
        ...totals,
        ledger_commission_coins: Number(commissionTotal?._sum?.commission_coins || 0),
        ledger_gross_fee_coins: Number(commissionTotal?._sum?.gross_fee_coins || 0),
      },
      organizers: rows,
    });
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

  // NOTE : `get_super_admin_dashboard_stats` est definie plus bas dans cet
  // objet (celle qui compte vraiment). Une premiere version figurait ici et
  // additionnait amount_pi de toutes les transactions, en pieces, sans filtre
  // de statut. Elle etait neutralisee par la definition suivante du meme objet,
  // mais laissonait deux sources de verite contradictoires.

  async get_audit_log_stats(args) {
    const { period_days } = args;
    const since = new Date(Date.now() - (Number(period_days) || 30) * 86400000);
    const rows = await db().admin_logs.findMany({ where: { created_at: { gte: since } }, orderBy: { created_at: 'desc' }, take: 500 });
    return ok({ stats: { total: rows.length, logs: rows }, total: rows.length });
  },

  // ---------- Agents de scan ----------
  // Ces trois RPC n'ont pas d'entrée dans RPC_POLICY : l'organisateur n'est
  // jamais lu dans les arguments. Il vient toujours de l'identité vérifiée, ce
  // qui rend impossible de gérer les agents d'un autre promoteur en forçant un
  // id dans le corps de la requête. La clé interne, elle, n'a pas d'identité
  // de promoteur : elle est refusée.
  async list_scan_agents(args, actor) {
    if (!actor?.id) return fail('Action réservée à un compte organisateur', 'NO_ORGANIZER');
    const dbc = db();
    const [agents, delegations] = await Promise.all([
      dbc.organizer_scan_agents.findMany({
        where: { organizer_id: actor.id },
        orderBy: { created_at: 'desc' },
      }),
      dbc.organizer_scan_agents.findMany({
        where: { user_id: actor.id, is_active: true },
        select: { organizer_id: true },
      }),
    ]);
    const ids = [...new Set(agents.map((a) => a.user_id))];
    const profiles = ids.length
      ? await dbc.profiles.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true, email: true, phone: true } })
      : [];
    return ok({
      agents: agents.map((a) => ({
        user_id: a.user_id,
        is_active: !!a.is_active,
        created_at: a.created_at,
        last_scanned_at: a.last_scanned_at,
        profile: profiles.find((p) => p.id === a.user_id) || null,
      })),
      // Ce que CE compte peut scanner, pour l'afficher dans l'interface.
      scans_for_organizers: delegations.map((d) => d.organizer_id),
    });
  },

  async add_scan_agent(args, actor) {
    if (!actor?.id) return fail('Action réservée à un compte organisateur', 'NO_ORGANIZER');
    const email = String(args.p_email || '').trim().toLowerCase();
    if (!email) return fail('p_email requis', 'EMAIL_MISSING');
    const dbc = db();
    const orFilters = [{ email }];
    if (args.p_phone) orFilters.push({ phone: String(args.p_phone).trim() });
    const target = await dbc.profiles.findFirst({
      where: { OR: orFilters },
      select: { id: true, email: true, full_name: true, user_type: true },
    });
    if (!target) return fail('Aucun compte avec cette adresse email', 'AGENT_NOT_FOUND');
    if (target.id === actor.id) return fail('Vous êtes déjà votre propre scanneur', 'SELF_AGENT');
    if (ADMIN_ROLES.includes(target.user_type)) {
      return fail('Un administrateur n\'a pas besoin d\'être délégué', 'AGENT_IS_ADMIN');
    }
    const existing = await dbc.organizer_scan_agents.findFirst({
      where: { organizer_id: actor.id, user_id: target.id },
    });
    if (existing) {
      if (existing.is_active) return ok({ success: true, already: true, user_id: target.id });
      await dbc.organizer_scan_agents.update({ where: { id: existing.id }, data: { is_active: true, granted_by: actor.id } });
      return ok({ success: true, reactivated: true, user_id: target.id });
    }
    await dbc.organizer_scan_agents.create({
      data: { id: uuidv4(), organizer_id: actor.id, user_id: target.id, granted_by: actor.id, is_active: true },
    });
    return ok({ success: true, user_id: target.id, full_name: target.full_name });
  },

  async remove_scan_agent(args, actor) {
    if (!actor?.id) return fail('Action réservée à un compte organisateur', 'NO_ORGANIZER');
    const userId = args.p_user_id;
    if (!userId) return fail('p_user_id requis', 'USER_MISSING');
    const dbc = db();
    // La paire (organisateur, agent) est celle de l'appelant : impossible de
    // désactiver l'agent d'un autre organisateur.
    const { count } = await dbc.organizer_scan_agents.updateMany({
      where: { organizer_id: actor.id, user_id: userId },
      data: { is_active: false },
    });
    return ok({ success: true, removed: count });
  },

  // Vue consolidée pour l'administration : toutes les délégations de scan,
  // avec le profil de l'organisateur, de l'agent et de celui qui a accordé.
  async admin_list_scan_agents(args, actor) {
    if (actor?.source === 'user' && !ADMIN_ROLES.includes(actor.user_type)) {
      return fail("Action réservée à l'administration", 'FORBIDDEN');
    }
    const dbc = db();
    const rows = await dbc.organizer_scan_agents.findMany({ orderBy: { created_at: 'desc' } });
    if (!rows.length) return ok({ agents: [], active_count: 0, total_count: 0 });
    const ids = [...new Set(rows.flatMap((r) => [r.organizer_id, r.user_id, r.granted_by]))];
    const profiles = await dbc.profiles.findMany({ where: { id: { in: ids } }, select: { id: true, full_name: true, email: true, phone: true } });
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return ok({
      agents: rows.map((r) => ({
        id: r.id,
        organizer_id: r.organizer_id,
        user_id: r.user_id,
        granted_by: r.granted_by,
        is_active: !!r.is_active,
        created_at: r.created_at,
        last_scanned_at: r.last_scanned_at,
        organizer: byId.get(r.organizer_id) || null,
        agent: byId.get(r.user_id) || null,
        granted_by_profile: byId.get(r.granted_by) || null,
      })),
      active_count: rows.filter((r) => r.is_active).length,
      total_count: rows.length,
    });
  },

  // ---------- Tickets ----------
  async reset_ticket(args, actor) {
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
    // Double vérification : la politique a déjà refusé tout appelant autre que
    // l'organisateur. On le rejoue ici parce que cette opération EFFACE une
    // trace de passage ; si la garde de scan est un jour contournée, cette
    // ligne tient encore.
    if (actor?.id && actor.source !== 'internal' && ticket.event_id) {
      const event = await dbc.events.findFirst({ where: { id: ticket.event_id }, select: { organizer_id: true } });
      if (event?.organizer_id && event.organizer_id !== actor.id) {
        return fail('Seul l\'organisateur peut réinitialiser un billet', 'forbidden');
      }
    }
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

  async verify_ticket_direct(args, actor) {
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

    // �Y'� Résolution de l'identité : le billet peut être lié à un compte
    // (tickets.user_id) sans attendee_name/phone renseignés (achat en ligne).
    // Quand la personne est déjà entrée ou déjà sortie, il faut afficher son
    // nom complet et son contact, jamais « Inconnu ».
    let resolvedName = ticket.attendee_name || ticket.customer_name || null;
    let resolvedPhone = ticket.phone || null;
    if (ticket.user_id) {
      const ownerProfile = await dbc.profiles
        .findUnique({
          where: { id: ticket.user_id },
          select: { full_name: true, phone: true, email: true },
        })
        .catch(() => null);
      if (ownerProfile) {
        if (!resolvedName) resolvedName = ownerProfile.full_name || ownerProfile.email || null;
        if (!resolvedPhone) resolvedPhone = ownerProfile.phone || null;
      }
    }
    const ticketView = { ...ticket, attendee_name: resolvedName, customer_name: resolvedName, phone: resolvedPhone };

    const isMultiDay = ticket.is_multi_day || false;
    const validDates = parseValidDates(ticket.valid_dates);

    // �>" Billet non livré : paiement USSD pas encore validé par un admin/secrétaire
    if (ticket.status === 'pending') {
      return ok({ success: false, message: 'Billet en attente de validation du paiement', status_code: 'pending_payment', status: 'pending', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
    }

    // �>" Billet annulé
    if (ticket.status === 'cancelled') {
      return ok({ success: false, message: 'Billet annulé', status_code: 'cancelled', status: 'cancelled', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
    }

    // �>" Billet multi-jours périmé (fin de validité dépassée)
    if (isMultiDay && validDates.length && now > new Date(validDates[validDates.length - 1])) {
      return ok({ success: false, message: 'Pass multi-jours expiré', status_code: 'expired_date', status: 'expired_date', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
    }

    // �>" Billet date fixe non encore valable
    // Comparaison sur le jour, pas sur l'horodatage : `ticket_date` est une
    // Date, et `ticket_date + 'T00:00:00'` produisait une date invalide, donc
    // ce test ne rejetait jamais rien. Un billet daté de demain passait.
    if (!isMultiDay && ticket.ticket_date) {
      const ticketDay = new Date(ticket.ticket_date).toISOString().slice(0, 10);
      if (today < ticketDay) {
        return ok({ success: false, message: 'Billet pas encore valable', status_code: 'not_valid_today', status: 'not_valid_today', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
      }
    }

    // �Y". Mode entrée : validation de la date du jour
    if (!p_exit_mode) {
      if (isMultiDay) {
        if (validDates.length && !validDates.includes(today)) {
          return ok({ success: false, message: 'Billet non valable ce jour', status_code: 'not_valid_today', status: 'not_valid_today', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
        }
      } else if (ticket.ticket_date && today !== ticket.ticket_date.toISOString().slice(0, 10)) {
        return ok({ success: false, message: 'Billet non valable ce jour', status_code: 'not_valid_today', status: 'not_valid_today', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
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
          return ok({ success: false, message: 'Déjà sorti', status_code: 'already_exited', status: 'already_exited', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
        }
        return ok({ success: false, message: 'Pas encore entré', status_code: 'not_entered', status: 'not_entered', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
      }
      const exitCount2 = ticket.reentry_count || 0;
      await dbc.tickets.update({
        where: { id: ticket.id },
        data: { check_out_time: now, reentry_count: exitCount2 + 1, last_reentry_time: now, updated_at: now },
      });
      result = { status_code: 'exit_registered', status: 'exit_registered', message: 'Sortie enregistrée' };
    } else {
      // �o. ENTR�?E
      if (inVenue) {
        return ok({ success: false, message: 'Déjà à l\'intérieur', status_code: 'already_used', status: 'already_used', ticket: ticketView, attendee_name: resolvedName || 'Inconnu', phone: resolvedPhone || null, entry_count: ticketView.entry_count || 0 });
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

    // ðŸ�?o Journal des scans
    // �Y"" Journal des scans
    // Cette écriture échouait silencieusement avant : elle visait `ticket_scans`
    // avec les colonnes ticket_id / scanned_at / verification_method, qui
    // n'existent pas dans cette table. Le .catch() masquait l'erreur, donc AUCUN
    // scan n'était journalisé et l'agent n'était jamais identifiable.
    // `ticket_verifications` est la table prévue pour cela (ticket_id, event_id,
    // organizer_id, scanner_id, verification_method) : elle compte déjà 147
    // lignes. Le journal porte enfin QUI a scanné.
    const organizerRow = await dbc.events
      .findFirst({ where: { id: ticket.event_id }, select: { organizer_id: true } })
      .catch(() => null);
    if (organizerRow?.organizer_id) {
      await dbc.ticket_verifications.create({
        data: {
          id: uuidv4(),
          event_id: ticket.event_id,
          ticket_id: ticket.id,
          organizer_id: organizerRow.organizer_id,
          scanner_id: actor?.id ?? null,
          verification_time: now,
          verification_method: p_verification_method || 'manual',
          verification_status: result.status_code,
          action: scanType,
          state: result.status_code,
          attendee_name: resolvedName ?? null,
          ticket_number: ticket.ticket_number ?? null,
        },
      }).catch((e) => console.error('�s�️ Journal scan non enregistré:', e.message));
    } else {
      console.warn(`�s�️ Scan non journalisé : organisateur introuvable pour l'événement ${ticket.event_id}`);
    }

    return ok({
      success: true,
      message: result.message,
      status_code: result.status_code,
      status: result.status,
      ticket: ticketView,
      attendee_name: resolvedName || 'Inconnu',
      phone: resolvedPhone || null,
      is_guest: ticket.is_guest || false,
      isGuest: ticket.is_guest || false,
      payment_method: ticket.payment_method || 'coins',
      transaction_reference: ticket.transaction_reference || null,
      ticket_type: ticket.ticket_type_id || null,
      entry_count: result.status_code === 'checkin' || result.status_code === 're_entry'
        ? entryCount + 1
        : ticketView.entry_count || 0,
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
    const { rate, minWithdrawalPi, withdrawalFeeRate } = await getAppSettings();
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
    const feeFcfa = Number(details.fee_amount_fcfa) || Math.ceil(amountFcfa * withdrawalFeeRate);
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
        payment_details: JSON.stringify({ ...details, fee_percent: details.fee_percent ?? platformFeeRate * 100 }),
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
      const actor = await dbc.profiles.findUnique({
        where: { id: actorId },
        select: { user_type: true, appointed_by_super_admin: true },
      });
      const canValidate =
        actor?.user_type === 'super_admin' ||
        (actor?.user_type === 'secretary' && actor?.appointed_by_super_admin === true);
      if (!canValidate) {
        return fail('Seul le super admin ou un secrétaire nommé par le super admin peut valider ce retrait', 'FORBIDDEN');
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

    // Commission partenaire d'affaires (créditée dans les gains du partenaire après retrait des fonds du filleul) :
    // % appliqué sur les frais retenus = frais de transfert (gains transférés) + frais de retrait, le tout sur l'organisateur.
    // On crédite les frais de retrait de cette demande + les frais de transfert transférés non encore commissionnés (idempotent).
    if (status === 'approved' || status === 'paid') {
      const settings = await getAppSettings();
      const rate = Number(settings.rate || 10);
      const platformFeeRate = Number(settings.platformFeeRate || 0.05);
      const feeFcfa = Number(request.fees || 0);
      const feeCoins = Math.max(0, Math.round(feeFcfa / rate));
      await creditBusinessPartnerFeeCommission({
        dbc,
        organizerId: request.organizer_id,
        sourceType: 'withdrawal_fee',
        sourceId: p_request_id,
        grossFeeCoins: feeCoins,
        metadata: { withdrawal_request_id: p_request_id, fee_fcfa: feeFcfa, amount_pi: request.amount_pi },
      });

      // Balayer les frais de transfert déjà retenus (earnings transférés) non commissionnés
      const transferred = await dbc.organizer_earnings.findMany({
        where: { organizer_id: request.organizer_id, status: 'transferred' },
        select: { id: true, earnings_coins: true, platform_commission: true },
      });
      for (const row of transferred) {
        const tf = Number(row.platform_commission ?? Math.floor(Number(row.earnings_coins || 0) * platformFeeRate));
        if (tf > 0) {
          await creditBusinessPartnerFeeCommission({
            dbc,
            organizerId: request.organizer_id,
            sourceType: 'transfer_fee',
            sourceId: row.id,
            grossFeeCoins: tf,
            metadata: { organizer_earning_id: row.id, settled_on_withdrawal: p_request_id },
          });
        }
      }
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

  async escalate_organizer_withdrawal(args) {
    const { p_request_id, p_actor_id, p_message } = args || {};
    if (!p_request_id) return fail('p_request_id requis');
    const dbc = db();
    const actorId = p_actor_id || null;
    const actor = actorId
      ? await dbc.profiles.findUnique({
          where: { id: actorId },
          select: { id: true, user_type: true, appointed_by_super_admin: true, full_name: true },
        })
      : null;
    if (!actor || !['super_admin', 'admin', 'secretary'].includes(actor.user_type)) {
      return fail('Permission non accordee', 'FORBIDDEN');
    }

    const request = await dbc.organizer_withdrawal_requests.findUnique({ where: { id: p_request_id } });
    if (!request) return fail('Demande de retrait introuvable', 'REQUEST_NOT_FOUND');
    if (request.status !== 'pending') {
      return fail('Seule une demande en attente peut etre transmise', 'INVALID_STATUS');
    }

    let details = {};
    try {
      if (request.payment_details && typeof request.payment_details === 'string') details = JSON.parse(request.payment_details);
      else if (request.payment_details && typeof request.payment_details === 'object') details = request.payment_details;
    } catch {
      details = {};
    }

    const now = new Date();
    const escalation = {
      urgent: true,
      escalated_at: now.toISOString(),
      escalated_by: actorId,
      escalated_by_name: actor.full_name || null,
      message: (p_message && String(p_message).trim()) || 'Demande de retrait urgente a valider',
    };
    const nextDetails = { ...details, escalation };

    const noteLine = `[ESCALADE ${now.toISOString()}] ${escalation.message}${actor.full_name ? ` (par ${actor.full_name})` : ''}`;
    const adminNotes = request.admin_notes ? `${request.admin_notes}\n${noteLine}` : noteLine;

    await dbc.organizer_withdrawal_requests.update({
      where: { id: p_request_id },
      data: {
        payment_details: JSON.stringify(nextDetails),
        admin_notes: adminNotes,
      },
    });

    const recipients = await dbc.profiles.findMany({
      where: {
        OR: [
          { user_type: 'super_admin' },
          { user_type: 'secretary', appointed_by_super_admin: true },
        ],
        ...(actorId ? { NOT: { id: actorId } } : {}),
      },
      select: { id: true },
    });

    const amountPi = Number(request.amount_pi || 0);
    const amountFcfa = Number(request.amount_fcfa || 0);
    await Promise.all(
      recipients.map((u) =>
        dbc.notifications
          .create({
            data: {
              id: uuidv4(),
              user_id: u.id,
              title: 'Retrait urgent a valider',
              message: `Demande de retrait #${String(p_request_id).slice(0, 8)} (${amountPi} pieces / ${amountFcfa} FCFA) transmise pour validation urgente.${escalation.message ? ` ${escalation.message}` : ''}`,
              type: 'warning',
              data: JSON.stringify({ request_id: p_request_id, kind: 'withdrawal_escalation', escalated_by: actorId }),
              created_at: now,
            },
          })
          .catch((e) => console.error('Notification escalade retrait non creee:', e.message)),
      ),
    );

    return ok({ success: true, message: 'Demande transmise au super admin et aux secretaires habilites.', escalated_to: recipients.length });
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
  async get_verification_stats(args, actor) {
    const { p_event_id } = args;
    if (!p_event_id) return fail('p_event_id requis', 'EVENT_REQUIRED');
    // Statistiques de scan d'un événement = données d'un organisateur : seul
    // l'organisateur, ses agents de scan actifs et l'administration y ont
    // accès (même règle que le scan lui-même).
    if (!(await canReadEventStats(actor, p_event_id))) {
      return fail("Vous n'êtes pas autorisé à consulter les statistiques de cet événement", 'FORBIDDEN');
    }
    const ticketCount = await db().tickets.count({ where: { event_id: p_event_id } });
    // Compté sur ticket_verifications : c'est la table que le scan alimente
    // réellement. ticket_scans restait vide (colonnes incompatibles), donc ce
    // chiffre restait à 0 pour tous les organisateurs.
    const scanned = await db().ticket_verifications.count({ where: { event_id: p_event_id } });
    return ok({ stats: { total_tickets: ticketCount, scanned, valid: scanned, invalid: 0 } });
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

  // ---------- Tableau de bord super admin ----------
  // CA (ventes) = argent REELLEMENT encaisse sur les packs, lu dans `payments`.
  //
  // Avant, ce total venait de `SUM(transactions.amount_fcfa)` sur toutes les
  // lignes `completed`, sans distinction de `transaction_type`. Ce n'est pas
  // un chiffre d'affaires : le solde melangeait des ventes et des mouvements
  // internes, et sortait negatif (-447 270 FCFA) parce que les annulations de
  // credits de l'administration (-2 525 321 FCFA, `credit_reversal`, 33 lignes)
  // etait compensees au hasard par les transferts de gains (+505 846 FCFA).
  //
  // `payments` est la seule source fiable de l'encaissement : elle porte le
  // montant reellement paye, le moyen de paiement et le statut du gateway.
  // `transactions` n'a pas de lien avec elle : les 53 paiements USSD valides
  // n'ont AUCUNE transaction correspondante.
  //
  // Regles appliquees :
  //   - payment_method 'coins' exclu : c'est une depense de pieces deja
  //    creees, pas une entree d'argent.
  //   - status 'completed' / 'success' seulement : un 'pending' n'est pas de
  //     l'argent recu, un 'cancelled' ne l'a jamais ete.
  //   - le taux de repli vient de app_settings, plus de la valeur codee en dur.
  async get_super_admin_dashboard_stats() {
    const dbc = db();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalUsers, newUsers, activeEvents, totalTransactions, pendingWithdrawals, sales, rateRow] = await Promise.all([
      dbc.profiles.count({ where: { deleted_at: null } }),
      dbc.profiles.count({ where: { created_at: { gte: since30 } } }),
      dbc.events.count({ where: { is_active: true, status: 'active' } }),
      dbc.transactions.count({ where: { status: 'completed' } }),
      dbc.withdrawal_requests.count({ where: { status: 'pending' } }),
      dbc.payments.aggregate({
        where: {
          status: { in: ['completed', 'success'] },
          payment_method: { not: 'coins' },
        },
        _sum: { amount_fcfa: true, coins_amount: true },
        _count: true,
      }),
      dbc.app_settings.findFirst({ select: { coin_to_fcfa_rate: true } }),
    ]);
    const rate = Number(rateRow?.coin_to_fcfa_rate) || 10;
    const salesFcfa = Number(sales._sum.amount_fcfa || 0);
    return ok({
      total_users: totalUsers,
      new_users: newUsers,
      active_events: activeEvents,
      total_transactions: totalTransactions,
      pending_withdrawals: pendingWithdrawals,
      // amount_fcfa est la valeur reellement payee. Le repli sur le taux ne sert
      // que si la colonne est absente, pas pour "corriger" un montant nul.
      total_sales_fcfa: salesFcfa || Number(sales._sum.coins_amount || 0) * rate,
      total_sales_coins: Number(sales._sum.coins_amount || 0),
      total_sales_count: sales._count,
      // Detail par canal, pour que le total soit explicable a l'ecran.
      sales_by_method: await dbc.payments.groupBy({
        by: ['payment_method'],
        where: {
          status: { in: ['completed', 'success'] },
          payment_method: { not: 'coins' },
        },
        _sum: { amount_fcfa: true, coins_amount: true },
        _count: true,
      }).then((rows) => rows.map((r) => ({
        payment_method: r.payment_method,
        count: r._count,
        total_fcfa: Number(r._sum.amount_fcfa || 0),
        total_coins: Number(r._sum.coins_amount || 0),
      }))),
    });
  },

  async get_super_admin_country_organizer_stats() {
    const dbc = db();
    const rateRow = await dbc.app_settings.findFirst({ select: { coin_to_fcfa_rate: true } });
    const rate = Number(rateRow?.coin_to_fcfa_rate) || 10;

    const organizers = await dbc.profiles.findMany({
      where: { deleted_at: null, user_type: 'organizer' },
      select: { id: true, full_name: true, email: true, country: true, city: true },
    });
    const ids = organizers.map((o) => o.id);

    const earnings = ids.length
      ? await dbc.organizer_earnings.findMany({
          where: { organizer_id: { in: ids } },
          select: {
            organizer_id: true, earnings_coins: true, earnings_fcfa: true, platform_commission: true, status: true,
            transferred_at: true, paid_at: true, updated_at: true, created_at: true,
          },
        })
      : [];

    // Série 12 mois (CA plateforme/frais)
    const now = new Date();
    const monthKeys = [];
    const monthMap = new Map();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      monthKeys.push(key);
      monthMap.set(key, { month: key, label, platform_ca_fcfa: 0 });
    }
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const byOrg = new Map();
    for (const e of earnings) {
      const st = String(e.status || '').toLowerCase();
      if (st === 'cancelled' || st === 'canceled' || st === 'rejected' || st === 'refunded') continue;
      const oid = e.organizer_id;
      if (!byOrg.has(oid)) byOrg.set(oid, { organizer_earnings_fcfa: 0, platform_ca_fcfa: 0, transactions_count: 0 });
      const agg = byOrg.get(oid);
      const earnFcfa = Number(e.earnings_fcfa || 0) || (Number(e.earnings_coins || 0) * rate);
      const platformFcfa = Number(e.platform_commission || 0) * rate;
      agg.organizer_earnings_fcfa += earnFcfa;
      agg.platform_ca_fcfa += platformFcfa;
      agg.transactions_count += 1;

      const d = new Date(e.transferred_at || e.paid_at || e.updated_at || e.created_at || 0);
      if (d >= firstMonth) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthMap.has(key)) monthMap.get(key).platform_ca_fcfa += platformFcfa;
      }
    }

    const byCountry = new Map();
    for (const o of organizers) {
      const country = String(o.country || '').trim() || 'INCONNUE';
      if (!byCountry.has(country)) {
        byCountry.set(country, { country, organizer_count: 0, total_organizer_earnings_fcfa: 0, total_platform_ca_fcfa: 0, organizers: [] });
      }
      const c = byCountry.get(country);
      const agg = byOrg.get(o.id) || { organizer_earnings_fcfa: 0, platform_ca_fcfa: 0, transactions_count: 0 };
      c.organizer_count += 1;
      c.total_organizer_earnings_fcfa += agg.organizer_earnings_fcfa;
      c.total_platform_ca_fcfa += agg.platform_ca_fcfa;
      c.organizers.push({
        id: o.id,
        full_name: o.full_name || null,
        email: o.email || null,
        country,
        city: o.city || null,
        organizer_earnings_fcfa: Math.round(agg.organizer_earnings_fcfa),
        platform_ca_fcfa: Math.round(agg.platform_ca_fcfa),
        transactions_count: agg.transactions_count,
      });
    }

    const countries = Array.from(byCountry.values())
      .map((c) => ({
        ...c,
        total_organizer_earnings_fcfa: Math.round(c.total_organizer_earnings_fcfa),
        total_platform_ca_fcfa: Math.round(c.total_platform_ca_fcfa),
        organizers: c.organizers.sort((a, b) => (b.platform_ca_fcfa - a.platform_ca_fcfa) || (b.organizer_earnings_fcfa - a.organizer_earnings_fcfa)),
      }))
      .sort((a, b) => (b.total_platform_ca_fcfa - a.total_platform_ca_fcfa) || (b.organizer_count - a.organizer_count) || a.country.localeCompare(b.country));

    const total_general_platform_ca_fcfa = countries.reduce((s, c) => s + Number(c.total_platform_ca_fcfa || 0), 0);
    const monthly_platform_ca = monthKeys.map((k) => {
      const m = monthMap.get(k);
      return { month: m.month, label: m.label, platform_ca_fcfa: Math.round(m.platform_ca_fcfa) };
    });

    return ok({
      countries,
      total_general_platform_ca_fcfa: Math.round(total_general_platform_ca_fcfa),
      monthly_platform_ca,
      generated_at: new Date().toISOString(),
      rate,
    });
  },

  // ---------- Revenus Bruts Plateforme (RBP) ----------
  // Base contractuelle du partage 20 % / 40 % / 40 % (voir
  // docs/contrat-partenariat-strategique-bonplaninfos.md, art. 2.2 a 2.7).
  //
  // RBP = ce que la Plateforme encaisse reellement, JAMAIS les 90 % dus aux
  // organisateurs :
  //   - commissions retenues sur les transactions (organizer_earnings) ;
  //   - packs de credits encaisses (payments) ;
  //   - licences partenaires ;
  //   - publicite / boosts / sponsors payes en argent ;
  //   - abonnements et options payantes ;
  //   - frais de retrait et autres encaissements.
  //
  // Regles de non-double-comptage :
  //   - un paiement lie a un evenement (ticket_payment, stand_rental_payment,
  //     vote_payment, raffle_payment, protected_access_payment) n'entre pas
  //     dans le RBP : seule la commission de l'organisateur est retenue ;
  //   - les depenses en pieces (payment_method='coins') ne sont pas des
  //     encaissements ;
  //   - un boost paye en pieces est deja couvert par l'achat du pack ;
  //   - une commission n'est retenue qu'une fois acquise (transferred, paid,
  //     available, completed). Les commissions encore 'pending' sont exposees
  //     a part, hors total.
  //
  // Le mois civil est celui de la reconnaissance :
  //   - commission : transferred_at, sinon paid_at, sinon created_at ;
  //   - paiement : processed_at, sinon validated_at, sinon created_at ;
  //   - frais de retrait : paid_at, sinon reviewed_at, sinon requested_at.
  async get_super_admin_rbp_stats(args = {}) {
    try {
      const dbc = db();
      const settings = await getAppSettings();
      const rate = Number(settings.rate) || 10;
      const platformFeeRate = Number(settings.platformFeeRate) || 0.05;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const sqlDate = (d) => (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
      const currentMonth = monthKey(now);

      const requested = String(args?.p_month || args?.month || '').trim();
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentMonth;
      const selectedStart = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
      const oldestAllowed = new Date(now.getFullYear(), now.getMonth() - 35, 1);
      const effectiveStart = selectedStart < oldestAllowed ? oldestAllowed : selectedStart;

      // Fenetre de lecture : 12 derniers mois + le mois selectionne s'il est
      // plus ancien (pour que le detail reste disponible).
      const seriesStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const queryStart = effectiveStart < seriesStart ? effectiveStart : seriesStart;
      const queryEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const monthKeys = [];
      const monthMap = new Map();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = monthKey(d);
        monthKeys.push(key);
        monthMap.set(key, {
          month: key,
          label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
          total_rbp_fcfa: 0,
          commissions_fcfa: 0,
          packs_fcfa: 0,
          licences_fcfa: 0,
          publicite_fcfa: 0,
          abonnements_fcfa: 0,
          autres_fcfa: 0,
          pending_commission_fcfa: 0,
        });
      }

      // --- 1. Commissions sur transactions (source : organizer_earnings) ---
      // Le calcul est fait en JS avec les mêmes règles que le CA de zone :
      // platform_commission fait foi ; les lots hérités 'paid' répètent le
      // frais du lot sur chaque ligne et ne doivent être comptés qu'une fois.
      const earningRows = await dbc.$queryRawUnsafe(
        `SELECT oe.id, oe.organizer_id, oe.status,
                COALESCE(oe.transaction_type, '') AS transaction_type,
                COALESCE(oe.earning_type, '') AS earning_type,
                COALESCE(e.event_type, oe.event_type, '') AS event_type,
                oe.earnings_coins, oe.earnings_fcfa,
                oe.platform_commission, oe.platform_fee, oe.fee_percent,
                oe.transferred_at, oe.paid_at, oe.created_at
         FROM organizer_earnings oe
         LEFT JOIN events e ON e.id = oe.event_id
         WHERE oe.status IN ('transferred', 'paid', 'available', 'completed')
           AND COALESCE(oe.transaction_type, '') <> 'promo_commission'
           AND COALESCE(oe.transferred_at, oe.paid_at, oe.created_at) >= ?
           AND COALESCE(oe.transferred_at, oe.paid_at, oe.created_at) < ?`,
        sqlDate(queryStart), sqlDate(queryEnd),
      );

      const commissionBuckets = new Map();
      const addCommission = (monthKeyValue, row, entries, grossFcfa, commissionFcfa) => {
        if (!monthKeyValue) return;
        const key = `${monthKeyValue}|${row.transaction_type || ''}|${row.event_type || ''}`;
        let bucket = commissionBuckets.get(key);
        if (!bucket) {
          bucket = {
            month_key: monthKeyValue,
            transaction_type: row.transaction_type || '',
            event_type: row.event_type || '',
            entries: 0,
            gross_fcfa: 0,
            commission_fcfa: 0,
          };
          commissionBuckets.set(key, bucket);
        }
        bucket.entries += entries;
        bucket.gross_fcfa += grossFcfa;
        bucket.commission_fcfa += commissionFcfa;
      };
      const grossFcfaOf = (row) => {
        const fcfa = Number(row.earnings_fcfa || 0);
        return fcfa > 0 ? fcfa : Number(row.earnings_coins || 0) * rate;
      };

      const paidGroups = new Map();
      for (const row of earningRows) {
        if (String(row.earning_type || '').toLowerCase() === 'promo_commission') continue;
        if (String(row.status) === 'paid') {
          const date = toValidDate(row.paid_at, row.created_at);
          const key = `${row.organizer_id}|${date ? date.getTime() : 'no-date'}`;
          if (!paidGroups.has(key)) paidGroups.set(key, []);
          paidGroups.get(key).push(row);
        } else {
          const date = toValidDate(row.transferred_at, row.paid_at, row.created_at);
          addCommission(
            date ? monthKey(date) : null,
            row,
            1,
            grossFcfaOf(row),
            resolveEarningFeeCoins(row, platformFeeRate) * rate,
          );
        }
      }
      for (const rows of paidGroups.values()) {
        const batchGrossCoins = rows.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
        const batchFeeFcfa = Math.round(resolvePaidBatchFeeCoins(rows, platformFeeRate, rate) * rate);
        const date = toValidDate(rows[0]?.paid_at, rows[0]?.created_at);
        const monthKeyValue = date ? monthKey(date) : null;
        let allocated = 0;
        rows.forEach((row, index) => {
          const share = batchGrossCoins > 0
            ? Number(row.earnings_coins || 0) / batchGrossCoins
            : 1 / rows.length;
          const amount = index === rows.length - 1
            ? batchFeeFcfa - allocated
            : Math.round(batchFeeFcfa * share);
          allocated += amount;
          addCommission(monthKeyValue, row, 1, grossFcfaOf(row), amount);
        });
      }
      const commissionRows = Array.from(commissionBuckets.values());

      // --- 2. Commissions encore en attente de transfert (hors total) ---
      const pendingRows = await dbc.$queryRawUnsafe(
        `SELECT DATE_FORMAT(oe.created_at, '%Y-%m') AS month_key,
                COUNT(*) AS entries,
                COALESCE(SUM(CASE WHEN COALESCE(oe.platform_fee, 0) > 0
                                  THEN oe.platform_fee
                                  ELSE COALESCE(oe.platform_commission, 0) * ? END), 0) AS commission_fcfa
         FROM organizer_earnings oe
         WHERE oe.status = 'pending'
           AND oe.created_at >= ?
           AND oe.created_at < ?
         GROUP BY month_key`,
        rate, sqlDate(queryStart), sqlDate(queryEnd),
      );

      // --- 3. Encaissements reels (source : payments) ---
      const paymentRows = await dbc.$queryRawUnsafe(
        `SELECT DATE_FORMAT(COALESCE(p.processed_at, p.validated_at, p.created_at), '%Y-%m') AS month_key,
                COALESCE(p.pack_id, '') AS pack_id,
                COALESCE(p.payment_method, '') AS payment_method,
                COUNT(*) AS payment_count,
                COALESCE(SUM(p.amount_fcfa), 0) AS amount_fcfa
         FROM payments p
         WHERE p.status IN ('completed', 'success')
           AND COALESCE(p.payment_method, '') <> 'coins'
           AND COALESCE(p.processed_at, p.validated_at, p.created_at) >= ?
           AND COALESCE(p.processed_at, p.validated_at, p.created_at) < ?
         GROUP BY month_key, pack_id, payment_method`,
        sqlDate(queryStart), sqlDate(queryEnd),
      );

      // --- 4. Frais de retrait encaisses (autres revenus numeriques) ---
      const withdrawalFeeRows = await dbc.$queryRawUnsafe(
        `SELECT DATE_FORMAT(COALESCE(w.paid_at, w.reviewed_at, w.requested_at), '%Y-%m') AS month_key,
                COUNT(*) AS entries,
                COALESCE(SUM(w.fees), 0) AS fees_fcfa
         FROM organizer_withdrawal_requests w
         WHERE w.status IN ('approved', 'paid')
           AND COALESCE(w.paid_at, w.reviewed_at, w.requested_at) >= ?
           AND COALESCE(w.paid_at, w.reviewed_at, w.requested_at) < ?
         GROUP BY month_key`,
        sqlDate(queryStart), sqlDate(queryEnd),
      ).catch(() => []);

      const EVENT_PAYMENT_PACKS = new Set([
        'ticket_payment', 'vote_payment', 'stand_rental_payment',
        'raffle_payment', 'protected_access_payment',
      ]);

      const classifyPayment = (packId, paymentMethod) => {
        const p = String(packId || '').toLowerCase();
        const m = String(paymentMethod || '').toLowerCase();
        if (p.startsWith('pack_') || p === 'custom') return 'packs';
        if (p.includes('license') || p.includes('licence')) return 'licences';
        if (p.includes('boost') || p.includes('promo') || p.includes('sponsor') || p.includes('advert') || p === 'ad') return 'publicite';
        if (p.includes('subscr') || p.includes('abonnement') || p.includes('option')) return 'abonnements';
        if (EVENT_PAYMENT_PACKS.has(p) || m === 'moneyfusion_ticket' || p.endsWith('_payment')) return 'evenement';
        // Paiement en argent sans pack_id explicite : achat de credits.
        if (!p) return 'packs';
        return 'autres';
      };

      const classifyEarning = (transactionType, eventType) => {
        const t = String(transactionType || '').toLowerCase();
        const e = String(eventType || '').toLowerCase();
        if (t.includes('raffle') || t.includes('tombola')) return 'tombolas';
        if (t.includes('stand')) return 'stands';
        if (t.includes('vote')) return 'votes';
        if (t.includes('ticket')) return 'billetterie';
        if (t.includes('access') || t.includes('unlock') || t.includes('protected')) return 'acces';
        if (t.includes('promo') || t.includes('coupon') || t.includes('interaction')) return 'promotions';
        if (e.includes('raffle') || e.includes('tombola')) return 'tombolas';
        if (e.includes('stand')) return 'stands';
        if (e.includes('vot')) return 'votes';
        if (e.includes('ticket')) return 'billetterie';
        if (e.includes('protected') || e.includes('access')) return 'acces';
        return 'autres';
      };

      const EVENT_TYPE_LABELS = {
        billetterie: 'Billetterie (tickets)',
        votes: 'Votes',
        stands: 'Location de stands',
        tombolas: 'Tombolas',
        acces: 'Acces aux evenements',
        promotions: 'Promotions / coupons',
        autres: 'Autres transactions',
      };

      const monthly = new Map(monthKeys.map((k) => [k, monthMap.get(k)]));
      const ensureMonth = (key) => {
        if (!monthly.has(key)) {
          const d = new Date(`${key}-01T00:00:00`);
          const entry = {
            month: key,
            label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
            total_rbp_fcfa: 0,
            commissions_fcfa: 0,
            packs_fcfa: 0,
            licences_fcfa: 0,
            publicite_fcfa: 0,
            abonnements_fcfa: 0,
            autres_fcfa: 0,
            pending_commission_fcfa: 0,
          };
          monthly.set(key, entry);
          return entry;
        }
        return monthly.get(key);
      };

      // Detail par type d'evenement : uniquement le mois selectionne.
      const detailByType = new Map();
      let selectedCommissionFcfa = 0;
      let selectedGrossFcfa = 0;
      let selectedCommissionEntries = 0;

      for (const row of commissionRows) {
        const m = String(row.month_key || '');
        const commissionFcfa = Number(row.commission_fcfa || 0);
        const grossFcfa = Number(row.gross_fcfa || 0);
        const entries = Number(row.entries || 0);
        const bucket = ensureMonth(m);
        bucket.commissions_fcfa += commissionFcfa;

        if (m !== month) continue;
        const category = classifyEarning(row.transaction_type, row.event_type);
        if (!detailByType.has(category)) {
          detailByType.set(category, {
            event_type: category,
            label: EVENT_TYPE_LABELS[category] || EVENT_TYPE_LABELS.autres,
            entries: 0,
            gross_fcfa: 0,
            commission_fcfa: 0,
          });
        }
        const d = detailByType.get(category);
        d.entries += entries;
        d.gross_fcfa += grossFcfa;
        d.commission_fcfa += commissionFcfa;
        selectedCommissionFcfa += commissionFcfa;
        selectedGrossFcfa += grossFcfa;
        selectedCommissionEntries += entries;
      }

      for (const row of pendingRows) {
        const bucket = ensureMonth(String(row.month_key || ''));
        bucket.pending_commission_fcfa += Number(row.commission_fcfa || 0);
      }

      let selectedPacks = 0;
      let selectedLicences = 0;
      let selectedPublicite = 0;
      let selectedAbonnements = 0;
      let selectedAutres = 0;

      for (const row of paymentRows) {
        const m = String(row.month_key || '');
        const bucket = ensureMonth(m);
        const category = classifyPayment(row.pack_id, row.payment_method);
        const amount = Number(row.amount_fcfa || 0);
        if (category === 'packs') bucket.packs_fcfa += amount;
        else if (category === 'licences') bucket.licences_fcfa += amount;
        else if (category === 'publicite') bucket.publicite_fcfa += amount;
        else if (category === 'abonnements') bucket.abonnements_fcfa += amount;
        else if (category === 'autres') {
          bucket.autres_fcfa += amount;
          if (m === month) selectedAutres += amount;
        }
        // 'evenement' : volontairement ignore (90 % organisateur + commission deja comptee)
        if (m === month) {
          if (category === 'packs') selectedPacks += amount;
          else if (category === 'licences') selectedLicences += amount;
          else if (category === 'publicite') selectedPublicite += amount;
          else if (category === 'abonnements') selectedAbonnements += amount;
        }
      }

      let selectedWithdrawalFees = 0;
      for (const row of withdrawalFeeRows) {
        const m = String(row.month_key || '');
        const bucket = ensureMonth(m);
        const fees = Number(row.fees_fcfa || 0);
        bucket.autres_fcfa += fees;
        if (m === month) selectedWithdrawalFees += fees;
      }
      selectedAutres += selectedWithdrawalFees;

      for (const bucket of monthly.values()) {
        bucket.total_rbp_fcfa = bucket.commissions_fcfa + bucket.packs_fcfa
          + bucket.licences_fcfa + bucket.publicite_fcfa
          + bucket.abonnements_fcfa + bucket.autres_fcfa;
      }

      const selectedBucket = monthly.get(month) || ensureMonth(month);
      const totalRbp = Number(selectedBucket.total_rbp_fcfa || 0);
      const survivalFund = Math.round(totalRbp * 0.20);
      const distributable = totalRbp - survivalFund;
      const partA = Math.round(distributable / 2);
      const partB = distributable - partA;

      const round = (n) => Math.round(Number(n) || 0);
      const components = [
        {
          key: 'commissions',
          label: 'Commissions sur transactions',
          description: 'Commission retenue sur les transactions (billetterie, votes, stands, tombolas, acces) une fois acquise.',
          amount_fcfa: round(selectedCommissionFcfa),
          source: 'organizer_earnings',
        },
        {
          key: 'packs',
          label: 'Packs de credits',
          description: 'Encaissements reels des achats de packs de pieces (hors depenses en pieces).',
          amount_fcfa: round(selectedPacks),
          source: 'payments',
        },
        {
          key: 'licences',
          label: 'Licences partenaires',
          description: 'Encaissements reels des licences partenaires (pays / ville).',
          amount_fcfa: round(selectedLicences),
          source: 'payments',
        },
        {
          key: 'publicite',
          label: 'Publicite, boosts et sponsors',
          description: 'Encaissements directs en argent. Un boost paye en pieces est deja inclus dans les packs.',
          amount_fcfa: round(selectedPublicite),
          source: 'payments',
        },
        {
          key: 'abonnements',
          label: 'Abonnements et options payantes',
          description: 'Encaissements des abonnements et options numeriques payes en argent.',
          amount_fcfa: round(selectedAbonnements),
          source: 'payments',
        },
        {
          key: 'autres',
          label: 'Autres revenus numeriques',
          description: 'Frais de retrait encaisses et autres paiements numeriques non classes.',
          amount_fcfa: round(selectedAutres),
          source: 'withdrawal_requests / payments',
        },
      ];

      const byEventType = Array.from(detailByType.values())
        .map((d) => ({
          ...d,
          gross_fcfa: round(d.gross_fcfa),
          commission_fcfa: round(d.commission_fcfa),
          share_of_commissions_pct: selectedCommissionFcfa > 0
            ? Math.round((d.commission_fcfa / selectedCommissionFcfa) * 10000) / 100
            : 0,
        }))
        .sort((a, b) => b.commission_fcfa - a.commission_fcfa);

      const monthLabelDate = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
      const monthLabel = monthLabelDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

      return ok({
        month,
        month_label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        current_month: currentMonth,
        total_rbp_fcfa: round(totalRbp),
        distribution: {
          survival_fund_pct: 20,
          survival_fund_fcfa: survivalFund,
          distributable_pct: 80,
          distributable_fcfa: distributable,
          party_a_pct: 40,
          party_a_fcfa: partA,
          party_b_pct: 40,
          party_b_fcfa: partB,
        },
        components,
        by_event_type: byEventType,
        commission_summary: {
          entries: selectedCommissionEntries,
          gross_fcfa: round(selectedGrossFcfa),
          commission_fcfa: round(selectedCommissionFcfa),
          effective_rate_pct: selectedGrossFcfa > 0
            ? Math.round((selectedCommissionFcfa / selectedGrossFcfa) * 10000) / 100
            : 0,
          pending_commission_fcfa: round(selectedBucket.pending_commission_fcfa),
        },
        monthly_series: monthKeys.map((k) => {
          const m = monthly.get(k) || monthMap.get(k);
          return {
            ...m,
            total_rbp_fcfa: round(m.total_rbp_fcfa),
            commissions_fcfa: round(m.commissions_fcfa),
            packs_fcfa: round(m.packs_fcfa),
            licences_fcfa: round(m.licences_fcfa),
            publicite_fcfa: round(m.publicite_fcfa),
            abonnements_fcfa: round(m.abonnements_fcfa),
            autres_fcfa: round(m.autres_fcfa),
            pending_commission_fcfa: round(m.pending_commission_fcfa),
          };
        }),
        total_series_fcfa: round(monthKeys.reduce((s, k) => s + Number((monthly.get(k) || {}).total_rbp_fcfa || 0), 0)),
        rate,
        generated_at: new Date().toISOString(),
        method: {
          currency: 'FCFA',
          recognition: 'Commission a la date de transfert (ou de paiement), sinon a la date de la transaction. Paiements a la date de traitement.',
          exclusion: 'Les 90 % dus aux organisateurs, les depenses en pieces et les paiements en attente/annules ne sont pas comptes.',
        },
      });
    } catch (e) {
      console.error('[RBP] calcul impossible:', e?.message || e);
      return fail(`Calcul des revenus RBP impossible : ${e?.message || e}`, 'RBP_STATS_ERROR');
    }
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

  async conduct_raffle_draw(args, actor) {
    const { p_raffle_event_id } = args || {};
    if (!p_raffle_event_id) return fail('Identifiant de tombola requis', 'RAFFLE_ID_MISSING');
    if (!actor || actor.source === 'internal') return fail('Authentification requise', 'FORBIDDEN');
    const dbc = db();
    const raffle = await dbc.raffle_events.findUnique({ where: { id: p_raffle_event_id } });
    if (!raffle) return fail('Tombola introuvable', 'RAFFLE_NOT_FOUND');
    // Seul l'organisateur (ou l'administration) peut lancer le tirage.
    if (actor.source === 'user' && !ADMIN_ROLES.includes(actor.user_type)) {
      if (raffle.organizer_id !== actor.id) return fail("Vous n'êtes pas l'organisateur de cette tombola", 'FORBIDDEN');
    }
    if (raffle.is_draw_conducted) {
      return ok({ success: true, message: 'Le tirage a déjà été effectué.', already_drawn: true });
    }
    const tickets = await dbc.raffle_tickets.findMany({
      where: { raffle_event_id: p_raffle_event_id },
      orderBy: { id: 'asc' },
    });
    if (!tickets.length) return fail('Aucun ticket vendu, impossible de tirer au sort', 'RAFFLE_NO_TICKETS');
    const minRequired = Number(raffle.min_tickets_required || 0);
    if (minRequired > 0 && tickets.length < minRequired) {
      return fail(`Tickets insuffisants (minimum requis: ${minRequired}, vendus: ${tickets.length})`, 'RAFFLE_MIN_NOT_MET');
    }
    let prizeList = await dbc.raffle_prizes.findMany({
      where: { raffle_event_id: p_raffle_event_id },
      orderBy: { rank: 'asc' },
    });
    if (!prizeList.length && raffle.event_id) {
      prizeList = await dbc.raffle_prizes.findMany({
        where: { event_id: raffle.event_id },
        orderBy: { rank: 'asc' },
      });
    }
    if (!prizeList.length) {
      prizeList = [{ rank: 1, description: 'Gagnant du tirage', value_fcfa: null }];
    }
    // Tirage sans remise : un ticket par lot, et si possible un gagnant différent par lot.
    const pool = [...tickets];
    const usedUserIds = new Set();
    const winners = [];
    for (const prize of prizeList) {
      if (!pool.length) break;
      let pickIdx = -1;
      for (let i = 0; i < pool.length; i++) {
        if (!usedUserIds.has(pool[i].user_id)) { pickIdx = i; break; }
      }
      if (pickIdx === -1) pickIdx = Math.floor(Math.random() * pool.length);
      const ticket = pool.splice(pickIdx, 1)[0];
      usedUserIds.add(ticket.user_id);
      winners.push({ rank: Number(prize.rank || 1), prize, ticket });
    }
    const now = new Date();
    await dbc.$transaction(async (tx) => {
      for (const w of winners) {
        await tx.raffle_tickets.update({
          where: { id: w.ticket.id },
          data: { rank: w.rank, updated_at: now },
        });
        await tx.raffle_winners.create({
          data: {
            id: uuidv4(),
            raffle_event_id: p_raffle_event_id,
            user_id: w.ticket.user_id,
            ticket_number: String(w.ticket.ticket_number),
            prize_description: w.prize.description || null,
            prize_value_fcfa: w.prize.value_fcfa ?? null,
            prize_value_pi: w.prize.value_fcfa != null ? Math.round(Number(w.prize.value_fcfa) / 10) : null,
            rank: w.rank,
            delivery_status: 'pending',
            created_at: now,
          },
        });
      }
      await tx.raffle_events.update({
        where: { id: p_raffle_event_id },
        data: {
          is_drawn: true,
          is_draw_conducted: true,
          draw_conducted_at: now,
          winning_ticket_number: String(winners[0]?.ticket.ticket_number ?? ''),
          winner_user_id: winners[0]?.ticket.user_id ?? null,
          winner_announced_at: now,
        },
      });
      await tx.raffle_draw_history.create({
        data: {
          id: uuidv4(),
          raffle_event_id: p_raffle_event_id,
          draw_type: 'live',
          participants_count: tickets.length,
          tickets_sold: tickets.length,
          winner_user_id: winners[0]?.ticket.user_id ?? null,
          winning_ticket_number: winners[0] ? String(winners[0].ticket.ticket_number) : null,
          draw_date: now,
          created_at: now,
        },
      });
      const session = await tx.raffle_draw_sessions.create({
        data: {
          id: uuidv4(),
          raffle_event_id: p_raffle_event_id,
          displayed_number: winners[0]?.ticket.ticket_number ?? null,
          started_at: now,
          started_by: actor.id,
          status: 'completed',
          step: 'done',
        },
      });
      const existingStatus = await tx.raffle_draw_status.findFirst({
        where: { raffle_event_id: p_raffle_event_id },
      });
      if (existingStatus) {
        await tx.raffle_draw_status.update({
          where: { id: existingStatus.id },
          data: {
            draw_session_id: session.id,
            status: 'completed',
            displayed_number: winners[0]?.ticket.ticket_number ?? null,
            broadcast_at: now,
            is_active: false,
            updated_at: now,
          },
        });
      } else {
        await tx.raffle_draw_status.create({
          data: {
            id: uuidv4(),
            raffle_event_id: p_raffle_event_id,
            draw_session_id: session.id,
            status: 'completed',
            round_number: 1,
            displayed_number: winners[0]?.ticket.ticket_number ?? null,
            broadcast_at: now,
            is_active: false,
            started_at: now,
            created_at: now,
            updated_at: now,
          },
        });
      }
    });
    return ok({
      success: true,
      message: 'Tirage terminé',
      winners: winners.map((w) => ({
        rank: w.rank,
        ticket_number: w.ticket.ticket_number,
        user_id: w.ticket.user_id,
        prize: w.prize.description || null,
      })),
    });
  },

  // Parrainage par code coupon (2% sur un achat déjà validé). Enregistre
  // l'usage, met à jour les compteurs du coupon et crédite la commission au
  // propriétaire (en pièces : 10 FCFA = 1 pièce). Idempotent par transaction.
  async credit_coupon_earnings(args) {
    const { p_coupon_code, p_buyer_user_id, p_amount_fcfa, p_transaction_id } = args || {};
    if (!p_coupon_code) return fail('Code coupon requis', 'COUPON_CODE_MISSING');
    if (!p_buyer_user_id) return fail('Acheteur requis', 'BUYER_MISSING');
    const dbc = db();
    const coupon = await dbc.coupons.findUnique({ where: { code: String(p_coupon_code) } });
    if (!coupon) return fail('Coupon introuvable', 'COUPON_NOT_FOUND');
    if (coupon.active === false) return fail('Coupon désactivé', 'COUPON_INACTIVE');
    if (coupon.user_id === p_buyer_user_id) return fail('Un utilisateur ne peut pas utiliser son propre coupon', 'COUPON_SELF_USE');
    if (p_transaction_id) {
      const already = await dbc.coupon_usages.findFirst({
        where: { coupon_code: String(p_coupon_code), transaction_id: String(p_transaction_id) },
        select: { id: true },
      });
      if (already) return ok({ success: true, message: 'Commission déjà enregistrée', already_recorded: true });
    }
    const amountFcfa = Math.max(0, Number(p_amount_fcfa) || 0);
    const commission = Math.floor(amountFcfa * 0.02);
    const commissionCoins = Math.floor(commission / 10);
    const now = new Date();
    await dbc.$transaction(async (tx) => {
      await tx.coupon_usages.create({
        data: {
          id: uuidv4(),
          coupon_code: String(p_coupon_code),
          user_id: p_buyer_user_id,
          transaction_id: p_transaction_id ? String(p_transaction_id) : null,
          amount: amountFcfa,
          commission,
          created_at: now,
        },
      });
      await tx.coupons.update({
        where: { code: String(p_coupon_code) },
        data: {
          usage_count: { increment: 1 },
          total_amount: { increment: amountFcfa },
          commission_earned: { increment: commission },
          last_used_at: now,
        },
      });
      if (commissionCoins > 0) {
        const ownerProfile = await tx.profiles.findUnique({ where: { id: coupon.user_id }, select: { coin_balance: true } });
        await tx.profiles.update({
          where: { id: coupon.user_id },
          data: { coin_balance: (ownerProfile?.coin_balance || 0) + commissionCoins, updated_at: now },
        });
        await tx.transactions.create({
          data: {
            user_id: coupon.user_id,
            transaction_type: 'coupon_commission',
            amount_pi: commissionCoins,
            amount_fcfa: commission,
            description: `Commission de parrainage coupon ${p_coupon_code} (2%)`,
            status: 'completed',
            transaction_reference: p_transaction_id ? String(p_transaction_id) : null,
            created_at: now,
            completed_at: now,
            payment_method: 'system',
          },
        });
      }
    });
    return ok({ success: true, message: 'Coupon enregistré', commission, commission_coins: commissionCoins, coupon_owner_id: coupon.user_id });
  },

  // Crédite une commission à un influenceur, après paiement validé. Opération
  // de porte-monnaie : réservée à l'administration (rôle ADMIN dans
  // rpcPolicy.mjs), jamais à un navigateur lambda. Idempotente par paiement.
  async add_commission_to_user(args) {
    const { p_user_id, p_amount_fcfa, p_payment_id, p_commission_coins } = args || {};
    if (!p_user_id) return fail('p_user_id requis', 'USER_MISSING');
    const dbc = db();
    const profile = await dbc.profiles.findUnique({ where: { id: p_user_id } });
    if (!profile) return fail('Utilisateur introuvable', 'USER_NOT_FOUND');
    const coins = Math.max(0, Number(p_commission_coins) || 0);
    const fcfa = Math.max(0, Number(p_amount_fcfa) || 0);
    if (coins <= 0 && fcfa <= 0) return fail('Montant de commission invalide', 'INVALID_AMOUNT');
    if (p_payment_id) {
      const existing = await dbc.transactions.findFirst({
        where: { user_id: p_user_id, transaction_type: 'commission_credit', transaction_reference: String(p_payment_id) },
        select: { id: true },
      });
      if (existing) return ok({ success: true, message: 'Commission déjà créditée', already_credited: true });
    }
    const now = new Date();
    await dbc.$transaction(async (tx) => {
      await tx.profiles.update({
        where: { id: p_user_id },
        data: { coin_balance: (profile.coin_balance || 0) + coins, updated_at: now },
      });
      await tx.transactions.create({
        data: {
          user_id: p_user_id,
          transaction_type: 'commission_credit',
          amount_pi: coins,
          amount_fcfa: fcfa,
          description: `Commission de parrainage (${fcfa} FCFA)`,
          status: 'completed',
          transaction_reference: p_payment_id ? String(p_payment_id) : null,
          created_at: now,
          completed_at: now,
          payment_method: 'system',
        },
      });
    });
    return ok({ success: true, coin_balance: (profile.coin_balance || 0) + coins, commission_coins: coins });
  },

  // Journal d'usage d'un code promo (ligne promo_code_usages, idempotente par
  // transaction). La remise, la limite d'usage et la commission influenceur
  // sont déjà gérées côté serveur dans purchase_tickets_v2 : ce RPC ne fait
  // qu'enregistrer l'usage pour les statistiques (getCodeStats).
  async process_promo_usage(args) {
    const { p_code_id, p_user_id, p_discount, p_commission, p_purchase, p_transaction_id } = args || {};
    if (!p_code_id || !p_user_id) return fail('code promo et utilisateur requis', 'PROMO_ARGS_MISSING');
    const dbc = db();
    const promo = await dbc.promo_codes.findUnique({ where: { id: p_code_id } });
    if (!promo) return fail('Code promo introuvable', 'PROMO_NOT_FOUND');
    if (promo.is_active === false) return fail('Code promo désactivé', 'PROMO_INACTIVE');
    if (p_transaction_id) {
      const already = await dbc.promo_code_usages.findFirst({
        where: { promo_code_id: p_code_id, transaction_id: String(p_transaction_id) },
        select: { id: true },
      });
      if (already) return ok({ success: true, message: 'Usage déjà enregistré', already_recorded: true });
    }
    const res = await recordPromoUsageOnce({
      promoCodeId: p_code_id,
      userId: p_user_id,
      discountCoins: p_discount,
      commissionCoins: p_commission,
      purchaseCoins: p_purchase,
      transactionRef: p_transaction_id,
    });
    return ok({ success: true, message: 'Usage enregistré', usage_id: res.usage_id });
  },
};

// RPC qui ne peuvent pas être portés fidèlement sans son schéma : réponse
// explicite plutôt que faux.
const NOT_IMPLEMENTED = {
  process_moneyfusion_success: 'paiements',
  submit_partner_verification: 'partenaires',
  get_admin_salary_stats_full: 'salaires',
};

// RPC atteignables sans session. Les deux sont sur des pages publiques :
//   - track_event_view        : compteur de vues d'un événement (EventDetailPage)
//   - validate_promo_code_simple : validation d'un code promo avant achat
// Elles ne doivent ni lire ni écrire de donnée personnelle. Tout le reste exige
// un jeton utilisateur ou la clé interne des fonctions.
const PUBLIC_RPCS = new Set(['track_event_view', 'validate_promo_code_simple']);

r.post('/', requireActorUnless(PUBLIC_RPCS), async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name;
    const args = body.args || body.params || {};
    if (!name) return res.status(400).json(fail('Nom de RPC requis', 'RPC_NAME_MISSING'));
    // Autorisation : appliquée avant le dispatch, sur l'identité vérifiée du
    // jeton (req.actor), jamais sur un identifiant fourni par l'appelant.
    const decision = await checkPolicy(name, args, req.actor);
    if (!decision.ok) return res.status(decision.status).json(decision.body);
    if (HANDLERS[name]) {
      const result = await HANDLERS[name](decision.args, req.actor);
      // Confirmation push (billet, stand, vote...) sans bloquer la reponse.
      afterRpc(name, decision.args, req.actor, result).catch((e) =>
        console.error('[push] afterRpc', e?.message?.split('\n')[0]),
      );
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
