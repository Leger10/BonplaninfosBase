import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { localQuery, API_BASE } from "./lib/localQuery.mjs";

const BASE_URL = "https://bonplaninfos.net";

const STATIC_PAGES = [
  "/", "/discover", "/events", "/news", "/promotions",
  "/sponsors", "/about", "/how-it-works", "/pricing",
  "/packs", "/wallet", "/create-event", "/boost",
  "/help-center", "/faq", "/terms", "/privacy-policy",
  "/legal-mentions", "/partner-signup", "/marketing"
];

const LANGUAGES = ["fr", "en"];
const AFRICAN_COUNTRIES = ["ci","sn","cm","ml","bf","bj","tg","ga","cg","cd","gn","ne","td","cf","mg","gh","ng","ke"];

function writeStaticSitemap() {
  console.log("🔒 Mode sécurité : génération sitemap statique");
  const today = new Date().toISOString().split("T")[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  STATIC_PAGES.forEach(page => {
    xml += `  <url>\n    <loc>${BASE_URL}${page === "/" ? "" : page}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${page === "/" ? "1.0" : "0.7"}</priority>\n  </url>\n`;
  });
  xml += "</urlset>";
  const distDir = path.join(process.cwd(), "dist");
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, "sitemap.xml"), xml.trim());
}

async function fetchDynamicRoutes() {
  const routes = [];

  const eventsRes = await localQuery("events").select("id, updated_at, created_at").eq("status", "active").limit(10000);
  eventsRes.data?.forEach(ev => {
    routes.push({ path: `/event/${ev.id}`, lastmod: ev.updated_at || ev.created_at });
  });

  const promosRes = await localQuery("promotion_packs").select("id, created_at").limit(10000);
  promosRes.data?.forEach(p => {
    routes.push({ path: `/promotion/${p.id}`, lastmod: p.created_at });
  });

  return routes;
}

function generateUrlEntry(url, lastmod, alternates = [], priority = "0.8") {
  const alternatesXml = alternates.map(a => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`).join("\n");
  return `
  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
${alternatesXml}
  </url>`;
}

async function generateSitemap() {
  const today = new Date().toISOString().split("T")[0];
  let dynamicRoutes = [];
  try {
    dynamicRoutes = await fetchDynamicRoutes();
    console.log(`✅ Sitemap dynamique depuis le moteur local (${API_BASE})`);
  } catch (err) {
    console.log(`⚠️ Moteur local indisponible (${API_BASE}), sitemap statique`);
    writeStaticSitemap();
    return;
  }

  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">`;

  STATIC_PAGES.forEach(page => {
    const alternates = [];
    LANGUAGES.forEach(lang => AFRICAN_COUNTRIES.forEach(c => {
      alternates.push({ hreflang: `${lang}-${c.toUpperCase()}`, href: `${BASE_URL}/${lang}/${c}${page === "/" ? "" : page}` });
    }));
    alternates.push({ hreflang: "x-default", href: `${BASE_URL}/fr/ci${page === "/" ? "" : page}` });
    sitemapXml += generateUrlEntry(`${BASE_URL}${page === "/" ? "" : page}`, today, alternates, page === "/" ? "1.0" : "0.7");
  });

  dynamicRoutes.forEach(route => {
    const alternates = [];
    LANGUAGES.forEach(lang => AFRICAN_COUNTRIES.forEach(c => {
      alternates.push({ hreflang: `${lang}-${c.toUpperCase()}`, href: `${BASE_URL}/${lang}/${c}${route.path}` });
    }));
    alternates.push({ hreflang: "x-default", href: `${BASE_URL}/fr/ci${route.path}` });
    sitemapXml += generateUrlEntry(`${BASE_URL}${route.path}`, route.lastmod, alternates, "0.9");
  });

  sitemapXml += "\n</urlset>";

  const distDir = path.join(process.cwd(), "dist");
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, "sitemap.xml"), sitemapXml.trim());

  console.log(`✅ Sitemap généré : ${STATIC_PAGES.length + dynamicRoutes.length} URLs`);
}

generateSitemap();