// Runs after `vite build`. The site is a single-page app, so without this every URL
// is served the same index.html: the homepage title, a canonical pointing at the
// homepage and an empty <div id="root">. Search engines then treat the city and
// listing pages as copies of the homepage.
//
// For every public page this writes dist/<path>.html with its own title,
// description, canonical, social tags, structured data and a plain-HTML summary
// inside #root (React replaces it on load). Cloudflare serves those files directly;
// worker/index.js handles everything else (aliases, dated URLs, real 404s).
// It also writes dist/sitemap.xml with only these canonical public pages.

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { blogPosts } from "../src/data/blogPosts.js";
import { CITY_ATTRACTIONS } from "../src/data/cityAttractions.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const SITE_URL = "https://oneluxstay.com";
const BRAND = "One Lux Stay";
const DEFAULT_IMAGE = `${SITE_URL}/ols-logo.webp`;
const CANCELLATION =
  "Free cancellation until 14 days before check-in. Cancelling within 14 days of check-in, or not showing up, is charged the full accommodation cost.";

const LISTINGS_ORIGINS = [
  process.env.SITEMAP_FUNCTIONS_ORIGIN,
  process.env.INTERNAL_API_ORIGIN,
  "https://admin.oneluxstay.com",
]
  .map((value) => String(value || "").trim().replace(/\/+$/, ""))
  .filter(Boolean);

// ---------------------------------------------------------------- cities & areas

const CITIES = {
  antwerp: {
    path: "/antwerp",
    name: "Antwerp",
    country: "BE",
    countryName: "Belgium",
    title: "Furnished Apartments in Antwerp | Short & Long Stays | One Lux Stay",
    description:
      "Furnished apartments in Antwerp near the Diamond District, Central Station, the Fashion District and the city centre. Studios to 3-bedroom suites, book direct with One Lux Stay.",
    intro:
      "One Lux Stay has fully furnished apartments across Antwerp: next to Antwerp Central Station, in the Diamond District, the Fashion District and the historic city centre. Every apartment has a full kitchen and Wi-Fi, suits short stays as well as monthly stays for work or relocation, and is booked directly with us.",
  },
  "los-angeles": {
    path: "/los-angeles",
    name: "Los Angeles",
    country: "US",
    countryName: "United States",
    title: "Furnished Apartments in Los Angeles & Hollywood | One Lux Stay",
    description:
      "Furnished 1-3 bedroom apartments in Hollywood and Los Angeles, some with Hollywood Sign views. Short and extended stays, book direct with One Lux Stay.",
    intro:
      "One Lux Stay has furnished apartments in Hollywood and central Los Angeles, from 1-bedroom apartments to 3-bedroom homes, some with Hollywood Sign or city views. They suit holidays, production work and longer stays, and are booked directly with us.",
  },
  dubai: {
    path: "/dubai",
    name: "Dubai",
    country: "AE",
    countryName: "United Arab Emirates",
    title: "Furnished Apartments in Downtown Dubai with Burj Khalifa Views | One Lux Stay",
    description:
      "2 and 3-bedroom furnished residences in Downtown Dubai with direct Burj Khalifa and fountain views. Book direct with One Lux Stay.",
    intro:
      "One Lux Stay's Dubai residences are on Sheikh Mohammed bin Rashid Boulevard in Downtown Dubai, with 2 and 3-bedroom layouts and direct Burj Khalifa or Dubai Fountain views, a short walk from Dubai Mall.",
  },
};

