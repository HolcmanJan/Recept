const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return jsonResponse({ error: "Missing ?url= parameter" }, 400);
    }

    try {
      const result = await getPreview(targetUrl);
      return jsonResponse(result);
    } catch (err) {
      return jsonResponse({
        title: "",
        description: "",
        image: "",
        domain: "",
        error: err.message,
      }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

// ─── Hlavní logika ───

async function getPreview(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  const hostname = parsed.hostname.replace(/^www\./, "");
  const siteImage = getSiteSpecificImage(url, parsed, hostname);

  // Instagram — speciální zacházení (blokuje datacenter IP na hlavní stránce)
  if (hostname === "instagram.com") {
    const ig = await getInstagramPreview(parsed);
    if (ig && ig.image) return ig;
  }

  // Wikipedia — vlastní REST API
  if (/^[a-z]+\.wikipedia\.org$/i.test(parsed.hostname)) {
    const wp = await getWikipediaPreview(parsed);
    if (wp) {
      if (siteImage && !wp.image) wp.image = siteImage;
      return wp;
    }
  }

  // Stáhni HTML stránky
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    html = await res.text();
  } catch (err) {
    return {
      title: hostname,
      description: "",
      image: siteImage || "",
      domain: hostname,
    };
  }

  const result = parseHtml(html, parsed);
  if (siteImage && !result.image) result.image = siteImage;
  if (!result.title) result.title = hostname;
  if (!result.domain) result.domain = hostname;

  return result;
}

// ─── Site-specific ───

function getSiteSpecificImage(url, parsed, hostname) {
  // YouTube
  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "music.youtube.com"
  ) {
    const v = parsed.searchParams.get("v");
    if (v)
      return "https://img.youtube.com/vi/" + encodeURIComponent(v) + "/hqdefault.jpg";
    const seg = parsed.pathname.split("/").filter(Boolean);
    if ((seg[0] === "shorts" || seg[0] === "embed") && seg[1])
      return "https://img.youtube.com/vi/" + encodeURIComponent(seg[1]) + "/hqdefault.jpg";
  }
  if (hostname === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    if (id)
      return "https://img.youtube.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
  }
  // Imgur
  if (hostname === "i.imgur.com") return url;

  return "";
}

async function getWikipediaPreview(parsed) {
  const m = parsed.hostname.match(/^([a-z]+)\.wikipedia\.org$/i);
  const pm = parsed.pathname.match(/^\/wiki\/(.+)$/);
  if (!m || !pm) return null;
  try {
    const res = await fetch(
      "https://" + m[1] + ".wikipedia.org/api/rest_v1/page/summary/" + pm[1]
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || "",
      description: data.extract || "",
      image: (data.thumbnail && data.thumbnail.source) || "",
      domain: "Wikipedia",
    };
  } catch {
    return null;
  }
}

