const createClient = require('./_lib/local-supabase.cjs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  try {
    const payload = JSON.parse(event.body);
    console.log('📦 Webhook MoneyFusion reçu:', JSON.stringify(payload, null, 2));

    const { 
      event: eventType, 
      personal_Info, 
      tokenPay, 
      numeroSend, 
      nomclient, 
      numeroTransaction, 
      Montant, 
      frais, 
      statut 
    } = payload;

    // Extraire les informations
    const userId = personal_Info?.[0]?.userId;
    const orderId = personal_Info?.[0]?.orderId;
    const amountFcfa = Montant || personal_Info?.[0]?.amountFcfa;

    console.log(`📊 Événement: ${eventType}, Token: ${tokenPay}, Statut: ${statut}`);

    // Gérer les différents types d'événements
    if (eventType === 'payin.session.completed' || statut === 'paid') {
      console.log(`✅ Paiement réussi pour la transaction ${orderId}`);
      
      // Récupérer le paiement en attente
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('transaction_id', orderId)
        .maybeSingle();

      if (paymentError || !payment) {
        console.error('❌ Paiement non trouvé:', orderId);
        return { 
          statusCode: 404, 
          headers,
          body: JSON.stringify({ error: 'Payment not found' }) 
        };
      }

      // Vérifier si déjà traité
      if (payment.status === 'completed') {
        console.log('⚠️ Paiement déjà traité');
        return { 
          statusCode: 200, 
          headers,
          body: JSON.stringify({ message: 'Already processed' }) 
        };
      }

      // Ajouter les crédits à l'utilisateur
      const coinsToAdd = payment.coins_amount;
      
      const { data: buyerProfile, error: buyerError } = await supabase
        .from('profiles')
        .select('coin_balance')
        .eq('id', userId)
        .maybeSingle();

      if (buyerError) {
        console.error('❌ Erreur récupération profil:', buyerError);
      }

      const newBalance = (buyerProfile?.coin_balance || 0) + coinsToAdd;
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          coin_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Erreur mise à jour crédits:', updateError);
        throw new Error(`Failed to update credits: ${updateError.message}`);
      }

      // Mettre à jour le statut du paiement
      await supabase
        .from('payments')
        .update({ 
          status: 'completed', 
          processed_at: new Date().toISOString(),
          credits_added: true,
          moneyfusion_token: tokenPay,
          moneyfusion_transaction: numeroTransaction
        })
        .eq('id', payment.id);

      // Enregistrer la transaction
      await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          transaction_type: 'credit_purchase',
          amount_pi: coinsToAdd,
          amount_fcfa: amountFcfa,
          status: 'completed',
          description: `Achat de ${coinsToAdd} crédits via MoneyFusion`,
          reference_id: payment.id,
          metadata: {
            pack_id: payment.pack_id,
            token: tokenPay,
            transaction_number: numeroTransaction
          }
        });

      console.log(`🎉 Transaction ${orderId} complétée: +${coinsToAdd} crédits pour user ${userId}`);

    } else if (eventType === 'payin.session.pending') {
      console.log(`⏳ Paiement en attente: ${orderId}`);
      
      // Mettre à jour le statut en pending
      await supabase
        .from('payments')
        .update({ 
          status: 'pending',
          moneyfusion_token: tokenPay
        })
        .eq('transaction_id', orderId);

    } else if (eventType === 'payin.session.cancelled') {
      console.log(`❌ Paiement annulé: ${orderId}`);
      
      // Marquer comme annulé
      await supabase
        .from('payments')
        .update({ 
          status: 'cancelled',
          moneyfusion_token: tokenPay
        })
        .eq('transaction_id', orderId);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true, event: eventType })
    };
    
  } catch (error) {
    console.error('❌ Erreur webhook:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};