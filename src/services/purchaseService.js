import { supabase } from '@/lib/customSupabaseClient';
import { v4 as uuidv4 } from 'uuid';

// Bornes d'un achat personnalisé de pièces. Elles doivent rester synchrones avec
// la validation serveur (initiateCustomCoins) ET avec l'affichage de CoinPacksPage :
// avant, le client acceptait 1 FCFA alors que le serveur refusait sous 500 FCFA.
export const CUSTOM_PURCHASE_MIN_FCFA = 500;
export const CUSTOM_PURCHASE_MAX_FCFA = 400000;
// Base de conversion : 1 pièce = 10 FCFA (sert de dénominateur aux bonus).
export const COINS_PER_FCFA_DIVISOR = 10;

export class PurchaseService {

  static async getCoinPacks() {
    const { data, error } = await supabase
      .from('coin_packs')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return data.map(pack => ({
      ...pack,
      total_coins: (pack.coin_amount || 0) + (pack.bonus_coins || 0),
      price_per_coin: ((pack.coin_amount || 0) + (pack.bonus_coins || 0) > 0)
        ? Number((pack.fcfa_price / ((pack.coin_amount || 0) + (pack.bonus_coins || 0))).toFixed(2))
        : 0,
      type: 'coin_pack'
    }));
  }

  static async getLicensePacks() {
    const { data, error } = await supabase
      .from('partner_license_packs')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return data.map(license => ({
      ...license,
      type: 'partner_license',
      duration_months: Math.floor(license.duration_days / 30),
      benefits: license.benefits ? (typeof license.benefits === 'string' ? JSON.parse(license.benefits) : license.benefits) : []
    }));
  }

