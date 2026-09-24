// Singleton Prisma Client partagé par toutes les fonctions Netlify.
// Réutilise l'instance entre les invocations en dev (réchauffage).
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}

module.exports = { prisma };