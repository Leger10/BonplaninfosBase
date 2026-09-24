import fs from 'node:fs';

const d = fs.readFileSync('db/mysql-data.sql', 'utf8');
const schema = fs.readFileSync('db/mysql-schema.sql', 'utf8');

const tables = new Set();
for (const m of d.matchAll(/INSERT INTO `([a-z0-9_]+)`/g)) tables.add(m[1]);
console.log('tables de données présentes :', tables.size);

const schemaTables = new Set();
for (const m of schema.matchAll(/CREATE TABLE `([a-z0-9_]+)`/g)) schemaTables.add(m[1]);
console.log('tables de schéma présentes :', schemaTables.size);

const wants = [
  'events', 'profiles', 'auth_users', 'user_votes', 'payments', 'tickets',
  'event_tickets', 'candidates', 'coupons', 'promo_codes', 'transactions',
  'event_settings', 'app_settings', 'welcome_popups', 'sponsors', 'announcements',
  'coin_packs', 'news_articles', 'contests', 'locations', 'participant_refunds',
  'event_refund_logs', 'refund_logs', 'promo_code_usages', 'coupon_usages',
  'user_coin_transactions', 'influencer_commissions', 'pin_reset_requests',
  'support_tickets', 'organizer_earnings', 'coin_transactions', 'push_tokens',
  'notifications', 'event_bookmarks', 'event_comments', 'event_promotions',
  'raffle_events', 'raffle_tickets', 'raffle_winners', 'stand_events',
  'stand_rentals', 'ticketing_events', 'ticket_types', 'tab', 'ticket_purchases',
];
for (const w of wants) {
  const s = schemaTables.has(w); const g = tables.has(w);
  console.log(w.padEnd(24), s ? 'schéma OK' : 'schéma MANQUANT', g ? '| données OK' : '| pas de données');
}

// comptage rapide de lignes par batch INSERT (approx)
function rowsIn(table) {
  const re = new RegExp(`INSERT INTO \`${table}\` \\(.*\\) VALUES\\n([\\s\\S]*?);`, 'g');
  let count = 0;
  let m;
  while ((m = re.exec(d))) {
    const chunk = m[1];
    count += chunk.split('),\n(').length;
  }
  return count;
}
for (const w of ['events', 'profiles', 'auth_users', 'user_votes', 'payments', 'candidates', 'tickets']) {
  console.log(`  ~lignes ${w}:`, rowsIn(w));
}