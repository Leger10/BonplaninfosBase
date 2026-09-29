// src/services/CoinService.js
import { supabase } from '@/lib/customSupabaseClient';
import { retrySupabaseRequest } from '@/lib/supabaseHelper';

// Configuration MoneyFusion
const MONEYFUSION_API_BASE = 'https://www.pay.moneyfusion.net';
const MONEYFUSION_API_URL = `${MONEYFUSION_API_BASE}/api/payment`;

export class CoinService {
  static COIN_RATE = 10;

  // ==================== MONEYFUSION METHODS ====================

  /**
   * Générer un ID de transaction unique
   * @returns {string}
   */
  static generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Créer une demande de paiement MoneyFusion
   * @returns {Promise<{success: boolean, redirect_url: string, token: string}>}
   */
  static async createMoneyFusionPayment({
    amountFcfa,
    userId,
    packId,
    transactionId,
    couponCode,
    returnUrl,
    webhookUrl,
    phoneNumber,
    customerName = 'Client'
  }) {
    try {
      const response = await fetch('/.netlify/functions/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalPrice: amountFcfa,
          article: [{ [packId || 'custom']: amountFcfa }],
          personal_Info: [{ 
            userId, 
            orderId: transactionId,
            couponCode,
            amountFcfa,
            paymentId: null
          }],
          numeroSend: phoneNumber,
          nomclient: customerName,
          return_url: returnUrl,
          webhook_url: webhookUrl
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Erreur création paiement');
      }
      
      return {
        success: true,
        redirect_url: result.redirect_url,
        token: result.token
      };
    } catch (error) {
      console.error('[CoinService.createMoneyFusionPayment] Error:', error);
      throw error;
    }
  }

  /**
   * Vérifier le statut d'un paiement via l'API MoneyFusion
   * @param {string} token - Token de paiement
   * @returns {Promise<Object>}
   */
  static async checkMoneyFusionPaymentStatus(token) {
    try {
      const response = await fetch(`${MONEYFUSION_API_BASE}/paiementNotif/${token}`);
      const data = await response.json();
      
      if (!data.statut) {
        throw new Error(data.message || 'Erreur lors de la vérification');
      }
      
      return {
        success: true,
        status: data.data?.statut,
        transaction: data.data,
        token: token
      };
    } catch (error) {
      console.error('[CoinService.checkMoneyFusionPaymentStatus] Error:', error);
      return {
        success: false,
        error: error.message,
        token: token
      };
    }
  }

  /**
   * Vérifier si un paiement MoneyFusion est réussi
   * @param {string} token - Token de paiement
   * @returns {Promise<boolean>}
   */
  static async isMoneyFusionPaymentSuccessful(token) {
    const result = await this.checkMoneyFusionPaymentStatus(token);
    return result.success && result.status === 'paid';
  }

