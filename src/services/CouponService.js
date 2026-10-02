import { supabase } from '@/lib/customSupabaseClient';
import { retrySupabaseRequest } from '@/lib/supabaseHelper';

export class CouponService {
  static generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  static async createCoupon(userId) {
    try {
      let code = this.generateCode();
      let existing = true;
      while (existing) {
        const { data } = await supabase
          .from('coupons')
          .select('code')
          .eq('code', code)
          .maybeSingle();
        if (!data) existing = false;
        else code = this.generateCode();
      }

      const { data, error } = await retrySupabaseRequest(() =>
        supabase.from('coupons').insert({
          code,
          user_id: userId,
          active: true,
          usage_count: 0,
          total_amount: 0,
          commission_earned: 0,
          last_used_at: null
        }).select().single()
      );

      if (error) throw error;
      return { code: data.code, error: null };
    } catch (error) {
      console.error('[CouponService] createCoupon error:', error);
      return { code: null, error };
    }
  }

  static async getUserCoupons(userId) {
    try {
      const { data, error } = await retrySupabaseRequest(() =>
        supabase
          .from('coupons')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[CouponService] getUserCoupons error:', error);
      return { data: null, error };
    }
  }

  static async validateCoupon(code) {
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('code, active, user_id')
        .eq('code', code)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { valid: false, coupon: null, error: 'Code invalide' };
      if (!data.active) return { valid: false, coupon: null, error: 'Code désactivé' };
      return { valid: true, coupon: data, error: null };
    } catch (error) {
      console.error('[CouponService] validateCoupon error:', error);
      return { valid: false, coupon: null, error: error.message };
    }
  }

