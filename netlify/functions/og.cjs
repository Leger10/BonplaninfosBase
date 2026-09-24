// netlify/functions/og.cjs
// Aperçu social (Open Graph / Twitter Card) pour les liens de candidat :
//   /og/:candidateId   (lien court partagé sur les réseaux)
//   /_og/:eventId/:candidateId  (compatibilité)
// Sert une page HTML complète dont l'image OG est la PHOTO DU CANDIDAT
// (au lieu du logo Bonplaninfos). Pour les humains, redirection vers la vraie
// page événement (l'app SPA). Les robots (WhatsApp, Telegram, Facebook...) ne
// suivent pas la redirection ET lisent les <meta> de cette page.

// Remarque Netlify : la redirection 200 vers ".netlify/functions/og" remplace
// le body mais PAS event.path => on reçoit toujours le chemin d'origine.
const createClient = require('./_lib/local-supabase.cjs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

let supabase = createClient(supabaseUrl, supabaseKey);

const escapeHtml = (s = '') =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const parseIds = (event) => {
    const segments = (event.path || '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .split('/');
    // /og/:candidateId
    if (segments[0] === 'og') {
        return { eventId: '', candidateId: segments[1] || '' };
    }
    // /_og/:eventId/:candidateId (compatibilité)
    if (segments[0] === '_og') {
        return { eventId: segments[1] || '', candidateId: segments[2] || '' };
    }
    return { eventId: '', candidateId: '' };
};

exports.handler = async (event) => {
    if (!supabase) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '<h1>Erreur de configuration</h1>',
        };
    }

    const { eventId, candidateId } = parseIds(event);

    if (!candidateId) {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '<h1>Lien d\u2019aper\u00e7u invalide</h1>',
        };
    }

    let eventRow = null;
    let candidate = null;

    try {
        const { data: cand } = await supabase
            .from('candidates')
            .select('id, name, photo_url, vote_count, event_id')
            .eq('id', candidateId)
            .maybeSingle();
        candidate = cand || null;
    } catch (e) {
        console.error('og: erreur lecture candidat', e.message);
    }

    const resolvedEventId = eventId || candidate?.event_id || '';

    if (!candidate || !resolvedEventId) {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '<h1>Contenu introuvable</h1>',
        };
    }

    try {
        const { data: ev } = await supabase
            .from('events')
            .select('id, title')
            .eq('id', resolvedEventId)
            .maybeSingle();
        eventRow = ev || null;
    } catch (e) {
        console.error('og: erreur lecture événement', e.message);
    }

    if (!candidate) {
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: '<h1>Contenu introuvable</h1>',
        };
    }

    const siteUrl = (process.env.VITE_SITE_URL || 'https://bonplaninfos.net').replace(/\/+$/, '');
    const candidatePageUrl = `${siteUrl}/event/${resolvedEventId}?candidate=${candidateId}`;
    // photo_url stockée est déjà une URL publique absolue (Supabase Storage).
    const imageUrl = candidate.photo_url
        ? (candidate.photo_url.startsWith('http') ? candidate.photo_url : `${siteUrl}${candidate.photo_url}`)
        : `${siteUrl}/images.jpeg`;

    const title = `Votez pour ${candidate.name} ! 🗳️`;
    const eventLabel = eventRow?.title || 'un concours';
    const description = `${candidate.name} participe à « ${eventLabel} » sur Bonplaninfos. Soutenez-le/elle et faites décoller son classement ! 🏆`;
    const votesLine = ` (${candidate.vote_count || 0} voix déjà)`;

    const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description + votesLine)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description + votesLine)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(candidatePageUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Bonplaninfos" />
    <meta property="og:locale" content="fr_FR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description + votesLine)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(candidatePageUrl)}" />
    <link rel="canonical" href="${escapeHtml(candidatePageUrl)}" />
  </head>
  <body style="margin:0;background:#0b0b0b;color:#fff;font-family:Arial;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(candidate.name)}" style="max-width:320px;max-height:320px;border-radius:16px;object-fit:cover;" />
    <h1 style="margin:16px 10px 0;font-size:20px;">${escapeHtml(title)}</h1>
    <p style="color:#a0a0a0;font-size:14px;padding:0 16px;">${escapeHtml(description + votesLine)}</p>
    <p style="margin-top:24px;"><a href="${escapeHtml(candidatePageUrl)}" style="background:#10b981;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;">Voter maintenant</a></p>
  </body>
</html>`;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
        body: html,
    };
};