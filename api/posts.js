export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    const q = req.query || {};
    const page = Math.max(1, parseInt(q.page || "1", 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(q.per_page || "12", 10) || 12));
    const search = (q.search || "").toString().slice(0, 100);
    const category = (q.category || "").toString();

    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      _embed: "1",
    });
    if (category) params.set("categories", category);
    if (search) params.set("search", search);

    const upstream = await fetch(
      "https://opportunitydesk.org/wp-json/wp/v2/posts?" + params.toString(),
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OppDeskHub/1.0)",
          Accept: "application/json",
        },
      }
    );

    const total = upstream.headers.get("X-WP-Total");
    const totalPages = upstream.headers.get("X-WP-TotalPages");
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "Upstream error",
        status: upstream.status,
        body: text.slice(0, 200),
      });
    }

    let posts;
    try {
      posts = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "Invalid JSON from upstream" });
    }
    if (!Array.isArray(posts)) {
      return res.status(502).json({ error: "Unexpected upstream shape" });
    }

    const items = posts.map(normalize);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      items,
      page,
      per_page: perPage,
      total: total ? parseInt(total, 10) : null,
      total_pages: totalPages ? parseInt(totalPages, 10) : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Proxy failed" });
  }
}

function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function thumb(p) {
  const fm = (p._embedded && p._embedded["wp:featuredmedia"]) || [];
  if (!fm.length) return "";
  const m = fm[0];
  const sizes = (m.media_details && m.media_details.sizes) || {};
  for (const s of ["medium", "medium_large", "thumbnail"]) {
    if (sizes[s] && sizes[s].source_url) return sizes[s].source_url;
  }
  return m.source_url || "";
}

function terms(p) {
  const cats = [];
  const tags = [];
  for (const group of (p._embedded && p._embedded["wp:term"]) || []) {
    for (const t of group || []) {
      if (t.taxonomy === "category" && t.name) cats.push(t.name);
      if (t.taxonomy === "post_tag" && t.name) tags.push(t.name);
    }
  }
  return { categories: cats.slice(0, 8), tags: tags.slice(0, 8) };
}

function extractApplyUrl(contentHtml) {
  const content = contentHtml || "";
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const clickExt = [], applyTextExt = [], applyHrefExt = [], otherExt = [];
  let m;
  while ((m = re.exec(content))) {
    const href = (m[1] || "").trim();
    if (!href.startsWith("http")) continue;
    const text = stripHtml(m[2] || "").toLowerCase();
    const isOd = /opportunitydesk\.org/i.test(href);
    if (isOd) continue;
    const clickApply = /click here to apply|apply now|apply here/i.test(text);
    const applyText = /\b(apply|application|register)\b/i.test(text);
    const applyHref = /apply|application|register|admission/i.test(href);
    if (clickApply) clickExt.push(href);
    else if (applyText) applyTextExt.push(href);
    else if (applyHref) applyHrefExt.push(href);
    else otherExt.push(href);
  }
  for (const bucket of [clickExt, applyTextExt, applyHrefExt, otherExt]) {
    if (bucket.length) return bucket[0];
  }
  return "";
}

function normalize(p) {
  const t = terms(p);
  const content = (p.content && p.content.rendered) || "";
  const application_url = extractApplyUrl(content);
  return {
    id: p.id,
    title: stripHtml((p.title && p.title.rendered) || ""),
    url: application_url,
    application_url,
    date: (p.date || "").slice(0, 10),
    excerpt: stripHtml((p.excerpt && p.excerpt.rendered) || "").slice(0, 220),
    img: thumb(p),
    categories: t.categories,
    tags: t.tags,
    slug: p.slug || "",
  };
}
