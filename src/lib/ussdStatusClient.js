import { localSupabase } from "./localSupabaseClient";

// Client dédié à la consultation/action USSD local : le client local émule la
// lecture via le moteur de requête Express (Prisma).
export const ussdServiceClient = localSupabase;

// Lecture du statut d'un paiement USSD (fallback local). Retourne 'pending' | 'completed' | 'cancelled' | null.
export const fetchUssdStatus = async (orderId) => {
  if (!ussdServiceClient || !orderId) return null;
  try {
    let q = ussdServiceClient
      .from("payments")
      .select("status")
      .eq("payment_method", "ussd");
    const { data, error } = await q
      .eq("transaction_id", orderId)
      .maybeSingle();
    if (error || !data) return null;
    return data.status;
  } catch (e) {
    console.error("Erreur fetch état USSD:", e);
    return null;
  }
};