// Prisma singleton + introspection du modèle (noms de tables et colonnes).
import { PrismaClient } from '@prisma/client';

let prisma;
export function getDb() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function models() {
  return getDb()._runtimeDataModel?.models || {};
}

// Colonnes scalaires (toutes les colonnes, aucune relation déclarée) d'un modèle.
export function scalarColumns(modelName) {
  const model = models()[modelName];
  if (!model) return null;
  return model.fields.filter((f) => f.kind === 'scalar').map((f) => f.name);
}

export function allModels() {
  return Object.keys(models());
}