  /**
   * Attendre la confirmation d'un paiement (polling)
   * @param {string} token - Token de paiement
   * @param {number} maxAttempts - Nombre maximum de tentatives
   * @param {number} interval - Intervalle entre les tentatives (ms)
   * @returns {Promise<Object>}
   */
  static async waitForMoneyFusionConfirmation(token, maxAttempts = 30, interval = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await this.checkMoneyFusionPaymentStatus(token);
        
        if (result.success && result.status === 'paid') {
          return { 
            success: true, 
            transaction: result.transaction,
            attempts: i + 1
          };
        }
        
        if (result.success && (result.status === 'failure' || result.status === 'no paid')) {
          return { 
            success: false, 
            error: `Payment ${result.status}`,
            attempts: i + 1
          };
        }
        
        // Attendre avant la prochaine tentative
        await new Promise(resolve => setTimeout(resolve, interval));
        
      } catch (error) {
        console.error(`[CoinService] Tentative ${i + 1} échouée:`, error);
      }
    }
    
    return { 
      success: false, 
      error: 'Timeout waiting for payment confirmation',
      attempts: maxAttempts
    };
  }

  // ==================== COIN METHODS ====================

  static async initializeRate() {
    try {
      const { data, error } = await retrySupabaseRequest(() => 
        supabase
          .from('app_settings')
          .select('coin_to_fcfa_rate')
          .maybeSingle()
      );

      if (error) {
        console.warn("⚠️ Erreur chargement taux:", error);
        this.COIN_RATE = 10;
        return;
      }

      if (data && data.coin_to_fcfa_rate !== undefined && data.coin_to_fcfa_rate !== null) {
        this.COIN_RATE = parseFloat(data.coin_to_fcfa_rate);
        console.log(`💰 Taux de conversion chargé: 1 crédit = ${this.COIN_RATE} FCFA`);
      } else {
        this.COIN_RATE = 10;
        console.log("💰 Taux de conversion par défaut: 1 crédit = 10 FCFA");
      }
    } catch (error) {
      console.warn("❌ Failed to initialize coin rate:", error);
      this.COIN_RATE = 10;
    }
  }

  static convertFcfaToCoins(fcfa) {
    return Math.max(1, Math.ceil(fcfa / this.COIN_RATE));
  }

  static convertCoinsToFcfa(coins) {
    return coins * this.COIN_RATE;
  }

  static async getWalletBalances(userId) {
    try {
      const { data, error } = await retrySupabaseRequest(() => supabase
        .from('profiles')
        .select('coin_balance, free_coin_balance')
        .eq('id', userId)
        .maybeSingle());
      
      if (error && error.code !== 'PGRST116') {
        console.error('Erreur récupération solde', error);
        return { coin_balance: 0, free_coin_balance: 0, total: 0 };
      }
      
      const paid = data?.coin_balance || 0;
      const free = data?.free_coin_balance || 0;
      return {
        coin_balance: paid,
        free_coin_balance: free,
        total: paid + free
      };
    } catch (error) {
      console.error('Exception getting wallet balances:', error);
      return { coin_balance: 0, free_coin_balance: 0, total: 0 };
    }
  }

  static async getUserBalance(userId) {
    const balances = await this.getWalletBalances(userId);
    return balances.total;
  }

  static async debitCoins(userId, amount, description, metadata = {}, referenceType = null) {
    const balances = await this.getWalletBalances(userId);
    if (balances.total < amount) {
      throw new Error("Solde insuffisant");
    }

    // Le débit passe par spend_user_coins : c'est le serveur qui vérifie le
    // solde, l'écrit et journalise. Le navigateur ne touche plus jamais au
    // solde ni au journal — l'ancien repli manuel (profiles.coin_balance et
    // coin_transactions écrits depuis le client) a été supprimé : il rendait
    // falsifiable la dépense et masquait les refus du serveur.
    const { data, error } = await retrySupabaseRequest(() => supabase.rpc('spend_user_coins', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: description,
      p_reference_type: referenceType,
      p_reference_id: typeof metadata === 'string' ? metadata : metadata?.reference_id || null,
    }));

    if (error) throw new Error(error.message || 'Débit impossible');
    if (!data?.success) throw new Error(data?.message || 'Débit refusé');

    return true;
  }

  static async addCredits(userId, amountFcfa, transactionId, couponCode = null) {
    try {
      console.log(`[CoinService.addCredits] Adding credits for user ${userId}, amount ${amountFcfa}, txn ${transactionId}, coupon ${couponCode}`);
      
      const { data, error } = await supabase.rpc('process_moneyfusion_success', {
        p_user_id: userId,
        p_transaction_id: transactionId,
        p_amount: amountFcfa,
        p_status: 'success',
        p_coupon_code: couponCode
      });
      
      if (error) {
        console.error("[CoinService.addCredits] RPC Error:", error);
        throw error;
      }
      
      console.log(`[CoinService.addCredits] Success:`, data);
      return data;
    } catch (error) {
      console.error("[CoinService.addCredits] Exception:", error);
      throw error;
    }
  }

  /**
   * Méthode principale pour gérer une action nécessitant des crédits.
   * Si l'utilisateur a assez de crédits, exécute onSuccess().
   * Sinon, lance le processus d'achat via MoneyFusion.
   */
  static async handleAction({ 
    userId, 
    requiredCoins, 
    onSuccess, 
    onInsufficientBalance, 
    phoneNumber,
    customerName = 'Client',
    ...paymentData 
  }) {
    const balance = await this.getUserBalance(userId);
    const hasBalance = balance >= requiredCoins;

    if (hasBalance) {
      await onSuccess();
      return { success: true, action: 'debited' };
    }
    
    if (onInsufficientBalance) {
      onInsufficientBalance();
      return { success: false, action: 'insufficient' };
    }
    
    // Créer un nouveau paiement MoneyFusion
    const transactionId = this.generateTransactionId();
    
    // Enregistrer la transaction pending
    const { error: insertError } = await supabase.from('payments').insert({
      user_id: userId,
      coins_amount: paymentData.coinsAmount,
      amount_fcfa: paymentData.amountFcfa,
      status: 'pending',
      payment_method: 'moneyfusion',
      transaction_id: transactionId,
      pack_id: paymentData.packId,
      coupon_code: paymentData.couponCode || null
    });

    if (insertError) {
      console.error('Erreur insertion paiement:', insertError);
      throw new Error('Erreur lors de la création du paiement');
    }

    const returnUrl = `${window.location.origin}/payment-success?transaction_id=${transactionId}&amount=${paymentData.amountFcfa}&status=success`;
    const webhookUrl = `${window.location.origin}/.netlify/functions/moneyfusion-webhook`;

    const payment = await this.createMoneyFusionPayment({
      amountFcfa: paymentData.amountFcfa,
      userId,
      packId: paymentData.packId,
      transactionId,
      couponCode: paymentData.couponCode,
      returnUrl,
      webhookUrl,
      phoneNumber,
      customerName
    });

    if (payment.success) {
      window.location.href = payment.redirect_url;
      return { success: true, action: 'redirect', redirect_url: payment.redirect_url };
    }
    
    throw new Error('Erreur lors de la création du paiement');
  }
}

// Initialiser le taux de conversion au chargement
CoinService.initializeRate().catch(err => console.warn("Failed to init coin rate:", err));

export default CoinService;