// Client minimal vers la base MySQL (MariaDB) via la Netlify function `db`.
// Utilisé en premier ; les pages gardent leur fallback Supabase.
const DB_FN = "/.netlify/functions/db";

async function getJson(route, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== ""),
  ).toString();
  const url = qs ? `${DB_FN}/${route}?${qs}` : `${DB_FN}/${route}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`db function ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body;
}

export const dbService = {
  async getActiveEvents(limit = 100) {
    const body = await getJson("events", { status: "active", order: "created_at:desc", limit });
    return body.rows;
  },

  async getEventById(id) {
    const body = await getJson("events", { id });
    return body.rows;
  },

  async getEventsByOrganizer(organizerId) {
    const body = await getJson("events", { organizer_id: organizerId });
    return body.rows;
  },

  async getAllEvents({ status = "active", organizer_id, country, limit = 1000 } = {}) {
    const body = await getJson("events", {
      status,
      organizer_id,
      country,
      order: "created_at:desc",
      limit,
    });
    return body.rows;
  },

  async getPromotions() {
    const body = await getJson("promotions");
    return body.rows;
  },

  async getCandidates({ event_id, category } = {}) {
    const body = await getJson("candidates", { event_id, category });
    return body.rows;
  },

  async getActiveCategories() {
    const body = await getJson("categories");
    return body.rows;
  },

  async getPromoEventIds() {
    const body = await getJson("promo-events");
    return body.rows;
  },

  async getPromotedEvents(limit = 8) {
    const body = await getJson("events", {
      status_in: "active,protected",
      promoted: "true",
      promoted_live: "true",
      order: "created_at:desc",
      limit,
    });
    return body.rows;
  },

  async getUnlockedEventIds(userId) {
    const body = await getJson("protected-events", { user_id: userId });
    return body.rows;
  },

  async getProfiles(limit = 10, id = null) {
    const body = await getJson("profiles", { limit, id });
    return body.rows;
  },

  async health() {
    const body = await getJson("health");
    return body.ok;
  },
};

export default dbService;