// Neighbourhood pages that exist in the app. Only the ones with listings get a page.
const AREAS = [
  {
    city: "antwerp", slug: "diamond-district", propertyIds: ["JACOB"], label: "Diamond District",
    copy: "Stay moments from the diamond quarter with easy access to Central Station and the city center. By day, wander streets lined with jewelers and traders; by night, retreat to a quiet, modern base just minutes from it all.",
  },
  {
    city: "antwerp", slug: "fashion-district", propertyIds: ["LANGE103"], label: "Fashion District",
    copy: "From Nationalestraat to Kammenstraat, the fashion district is Antwerp's style heart. Expect concept stores, the MoMu fashion museum, and a steady stream of good coffee within a short walk of the front door.",
  },
  {
    city: "antwerp", slug: "antwerp-central", propertyIds: ["LANGE5"], label: "Antwerp Central",
    copy: "A prime base next to Antwerp Central Station, widely regarded as one of the world's most beautiful railway stations, with fast links across the city and beyond, plus the zoo and Astridplein on your doorstep.",
  },
  {
    city: "antwerp", slug: "city-centre", propertyIds: ["KRIBB"], label: "City Centre",
    copy: "Walk to Grote Markt, the Cathedral of Our Lady, and riverside terraces from the heart of the city. This is old Antwerp at its most postcard-perfect, with cobbled lanes and a river breeze close by.",
  },
  {
    city: "antwerp", slug: "near-central-station", propertyIds: ["LANGEKIEV"], label: "Near Central Station",
    copy: "A calm base just outside the station with quick access to the center and local dining. Zurenborg's Belle Epoque streets and Dageraadplaats' cafes are an easy stroll away.",
  },
  {
    city: "los-angeles", slug: "hollywood", propertyIds: ["ARDENCE"], label: "Hollywood",
    copy: "Furnished apartments in the heart of Hollywood, some with Hollywood Sign, pool or city views, close to the Walk of Fame, studios and Sunset Boulevard.",
  },
  {
    city: "los-angeles", slug: "hwh", propertyIds: ["HWH"], label: "HWH Los Angeles",
    copy: "Stylish 1 and 2-bedroom furnished apartments at HWH in Los Angeles, a practical base for work trips, production schedules and longer stays.",
  },
  {
    city: "dubai", slug: "downtowndubai", propertyIds: ["DUBAI"], label: "Downtown Dubai",
    copy: "Residences on Sheikh Mohammed bin Rashid Boulevard with direct Burj Khalifa and Dubai Fountain views, a short walk from Dubai Mall and the Dubai Opera.",
  },
];

const BUSINESS_PAGES = [
  { path: "/healthcare-professionals", label: "Healthcare Professionals", headline: "Where Rest Is Part of the Treatment", intro: "Furnished apartments for traveling nurses, physicians, allied health workers and healthcare teams, close to hospitals, clinics and medical districts." },
  { path: "/business/construction-accommodations", label: "Construction Accommodations", headline: "A Better Home Base for Every Project", intro: "Furnished apartments for project managers, engineers, skilled trades and construction crews, near job sites, project offices and transport routes." },
  { path: "/business/corporate-relocation", label: "Corporate Assignment & Relocation", headline: "Arrive Ready. Live Exceptionally.", intro: "Furnished apartments for relocating employees, executives, consultants and project teams, near business districts, client offices and key transport links." },
  { path: "/business/entertainment-industry", label: "Entertainment Industry", headline: "Private Stays Behind Every Great Production", intro: "Private furnished residences for cast, crew, production teams and touring talent, near studios, sets, venues and production hubs." },
  { path: "/business/government", label: "Government", headline: "Dependable Stays for Work That Serves", intro: "Furnished apartments for government employees, contractors, consultants and delegations, near government offices, civic centers and assignment locations." },
];

// ---------------------------------------------------------------- helpers

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (text, max = 158) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

const absolute = (pagePath) => (pagePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${pagePath}`);

const plural = (count, word) => `${count} ${word}${Number(count) === 1 ? "" : "s"}`;

const cleanTitle = (title) =>
  String(title || "")
    .replace(/\s+/g, " ")
    .replace(/\s*(by )?(One ?Lux ?Stay|Oneluxstay)\s*$/i, "")
    .replace(/^(One ?Lux ?Stay|Oneluxstay)\s+/i, "")
    .trim();

const breadcrumbLd = (crumbs) => ({
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map(([name, crumbPath], index) => ({
    "@type": "ListItem",
    position: index + 1,
    name,
    item: absolute(crumbPath),
  })),
});

const linkList = (links) =>
  links.length
    ? `<ul>${links.map(([label, href]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join("")}</ul>`
    : "";

// ---------------------------------------------------------------- listings

const fetchListings = async () => {
  for (const origin of LISTINGS_ORIGINS) {
    try {
      const all = [];
      for (let skip = 0; skip < 2000; skip += 200) {
        const response = await fetch(`${origin}/.netlify/functions/listings?limit=200&skip=${skip}`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const results = Array.isArray(payload?.results) ? payload.results : [];
        all.push(...results);
        if (results.length < 200) break;
      }
      return all;
    } catch (error) {
      console.warn(`[seo] Listing fetch from ${origin} failed: ${error.message}`);
    }
  }
  return [];
};

const listingCityKey = (listing) => {
  const city = String(listing?.city || listing?.address?.city || "").toLowerCase();
  if (city.includes("antwerp")) return "antwerp";
  if (city.includes("los angeles") || city.includes("hollywood")) return "los-angeles";
  if (city.includes("dubai")) return "dubai";
  // Torrance and Redondo Beach have their own sites (torrance. / redondobeach.oneluxstay.com).
  return "";
};

const listingPath = (cityKey, id) => `/${cityKey}/listing/${encodeURIComponent(id)}`;

// Identical units of one apartment type each have their own listing id. One of them
// is the canonical page for the type so search engines don't index near-copies.
const groupListings = (listings) => {
  const groups = new Map();
  for (const listing of listings) {
    const id = String(listing?.id || "").trim();
    const cityKey = listingCityKey(listing);
    if (!id || !cityKey) continue;
    const groupKey = `${listing.apaleoUnitGroupId || cityKey}|${cleanTitle(listing.title).toLowerCase()}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ ...listing, id, cityKey });
  }
  return [...groups.values()].map((units) => {
    units.sort((a, b) => a.id.localeCompare(b.id));
    return { primary: units[0], units };
  });
};