  /**
   * ⚠️ DEPRECATED: Cette méthode ne doit plus être utilisée directement.
   * Elle crédite la commission immédiatement, ce qui n'est pas le comportement souhaité.
   * Utilisez plutôt registerCouponUsage() + finalizeCouponUsage()
   */
  static async useCoupon(couponCode, buyerUserId, amountFcfa, transactionId = null) {
    console.warn('[CouponService] useCoupon is deprecated. Use registerCouponUsage + finalizeCouponUsage instead.');
    
    try {
      const { data, error } = await supabase.rpc('credit_coupon_earnings', {
        p_coupon_code: couponCode,
        p_buyer_user_id: buyerUserId,
        p_amount_fcfa: amountFcfa,
        p_transaction_id: transactionId
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return { success: true, data: data.data };
    } catch (error) {
      console.error('[CouponService] useCoupon error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enregistre l'intention d'utiliser un coupon (sans créditer la commission)
   * @param {string} couponCode - Code du coupon
   * @param {string} buyerUserId - ID de l'acheteur
   * @param {number} amountFcfa - Montant de la transaction en FCFA
   * @param {string} paymentId - ID du paiement associé
   * @returns {Promise<{success: boolean, usageId?: string, error?: string}>}
   */
  static async registerCouponUsage(couponCode, buyerUserId, amountFcfa, paymentId) {
    try {
      // Vérifier d'abord que le coupon est valide et actif
      const { valid, coupon, error: validateError } = await this.validateCoupon(couponCode);
      if (!valid) {
        return { success: false, error: validateError || 'Code invalide' };
      }

      // Vérifier que l'utilisateur n'utilise pas son propre coupon
      if (coupon.user_id === buyerUserId) {
        return { success: false, error: 'Vous ne pouvez pas utiliser votre propre coupon de parrainage' };
      }

      // Enregistrer l'utilisation en attente (sans créditer)
      const { data, error } = await supabase
        .from('coupon_usages')
        .insert({
          coupon_code: couponCode,
          user_id: buyerUserId,
          amount_fcfa: amountFcfa,
          payment_id: paymentId,
          status: 'pending',  // En attente de validation du paiement
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      return { success: true, usageId: data.id, error: null };
    } catch (error) {
      console.error('[CouponService] registerCouponUsage error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Finalise l'utilisation du coupon après paiement réussi
   * Crédite la commission au propriétaire
   * @param {string} paymentId - ID du paiement complété
   * @returns {Promise<{success: boolean, commissionAmount?: number, error?: string}>}
   */
  static async finalizeCouponUsage(paymentId) {
    try {
      // 1. Récupérer le paiement avec les infos du coupon
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select(`
          id,
          user_id,
          amount_fcfa,
          coupon_code,
          status,
          transaction_id
        `)
        .eq('id', paymentId)
        .single();

      if (paymentError) throw paymentError;
      
      // Vérifier que le paiement est bien complété
      if (payment.status !== 'completed') {
        return { 
          success: false, 
          error: `Le paiement n'est pas complété (statut: ${payment.status})` 
        };
      }

      // Vérifier qu'un coupon a été utilisé
      if (!payment.coupon_code) {
        return { success: true, commissionAmount: 0, message: 'Aucun coupon utilisé' };
      }

      // 2. Vérifier si la commission a déjà été créditée
      const { data: existingUsage, error: usageCheckError } = await supabase
        .from('coupon_usages')
        .select('id, status, commission_credited_at')
        .eq('payment_id', paymentId)
        .eq('coupon_code', payment.coupon_code)
        .maybeSingle();

      if (existingUsage && existingUsage.status === 'completed') {
        return { 
          success: true, 
          commissionAmount: existingUsage.commission_amount,
          message: 'Commission déjà créditée' 
        };
      }

      // 3. Récupérer le coupon
      const { data: coupon, error: couponError } = await supabase
        .from('coupons')
        .select('id, user_id, usage_count, total_amount, commission_earned')
        .eq('code', payment.coupon_code)
        .single();

      if (couponError) throw couponError;

      // 4. Calculer la commission (2%)
      const commissionAmount = Math.floor(payment.amount_fcfa * 0.02);
      
      if (commissionAmount <= 0) {
        return { success: false, error: 'Montant de commission invalide' };
      }

      // 5. Créditer le propriétaire du coupon (en FCFA ou en crédits)
      // Convertir en crédits si nécessaire (10 FCFA = 1 crédit)
      const commissionCoins = Math.floor(commissionAmount / 10);

      // Mettre à jour le solde du propriétaire
      const { error: balanceError } = await supabase.rpc('add_commission_to_user', {
        p_user_id: coupon.user_id,
        p_amount_fcfa: commissionAmount,
        p_payment_id: paymentId,
        p_commission_coins: commissionCoins
      });

      if (balanceError) throw balanceError;

      // 6. Mettre à jour les statistiques du coupon
      const { error: updateCouponError } = await supabase
        .from('coupons')
        // Colonnes DECIMAL : on convertit avant d'additionner. Sinon
      // `(coupon.total_amount || 0) + payment.amount_fcfa` concatene deux
      // chaines et ECRIT une valeur aberrante en base.
      .update({
          usage_count: (Number(coupon.usage_count) || 0) + 1,
          total_amount: (Number(coupon.total_amount) || 0) + Number(payment.amount_fcfa || 0),
          commission_earned: (Number(coupon.commission_earned) || 0) + commissionAmount,
          last_used_at: new Date().toISOString()
        })
        .eq('id', coupon.id);

      if (updateCouponError) throw updateCouponError;

      // 7. Mettre à jour la table coupon_usages
      if (existingUsage) {
        await supabase
          .from('coupon_usages')
          .update({
            status: 'completed',
            commission_amount: commissionAmount,
            commission_credited_at: new Date().toISOString()
          })
          .eq('id', existingUsage.id);
      } else {
        await supabase
          .from('coupon_usages')
          .insert({
            coupon_code: payment.coupon_code,
            user_id: payment.user_id,
            amount_fcfa: payment.amount_fcfa,
            payment_id: paymentId,
            commission_amount: commissionAmount,
            status: 'completed',
            commission_credited_at: new Date().toISOString()
          });
      }

      // 8. Enregistrer la transaction de commission
      await supabase
        .from('transactions')
        .insert({
          user_id: coupon.user_id,
          amount: commissionAmount,
          type: 'commission',
          reference_id: paymentId,
          description: `Commission de parrainage (2%) pour l'utilisation du coupon ${payment.coupon_code}`,
          status: 'completed',
          created_at: new Date().toISOString()
        });

      return { 
        success: true, 
        commissionAmount,
        commissionCoins,
        couponOwnerId: coupon.user_id
      };

    } catch (error) {
      console.error('[CouponService] finalizeCouponUsage error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie le statut d'un coupon pour un paiement donné
   * @param {string} paymentId - ID du paiement
   * @returns {Promise<{status: string, commissionCredited: boolean, error?: string}>}
   */
  static async getCouponUsageStatus(paymentId) {
    try {
      const { data, error } = await supabase
        .from('coupon_usages')
        .select('status, commission_amount, commission_credited_at')
        .eq('payment_id', paymentId)
        .maybeSingle();

      if (error) throw error;

      return {
        status: data?.status || 'none',
        commissionCredited: data?.status === 'completed',
        commissionAmount: data?.commission_amount || 0,
        creditedAt: data?.commission_credited_at || null,
        error: null
      };
    } catch (error) {
      console.error('[CouponService] getCouponUsageStatus error:', error);
      return { status: 'error', commissionCredited: false, error: error.message };
    }
  }

  static async deactivateCoupon(code) {
    try {
      const { error } = await supabase
        .from('coupons')
        .update({ active: false })
        .eq('code', code);
      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('[CouponService] deactivateCoupon error:', error);
      return { success: false, error };
    }
  }

  static async activateCoupon(code) {
    try {
      const { error } = await supabase
        .from('coupons')
        .update({ active: true })
        .eq('code', code);
      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('[CouponService] activateCoupon error:', error);
      return { success: false, error };
    }
  }

  static async getAllCouponsStats() {
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('code, user_id, usage_count, total_amount, commission_earned, last_used_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[CouponService] getAllCouponsStats error:', error);
      return { data: null, error };
    }
  }

  /**
   * Récupère tous les usages de coupons avec les données associées
   * Version sécurisée qui gère les erreurs de relations
   */
  static async getAllCouponUsages() {
    try {
      // Premièrement, récupérer tous les usages
      const { data: usages, error: usageError } = await supabase
        .from('coupon_usages')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (usageError) throw usageError;
      
      // Si aucun usage, retourner un tableau vide
      if (!usages || usages.length === 0) {
        return { data: [], error: null };
      }

      // Extraire les IDs uniques pour les requêtes associées
      const couponCodes = [...new Set(usages.map(u => u.coupon_code).filter(Boolean))];
      const userIds = [...new Set(usages.map(u => u.user_id).filter(Boolean))];
      const paymentIds = [...new Set(usages.map(u => u.payment_id).filter(Boolean))];

      // Récupérer les données associées en parallèle
      const [couponsResult, usersResult, paymentsResult] = await Promise.all([
        couponCodes.length > 0 
          ? supabase.from('coupons').select('code, *').in('code', couponCodes)
          : { data: [], error: null },
        userIds.length > 0
          ? supabase.from('users').select('id, full_name, email').in('id', userIds)
          : { data: [], error: null },
        paymentIds.length > 0
          ? supabase.from('payments').select('*').in('id', paymentIds)
          : { data: [], error: null }
      ]);

      // Créer des maps pour un accès rapide
      const couponsMap = {};
      (couponsResult.data || []).forEach(c => {
        couponsMap[c.code] = c;
      });

      const usersMap = {};
      (usersResult.data || []).forEach(u => {
        usersMap[u.id] = u;
      });

      const paymentsMap = {};
      (paymentsResult.data || []).forEach(p => {
        paymentsMap[p.id] = p;
      });

      // Enrichir les données
      const enrichedData = usages.map(usage => ({
        ...usage,
        coupon: couponsMap[usage.coupon_code] || null,
        user: usersMap[usage.user_id] || null,
        payment: paymentsMap[usage.payment_id] || null
      }));

      return { data: enrichedData, error: null };
    } catch (error) {
      console.error('[CouponService] getAllCouponUsages error:', error);
      return { data: null, error };
    }
  }

  /**
   * Récupère les statistiques des gains d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<{totalCommission: number, usageCount: number, coupons: Array}>}
   */
  static async getUserEarningsStats(userId) {
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('code, usage_count, total_amount, commission_earned')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      // `coupons.total_amount` et `commission_earned` sont des colonnes DECIMAL :
      // l'API les renvoie sous forme de CHAINE ("1000"). Sans Number(), le
      // premier `0 + "0"` transforme l'accumulateur en chaine et le reduce
      // concatene au lieu d'additionner ("00100001000..."). D'ou des cartes
      // "Total généré" affichant des dizaines de chiffres.
      const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const totalCommission = (data || []).reduce((sum, c) => sum + toNum(c.commission_earned), 0);
      const totalUsage = (data || []).reduce((sum, c) => sum + toNum(c.usage_count), 0);
      const totalAmount = (data || []).reduce((sum, c) => sum + toNum(c.total_amount), 0);
      
      return {
        totalCommission,
        totalUsage,
        totalAmount,
        couponsCount: data?.length || 0,
        coupons: data || [],
        error: null
      };
    } catch (error) {
      console.error('[CouponService] getUserEarningsStats error:', error);
      return { totalCommission: 0, totalUsage: 0, totalAmount: 0, couponsCount: 0, coupons: [], error };
    }
  }
}