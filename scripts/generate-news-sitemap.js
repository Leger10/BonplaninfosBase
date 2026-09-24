import { writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { localQuery, API_BASE } from "./lib/localQuery.mjs";

const BASE_URL = "https://bonplaninfos.net";

function writeMinimalSitemap() {
  console.log("⚠️ Moteur local indisponible : news sitemap minimal généré");
  const today = new Date().toISOString().split("T")[0];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/news</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;
  if (!existsSync("dist")) mkdirSync("dist");
  writeFileSync(path.join("dist", "news-sitemap.xml"), xml.trim());
}

async function generateNewsSitemap() {
  const today = new Date().toISOString().split("T")[0];
  try {
    const { data: articles } = await localQuery("news_articles")
      .select("id, slug, updated_at, published_at, created_at")
      .eq("status", "published")
      .limit(1000);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/news</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;

    articles?.forEach(article => {
      const lastmod = article.updated_at || article.published_at || article.created_at || today;
      const slug = article.slug || article.id;
      xml += `
  <url>
    <loc>${BASE_URL}/news/${slug}</loc>
    <lastmod>${lastmod.split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    xml += "\n</urlset>";

    if (!existsSync("dist")) mkdirSync("dist");
    writeFileSync(path.join("dist", "news-sitemap.xml"), xml.trim());
    console.log(`✅ News sitemap généré depuis ${API_BASE} (${articles?.length || 0} articles)`);

  } catch (err) {
    console.log(`⚠️ Moteur local indisponible (${API_BASE}): ${err.message}`);
    writeMinimalSitemap();
  }
}

generateNewsSitemap();