async function getInstagramPreview(parsed) {
  const m = parsed.pathname.match(/^\/(p|reel|tv|stories)\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const shortcode = m[2];
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,*/*",
    Referer: "https://www.google.com/",
  };

  // 1) Zkus embed endpoint — Instagram ho servíruje ochotněji
  try {
    const embedUrl =
      "https://www.instagram.com/p/" + shortcode + "/embed/captioned/";
    const res = await fetch(embedUrl, { headers, redirect: "follow" });
    if (res.ok) {
      const html = await res.text();
      let image = "";

      // display_url v embedded JSON datech
      const displayMatch = html.match(/"display_url"\s*:\s*"([^"]+)"/);
      if (displayMatch)
        image = displayMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");

      // og:image v embed stránce
      if (!image) {
        const ogMatch =
          html.match(
            /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i
          ) ||
          html.match(
            /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i
          );
        if (ogMatch) image = decodeEntities(ogMatch[1]);
      }

      // EmbeddedMediaImage class
      if (!image) {
        const imgMatch = html.match(
          /<img[^>]+class=["'][^"']*EmbeddedMedia[^"']*["'][^>]*src=["']([^"']+)["']/i
        );
        if (imgMatch) image = decodeEntities(imgMatch[1]);
      }

      // Jakýkoli scontent/cdninstagram CDN obrázek
      if (!image) {
        const cdnMatch = html.match(
          /["'](https?:\/\/[^"']*?(?:scontent|cdninstagram)[^"']*?\.(?:jpg|jpeg|png|webp)[^"']*?)["']/i
        );
        if (cdnMatch)
          image = cdnMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
      }

      let title = "";
      const captionMatch = html.match(
        /<div[^>]+class=["'][^"']*Caption[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      );
      if (captionMatch) {
        title = captionMatch[1]
          .replace(/<[^>]+>/g, "")
          .trim()
          .slice(0, 120);
      }
      if (!title) title = "Instagram";

      if (image) {
        return { title, description: "", image, domain: "Instagram" };
      }
    }
  } catch (err) {
    // embed failed, try next
  }

  // 2) Fallback: /media/?size=l — prohlížeč následuje redirect (funguje s cookies)
  return {
    title: "Instagram",
    description: "",
    image: "https://www.instagram.com/p/" + shortcode + "/media/?size=l",
    domain: "Instagram",
  };
}

// ─── HTML parsování ───

function parseHtml(html, parsed) {
  const origin = parsed.origin;
  const hostname = parsed.hostname.replace(/^www\./, "");

  const metaContent = (attr, value) => {
    const esc = escapeRegex(value);
    const re1 = new RegExp(
      "<meta[^>]+" + attr + "=[\"']" + esc + "[\"'][^>]*content=[\"']([^\"']+)[\"']",
      "i"
    );
    const re2 = new RegExp(
      "<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*" + attr + "=[\"']" + esc + "[\"']",
      "i"
    );
    const m = html.match(re1) || html.match(re2);
    return m ? decodeEntities(m[1].trim()) : "";
  };

  let image =
    metaContent("property", "og:image") ||
    metaContent("name", "og:image") ||
    metaContent("property", "og:image:url") ||
    metaContent("name", "twitter:image") ||
    metaContent("property", "twitter:image") ||
    metaContent("name", "twitter:image:src") ||
    metaContent("itemprop", "image") ||
    linkHref(html, "image_src") ||
    extractJsonLdImage(html) ||
    findFirstMeaningfulImage(html);
  if (image) image = resolveUrl(image, origin);

  let title =
    metaContent("property", "og:title") ||
    metaContent("name", "twitter:title");
  if (!title) {
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t) title = decodeEntities(t[1].trim());
  }

  const description =
    metaContent("property", "og:description") ||
    metaContent("name", "description") ||
    metaContent("name", "twitter:description");

  const siteName = metaContent("property", "og:site_name");

  return {
    title: title || "",
    description: (description || "").trim(),
    image: image || "",
    domain: siteName || hostname,
  };
}

// ─── Helpery ───

function linkHref(html, rel) {
  const esc = escapeRegex(rel);
  const re1 = new RegExp(
    "<link[^>]+rel=[\"']" + esc + "[\"'][^>]*href=[\"']([^\"']+)[\"']",
    "i"
  );
  const re2 = new RegExp(
    "<link[^>]+href=[\"']([^\"']+)[\"'][^>]*rel=[\"']" + esc + "[\"']",
    "i"
  );
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1].trim()) : "";
}

function extractJsonLdImage(html) {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const img = pickImageFromJsonLd(parsed);
      if (img) return img;
    } catch {}
  }
  return "";
}

function pickImageFromJsonLd(node) {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = pickImageFromJsonLd(item);
      if (r) return r;
    }
    return "";
  }
  if (node.image) {
    if (typeof node.image === "string") return node.image;
    if (Array.isArray(node.image)) {
      for (const x of node.image) {
        if (typeof x === "string") return x;
        if (x && typeof x === "object" && x.url) return x.url;
      }
    }
    if (typeof node.image === "object" && node.image.url) return node.image.url;
  }
  if (node["@graph"]) return pickImageFromJsonLd(node["@graph"]);
  return "";
}

function findFirstMeaningfulImage(html) {
  const bodyIdx = html.search(/<body[\s>]/i);
  const start = bodyIdx === -1 ? 0 : bodyIdx;
  const body = html.slice(start);
  const re = /<img\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const attrs = m[1];
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1];
    if (!src || src.startsWith("data:")) continue;
    if (/1x1|pixel|spacer|blank|tracking|analytics|beacon|sprite/i.test(src))
      continue;
    const w = parseInt(
      (attrs.match(/\bwidth=["']?(\d+)/i) || [])[1] || "0",
      10
    );
    const h = parseInt(
      (attrs.match(/\bheight=["']?(\d+)/i) || [])[1] || "0",
      10
    );
    if ((w > 0 && w < 120) || (h > 0 && h < 120)) continue;
    return decodeEntities(src);
  }
  return "";
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveUrl(href, origin) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/") && origin) return origin + href;
  return href;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}
