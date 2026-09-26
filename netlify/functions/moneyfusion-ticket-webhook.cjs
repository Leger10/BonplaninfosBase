// netlify/functions/moneyfusion-ticket-webhook.cjs
const createClient = require('./_lib/local-supabase.cjs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const TICKET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genShortCode = (used) => {
    let code;
    do {
        code = Array.from(
            { length: 4 },
            () => TICKET_CODE_ALPHABET[Math.floor(Math.random() * TICKET_CODE_ALPHABET.length)]
        ).join('');
    } while (used && used.has(code));
    if (used) used.add(code);
    return code;
};

const generateEmailFromName = (fullName) => {
    const cleanName = fullName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
    return `${cleanName}@gmail.com`;
};

const createUserAccount = async (fullName, phoneNumber, userEmail) => {
    try {
        const email = userEmail || generateEmailFromName(fullName);
        const password = '000000';
        
        console.log('📧 Création compte utilisateur:', { email, fullName, phoneNumber });

        const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 100
        });

        if (!listError && existingUsers) {
            const existingUser = existingUsers.users.find(u => u.email === email);
            if (existingUser) {
                console.log('✅ Utilisateur existant trouvé:', existingUser.id);
                
                // 🔥 Mettre à jour le téléphone même pour les utilisateurs existants
                if (phoneNumber) {
                    await supabase
                        .from('profiles')
                        .update({
                            phone: phoneNumber,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingUser.id);
                    console.log('✅ Téléphone mis à jour pour l\'utilisateur existant:', phoneNumber);
                }
                
                return existingUser.id;
            }
        }

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                phone: phoneNumber || ''
            }
        });

        if (authError) {
            console.error('❌ Erreur création auth:', authError);
            const guestId = crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(36).substring(2, 10)}`;
            await supabase
                .from('profiles')
                .insert({
                    id: guestId,
                    email: email,
                    full_name: fullName,
                    phone: phoneNumber || '',
                    user_type: 'guest',
                    created_at: new Date().toISOString()
                });
            return guestId;
        }

        if (!authUser || !authUser.user) {
            throw new Error('Création utilisateur échouée');
        }

        const userId = authUser.user.id;
        console.log('✅ Compte utilisateur créé:', { userId, email });

        await supabase
            .from('profiles')
            .insert({
                id: userId,
                email: email,
                full_name: fullName,
                phone: phoneNumber || '',
                user_type: 'user',
                created_at: new Date().toISOString()
            });

        return userId;

    } catch (error) {
        console.error('❌ Erreur création compte:', error);
        const guestId = crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(36).substring(2, 10)}`;
        await supabase
            .from('profiles')
            .insert({
                id: guestId,
                email: `guest_${Date.now()}@temp.com`,
                full_name: fullName || 'Invité',
                phone: phoneNumber || '',
                user_type: 'guest',
                created_at: new Date().toISOString()
            });
        return guestId;
    }
};

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
        if (!event.body) {
            throw new Error('Body manquant');
        }

        const payload = JSON.parse(event.body);
        console.log('📦 Webhook reçu:', JSON.stringify(payload, null, 2));

        const { event: eventType, personal_Info, statut } = payload;

        if (eventType !== 'payin.session.completed' && statut !== 'paid') {
            console.log('ℹ️ Événement non traité:', eventType);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ received: true })
            };
        }

        const info = personal_Info?.[0] || {};
        const orderId = info.orderId;
        const eventId = info.eventId;
        const cart = info.cart || {};
        const attendeeName = info.attendeeName || 'Invité';
        const originalAmount = info.amountFcfa || 0;
        const isGuest = info.isGuest || false;
        
        // 🔥 IMPORTANT: Récupérer le téléphone de plusieurs sources
        let phoneNumber = info.phone || info.phoneNumber || info.phone_number || info.telephone || info.mobile || '';
        const userEmail = info.userEmail || info.email || '';

        // 🔥 Nettoyer le numéro de téléphone
        if (phoneNumber) {
            phoneNumber = phoneNumber.replace(/[\s\-\.\(\)]/g, '').replace(/[^0-9]/g, '');
            console.log('📱 Téléphone nettoyé:', phoneNumber);
        }

        console.log('✅ Paiement réussi:', { 
            orderId, 
            eventId, 
            attendeeName, 
            originalAmount, 
            isGuest,
            phoneNumber: phoneNumber || '⚠️ AUCUN TÉLÉPHONE',
            userEmail,
            infoKeys: Object.keys(info)
        });

        // --- 1. Créer le compte utilisateur ---
        let finalUserId;
        if (isGuest || !info.userId || info.userId.startsWith('guest_')) {
            console.log(`👤 Création compte pour: ${attendeeName} (${phoneNumber || 'pas de téléphone'})`);
            finalUserId = await createUserAccount(attendeeName, phoneNumber, userEmail);
            console.log('✅ ID utilisateur final:', finalUserId);
        } else {
            finalUserId = info.userId;
            console.log('👤 Utilisateur existant:', finalUserId);
            
            // 🔥 Mettre à jour le téléphone de l'utilisateur existant
            if (phoneNumber) {
                await supabase
                    .from('profiles')
                    .update({ phone: phoneNumber, updated_at: new Date().toISOString() })
                    .eq('id', finalUserId);
                console.log('✅ Téléphone mis à jour pour l\'utilisateur:', phoneNumber);
            }
        }

        // --- 2. Créer les tickets AVEC LE TÉLÉPHONE ---
        let ticketCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
        if (ticketCount === 0) ticketCount = 1;

        const finalEmail = userEmail || generateEmailFromName(attendeeName);
        
        const pricePerTicketCoins = Math.floor(originalAmount / 10 / ticketCount);
        const pricePerTicketFcfa = Math.floor(originalAmount / ticketCount);
        const totalAmountCoins = pricePerTicketCoins * ticketCount;
        const totalAmountFcfa = pricePerTicketFcfa * ticketCount;

        console.log('💰 Prix calculés:', {
            ticketCount,
            pricePerTicketCoins,
            pricePerTicketFcfa,
            totalAmountCoins,
            totalAmountFcfa,
            phoneNumber: phoneNumber || '⚠️ AUCUN'
        });

        const tickets = [];
        const now = new Date().toISOString();
        const baseTimestamp = Date.now();

        const usedCodes = new Set();
        for (let i = 0; i < ticketCount; i++) {
            const ticketId = crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(36).substring(2, 10)}`;
            const shortCode = genShortCode(usedCodes);
            const qrCode = shortCode;
            
            tickets.push({
                id: ticketId,
                event_id: eventId,
                user_id: finalUserId,
                status: 'active',
                payment_method: 'moneyfusion_ticket',
                transaction_reference: orderId,
                attendee_name: attendeeName,
                customer_name: attendeeName,
                phone: phoneNumber || '', // 🔥 LE TÉLÉPHONE EST OBLIGATOIREMENT ENREGISTRÉ
                email: finalEmail,
                is_guest: isGuest || false,
                purchased_at: now,
                qr_code: qrCode,
                ticket_code_short: shortCode, // 🔥 Ajout du code court
                ticket_number: `MF-${baseTimestamp}-${String(i + 1).padStart(4, '0')}`,
                ticket_type_id: null,
                purchase_price_pi: pricePerTicketCoins,
                total_amount_pi: totalAmountCoins,
                total_amount_fcfa: totalAmountFcfa,
                quantity: 1,
                entry_count: 0,
                created_at: now,
                updated_at: now
            });
        }

        // --- 3. Insérer les tickets ---
        if (tickets.length > 0) {
            console.log('📝 Tickets à insérer:', JSON.stringify(tickets.map(t => ({
                attendee_name: t.attendee_name,
                phone: t.phone || '⚠️ VIDE',
                email: t.email,
                qr_code: t.qr_code
            })), null, 2));
            
            const { error } = await supabase
                .from('tickets')
                .insert(tickets);

            if (error) {
                console.error('❌ Erreur insertion tickets:', error);
                throw new Error('Erreur insertion tickets: ' + error.message);
            } else {
                console.log(`✅ ${tickets.length} tickets créés avec téléphone: "${phoneNumber || '⚠️ AUCUN'}"`);
            }
        }

        // --- 4. Mettre à jour le paiement ---
        await supabase
            .from('payments')
            .update({
                status: 'completed',
                processed_at: now,
                user_id: finalUserId,
                payment_method: 'moneyfusion_ticket',
                amount_fcfa: totalAmountFcfa,
                amount_pi: totalAmountCoins
            })
            .eq('transaction_id', orderId);

        // --- 5. Créer les gains de l'organisateur ---
        const { data: eventData } = await supabase
            .from('events')
            .select('organizer_id')
            .eq('id', eventId)
            .single();

        if (eventData) {
            const organizerId = eventData.organizer_id;
            const amountCoins = totalAmountCoins;
            const earnedFcfa = totalAmountFcfa;
            const transactionUuid = crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-0000-0000-${Math.random().toString(36).substring(2, 10)}`;

            const { error: earningError } = await supabase.rpc('credit_organizer_earnings', {
                p_organizer_id: organizerId,
                p_event_id: eventId,
                p_transaction_id: transactionUuid,
                p_transaction_type: 'ticket_sale',
                p_earnings_coins: amountCoins,
                p_earnings_fcfa: earnedFcfa,
                p_ticket_count: ticketCount || 1,
                p_description: `Vente de ${ticketCount} tickets via MoneyFusion - ${attendeeName} (${phoneNumber || 'pas de téléphone'})`,
                p_created_at: now
            });
            if (earningError) throw new Error(earningError.message);
            console.log(`✅ Gains organisateur enregistrés: +${amountCoins} coins (en attente)`);
        }

        console.log(`🎉 Traitement terminé pour ${orderId}`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                received: true,
                success: true,
                tickets_created: tickets.length > 0,
                ticket_count: tickets.length,
                user_id: finalUserId,
                email: finalEmail,
                phone: phoneNumber || '',
                price_per_ticket_coins: pricePerTicketCoins,
                total_amount_fcfa: totalAmountFcfa,
                password: '000000'
            })
        };

    } catch (error) {
        console.error('❌ Erreur webhook:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};