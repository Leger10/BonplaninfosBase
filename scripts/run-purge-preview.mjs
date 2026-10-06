import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const file = process.argv[2] || "migrations-prod/purge-events-30d-preview.sql";

const raw = fs.readFileSync(file, "utf8");
const sql = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const prisma = new PrismaClient();

try {
  for (const [i, stmt] of statements.entries()) {
    const head = stmt.replace(/\s+/g, " ").slice(0, 78);
    try {
      const rows = await prisma.$queryRawUnsafe(stmt);
      const arr = Array.isArray(rows) ? rows : [rows];
      console.log(`\n[${i + 1}] ${head}`);
      for (const r of arr) {
        const line = Object.entries(r)
          .map(([k, v]) => `${k}=${v}`)
          .join("  |  ");
        console.log("      " + line);
      }
      if (arr.length > 8) console.log(`      ... ${arr.length} lignes au total`);
    } catch (e) {
      console.log(`\n[${i + 1}] ERREUR sur : ${head}`);
      console.log("      " + e.message);
      process.exitCode = 1;
    }
  }
} finally {
  await prisma.$disconnect();
}
