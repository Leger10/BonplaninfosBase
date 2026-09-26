// netlify/functions/ussd-payment.cjs
// Paiement USSD mobile money (Nida / marchand mobile) — sans passer par MoneyFusion.
// - action=submit   : le client a payé par USSD et saisit la référence du SMS => on enregistre
//                     le paiement (status 'pending'), on crédite immédiatement (pièces) ou on
//                     crée les billets, en attente de validation admin.
// - action=validate : l'admin confirme le paiement reçu  => payments.status = 'completed'
// - action=reject   : l'admin rejette (fraude)           => payments.status = 'cancelled'
//                     (+ remboursement pièces / suppression billets / contrepassation gains)
const createClient = require('./_lib/local-supabase.cjs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const USSD_MERCHANT = process.env.USSD_MERCHANT || '46598281';
const USSD_PREFIX = '*144*10*';
const buildUSSDCode = (amount) => `${USSD_PREFIX}${USSD_MERCHANT}*${amount}#`;

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

// Upload de la capture d'écran (service role => bypass RLS). Accepte une data:image/... base64
// ou une URL publique déjà prête. Retourne l'URL publique ou '' en cas d'échec.
const uploadProof = async (proofInput, orderId) => {
    try {
        const input = String(proofInput || '').trim();
        if (!input) return '';
        if (!input.startsWith('data:')) return input; // déjà une URL
        const m = input.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (!m) return '';
        const isPng = m[1].toLowerCase().includes('png');
        const ext = isPng ? 'png' : 'jpg';
        const buf = Buffer.from(m[2], 'base64');
        const path = `ussd_proofs/${orderId}.${ext}`;
        const { error } = await supabase.storage.from('media').upload(path, buf, {
            contentType: isPng ? 'image/png' : 'image/jpeg',
            upsert: true,
            cacheControl: '3600'
        });
        if (error) {
            console.error('⚠️ Upload preuve échoué:', error.message);
            return '';
        }
        return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
    } catch (e) {
        console.error('⚠️ Upload preuve exception:', e.message);
        return '';
    }
};

const now = () => new Date().toISOString();
const uuidv4 = () => crypto.randomUUID
    ? crypto.randomUUID()
    : `00000000-0000-0000-0000-${Math.random().toString(36).substring(2, 10)}`;

const generateEmailFromName = (fullName) => {
    const cleanName = String(fullName || 'invite')
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

        const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (!listError && existingUsers) {
            const existingUser = existingUsers.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
            if (existingUser) {
                if (phoneNumber) {
                    await supabase.from('profiles').update({ phone: phoneNumber, updated_at: now() }).eq('id', existingUser.id);
                }
                return existingUser.id;
            }
        }

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, phone: phoneNumber || '' }
        });

        if (authError || !authUser || !authUser.user) {
            const guestId = uuidv4();
            await supabase.from('profiles').insert({
                id: guestId,
                email,
                full_name: fullName || 'Invité',
                phone: phoneNumber || '',
                user_type: 'guest',
                created_at: now()
            });
            return guestId;
        }

        const userId = authUser.user.id;
        await supabase.from('profiles').insert({
            id: userId,
            email,
            full_name: fullName || 'Invité',
            phone: phoneNumber || '',
            user_type: 'user',
            created_at: now()
        });
        return userId;
    } catch (error) {
        console.error('❌ Erreur création compte:', error);
        const guestId = uuidv4();
        await supabase.from('profiles').insert({
            id: guestId,
            email: `guest_${Date.now()}@temp.com`,
            full_name: fullName || 'Invité',
            phone: phoneNumber || '',
            user_type: 'guest',
            created_at: now()
        });
        return guestId;
    }
};

// ============================================================
// SUBMIT — le client paie par USSD et confirme avec la réf. SMS
// ============================================================
const parseMeta = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
};

const recordUssdEvidence = async ({ userId, transactionType, amountPi, amountFcfa, description, paymentId, ussdMeta, extra = {} }) => {
    try {
        const { error } = await supabase.from('transactions').insert({
            user_id: userId,
            transaction_type: transactionType,
            amount_pi: amountPi,
            amount_fcfa: amountFcfa,
            status: 'pending',
            description,
            transaction_reference: paymentId,
            metadata: { ussd: ussdMeta, payment_id: paymentId, ...extra }
        });
        if (error) console.error('⚠️ Preuve USSD non enregistrée:', error.message);
    } catch (e) {
        console.error('⚠️ Preuve USSD non enregistrée (exception):', e.message);
    }
};

const findUssdEvidence = async (paymentId) => {
    const direct = await supabase.from('transactions').select('id, metadata').eq('transaction_reference', paymentId);
    let rows = direct.data || [];
    if (!rows.length) {
        const legacy = await supabase.from('transactions').select('id, metadata').not('metadata', 'is', null).limit(500);
        rows = (legacy.data || []).filter((r) => parseMeta(r.metadata)?.payment_id === paymentId);
    }
    return rows.map((r) => parseMeta(r.metadata)).filter((m) => m?.ussd);
};

const creditEarningsOnce = async ({ transactionRef, organizerId, eventId, transactionType, coins, fcfa, ticketCount, description }) => {
    const amount = Math.max(0, Math.floor(Number(coins) || 0));
    if (!organizerId || !amount || !transactionRef) return null;
    const { data: existing } = await supabase
        .from('organizer_earnings')
        .select('id')
        .eq('transaction_id', transactionRef)
        .eq('transaction_type', transactionType)
        .maybeSingle();
    if (existing) return existing.id;
    const { data, error } = await supabase.rpc('credit_organizer_earnings', {
        p_organizer_id: organizerId,
        p_event_id: eventId || null,
        p_transaction_id: transactionRef,
        p_transaction_type: transactionType,
        p_earnings_coins: amount,
        p_earnings_fcfa: Number(fcfa) || amount * 10,
        p_ticket_count: ticketCount || null,
        p_description: description || null,
        p_created_at: now(),
    });
    if (error) {
        console.error('⚠️ Crédit des gains USSD échoué:', error.message);
        return null;
    }
    return data ? data.earning_id : null;
};

