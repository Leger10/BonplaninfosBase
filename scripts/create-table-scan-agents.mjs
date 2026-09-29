// scripts/create-table-scan-agents.mjs
// Delegation de scan au profit des agents terrain.
//
// Pourquoi : verify_ticket_direct et reset_ticket ne reçoivent que
// l'identifiant du billet, donc seule la base peut repondre « cette personne
// a-t-elle le droit de scanner l'evenement de ce billet ? ». Un agent est un
// compte comme un autre : rien dans son profil ne dit a quels evenements il a
// acces. D'ou cette table, une ligne par couple (organisateur, agent).
//
// Perimetre choisi : delegation PAR ORGANISATEUR. Un agent ajoute une fois peut
// scanner tous les evenements de cet organisateur. La reinitialisation d'un
// billet reste reservee a l'organisateur lui-meme.
//
// Idempotent : peut etre relance sans risque. A executer sur la base locale
// comme sur la production, une fois, avant de redemarrer le serveur.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CREATE = `
CREATE TABLE IF NOT EXISTS \`organizer_scan_agents\` (
  \`id\` char(36) NOT NULL,
  \`organizer_id\` char(36) NOT NULL,
  \`user_id\` char(36) NOT NULL,
  \`granted_by\` char(36) DEFAULT NULL,
  \`is_active\` tinyint(1) DEFAULT 1,
  \`created_at\` datetime(0) DEFAULT CURRENT_TIMESTAMP,
  \`last_scanned_at\` datetime(0) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_scan_agent\` (\`organizer_id\`, \`user_id\`),
  KEY \`idx_scan_agent_user\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

try {
  await prisma.$executeRawUnsafe(CREATE);
  console.log('table organizer_scan_agents : creation OK');
} catch (e) {
  console.error('creation KO :', e.message.split('\n')[0]);
  process.exitCode = 1;
}

const found = await prisma.$queryRawUnsafe(
  "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizer_scan_agents' ORDER BY ORDINAL_POSITION"
);
console.log('colonnes :', found.map((c) => c.COLUMN_NAME).join(', ') || 'aucune');

await prisma.$disconnect();