const listingSummary = (listing) => {
  const parts = [];
  if (Number(listing.bedrooms) > 0) parts.push(plural(listing.bedrooms, "bedroom"));
  else parts.push("studio");
  if (Number(listing.bathrooms) > 0) parts.push(plural(listing.bathrooms, "bathroom"));
  if (Number(listing.accommodates) > 0) parts.push(`sleeps ${listing.accommodates}`);
  return parts.join(", ");
};

// Amenities worth naming in a search snippet, in order of preference.
const HIGHLIGHT_AMENITIES = [/^wifi|wireless/i, /^kitchen$/i, /air condition/i, /washer|washing machine/i, /free parking|parking/i, /pool/i, /gym|fitness/i, /balcony|terrace|patio/i, /dedicated workspace|workspace/i, /elevator/i];
const highlightAmenities = (amenities) =>
  HIGHLIGHT_AMENITIES.map((pattern) => amenities.find((item) => pattern.test(item))).filter(Boolean).slice(0, 3);

const areaForListing = (listing) => AREAS.find((area) => area.propertyIds.includes(listing.apaleoPropertyId)) || null;

// ---------------------------------------------------------------- page HTML

const renderPage = (shell, page) => {
  const canonical = absolute(page.canonical || page.path);
  const image = page.image || DEFAULT_IMAGE;
  const head = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${page.ogType || "website"}" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ];
  if (page.jsonLd?.length) {
    const graph = { "@context": "https://schema.org", "@graph": page.jsonLd };
    head.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`);
  }

  // Plain summary for crawlers and link previews; React replaces #root once it loads.
  const body = `<div id="root"><main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:48px 20px;font-family:Georgia,serif;color:#1d1a16;line-height:1.6">
<p><a href="/">${BRAND}</a></p>
<h1>${escapeHtml(page.h1 || page.title)}</h1>
${page.bodyHtml || `<p>${escapeHtml(page.description)}</p>`}
</main></div>`;

  return shell
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, "")
    .replace(/<meta\s+name="robots"[^>]*>\s*/i, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/i, "")
    .replace(/<meta\s+(property="og:(type|site_name|url|title|description|image|image:alt)"|name="twitter:(card|title|description|image)")[\s\S]*?\/>\s*/gi, "")
    .replace("</head>", `  ${head.join("\n  ")}\n</head>`)
    .replace(/<div id="root"><\/div>/, body);
};

// ---------------------------------------------------------------- pages

const buildPages = (listings) => {
  const groups = groupListings(listings);
  const pages = [];
  const organizationRef = { "@id": `${SITE_URL}/#organization` };

  const groupsFor = (predicate) => groups.filter((group) => predicate(group.primary));
  const listingLinks = (groupList) =>
    groupList.map(({ primary }) => [
      `${cleanTitle(primary.title)} (${listingSummary(primary)})`,
      listingPath(primary.cityKey, primary.id),
    ]);

  // Homepage
  pages.push({
    path: "/",
    title: "One Lux Stay | Furnished Apartments in Antwerp, Dubai & Los Angeles",
    h1: "Furnished apartments in Antwerp, Dubai and Los Angeles",
    description:
      "Book furnished apartments direct with One Lux Stay in Antwerp, Downtown Dubai, Hollywood and Los Angeles, Torrance and Redondo Beach. Short stays and monthly stays.",
    bodyHtml: `<p>One Lux Stay rents fully furnished apartments for short and long stays, booked directly with us.</p>
${linkList([
  ["Furnished apartments in Antwerp", "/antwerp"],
  ["Furnished apartments in Los Angeles", "/los-angeles"],
  ["Furnished apartments in Hollywood", "/hollywood"],
  ["Furnished apartments in Downtown Dubai", "/dubai"],
  ["Furnished homes in Torrance", "https://torrance.oneluxstay.com"],
  ["Redondo Beach homes", "https://redondobeach.oneluxstay.com"],
  ["All apartments", "/global"],
  ["Travel guides", "/blog"],
])}
<p>${escapeHtml(CANCELLATION)}</p>`,
    jsonLd: [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: BRAND,
        url: `${SITE_URL}/`,
        logo: DEFAULT_IMAGE,
        email: "reservations@oneluxstay.com",
        areaServed: ["Antwerp, BE", "Dubai, AE", "Los Angeles, CA, US", "Torrance, CA, US", "Redondo Beach, CA, US"].map(
          (name) => ({ "@type": "Place", name }),
        ),
      },
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: BRAND, publisher: organizationRef, inLanguage: "en" },
    ],
  });

  // City pages
  for (const [cityKey, city] of Object.entries(CITIES)) {
    const cityGroups = groupsFor((listing) => listing.cityKey === cityKey);
    const cityAreas = AREAS.filter((area) => area.city === cityKey && cityGroups.some(({ primary }) => areaForListing(primary) === area));
    const attractions = CITY_ATTRACTIONS[cityKey];
    pages.push({
      path: city.path,
      title: city.title,
      h1: `Furnished apartments in ${city.name}`,
      description: city.description,
      image: cityGroups[0]?.primary?.pictures?.[0]?.original,
      bodyHtml: `<p>${escapeHtml(city.intro)}</p>
${cityAreas.length ? `<h2>Neighbourhoods</h2>${linkList(cityAreas.map((area) => [`${area.label}, ${city.name}`, `${city.path}/${area.slug}`]))}` : ""}
${cityGroups.length ? `<h2>Apartments in ${escapeHtml(city.name)}</h2>${linkList(listingLinks(cityGroups))}` : ""}
${attractions ? `<p><a href="/${cityKey}/attractions">Things to do in ${escapeHtml(city.name)}</a></p>` : ""}
<p>${escapeHtml(CANCELLATION)}</p>`,
      jsonLd: [
        breadcrumbLd([[BRAND, "/"], [city.name, city.path]]),
        {
          "@type": "ItemList",
          name: `Furnished apartments in ${city.name}`,
          itemListElement: cityGroups.map(({ primary }, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: absolute(listingPath(primary.cityKey, primary.id)),
            name: cleanTitle(primary.title),
          })),
        },
      ],
    });
  }

  // Hollywood has its own landing page in the app.
  const hollywoodGroups = groupsFor((listing) => listing.apaleoPropertyId === "ARDENCE");
  pages.push({
    path: "/hollywood",
    title: "Furnished Apartments in Hollywood, Los Angeles | One Lux Stay",
    h1: "Furnished apartments in Hollywood",
    description:
      "Furnished 1-3 bedroom apartments in Hollywood, Los Angeles, some with Hollywood Sign, pool or city views. Book direct with One Lux Stay.",
    image: hollywoodGroups[0]?.primary?.pictures?.[0]?.original,
    bodyHtml: `<p>${escapeHtml(AREAS.find((area) => area.slug === "hollywood").copy)}</p>
${linkList(listingLinks(hollywoodGroups))}
<p><a href="/los-angeles">All Los Angeles apartments</a></p>
<p>${escapeHtml(CANCELLATION)}</p>`,
    jsonLd: [breadcrumbLd([[BRAND, "/"], ["Los Angeles", "/los-angeles"], ["Hollywood", "/hollywood"]])],
  });

  // Neighbourhood pages
  for (const area of AREAS) {
    const city = CITIES[area.city];
    const areaGroups = groupsFor((listing) => areaForListing(listing) === area);
    if (!areaGroups.length) continue;
    const areaPath = `${city.path}/${area.slug}`;
    pages.push({
      path: areaPath,
      title: `${area.label} Furnished Apartments, ${city.name} | One Lux Stay`,
      h1: `Furnished apartments in ${area.label}, ${city.name}`,
      description: clip(`Furnished apartments in ${area.label}, ${city.name}. ${area.copy}`),
      image: areaGroups[0].primary.pictures?.[0]?.original,
      bodyHtml: `<p>${escapeHtml(area.copy)}</p>
<h2>Apartments in ${escapeHtml(area.label)}</h2>${linkList(listingLinks(areaGroups))}
<p><a href="${city.path}">All ${escapeHtml(city.name)} apartments</a></p>
<p>${escapeHtml(CANCELLATION)}</p>`,
      jsonLd: [breadcrumbLd([[BRAND, "/"], [city.name, city.path], [area.label, areaPath]])],
    });
  }

  // Listing pages: one per unit; identical units point their canonical at the group's primary.
  for (const { primary, units } of groups) {
    const city = CITIES[primary.cityKey];
    const area = areaForListing(primary);
    const name = cleanTitle(primary.title);
    const summary = listingSummary(primary);
    const place = area ? `${area.label}, ${city.name}` : city.name;
    const amenities = (Array.isArray(primary.amenities) ? primary.amenities : [])
      .map((item) => (typeof item === "string" ? item : item?.name))
      .filter(Boolean);
    const images = (primary.pictures || []).map((picture) => picture?.original).filter(Boolean).slice(0, 8);
    const primaryPath = listingPath(primary.cityKey, primary.id);
    const description = clip(
      `${name}: furnished ${summary} in ${place}. ${highlightAmenities(amenities).join(", ")}. Book direct with One Lux Stay.`,
    );
    const geo =
      Number.isFinite(Number(primary.latitude)) && primary.latitude !== null
        ? { "@type": "GeoCoordinates", latitude: Number(primary.latitude), longitude: Number(primary.longitude) }
        : undefined;

    for (const unit of units) {
      pages.push({
        path: listingPath(unit.cityKey, unit.id),
        canonical: primaryPath,
        inSitemap: unit === primary && Boolean(primary.apaleoUnitGroupId),
        title: `${name} | ${place} | One Lux Stay`.slice(0, 120),
        h1: name,
        description,
        image: images[0],
        bodyHtml: `<p>Furnished ${escapeHtml(summary)} in ${escapeHtml(place)}.</p>
${primary.address?.full ? `<p>${escapeHtml(primary.address.full)}</p>` : ""}
${area ? `<p>${escapeHtml(area.copy)}</p>` : ""}
${amenities.length ? `<h2>Amenities</h2><ul>${amenities.slice(0, 24).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
<p>${escapeHtml(CANCELLATION)}</p>
<p><a href="${escapeHtml(city.path)}">More apartments in ${escapeHtml(city.name)}</a></p>`,
        jsonLd: [
          breadcrumbLd(
            [[BRAND, "/"], [city.name, city.path], ...(area ? [[area.label, `${city.path}/${area.slug}`]] : []), [name, primaryPath]],
          ),
          {
            "@type": "Apartment",
            "@id": `${absolute(primaryPath)}#apartment`,
            name,
            description,
            url: absolute(primaryPath),
            image: images.length ? images : undefined,
            numberOfRooms: Number(primary.bedrooms) || undefined,
            numberOfBathroomsTotal: Number(primary.bathrooms) || undefined,
            occupancy: Number(primary.accommodates)
              ? { "@type": "QuantitativeValue", maxValue: Number(primary.accommodates) }
              : undefined,
            address: {
              "@type": "PostalAddress",
              streetAddress: primary.address?.full || undefined,
              addressLocality: city.name,
              addressCountry: city.country,
            },
            geo,
            amenityFeature: amenities.slice(0, 20).map((item) => ({ "@type": "LocationFeatureSpecification", name: item, value: true })),
            provider: organizationRef,
          },
        ],
      });
    }
  }

  // Global units list
  pages.push({
    path: "/global",
    title: "All Furnished Apartments: Antwerp, Dubai & Los Angeles | One Lux Stay",
    h1: "All One Lux Stay apartments",
    description:
      "Browse every One Lux Stay furnished apartment in Antwerp, Downtown Dubai, Hollywood and Los Angeles, and book direct.",
    bodyHtml: `${linkList(listingLinks(groups.filter(({ primary }) => primary.apaleoUnitGroupId)))}<p>${escapeHtml(CANCELLATION)}</p>`,
  });

  // Things to do
  for (const cityKey of ["antwerp", "los-angeles", "dubai"]) {
    const data = CITY_ATTRACTIONS[cityKey];
    if (!data) continue;
    const places = (data.categories || []).flatMap((category) => (category.attractions || []).map((item) => item?.name)).filter(Boolean);
    pages.push({
      path: `/${cityKey}/attractions`,
      title: `Things to Do in ${data.cityName} | One Lux Stay`,
      h1: `Things to do in ${data.cityName}`,
      description: clip(`${data.tagline} ${data.intro}`),
      image: data.heroImage,
      bodyHtml: `<p>${escapeHtml(data.intro)}</p>
${places.length ? `<ul>${places.map((placeName) => `<li>${escapeHtml(placeName)}</li>`).join("")}</ul>` : ""}
<p><a href="${escapeHtml(CITIES[cityKey].path)}">Furnished apartments in ${escapeHtml(data.cityName)}</a></p>`,
      jsonLd: [breadcrumbLd([[BRAND, "/"], [data.cityName, CITIES[cityKey].path], ["Things to do", `/${cityKey}/attractions`]])],
    });
  }

  // Blog (the article component adds its own Article/FAQ structured data on load)
  pages.push({
    path: "/blog",
    title: "Travel Guides & Furnished Stay Tips | One Lux Stay Blog",
    h1: "One Lux Stay travel guides",
    description: "Neighbourhood guides and tips for furnished stays in Antwerp, Dubai and Southern California from One Lux Stay.",
    bodyHtml: linkList(blogPosts.map((post) => [post.title, `/blog/${post.slug}`])),
  });
  for (const post of blogPosts) {
    pages.push({
      path: `/blog/${post.slug}`,
      title: post.seoTitle || `${post.title} | One Lux Stay`,
      h1: post.title,
      description: clip(post.seoDescription || post.excerpt),
      image: post.featuredImage,
      ogType: "article",
      bodyHtml: `<p>${escapeHtml(post.excerpt)}</p><p><a href="/blog">More travel guides</a></p>`,
    });
  }

  // Business stays
  for (const business of BUSINESS_PAGES) {
    pages.push({
      path: business.path,
      title: `Furnished Housing for ${business.label} | One Lux Stay`,
      h1: business.headline,
      description: clip(`${business.intro} Antwerp, Dubai and Los Angeles. Book direct with One Lux Stay.`),
      bodyHtml: `<p>${escapeHtml(business.intro)}</p>${linkList(BUSINESS_PAGES.filter((other) => other !== business).map((other) => [`Stays for ${other.label}`, other.path]))}`,
    });
  }

  // Policies
  pages.push(
    { path: "/terms", title: "Terms & Conditions | One Lux Stay", description: `Booking terms for One Lux Stay apartments. ${CANCELLATION}` },
    { path: "/privacy-policy", title: "Privacy Policy | One Lux Stay", description: "How One Lux Stay collects, uses and protects your personal data." },
    { path: "/california-privacy-policy", title: "California Privacy Policy | One Lux Stay", description: "California privacy rights (CCPA/CPRA) for One Lux Stay guests and website visitors." },
  );

  return pages;
};