const handleSubmit = async (body) => {
    const {
        type, // 'credits' | 'tickets'
        smsReference,
        proofUrl, // data:image/... base64 (capture d'écran) OU URL publique
        proofDataUrl, // alias moderne envoyé par l'app
        amountFcfa,
        phone,
        transactionId,
        // crédits:
        userId,
        coinsAmount,
        packId,
        couponCode,
        userEmail,
        // billets:
        eventId,
        cart,
        cartTotalFcfa,
        attendeeName,
        promoCodeId,
        commissionAmount,
        isGuest,
        // votes:
        candidateId,
        voteCount,
        contestId,
        organizerId,
        votePricePi,
    } = body;

    if (!['credits', 'tickets', 'votes', 'stand_rental', 'raffle', 'protected'].includes(type)) {
        return { statusCode: 400, body: { success: false, message: 'Type de paiement invalide' } };
    }

    const cleanSmsRef = String(smsReference || '').trim();
    const proofInput = String(proofDataUrl || proofUrl || '').trim();
    if (!proofInput) {
        return { statusCode: 400, body: { success: false, message: "Capture d'écran de la transaction requise pour confirmer le paiement" } };
    }

    const total = parseInt(amountFcfa, 10);
    if (!total || total <= 0) {
        return { statusCode: 400, body: { success: false, message: 'Montant invalide' } };
    }

    const cleanPhone = String(phone || '').replace(/[^\d]/g, '');
    if (cleanPhone.length < 8) {
        return { statusCode: 400, body: { success: false, message: 'Numéro de téléphone invalide' } };
    }

    const orderId = transactionId || `ussd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const proofUrlFinal = await uploadProof(proofInput, orderId);
    if (!proofUrlFinal) {
        return { statusCode: 400, body: { success: false, message: "Impossible d'enregistrer la capture d'écran de la transaction" } };
    }
    const ussdMeta = {
        sms_reference: cleanSmsRef,
        proof_url: proofUrlFinal,
        merchant_ussd: buildUSSDCode(total),
        operator: 'mobile_money',
        amount_paid_fcfa: total
    };

    // ---------- CRÉDITS (packs / montant libre) ----------
    if (type === 'credits') {
        if (!userId) {
            return { statusCode: 400, body: { success: false, message: 'Utilisateur requis' } };
        }
        const coins = parseInt(coinsAmount, 10) || Math.floor(total / 10);

        const { data: paymentRow, error: paymentError } = await supabase
            .from('payments')
            .insert({
                user_id: userId,
                coins_amount: coins,
                amount_fcfa: total,
                status: 'pending',
                payment_method: 'ussd',
                transaction_id: orderId,
                pack_id: packId || 'custom',
                coupon_code: couponCode || null,
                credits_added: false
            })
            .select()
            .single();

        if (paymentError) {
            console.error('❌ Erreur insertion paiement USSD:', paymentError);
            return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement paiement: ' + paymentError.message } };
        }

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('coin_balance')
            .eq('id', userId)
            .single();

        if (profileError || !profile) {
            console.error('❌ Profil introuvable:', profileError);
            return { statusCode: 500, body: { success: false, message: 'Compte utilisateur introuvable' } };
        }

        await recordUssdEvidence({
            userId,
            transactionType: 'credit_purchase',
            amountPi: coins,
            amountFcfa: total,
            description: `Recharge USSD ${total} FCFA${cleanSmsRef ? ` (réf. ${cleanSmsRef})` : ' (capture d\'écran)'} - en attente de validation`,
            paymentId: paymentRow.id,
            ussdMeta,
            extra: { payment_type: 'credits' }
        });

        return {
            statusCode: 200,
            body: {
                success: true,
                type: 'credits',
                transaction_id: orderId,
                payment_id: paymentRow.id,
                coins_pending: coins,
                current_balance: profile.coin_balance || 0,
                message: 'Paiement enregistré. Vos pièces seront créditées après validation du paiement par un administrateur.',
                pending_validation: true
            }
        };
    }

    // ---------- VOTES (événement de vote OU concours / vote simple OU panier) ----------
    if (type === 'votes') {
        // Vote simple (candidateId + voteCount) OU panier (votes = [{candidateId, voteCount, votePricePi}])
        let voteItems = [];
        if (Array.isArray(body.votes) && body.votes.length > 0) {
            voteItems = body.votes
                .map((v) => ({
                    candidateId: v && v.candidateId,
                    voteCount: parseInt(v && v.voteCount, 10) || 1,
                    votePricePi: parseInt(v && v.votePricePi, 10) || null
                }))
                .filter((v) => v.candidateId);
        } else if (candidateId) {
            voteItems.push({
                candidateId,
                voteCount: parseInt(voteCount, 10) || 1,
                votePricePi: parseInt(votePricePi, 10) || null
            });
        }
        if (voteItems.length === 0) {
            return { statusCode: 400, body: { success: false, message: 'Candidat requis' } };
        }
        const totalVoteCount = voteItems.reduce((s, v) => s + v.voteCount, 0);
        if (totalVoteCount <= 0) {
            return { statusCode: 400, body: { success: false, message: 'Nombre de voix invalide' } };
        }
        const voteAmountFcfa = parseInt(amountFcfa, 10) || total;
        const totalUnitPi = voteItems.reduce((s, v) => s + (v.votePricePi || 0) * v.voteCount, 0);
        const unitPricePi = totalUnitPi > 0
            ? Math.round(totalUnitPi / totalVoteCount)
            : Math.floor(voteAmountFcfa / 10 / totalVoteCount) || 1;
        const voteAmountPi = unitPricePi * totalVoteCount;

        const voteUserName = attendeeName || 'Invité';
        let voteFinalUserId = userId || null;
        if (isGuest || !userId || String(userId).startsWith('guest_')) {
            voteFinalUserId = await createUserAccount(voteUserName, cleanPhone, userEmail);
        } else {
            await supabase.from('profiles').update({ phone: cleanPhone, updated_at: now() }).eq('id', voteFinalUserId);
        }

        const votePaymentId = uuidv4();
        const { data: votePaymentRow, error: votePayErr } = await supabase
            .from('payments')
            .insert({
                id: votePaymentId,
                user_id: voteFinalUserId,
                coins_amount: voteAmountPi,
                amount_fcfa: voteAmountFcfa,
                status: 'pending',
                payment_method: 'ussd',
                transaction_id: orderId,
                pack_id: 'vote_payment',
                credits_added: false
            })
            .select()
            .single();

        if (votePayErr) {
            console.error('❌ Erreur insertion paiement vote USSD:', votePayErr);
            return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement paiement: ' + votePayErr.message } };
        }

        // Persistance des votes en attente (seront appliqués à la validation admin)
        const vpRows = voteItems.map((v) => ({
            payment_id: votePaymentId,
            user_id: voteFinalUserId,
            event_id: eventId || null,
            contest_id: contestId || null,
            candidate_id: v.candidateId,
            vote_count: v.voteCount,
            amount_pi: (v.votePricePi || unitPricePi) * v.voteCount,
            amount_fcfa: ((v.votePricePi || unitPricePi) * v.voteCount) * 10,
            status: 'pending',
            transaction_id: orderId,
            sms_reference: cleanSmsRef,
            proof_url: proofUrlFinal,
            organizer_id: organizerId || null,
            created_at: now(),
            updated_at: now()
        }));
        const { error: vpErr } = await supabase.from('vote_payments').insert(vpRows);
        if (vpErr) {
            console.error('❌ Erreur insertion vote_payments:', vpErr);
            return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement vote: ' + vpErr.message } };
        }

    await recordUssdEvidence({
        userId: voteFinalUserId,
        transactionType: 'vote_purchase',
        amountPi: -voteAmountPi,
        amountFcfa: -voteAmountFcfa,
        description: `${totalVoteCount} voix via USSD${cleanSmsRef ? ` (réf. ${cleanSmsRef})` : ''} - en attente de validation`,
        paymentId: votePaymentId,
        ussdMeta,
        extra: {
            payment_type: 'votes',
            event_id: eventId || null,
            contest_id: contestId || null,
            vote_items: voteItems.map((v) => ({ candidate_id: v.candidateId, vote_count: v.voteCount }))
        }
    });

        return {
            statusCode: 200,
            body: {
                success: true,
                type: 'votes',
                transaction_id: orderId,
                payment_id: votePaymentId,
                vote_count: totalVoteCount,
                message: 'Paiement enregistré. Vos voix seront ajoutées après validation.',
                pending_validation: true
            }
        };
    }

    // ---------- LOCATION DE STAND ----------
    if (type === 'stand_rental') {
        if (!userId) {
            return { statusCode: 400, body: { success: false, message: 'Utilisateur requis' } };
        }
        if (!eventId) {
            return { statusCode: 400, body: { success: false, message: 'Evenement requis' } };
        }
        const requested = Array.isArray(body.standCart) ? body.standCart : [];
        if (!requested.length) {
            return { statusCode: 400, body: { success: false, message: 'Panier de stands vide' } };
        }
        const resolvedStands = [];
        for (const item of requested) {
            const typeId = item && (item.standTypeId || item.stand_type_id);
            const qty = Math.max(1, parseInt((item && item.quantity) || 1, 10) || 1);
            if (!typeId) continue;
            const { data: standType } = await supabase.from('stand_types').select('*').eq('id', typeId).maybeSingle();
            if (!standType) {
                return { statusCode: 400, body: { success: false, message: `Type de stand introuvable: ${typeId}` } };
            }
            if (standType.event_id && standType.event_id !== eventId) {
                return { statusCode: 400, body: { success: false, message: "Ce stand n'appartient pas a cet evenement" } };
            }
            const rented = Number(standType.quantity_rented || 0);
            const available = Number(standType.quantity_available || 0);
            if (rented + qty > available) {
                return { statusCode: 400, body: { success: false, message: `Plus aucun emplacement disponible pour "${standType.name}"` } };
            }
            const unitCoins = Number(standType.calculated_price_pi || 0);
            const unitFcfa = Number(standType.base_price || 0) || unitCoins * 10;
            resolvedStands.push({
                typeId, qty, name: standType.name, unitCoins, unitFcfa,
                standEventId: standType.stand_event_id || null,
            });
        }
        if (!resolvedStands.length) {
            return { statusCode: 400, body: { success: false, message: 'Aucun stand valide dans le panier' } };
        }
        const standTotalFcfa = resolvedStands.reduce((sum, line) => sum + line.unitFcfa * line.qty, 0);
        const standTotalCoins = resolvedStands.reduce((sum, line) => sum + line.unitCoins * line.qty, 0);
        if (total < standTotalFcfa) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    message: `Montant insuffisant pour la location (attendu ${standTotalFcfa} FCFA, recu ${total} FCFA). Aucune reservation n'a ete faite.`
                }
            };
        }

        const standUserName = attendeeName || 'Invite';
        let standUserId = userId;
        if (isGuest || !userId || String(userId).startsWith('guest_')) {
            standUserId = await createUserAccount(standUserName, cleanPhone, userEmail);
        } else {
            await supabase.from('profiles').update({ phone: cleanPhone, updated_at: now() }).eq('id', standUserId);
        }

        const { data: standPayment, error: standPayErr } = await supabase
            .from('payments')
            .insert({
                user_id: standUserId,
                coins_amount: standTotalCoins,
                amount_fcfa: total,
                status: 'pending',
                payment_method: 'ussd',
                transaction_id: orderId,
                pack_id: 'stand_rental_payment',
                credits_added: false
            })
            .select()
            .single();
        if (standPayErr) {
            return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement paiement: ' + standPayErr.message } };
        }

        const standBookings = [];
        for (const line of resolvedStands) {
            for (let unitIndex = 0; unitIndex < line.qty; unitIndex++) {
                const bookingCode = genShortCode();
                const { data: rental, error: rentalErr } = await supabase
                    .from('stand_rentals')
                    .insert({
                        stand_event_id: line.standEventId,
                        user_id: standUserId,
                        stand_type_id: line.typeId,
                        company_name: body.companyName || null,
                        contact_person: body.contactPerson || standUserName,
                        contact_email: body.contactEmail || userEmail || null,
                        contact_phone: cleanPhone,
                        business_description: body.businessDescription || null,
                        rental_amount_pi: line.unitCoins,
                        rental_amount_fcfa: line.unitFcfa,
                        deposit_paid_pi: line.unitCoins,
                        deposit_paid_fcfa: line.unitFcfa,
                        status: 'pending_validation',
                        reserved_at: now(),
                        booking_code: bookingCode,
                        rental_type: body.rentalType || 'stand',
                        guest_name: body.guestName || null,
                        check_in_date: body.checkIn || null,
                        check_out_date: body.checkOut || null,
                        tent_size: body.tentSize || null,
                        special_requests: body.specialRequests || null,
                        created_at: now(),
                        updated_at: now()
                    })
                    .select()
                    .single();
                if (rentalErr) {
                    return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement reservation: ' + rentalErr.message } };
                }
                standBookings.push({
                    rental_id: rental.id,
                    stand_type_id: line.typeId,
                    booking_code: bookingCode,
                    name: line.name,
                    unit_coins: line.unitCoins,
                    unit_fcfa: line.unitFcfa
                });
            }
        }

        await recordUssdEvidence({
            userId: standUserId,
            transactionType: 'stand_rental',
            amountPi: standTotalCoins,
            amountFcfa: total,
            description: `Location de ${standBookings.length} stand(s) via USSD${cleanSmsRef ? ` (ref. ${cleanSmsRef})` : ''} - en attente de validation`,
            paymentId: standPayment.id,
            ussdMeta,
            extra: {
                payment_type: 'stand_rental',
                event_id: eventId,
                bookings: standBookings,
                total_coins: standTotalCoins
            }
        });

        return {
            statusCode: 200,
            body: {
                success: true,
                type: 'stand_rental',
                transaction_id: orderId,
                payment_id: standPayment.id,
                booking_codes: standBookings.map((b) => b.booking_code),
                message: 'Paiement enregistre. Vos reservations seront confirmees apres validation du depot par un administrateur.',
                pending_validation: true
            }
        };
    }

    // ---------- TOMBOLA ----------
    if (type === 'raffle') {
        const raffleId = body.raffleEventId || body.raffle_event_id;
        const qty = Math.max(1, parseInt(body.quantity || 1, 10) || 1);
        if (!userId) {
            return { statusCode: 400, body: { success: false, message: 'Utilisateur requis' } };
        }
        if (!raffleId) {
            return { statusCode: 400, body: { success: false, message: 'Tombola requise' } };
        }
        const { data: raffle } = await supabase.from('raffle_events').select('*').eq('id', raffleId).maybeSingle();
        if (!raffle) {
            return { statusCode: 404, body: { success: false, message: 'Tombola introuvable' } };
        }
        if (raffle.status && raffle.status !== 'active') {
            return { statusCode: 400, body: { success: false, message: 'Les ventes de cette tombola sont fermees' } };
        }
        const unitCoins = Number(raffle.calculated_price_pi || 0);
        const raffleTotalCoins = unitCoins * qty;
        const expectedFcfa = unitCoins * 10;
        if (expectedFcfa > 0 && total < expectedFcfa) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    message: `Montant insuffisant (attendu ${expectedFcfa} FCFA, recu ${total} FCFA). Aucun ticket n'a ete cree.`
                }
            };
        }
        const sold = Number(raffle.tickets_sold || 0);
        if (sold + qty > Number(raffle.total_tickets || 0)) {
            return { statusCode: 400, body: { success: false, message: `Tickets insuffisants (dispo: ${Math.max(0, Number(raffle.total_tickets || 0) - sold)})` } };
        }
        const maxPerUser = Number(raffle.max_tickets_per_user || 0);
        if (maxPerUser > 0) {
            const { data: alreadyRows } = await supabase
                .from('raffle_tickets')
                .select('id')
                .eq('raffle_event_id', raffleId)
                .eq('user_id', userId);
            const already = (alreadyRows || []).length;
            if (already + qty > maxPerUser) {
                return { statusCode: 400, body: { success: false, message: `Limite de ${maxPerUser} ticket(s) par personne (deja ${already})` } };
            }
        }

        const raffleUserName = attendeeName || 'Invite';
        let raffleUserId = userId;
        if (isGuest || !userId || String(userId).startsWith('guest_')) {
            raffleUserId = await createUserAccount(raffleUserName, cleanPhone, userEmail);
        } else {
            await supabase.from('profiles').update({ phone: cleanPhone, updated_at: now() }).eq('id', raffleUserId);
        }

        const { data: rafflePayment, error: rafflePayErr } = await supabase
            .from('payments')
            .insert({
                user_id: raffleUserId,
                coins_amount: raffleTotalCoins,
                amount_fcfa: total,
                status: 'pending',
                payment_method: 'ussd',
                transaction_id: orderId,
                pack_id: 'raffle_payment',
                credits_added: false
            })
            .select()
            .single();
        if (rafflePayErr) {
            return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement paiement: ' + rafflePayErr.message } };
        }

        await recordUssdEvidence({
            userId: raffleUserId,
            transactionType: 'raffle_ticket_purchase',
            amountPi: raffleTotalCoins,
            amountFcfa: total,
            description: `Achat de ${qty} ticket(s) de tombola via USSD${cleanSmsRef ? ` (ref. ${cleanSmsRef})` : ''} - en attente de validation`,
            paymentId: rafflePayment.id,
            ussdMeta,
            extra: {
                payment_type: 'raffle',
                raffle_event_id: raffleId,
                quantity: qty,
                unit_coins: unitCoins,
                total_coins: raffleTotalCoins
            }
        });

        return {
            statusCode: 200,
            body: {
                success: true,
                type: 'raffle',
                transaction_id: orderId,
                payment_id: rafflePayment.id,
                quantity: qty,
                message: 'Paiement enregistre. Vos tickets de tombola seront crees apres validation du depot par un administrateur.',
                pending_validation: true
            }
        };
    }

    // ---------- ACCES EVENEMENT PROTEGE ----------
    if (type === 'protected') {
        if (!userId) {
            return { statusCode: 400, body: { success: false, message: 'Utilisateur requis' } };
        }
        if (!eventId) {
            return { statusCode: 400, body: { success: false, message: 'Evenement requis' } };
        }
        const { data: ev } = await supabase
            .from('events')
            .select('id, title, price_pi, price_fcfa, is_sales_closed, organizer_id')
            .eq('id', eventId)
            .maybeSingle();
        if (!ev) {
            return { statusCode: 404, body: { success: false, message: 'Evenement introuvable' } };
        }
        if (ev.is_sales_closed) {
            return { statusCode: 400, body: { success: false, message: 'Les acces a cet evenement sont fermes' } };
        }
        const accessCoins = Number(ev.price_pi || 0);
        const expectedFcfa = Number(ev.price_fcfa || 0) || accessCoins * 10;
        if (expectedFcfa > 0 && total < expectedFcfa) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    message: `Montant insuffisant (attendu ${expectedFcfa} FCFA, recu ${total} FCFA). Aucun acces n'a ete ouvert.`
                }
            };
        }
        const { data: accessPayment, error: accessPayErr } = await supabase
            .from('payments')
            .insert({
                user_id: userId,
                coins_amount: accessCoins,
                amount_fcfa: total,
                status: 'pending',
                payment_method: 'ussd',
                transaction_id: orderId,
                pack_id: 'protected_access_payment',
                credits_added: false
            })
            .select()
            .single();
        if (accessPayErr) {
            return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement paiement: ' + accessPayErr.message } };
        }

        await recordUssdEvidence({
            userId,
            transactionType: 'protected_access',
            amountPi: accessCoins,
            amountFcfa: total,
            description: `Acces a l'evenement via USSD${cleanSmsRef ? ` (ref. ${cleanSmsRef})` : ''} - en attente de validation`,
            paymentId: accessPayment.id,
            ussdMeta,
            extra: {
                payment_type: 'protected',
                event_id: eventId,
                amount_coins: accessCoins
            }
        });

        return {
            statusCode: 200,
            body: {
                success: true,
                type: 'protected',
                transaction_id: orderId,
                payment_id: accessPayment.id,
                message: 'Paiement enregistre. Votre acces sera ouvert apres validation du depot par un administrateur.',
                pending_validation: true
            }
        };
    }

    // ---------- BILLETS ----------
    const originalAmount = parseInt(cartTotalFcfa, 10) || total;
    const userName = attendeeName || 'Invité';

    let finalUserId = userId || null;
    if (isGuest || !userId || String(userId).startsWith('guest_')) {
        finalUserId = await createUserAccount(userName, cleanPhone, userEmail);
    } else {
        await supabase.from('profiles').update({ phone: cleanPhone, updated_at: now() }).eq('id', finalUserId);
    }

    const cartData = cart && typeof cart === 'object' ? cart : {};

    const resolvedLines = [];
    for (const [typeId, rawQty] of Object.entries(cartData)) {
        const qty = parseInt(rawQty || 0, 10);
        if (!qty || qty < 1) continue;
        const { data: typeRow, error: typeError } = await supabase
            .from('ticket_types')
            .select('*')
            .eq('id', typeId)
            .maybeSingle();
        if (typeError) return { statusCode: 500, body: { success: false, message: 'Lecture du type de billet impossible' } };
        if (!typeRow) return { statusCode: 400, body: { success: false, message: `Type de billet introuvable: ${typeId}` } };
        if (typeRow.event_id && typeRow.event_id !== eventId) {
            return { statusCode: 400, body: { success: false, message: `Type de billet ${typeRow.name} hors événement` } };
        }
        const sold = Number(typeRow.quantity_sold ?? typeRow.tickets_sold ?? 0);
        const capacity = Number(typeRow.quantity_available ?? 0);
        if (sold + qty > capacity) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    message: `Stock insuffisant pour "${typeRow.name}" (dispo: ${Math.max(0, capacity - sold)})`
                }
            };
        }
        const unitFcfa = Number(typeRow.price || 0);
        const unitCoins = Number(typeRow.price_coins || typeRow.price_pi || Math.round(unitFcfa / 10));
        resolvedLines.push({ typeId, qty, name: typeRow.name, unitFcfa, unitCoins });
    }
    if (!resolvedLines.length) {
        return { statusCode: 400, body: { success: false, message: 'Aucun billet valide dans le panier' } };
    }

    const serverTotalFcfa = resolvedLines.reduce((sum, line) => sum + line.unitFcfa * line.qty, 0);
    const serverTotalCoins = resolvedLines.reduce((sum, line) => sum + line.unitCoins * line.qty, 0);
    if (originalAmount < serverTotalFcfa) {
        return {
            statusCode: 400,
            body: {
                success: false,
                message: `Montant insuffisant pour le panier (attendu ${serverTotalFcfa} FCFA, reçu ${originalAmount} FCFA). Aucune réservation n'a été faite.`
            }
        };
    }

    const ticketCount = resolvedLines.reduce((sum, line) => sum + line.qty, 0);
    const unitRows = [];
    for (const line of resolvedLines) {
        for (let i = 0; i < line.qty; i++) unitRows.push(line);
    }

    const tickets = [];
    const baseTimestamp = Date.now();
    const created_at = now();
    const usedCodes = new Set();
    for (let unitIndex = 0; unitIndex < unitRows.length; unitIndex++) {
        const line = unitRows[unitIndex];
        const ticketId = uuidv4();
        const qrCode = genShortCode(usedCodes);
        tickets.push({
            id: ticketId,
            event_id: eventId,
            user_id: finalUserId,
            status: 'pending',
            payment_method: 'ussd',
            transaction_reference: orderId,
            attendee_name: userName,
            customer_name: userName,
            phone: cleanPhone,
            email: userEmail || generateEmailFromName(userName),
            is_guest: isGuest || false,
            purchased_at: created_at,
            qr_code: qrCode,
            ticket_code_short: qrCode,
            ticket_number: `US-${baseTimestamp}-${String(unitIndex + 1).padStart(4, '0')}`,
            ticket_type_id: line.typeId,
            purchase_price_pi: line.unitCoins,
            total_amount_pi: line.unitCoins,
            total_amount_fcfa: line.unitFcfa,
            quantity: 1,
            entry_count: 0,
            created_at,
            updated_at: created_at
        });
    }

    const { error: ticketsError } = await supabase.from('tickets').insert(tickets);
    if (ticketsError) {
        console.error('❌ Erreur insertion tickets:', ticketsError);
        return { statusCode: 500, body: { success: false, message: 'Erreur création des billets: ' + ticketsError.message } };
    }

    // ✅ Écriture miroir dans event_tickets pour l'affichage "Mes billets".
    const { data: mirrorEvent } = await supabase
        .from('events')
        .select('title, event_start_at, event_end_at, location, full_address, address, city, country, organizer_id')
        .eq('id', eventId)
        .maybeSingle();
    const eventTicketRows = tickets.map((t) => ({
        order_id: orderId,
        event_id: eventId,
        user_id: finalUserId,
        ticket_type_id: t.ticket_type_id,
        ticket_number: t.ticket_number,
        ticket_code: t.ticket_code_short,
        ticket_code_short: t.ticket_code_short,
        qr_code: t.qr_code,
        status: 'pending',
        payment_status: 'pending',
        payment_method: 'ussd',
        purchase_amount_pi: t.purchase_price_pi,
        purchase_amount_fcfa: t.total_amount_fcfa,
        purchased_at: created_at,
        transaction_reference: orderId,
        event_title: mirrorEvent?.title || null,
        event_start_at: mirrorEvent?.event_start_at || null,
        event_end_at: mirrorEvent?.event_end_at || null,
        location: mirrorEvent?.location || mirrorEvent?.city || null,
        full_address: mirrorEvent?.full_address || mirrorEvent?.address || mirrorEvent?.location || mirrorEvent?.city || null,
        address: mirrorEvent?.address || null,
        city: mirrorEvent?.city || null,
        country: mirrorEvent?.country || null
    }));
    try {
        const { error: evtError } = await supabase.from('event_tickets').insert(eventTicketRows);
        if (evtError) console.error('⚠️ Écriture event_tickets ignorée:', evtError.message);
    } catch (e) {
        console.error('⚠️ Écriture event_tickets ignorée (exception):', e.message);
    }

    // Paiement (status pending, en attente de validation admin)
    const { data: paymentRow, error: paymentError } = await supabase
        .from('payments')
        .insert({
            user_id: finalUserId,
            coins_amount: serverTotalCoins,
            amount_fcfa: serverTotalFcfa,
            status: 'pending',
            payment_method: 'ussd',
            transaction_id: orderId,
            pack_id: 'ticket_payment',
            coupon_code: promoCodeId || null,
            credits_added: false
        })
        .select()
        .single();

    if (paymentError) {
        console.error('❌ Erreur insertion paiement ticket USSD:', paymentError);
        return { statusCode: 500, body: { success: false, message: 'Erreur enregistrement paiement: ' + paymentError.message } };
    }

    await recordUssdEvidence({
        userId: finalUserId,
        transactionType: 'ticket_purchase',
        amountPi: serverTotalCoins,
        amountFcfa: serverTotalFcfa,
        description: `Achat de ${ticketCount} billet(s) via USSD${cleanSmsRef ? ` (réf. ${cleanSmsRef})` : ''} - en attente de validation`,
        paymentId: paymentRow.id,
        ussdMeta,
        extra: {
            payment_type: 'tickets',
            event_id: eventId,
            cart: cartData,
            promo_code_id: promoCodeId || null,
            commission_amount: commissionAmount || 0
        }
    });

    // Les gains organisateur ne sont credites qu'a la validation du depot.

    return {
        statusCode: 200,
        body: {
            success: true,
            type: 'tickets',
            transaction_id: orderId,
            payment_id: paymentRow.id,
            ticket_count: tickets.length,
            tickets: tickets.map((t) => ({
                id: t.id,
                qr_code: t.qr_code,
                ticket_code_short: t.ticket_code_short,
                ticket_number: t.ticket_number
            })),
            message: 'Paiement enregistré. Vos billets sont en attente de validation et seront disponibles dès validation par un administrateur.',
            pending_validation: true
        }
    };
};