  static async getUserLicenses(userId) {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('user_partner_licenses')
      .select(`
        *,
        partner_license_packs (
          id,
          name,
          description,
          slug,
          revenue_share_percent,
          benefits,
          coverage_type
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('purchase_date', { ascending: false });

    if (error) {
      console.error("Erreur lors de la récupération des licences utilisateur", error);
      throw error;
    }

    return data.map(license => ({
      ...license,
      partner_license_packs: {
        ...license.partner_license_packs,
        benefits: license.partner_license_packs?.benefits ? (typeof license.partner_license_packs.benefits === 'string' ? JSON.parse(license.partner_license_packs.benefits) : license.partner_license_packs.benefits) : []
      },
      days_remaining: Math.ceil((new Date(license.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
    }));
  }

  // ... (rest of the service methods remain unchanged but included for completeness if needed, assuming they are stable)
  // Including initiatePurchase for context
  static async initiatePurchase(userId, purchaseData) {
    const { type } = purchaseData;
    if (type === 'coin_pack') {
      return await this.initiateCoinPack(userId, purchaseData);
    } else if (type === 'custom_coins') {
      return await this.initiateCustomCoins(userId, purchaseData);
    } else if (type === 'partner_license') {
      return await this.initiatePartnerLicense(userId, purchaseData);
    } else {
      throw new Error('Type d\'achat non supporté');
    }
  }

  static async initiateCoinPack(userId, { pack_id }) {
    const { data: pack, error: packError } = await supabase
      .from('coin_packs')
      .select('*')
      .eq('id', pack_id)
      .eq('is_active', true)
      .eq('is_custom', false)
      .single();

    if (packError || !pack) throw new Error('Ce pack de pièces n\'est pas disponible pour le moment.');

    const transactionId = `BPI-COIN-${pack_id}-${uuidv4().substring(0, 8)}`;
    const totalCoins = pack.coin_amount + (pack.bonus_coins || 0);

    const { error: transactionError } = await supabase
      .from('user_coin_transactions')
      .insert({
        user_id: userId,
        transaction_id: transactionId,
        amount_fcfa: pack.fcfa_price,
        coin_amount: pack.coin_amount,
        bonus_coins: pack.bonus_coins || 0,
        total_coins: totalCoins,
        pack_id: pack_id,
        transaction_type: 'coin_pack',
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (transactionError) throw new Error("Erreur lors de la création de la transaction: " + transactionError.message);

    return {
      success: true,
      transaction_id: transactionId,
      redirect_url: this.generateRedirectUrl(transactionId, pack.fcfa_price, 'coin_pack', pack.id),
      amount: pack.fcfa_price,
      product_name: pack.name
    };
  }

  static async initiateCustomCoins(userId, { amount_fcfa }) {
    if (amount_fcfa < CUSTOM_PURCHASE_MIN_FCFA) throw new Error(`Le montant minimum pour un achat personnalisé est de ${CUSTOM_PURCHASE_MIN_FCFA} FCFA.`);
    if (amount_fcfa > CUSTOM_PURCHASE_MAX_FCFA) throw new Error(`Le montant maximum pour un achat personnalisé est de ${CUSTOM_PURCHASE_MAX_FCFA.toLocaleString('fr-FR')} FCFA.`);

    const baseCoins = Math.floor(amount_fcfa / COINS_PER_FCFA_DIVISOR);
    const bonusCoins = this.calculateCustomBonus(amount_fcfa);
    const totalCoins = baseCoins + bonusCoins;
    const transactionId = `BPI-CUSTOM-${uuidv4().substring(0, 8)}`;

    const { error } = await supabase
      .from('user_coin_transactions')
      .insert({
        user_id: userId,
        transaction_id: transactionId,
        amount_fcfa: amount_fcfa,
        coin_amount: baseCoins,
        bonus_coins: bonusCoins,
        total_coins: totalCoins,
        transaction_type: 'custom_coins',
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (error) throw new Error("Erreur lors de la création de la transaction personnalisée: " + error.message);

    return {
      success: true,
      transaction_id: transactionId,
      redirect_url: this.generateRedirectUrl(transactionId, amount_fcfa, 'custom_coins'),
      amount: amount_fcfa,
      product_name: `${totalCoins} pièces personnalisées`
    };
  }

  static async initiatePartnerLicense(userId, { license_pack_id }) {
    const { data: license, error: licenseError } = await supabase
      .from('partner_license_packs')
      .select('*')
      .eq('id', license_pack_id)
      .eq('is_active', true)
      .single();

    if (licenseError || !license) throw new Error('Cette licence de partenariat n\'est pas disponible.');

    const transactionId = `BPI-LIC-${license_pack_id}-${uuidv4().substring(0, 8)}`;

    const { error: transactionError } = await supabase
      .from('user_coin_transactions')
      .insert({
        user_id: userId,
        transaction_id: transactionId,
        amount_fcfa: license.fcfa_price,
        license_pack_id: license_pack_id,
        transaction_type: 'partner_license',
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (transactionError) throw new Error("Erreur lors de la création de la transaction de licence: " + transactionError.message);

    return {
      success: true,
      transaction_id: transactionId,
      redirect_url: this.generateRedirectUrl(transactionId, license.fcfa_price, 'partner_license', license_pack_id),
      amount: license.fcfa_price,
      product_name: license.name,
      duration_days: license.duration_days
    };
  }

  static calculateCustomBonus(amountFcfa) {
    if (amountFcfa >= 200000) return Math.floor(amountFcfa / 10 * 0.08);
    if (amountFcfa >= 100000) return Math.floor(amountFcfa / 10 * 0.06);
    if (amountFcfa >= 50000) return Math.floor(amountFcfa / 10 * 0.05);
    if (amountFcfa >= 20000) return Math.floor(amountFcfa / 10 * 0.03);
    if (amountFcfa >= 10000) return Math.floor(amountFcfa / 10 * 0.02);
    if (amountFcfa >= 5000) return Math.floor(amountFcfa / 10 * 0.01);
    return 0;
  }

  static generateRedirectUrl(transactionId, amountFcfa, productType, packId = null) {
    const params = new URLSearchParams({
      transaction_id: transactionId,
      amount: amountFcfa,
      type: productType
    });
    if (packId) {
      params.append('pack_id', packId);
    }
    return `/payment/checkout?${params.toString()}`;
  }
}