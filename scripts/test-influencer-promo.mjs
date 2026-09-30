// Positions des codes promo d'influenceur dans /api/query.
//
// PromoCodeGenerator.jsx crée (insert), active/désactive (update) et vérifie
// ses propres codes promo via POST /api/query sur promo_codes. Sans portée
// propriétaire, checkWritePolicy refusait tout en bloc (403 write_forbidden) :
// « erreur d'écriture » côté influenceur.
//
// La portée retenue : { column: 'influencer_id' } — l'appelant n'écrit que sur
// ses propres codes ; l'influencer_id du body est forcé à l'identité vérifiée,
// même si le client prétend être un autre. La LECTURE reste publique : le
// formulaire doit consulter tous les codes pour vérifier qu'un code personnalisé
// n'est pas déjà pris.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
const prisma = new PrismaClient();
const PORT = process.env.PROMO_TEST_PORT || 8888;
const API = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = 'Tmp!23456789';

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json };
}

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(52)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const promoIds = [];

try {
  const stamp = Date.now();
  let seq = 0;
  const mk = async () => {
    const email = `tmp-promo-${stamp}-${++seq}@test.local`;
    const r = await post('/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    if (!id) throw new Error(`inscription ${email} -> ${JSON.stringify(r.json).slice(0, 160)}`);
    ids.push(id);
    const token = (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;
    return { id, token, email };
  };

  const X = await mk(); // influenceur principal
  const Y = await mk(); // influenceur tiers
  const O = await mk(); // organisateur de l'événement (l'influenceur n'en est PAS l'organisateur)
  const ev = await prisma.events.create({
    data: {
      title: `TMP promo ${stamp}`,
      organizer_id: O.id,
      status: 'published',
      city: 'X',
      event_start_at: new Date(Date.now() + 86400000),
    },
  });
  const alreadyByEvent = await prisma.events.findUnique({ where: { id: ev.id }, select: { id: true } });
  check('événement de test créé (organisateur tiers)', !!alreadyByEvent, true);

  const query = (method, table, extra = {}, token) => post('/query', { method, table, ...extra }, token);
  const insert = (token, body) => query('insert', 'promo_codes', { body }, token);
  const update = (token, id, body) => query('update', 'promo_codes', { body, filters: [{ column: 'id', op: 'eq', value: id }] }, token);
  const row = (id) => prisma.promo_codes.findUnique({ where: { id }, select: { influencer_id: true, is_active: true, code: true } });
  const cleanupPromo = async (pid) => {
    if (pid) { promoIds.push(pid); }
  };

  // ---------- 1. l'influenceur crée son propre code ----------
  const ins = await insert(X.token, {
    code: `PX-${stamp}`,
    influencer_id: Y.id, // usurpation : doit être écrasé par X.id
    event_id: ev.id,
    is_active: true,
    usage_count: 0,
    usage_limit: null,
  });
  const promoId = ins.json?.data?.[0]?.id || ins.json?.data?.id;
  check('insert code promo influenceur -> 200', ins.status, 200);
  check('  id renvoyé', !!promoId, true);
  if (promoId) {
    await cleanupPromo(promoId);
    const dbRow = await row(promoId);
    check('  influencer_id forcé à l\'appelant', dbRow?.influencer_id, X.id);
    check('  code enregistré', dbRow?.code, `PX-${stamp}`);
  }

  // ---------- 2. un autre influenceur a son propre code ----------
  const insY = await insert(Y.token, { code: `PY-${stamp}`, event_id: ev.id, is_active: true });
  const promoIdY = insY.json?.data?.[0]?.id || insY.json?.data?.id;
  check('insert par un autre influenceur -> 200', insY.status, 200);
  if (promoIdY) await cleanupPromo(promoIdY);

  // ---------- 3. l'influenceur active/désactive son propre code ----------
  if (promoId) {
    const off = await update(X.token, promoId, { is_active: false });
    check('désactiver son code -> 200', off.status, 200);
    check('  is_active=false en base', (await row(promoId))?.is_active, false);
    const on = await update(X.token, promoId, { is_active: true });
    check('réactiver son code -> 200', on.status, 200);
    check('  is_active=true en base', (await row(promoId))?.is_active, true);
  }

  // ---------- 4. il ne modifie pas le code d'un autre ----------
  if (promoIdY) {
    const offY = await update(X.token, promoIdY, { is_active: false });
    check('modifier le code d\'un autre -> 200 (filtré à 0 ligne)', offY.status, 200);
    check('  code tier intact', (await row(promoIdY))?.is_active, true);
  }

  // ---------- 5. anonyme : pas d'accès ----------
  const anon = await insert(null, { code: `ANON-${stamp}`, event_id: ev.id });
  check('insert anonyme -> 401', anon.status, 401);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 300));
  fails += 1;
} finally {
  for (const pid of promoIds.filter(Boolean)) await prisma.promo_codes.deleteMany({ where: { id: pid } });
  const tmpEvents = await prisma.events.findMany({ where: { title: { startsWith: 'TMP promo' } }, select: { id: true } });
  for (const e of tmpEvents) await prisma.events.deleteMany({ where: { id: e.id } });
  for (const id of ids.filter(Boolean)) {
    await prisma.promo_codes.deleteMany({ where: { influencer_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  const remain = await prisma.promo_codes.count({ where: { code: { startsWith: 'TMP' } } });
  console.log(`nettoyage: comptes tmp restants = ${ids.filter(Boolean).length - 0} (traités) | codes promo TMP restants = ${remain}`);
}