// ---------------------------------------------------------------- output

const pageFile = (pagePath) => {
  if (pagePath === "/") return path.join(distDir, "index.html");
  const clean = pagePath.split("?")[0].replace(/^\/+/, "");
  return path.join(distDir, ...clean.split("/").map(decodeURIComponent)) + ".html";
};

const buildSitemap = (pages) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter((page) => page.inSitemap !== false && (page.canonical || page.path) === page.path)
    .map((page) => absolute(page.path))
    .sort();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeHtml(url)}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
};

const main = async () => {
  // Keep vite's untouched index.html as spa-shell.html: it is the template here (so
  // re-running this script is safe) and the worker serves it for other app routes.
  const shellPath = path.join(distDir, "spa-shell.html");
  const shell = await fs.readFile(shellPath, "utf8").catch(async () => {
    const built = await fs.readFile(path.join(distDir, "index.html"), "utf8");
    await fs.writeFile(shellPath, built);
    return built;
  });

  const listings = await fetchListings();
  if (!listings.length) console.warn("[seo] No listings fetched; writing city and static pages only.");

  const pages = buildPages(listings);
  for (const page of pages) {
    const file = pageFile(page.path);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, renderPage(shell, page));
  }

  const sitemap = buildSitemap(pages);
  await fs.writeFile(path.join(distDir, "sitemap.xml"), sitemap);
  console.log(
    `[seo] Wrote ${pages.length} pages (${listings.length} listings fetched) and ${(sitemap.match(/<loc>/g) || []).length} sitemap URLs.`,
  );
};

main().catch((error) => {
  console.error(`[seo] Prerender failed: ${error.message}`);
  process.exit(1);
});