// ============================================================
// STATUS — consultation publique de l'état d'un paiement USSD
// (utilisée par la vue "Mes billets" des invités sans compte)
// ============================================================
const handleStatus = async (body) => {
    const { transactionId, paymentId } = body;
    if (!transactionId && !paymentId) {
        return { statusCode: 400, body: { success: false, status: null, message: 'transactionId requis' } };
    }
    try {
        let query = supabase
            .from('payments')
            .select('transaction_id, status, payment_method, amount_fcfa, processed_at');
        if (paymentId) query = query.eq('id', paymentId);
        else query = query.eq('transaction_id', transactionId);
        const { data, error } = await query.maybeSingle();

        if (error || !data) {
            return { statusCode: 200, body: { success: false, status: null, message: 'Paiement introuvable' } };
        }
        return {
            statusCode: 200,
            body: {
                success: true,
                status: data.status,
                transaction_id: data.transaction_id,
                payment_method: data.payment_method,
                amount_fcfa: data.amount_fcfa,
                processed_at: data.processed_at
            }
        };
    } catch (e) {
        console.error('❌ Erreur consultation statut USSD:', e.message);
        return { statusCode: 500, body: { success: false, status: null, message: e.message } };
    }
};

// ============================================================
// VALIDATE / REJECT — actions admin
// ============================================================
const resolvePayment = async (body, targetStatus) => {
    const { paymentId, transactionId, actorId } = body;
    if (!paymentId && !transactionId) {
        return { statusCode: 400, body: { success: false, message: 'paymentId requis' } };
    }

    let query = supabase.from('payments').select('*');
    if (paymentId) query = query.eq('id', paymentId);
    else query = query.eq('transaction_id', transactionId);
    const { data: rows, error } = await query.maybeSingle();

    if (error || !rows) {
        return { statusCode: 404, body: { success: false, message: 'Paiement introuvable' } };
    }
    if (rows.payment_method !== 'ussd') {
        return { statusCode: 400, body: { success: false, message: 'Ce paiement n\'est pas un paiement USSD' } };
    }

    const payment = rows;

    const ADMIN_ROLES = ['super_admin', 'admin', 'secretary'];
    if (!actorId) {
        return { statusCode: 403, body: { success: false, message: 'Identifiant administrateur requis pour valider ou rejeter un depot.' } };
    }
    const { data: actor } = await supabase
        .from('profiles')
        .select('user_type, is_active')
        .eq('id', actorId)
        .maybeSingle();
    if (!actor || !ADMIN_ROLES.includes(actor.user_type) || actor.is_active === false) {
        return { statusCode: 403, body: { success: false, message: 'Seul un administrateur (super_admin, admin ou secretaire) peut valider ou rejeter un depot USSD.' } };
    }
    if (payment.status && payment.status !== 'pending') {
        return {
            statusCode: 409,
            body: {
                success: false,
                message: `Ce paiement est deja ${payment.status === 'completed' ? 'valide' : 'rejete'} : double traitement refuse.`,
                current_status: payment.status
            }
        };
    }

    let deliveryMeta = null;
    {
        const proofs = await findUssdEvidence(payment.id);
        deliveryMeta = proofs[0] || null;
        if (targetStatus === 'completed' && !proofs.length) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    message: 'Preuve de dépôt USSD introuvable pour ce paiement : validation refusée. Vérifiez la référence SMS et la capture d’écran avant de valider.'
                }
            };
        }
    }

    // ---- REJET : rembourser / annuler la délivrance ----
    if (targetStatus === 'cancelled') {
        const orderId = payment.transaction_id;
        const orderPackIds = ['ticket_payment', 'vote_payment', 'stand_rental_payment', 'raffle_payment', 'protected_access_payment'];
        const isCredits = !orderPackIds.includes(payment.pack_id);

        if (isCredits && payment.credits_added) {
            const coins = payment.coins_amount || 0;
            const { data: profile } = await supabase.from('profiles').select('coin_balance').eq('id', payment.user_id).single();
            if (profile) {
                const newBalance = Math.max((profile.coin_balance || 0) - coins, 0);
                await supabase.from('profiles').update({ coin_balance: newBalance, updated_at: now() }).eq('id', payment.user_id);
                await supabase.from('transactions').insert({
                    user_id: payment.user_id,
                    transaction_type: 'reversed_credits',
                    amount_pi: coins,
                    amount_fcfa: payment.amount_fcfa || 0,
                    status: 'completed',
                    description: `↩️ Remboursement USSD rejeté (${payment.amount_fcfa || 0} FCFA)`,
                    reference_id: payment.id,
                    metadata: { ussd: payment.metadata?.ussd }
                });
            }
        }

        if (payment.pack_id === 'ticket_payment') {
            try {
                await supabase.from('tickets').update({ status: 'cancelled', updated_at: now() }).eq('transaction_reference', orderId);
            } catch (err) {
                console.warn('⚠️ tickets cleanup skip:', err.message);
            }
            try {
                await supabase.from('event_tickets').update({ status: 'cancelled' }).eq('transaction_reference', orderId);
            } catch (err) {
                console.warn('⚠️ event_tickets cleanup skip:', err.message);
            }
        }

        // Location de stand USSD : annuler les réservations en attente de cette commande
        if (payment.pack_id === 'stand_rental_payment') {
            const rentalIds = (deliveryMeta && Array.isArray(deliveryMeta.bookings))
                ? deliveryMeta.bookings.map((b) => b && b.rental_id).filter(Boolean)
                : [];
            if (rentalIds.length) {
                try {
                    await supabase
                        .from('stand_rentals')
                        .update({ status: 'cancelled', cancelled_at: now(), updated_at: now() })
                        .in('id', rentalIds)
                        .eq('status', 'pending_validation');
                } catch (err) {
                    console.warn('⚠️ stand_rentals cancel skip:', err.message);
                }
            }
        }

        // Votes USSD : ne rien créditer, marquer le vote en attente comme rejeté
        if (payment.pack_id === 'vote_payment') {
            try {
                await supabase.from('vote_payments').update({ status: 'cancelled', rejected_by: actorId || null, rejected_at: now(), updated_at: now() }).eq('payment_id', payment.id);
            } catch (err) {
                console.warn('⚠️ vote_payments cancel skip:', err.message);
            }
        }
    }

    const updates = { status: targetStatus, processed_at: now() };
    if (targetStatus === 'completed') {
        updates.credits_added = true;
        updates.validated_by = actorId || null;
        updates.validated_at = now();
        updates.rejected_by = null;
        updates.rejected_at = null;
        try {
            await supabase.from('transactions')
                .update({ status: 'completed', completed_at: now() })
                .eq('transaction_reference', payment.id);
        } catch (e) {
            console.warn('⚠️ Mise à jour de la preuve USSD ignorée:', e.message);
        }
    } else {
        updates.rejected_by = actorId || null;
        updates.rejected_at = now();
        updates.validated_by = null;
        updates.validated_at = null;
    }

    // Votes USSD validés : appliquer réellement l'incrément des voix
    if (targetStatus === 'completed' && payment.pack_id === 'vote_payment') {
        try {
            const { data: vpRows } = await supabase.from('vote_payments').select('*').eq('payment_id', payment.id);
            if (vpRows && vpRows.length > 0) {
                // 🔒 Limite par téléphone (anti-fraude) : refuser AVANT de créditer
                // pour éviter un crédit partiel. Le trigger DB reste le filet de sécurité.
                let payerPhone = '';
                const firstVp = vpRows.find((v) => v.event_id);
                if (firstVp?.user_id) {
                    const { data: payerPr } = await supabase.from('profiles').select('phone').eq('id', firstVp.user_id).maybeSingle();
                    payerPhone = payerPr?.phone || '';
                }
                if (firstVp?.event_id && payerPhone) {
                    const { data: esLim } = await supabase.from('event_settings').select('max_votes_per_phone').eq('event_id', firstVp.event_id).maybeSingle();
                    const phoneLimit = Number(esLim?.max_votes_per_phone || 0);
                    if (phoneLimit > 0) {
                        const { data: phCnt } = await supabase.rpc('get_phone_vote_count', { p_event_id: firstVp.event_id, p_phone: payerPhone });
                        const alreadyVoted = Number(phCnt || 0);
                        const adding = vpRows.reduce((s, v) => s + (v.vote_count || 1), 0);
                        if (alreadyVoted + adding > phoneLimit) {
                            return {
                                statusCode: 400,
                                body: { success: false, message: `Limite de ${phoneLimit} voix par téléphone atteinte pour cet événement (${alreadyVoted} voix déjà données). Validation refusée.` }
                            };
                        }
                    }
                }
                for (const vp of vpRows) {
                    const vCount = vp.vote_count || 1;
                    const vAmountPi = vp.amount_pi || 0;
                    const candidateId = vp.candidate_id;
                    const vpEventId = vp.event_id || vp.contest_id || '00000000-0000-0000-0000-000000000000';

                    // Incrément du compteur public du candidat
                    // ⚠️ Ne PAS mettre "updated_at" ici : la table candidates n'a pas cette
                    // colonne => l'UPDATE échouerait silencieusement (PGRST204) et les voix
                    // ne seraient jamais ajoutées au candidat / au classement.
                    const { data: cand } = await supabase.from('candidates').select('vote_count').eq('id', candidateId).maybeSingle();
                    const { error: candidateUpdErr } = await supabase
                        .from('candidates')
                        .update({ vote_count: (cand?.vote_count || 0) + vCount })
                        .eq('id', candidateId);
                    if (candidateUpdErr) {
                        console.error('⚠️ Incrément voix candidat échoué:', candidateUpdErr.message);
                    }

                    // Aggrégat par user/candidat dans user_votes
                    const { data: existingVote } = await supabase.from('user_votes')
                        .select('vote_count, vote_cost_pi, net_to_organizer, fees')
                        .eq('user_id', vp.user_id)
                        .eq('candidate_id', candidateId)
                        .eq('event_id', vpEventId)
                        .maybeSingle();
                    const totalVoteCount = (existingVote?.vote_count || 0) + vCount;
                    const totalCost = (existingVote?.vote_cost_pi || 0) + vAmountPi;
                    await supabase.from('user_votes').upsert({
                        user_id: vp.user_id,
                        candidate_id: candidateId,
                        event_id: vpEventId,
                        vote_count: totalVoteCount,
                        vote_cost_pi: totalCost,
                        vote_cost_fcfa: totalCost * 5,
                        net_to_organizer: (existingVote?.net_to_organizer || 0) + vAmountPi,
                        fees: existingVote?.fees || 0,
                        payment_method: 'ussd',
                        payment_status: 'completed',
                        voter_phone: payerPhone || null,
                        created_at: new Date().toISOString()
                    }, { onConflict: 'event_id, candidate_id, user_id' });

                    // Créditer l'organisateur
                    let orgId = vp.organizer_id;
                    if (!orgId) {
                        if (vp.event_id) {
                            const { data: ev } = await supabase.from('events').select('organizer_id').eq('id', vp.event_id).maybeSingle();
                            orgId = ev?.organizer_id;
                        } else if (vp.contest_id) {
                            const { data: ct } = await supabase.from('contests').select('organizer_id').eq('id', vp.contest_id).maybeSingle();
                            orgId = ct?.organizer_id;
                        }
                    }
                    if (orgId) {
                        const { error: voteEarningError } = await supabase.rpc('credit_organizer_earnings', {
                            p_organizer_id: orgId,
                            p_event_id: vp.event_id || null,
                            p_transaction_id: payment.id,
                            p_transaction_type: 'vote',
                            p_earnings_coins: vAmountPi,
                            p_earnings_fcfa: vp.amount_fcfa || 0,
                            p_ticket_count: vCount,
                            p_description: `${vCount} voix (USSD validé)`,
                            p_created_at: now()
                        });
                        if (voteEarningError) throw new Error(voteEarningError.message);
                    }

                    // Marquer le vote en attente comme validé
                    await supabase.from('vote_payments').update({ status: 'completed', validated_by: actorId || null, validated_at: now(), updated_at: now() }).eq('payment_id', payment.id);
                }
            }
        } catch (e) {
            console.error('⚠️ Application des voix USSD échouée:', e.message);
        }
    }

    const CREDIT_PACK_EXCLUSIONS = ['ticket_payment', 'vote_payment', 'stand_rental_payment', 'raffle_payment', 'protected_access_payment'];
    if (targetStatus === 'completed' && !CREDIT_PACK_EXCLUSIONS.includes(payment.pack_id)) {
        const coins = payment.coins_amount || 0;
        if (coins > 0 && !payment.credits_added) {
            try {
                const { data: buyerProfile } = await supabase.from('profiles').select('coin_balance').eq('id', payment.user_id).maybeSingle();
                if (buyerProfile) {
                    const newBalance = (buyerProfile.coin_balance || 0) + coins;
                    const { error: creditError } = await supabase
                        .from('profiles')
                        .update({ coin_balance: newBalance, updated_at: now() })
                        .eq('id', payment.user_id);
                    if (creditError) throw new Error(creditError.message);
                    await supabase.from('transactions').insert({
                        user_id: payment.user_id,
                        transaction_type: 'credit_purchase',
                        amount_pi: coins,
                        amount_fcfa: payment.amount_fcfa || coins * 10,
                        status: 'completed',
                        completed_at: now(),
                        description: `Recharge USSD validée (${payment.amount_fcfa || coins * 10} FCFA)`,
                        transaction_reference: payment.id,
                        metadata: { payment_id: payment.id, payment_type: 'credits' }
                    });
                }
            } catch (e) {
                console.error('⚠️ Crédit des pièces USSD échoué:', e.message);
            }
        }
    }

    if (targetStatus === 'completed' && payment.pack_id === 'ticket_payment') {
        const orderId = payment.transaction_id;
        try {
            const { error: ticketsDeliveryError } = await supabase
                .from('tickets')
                .update({ status: 'active', updated_at: now() })
                .eq('transaction_reference', orderId);
            if (ticketsDeliveryError) throw new Error(ticketsDeliveryError.message);
            const { error: mirrorDeliveryError } = await supabase
                .from('event_tickets')
                .update({ status: 'active', payment_status: 'completed', updated_at: now() })
                .eq('transaction_reference', orderId);
            if (mirrorDeliveryError) throw new Error(mirrorDeliveryError.message);
            const { data: delivered, error: deliveredError } = await supabase
                .from('tickets')
                .select('ticket_type_id')
                .eq('transaction_reference', orderId);
            if (deliveredError) throw new Error(deliveredError.message);
            const soldByType = {};
            (delivered || []).forEach((t) => {
                if (t.ticket_type_id) soldByType[t.ticket_type_id] = (soldByType[t.ticket_type_id] || 0) + 1;
            });
            for (const [typeId, count] of Object.entries(soldByType)) {
                const { data: typeRow } = await supabase
                    .from('ticket_types')
                    .select('quantity_sold, tickets_sold')
                    .eq('id', typeId)
                    .maybeSingle();
                await supabase
                    .from('ticket_types')
                    .update({
                        quantity_sold: Number(typeRow?.quantity_sold || 0) + count,
                        tickets_sold: Number(typeRow?.tickets_sold || 0) + count
                    })
                    .eq('id', typeId);
            }
        } catch (e) {
            console.error('⚠️ Livraison des billets USSD échouée:', e.message);
        }

        try {
            const { data: evRow } = await supabase
                .from('events')
                .select('organizer_id')
                .eq('id', (deliveryMeta && deliveryMeta.event_id) || '')
                .maybeSingle();
            if (evRow && evRow.organizer_id) {
                await creditEarningsOnce({
                    transactionRef: orderId,
                    organizerId: evRow.organizer_id,
                    eventId: (deliveryMeta && deliveryMeta.event_id) || null,
                    transactionType: 'ticket_sale',
                    coins: Number(payment.coins_amount || 0),
                    fcfa: Number(payment.amount_fcfa || 0),
                    ticketCount: (deliveryMeta && deliveryMeta.cart)
                        ? Object.values(deliveryMeta.cart).reduce((s, q) => s + (Number(q) || 0), 0)
                        : null,
                    description: `Vente de tickets via USSD - ${orderId}`,
                });
            }
        } catch (e) {
            console.error('⚠️ Gains organisateur USSD non crédités:', e.message);
        }
    }

    if (targetStatus === 'completed' && payment.pack_id === 'stand_rental_payment') {
        const bookings = (deliveryMeta && Array.isArray(deliveryMeta.bookings)) ? deliveryMeta.bookings : [];
        try {
            for (const booking of bookings) {
                const { data: rental } = await supabase
                    .from('stand_rentals')
                    .select('id, stand_type_id')
                    .eq('id', booking.rental_id)
                    .maybeSingle();
                if (!rental || rental.status !== 'pending_validation') continue;
                await supabase
                    .from('stand_rentals')
                    .update({ status: 'reserved', confirmed_at: now(), updated_at: now() })
                    .eq('id', rental.id);
                const { data: standType } = await supabase
                    .from('stand_types')
                    .select('quantity_rented')
                    .eq('id', rental.stand_type_id)
                    .maybeSingle();
                await supabase
                    .from('stand_types')
                    .update({ quantity_rented: Number(standType?.quantity_rented || 0) + 1 })
                    .eq('id', rental.stand_type_id);
            }
            const { data: evRow } = await supabase
                .from('events')
                .select('organizer_id')
                .eq('id', (deliveryMeta && deliveryMeta.event_id) || '')
                .maybeSingle();
            if (evRow && evRow.organizer_id) {
                await creditEarningsOnce({
                    transactionRef: payment.transaction_id,
                    organizerId: evRow.organizer_id,
                    eventId: (deliveryMeta && deliveryMeta.event_id) || null,
                    transactionType: 'stand_rental',
                    coins: Number(payment.coins_amount || 0),
                    fcfa: Number(payment.amount_fcfa || 0),
                    ticketCount: bookings.length,
                    description: `Location de ${bookings.length} stand(s) via USSD - ${payment.transaction_id}`,
                });
            }
        } catch (e) {
            console.error('⚠️ Confirmation des stands USSD échouée:', e.message);
        }
    }

    if (targetStatus === 'completed' && payment.pack_id === 'raffle_payment') {
        const raffleId = deliveryMeta && deliveryMeta.raffle_event_id;
        const qty = Math.max(1, parseInt((deliveryMeta && deliveryMeta.quantity) || 0, 10) || 0);
        const unitCoins = Number((deliveryMeta && deliveryMeta.unit_coins) || 0);
        if (raffleId && qty > 0) {
            try {
                const { data: raffle } = await supabase
                    .from('raffle_events')
                    .select('id, tickets_sold, total_tickets, organizer_id, event_id')
                    .eq('id', raffleId)
                    .maybeSingle();
                if (!raffle) throw new Error('Tombola introuvable a la validation');
                const sold = Number(raffle.tickets_sold || 0);
                if (sold + qty > Number(raffle.total_tickets || 0)) {
                    throw new Error(`Tickets insuffisants a la validation (dispo: ${Math.max(0, Number(raffle.total_tickets || 0) - sold)})`);
                }
                const rows = [];
                for (let i = 0; i < qty; i++) {
                    rows.push({
                        id: uuidv4(),
                        raffle_event_id: raffleId,
                        user_id: payment.user_id,
                        ticket_number: Math.floor(100000 + Math.random() * 900000),
                        purchase_price_pi: unitCoins,
                        purchased_at: now(),
                    });
                }
                const { error: ticketErr } = await supabase.from('raffle_tickets').insert(rows);
                if (ticketErr) throw new Error(ticketErr.message);
                await supabase
                    .from('raffle_events')
                    .update({ tickets_sold: sold + qty })
                    .eq('id', raffleId);
                if (raffle.organizer_id) {
                    await creditEarningsOnce({
                        transactionRef: payment.transaction_id,
                        organizerId: raffle.organizer_id,
                        eventId: raffle.event_id || null,
                        transactionType: 'raffle_ticket_sale',
                        coins: Number(payment.coins_amount || 0),
                        fcfa: Number(payment.amount_fcfa || 0),
                        ticketCount: qty,
                        description: `Vente de ${qty} ticket(s) de tombola via USSD - ${payment.transaction_id}`,
                    });
                }
            } catch (e) {
                console.error('⚠️ Livraison des tickets de tombola USSD échouée:', e.message);
            }
        }
    }

    if (targetStatus === 'completed' && payment.pack_id === 'protected_access_payment') {
        const protectedEventId = deliveryMeta && deliveryMeta.event_id;
        if (protectedEventId) {
            try {
                const { data: evRow } = await supabase
                    .from('events')
                    .select('organizer_id')
                    .eq('id', protectedEventId)
                    .maybeSingle();
                const { data: already } = await supabase
                    .from('protected_event_access')
                    .select('id')
                    .eq('event_id', protectedEventId)
                    .eq('user_id', payment.user_id)
                    .maybeSingle();
                if (!already) {
                    await supabase.from('protected_event_access').insert({
                        id: uuidv4(),
                        event_id: protectedEventId,
                        user_id: payment.user_id,
                        status: 'active',
                        amount_paid_pi: Number(payment.coins_amount || 0),
                        created_at: now(),
                        updated_at: now(),
                    });
                }
                if (evRow && evRow.organizer_id) {
                    await creditEarningsOnce({
                        transactionRef: payment.transaction_id,
                        organizerId: evRow.organizer_id,
                        eventId: protectedEventId,
                        transactionType: 'event_access',
                        coins: Number(payment.coins_amount || 0),
                        fcfa: Number(payment.amount_fcfa || 0),
                        ticketCount: 1,
                        description: `Acces payant a l'evenement via USSD - ${payment.transaction_id}`,
                    });
                }
            } catch (e) {
                console.error('⚠️ Ouverture de l\'accès protégé USSD échouée:', e.message);
            }
        }
    }

    const { error: updateError } = await supabase.from('payments').update(updates).eq('id', payment.id);
    if (updateError) {
        return { statusCode: 500, body: { success: false, message: 'Erreur mise à jour: ' + updateError.message } };
    }

    return {
        statusCode: 200,
        body: {
            success: true,
            status: targetStatus,
            message: targetStatus === 'completed' ? 'Paiement validé ✅' : 'Paiement rejeté (annulé)'
        }
    };
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
        return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    if (!supabase) {
        console.error('❌ ussd-payment: variables Supabase manquantes');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Configuration Supabase manquante côté serveur (SUPABASE_SERVICE_ROLE_KEY)'
            })
        };
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        const { action } = payload;

        let result;
        switch (action) {
            case 'submit':
                result = await handleSubmit(payload);
                break;
            case 'validate':
                result = await resolvePayment(payload, 'completed');
                break;
            case 'reject':
                result = await resolvePayment(payload, 'cancelled');
                break;
            case 'status':
                result = await handleStatus(payload);
                break;
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Action inconnue (submit | validate | reject)' })
                };
        }

        console.log(`✅ ussd-payment [${action}]`, result.body);
        return {
            statusCode: result.statusCode,
            headers,
            body: JSON.stringify(result.body)
        };
    } catch (error) {
        console.error('❌ Erreur ussd-payment:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: error.message || 'Erreur serveur' })
        };
    }
};