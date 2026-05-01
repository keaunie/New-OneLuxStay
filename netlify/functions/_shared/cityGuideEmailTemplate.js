import { getCityAttractions } from "../../../src/data/cityAttractions.js";

const normalizeString = (value) => String(value ?? "").trim();

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    if (ch === "'") return "&#39;";
    return ch;
  });

const stripTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

export const buildCityGuideEmailTemplate = ({
  baseUrl,
  citySlug,
  fullName,
  checkIn,
  checkOut,
  reservationId,
} = {}) => {
  const normalizedSlug = normalizeString(citySlug);
  if (!normalizedSlug) {
    return {
      skipped: true,
      permanent: true,
      reason: "Missing citySlug for city guide email.",
    };
  }

  const data = getCityAttractions(normalizedSlug);
  if (!data) {
    return {
      skipped: true,
      permanent: true,
      reason: `No city guide data found for "${normalizedSlug}".`,
      citySlugCandidate: normalizedSlug,
    };
  }

  const safeBaseUrl = stripTrailingSlash(baseUrl || "https://oneluxstay.com");
  const guideUrl = `${safeBaseUrl}${data.cityPath}/attractions`;
  const viewInBrowserUrl = `${guideUrl}?src=email`;
  const destinationsUrl = `${safeBaseUrl}/global`;
  const bookUrl = `${safeBaseUrl}${data.bookPath || data.cityPath || ""}`;

  const cityName = normalizeString(data.cityName);
  const guestName = normalizeString(fullName) || "Guest";
  const accent = data?.accentColor || "#c9a96e";
  const heroGradient =
    data?.heroGradient ||
    "linear-gradient(135deg, #2c2420 0%, #4a3728 60%, #6b4f38 100%)";
  const heroImage = data?.heroImage || "";
  const categories = Array.isArray(data?.categories) ? data.categories : [];

  const reasonItems = categories
    .slice(0, 5)
    .map((cat, idx) => {
      const label = normalizeString(cat?.label);
      const image = normalizeString(cat?.image);
      const narrative = normalizeString(cat?.narrative || "");
      const excerpt = narrative
        ? narrative.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ").slice(0, 170)
        : "";
      const count = Array.isArray(cat?.attractions) ? cat.attractions.length : 0;
      return { idx: idx + 1, id: normalizeString(cat?.id), label, image, excerpt, count };
    })
    .filter((item) => item.label);

  const featuredExperiences = categories
    .slice(0, 2)
    .map((cat) => {
      const first = Array.isArray(cat?.attractions) ? cat.attractions[0] : null;
      if (!first) return null;
      const title = normalizeString(first?.name);
      if (!title) return null;
      return {
        id: normalizeString(cat?.id),
        categoryLabel: normalizeString(cat?.label),
        image: normalizeString(cat?.image),
        title,
        description: normalizeString(first?.description).slice(0, 190),
        metaLeft: normalizeString(first?.distance) || "Nearby",
        metaRight:
          normalizeString(checkIn) && normalizeString(checkOut)
            ? `${normalizeString(checkIn)} - ${normalizeString(checkOut)}`
            : "Anytime",
        ctaUrl: `${guideUrl}#${encodeURIComponent(normalizeString(cat?.id))}`,
      };
    })
    .filter(Boolean);

  const subject = `Your ${cityName} city guide`;
  const dateLine =
    normalizeString(checkIn) && normalizeString(checkOut)
      ? `Your dates: <strong>${escapeHtml(checkIn)}</strong> &ndash; <strong>${escapeHtml(checkOut)}</strong>.`
      : "";

  const bulletproofButton = (href, label, bg, fg) => `
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse: separate;">
      <tr>
        <td bgcolor="${bg}" style="border-radius: 999px; text-align: center;">
          <a href="${href}" style="display: inline-block; padding: 12px 18px; font-weight: 700; letter-spacing: 0.02em; text-decoration: none; color: ${fg};">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `;

  const navLink = (href, label) =>
    `<a href="${href}" style="color: rgba(255,255,255,0.88); text-decoration: none; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;">${label}</a>`;

  const html = `
  <span style="display:none!important; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
    Your curated guide to ${escapeHtml(cityName)}: top attractions and local favorites near your stay.
  </span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f1ee; padding: 0; margin: 0;">
    <tr>
      <td align="center" style="padding: 18px 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width: 640px; max-width: 640px; border-collapse: collapse;">
          <tr>
            <td align="right" style="padding: 0 6px 10px; font-family: Arial, sans-serif; font-size: 12px; color: rgba(63,54,47,0.75);">
              <a href="${viewInBrowserUrl}" style="color: rgba(63,54,47,0.75); text-decoration: underline;">View in browser</a>
            </td>
          </tr>
          <tr>
            <td style="border-radius: 18px; overflow: hidden; border: 1px solid rgba(201,181,156,0.45); background: #ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                <tr>
                  <td style="background: ${heroGradient}; padding: 16px 18px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                      <tr>
                        <td align="left" style="font-family: Arial, sans-serif; color: #ffffff;">
                          <div style="font-size: 18px; font-weight: 800; letter-spacing: 0.06em;">OneLuxStay</div>
                        </td>
                        <td align="right" style="font-family: Arial, sans-serif; color: #ffffff;">
                          ${navLink(destinationsUrl, "Destinations")}&nbsp;&nbsp;&nbsp;
                          ${navLink(guideUrl, "Guide")}&nbsp;&nbsp;&nbsp;
                          ${navLink("mailto:support@oneluxstay.com", "Support")}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${heroImage ? `
                  <tr>
                    <td>
                      <img src="${heroImage}" alt="${escapeHtml(cityName)}" width="640" style="width: 100%; max-width: 640px; height: auto; display: block;" />
                    </td>
                  </tr>
                ` : ""}
                <tr>
                  <td style="padding: 22px 22px 12px; font-family: Arial, sans-serif; color: #2d251f;">
                    <div style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(63,54,47,0.72); font-weight: 700;">
                      City Guide
                    </div>
                    <h1 style="margin: 10px 0 10px; font-size: 28px; line-height: 1.25;">
                      Get excited for ${escapeHtml(cityName)}
                    </h1>
                    <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.7; color: rgba(45,37,31,0.85);">
                      Hi ${escapeHtml(guestName)} &mdash; your OneLuxStay guide to <strong>${escapeHtml(cityName)}</strong> is ready. ${dateLine}
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right: 10px; vertical-align: top;">
                          ${bulletproofButton(guideUrl, `OPEN THE GUIDE`, accent, "#1a1a1a")}
                        </td>
                        <td style="vertical-align: top;">
                          ${bulletproofButton(bookUrl, `BROWSE STAYS`, "#2d251f", "#ffffff")}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 8px 22px 0; font-family: Arial, sans-serif; color: #2d251f;">
                    <h2 style="margin: 14px 0 10px; font-size: 18px;">Five reasons you’ll love ${escapeHtml(cityName)}</h2>
                  </td>
                </tr>

                ${reasonItems.map((item) => `
                  <tr>
                    <td style="padding: 0 22px 14px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                        <tr>
                          <td width="120" style="width:120px; padding: 6px 12px 6px 0; vertical-align: top;">
                            ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.label)}" width="120" style="width: 120px; height: 84px; object-fit: cover; border-radius: 12px; display:block;" />` : ""}
                          </td>
                          <td style="padding: 6px 0; vertical-align: top; font-family: Arial, sans-serif;">
                            <div style="font-size: 12px; font-weight: 800; letter-spacing: 0.1em; color: rgba(63,54,47,0.65);">
                              0${item.idx}
                            </div>
                            <div style="font-size: 14px; font-weight: 800; color: #2d251f; margin-top: 2px;">
                              ${escapeHtml(item.label)}
                            </div>
                            <div style="font-size: 13px; line-height: 1.6; color: rgba(45,37,31,0.78); margin-top: 4px;">
                              ${item.excerpt ? escapeHtml(item.excerpt) : `${item.count} picks curated in your guide.`}
                            </div>
                            <div style="margin-top: 8px;">
                              <a href="${guideUrl}#${encodeURIComponent(item.id)}" style="color: ${accent}; text-decoration: underline; font-weight: 700; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;">
                                Explore ${escapeHtml(item.label)}
                              </a>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                `).join("")}

                <tr>
                  <td style="padding: 6px 22px 20px;">
                    ${bulletproofButton(guideUrl, `OPEN THE FULL GUIDE`, accent, "#1a1a1a")}
                  </td>
                </tr>

                <tr>
                  <td style="padding: 2px 22px 0; font-family: Arial, sans-serif; color: #2d251f;">
                    <h2 style="margin: 10px 0 10px; font-size: 18px;">Don’t miss these experiences</h2>
                  </td>
                </tr>

                ${featuredExperiences.map((exp) => `
                  <tr>
                    <td style="padding: 0 22px 16px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; border: 1px solid rgba(201,181,156,0.35); border-radius: 14px; overflow: hidden;">
                        <tr>
                          <td width="200" style="width:200px; vertical-align: top;">
                            ${exp.image ? `<img src="${exp.image}" alt="${escapeHtml(exp.title)}" width="200" style="width: 200px; height: 140px; object-fit: cover; display:block;" />` : ""}
                          </td>
                          <td style="padding: 14px 14px 12px; vertical-align: top; font-family: Arial, sans-serif;">
                            <div style="font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(63,54,47,0.65); font-weight: 800;">
                              ${escapeHtml(exp.categoryLabel)}
                            </div>
                            <div style="font-size: 16px; font-weight: 900; color: #2d251f; margin-top: 4px;">
                              ${escapeHtml(exp.title)}
                            </div>
                            <div style="font-size: 13px; line-height: 1.6; color: rgba(45,37,31,0.78); margin-top: 6px;">
                              ${escapeHtml(exp.description)}
                            </div>
                            <div style="margin-top: 10px; font-size: 12px; color: rgba(45,37,31,0.7);">
                              <strong>${escapeHtml(exp.metaLeft)}</strong> &nbsp;|&nbsp; ${escapeHtml(exp.metaRight)}
                            </div>
                            <div style="margin-top: 10px;">
                              <a href="${exp.ctaUrl}" style="color: ${accent}; text-decoration: underline; font-weight: 800; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;">
                                See in guide
                              </a>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                `).join("")}

                <tr>
                  <td style="padding: 0 22px 22px; font-family: Arial, sans-serif; font-size: 12px; color: rgba(63,54,47,0.78);">
                    If the buttons don’t work, open your guide here: <span style="word-break: break-word;">${guideUrl}</span>
                  </td>
                </tr>

                <tr>
                  <td style="background: #2d251f; padding: 18px 22px; font-family: Arial, sans-serif; color: rgba(255,255,255,0.82);">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                      <tr>
                        <td align="left" style="font-size: 12px;">
                          Follow us:
                          <a href="https://www.instagram.com/" style="color: rgba(255,255,255,0.88); text-decoration: underline;">Instagram</a>
                          &nbsp;|&nbsp;
                          <a href="https://www.facebook.com/" style="color: rgba(255,255,255,0.88); text-decoration: underline;">Facebook</a>
                        </td>
                        <td align="right" style="font-size: 12px;">
                          <a href="mailto:support@oneluxstay.com" style="color: rgba(255,255,255,0.88); text-decoration: underline;">Contact</a>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top: 10px; font-size: 11px; color: rgba(255,255,255,0.7);">
                      You’re receiving this because you booked a stay with OneLuxStay.
                      ${reservationId ? `Reservation ID: ${escapeHtml(reservationId)}.` : ""}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;

  const textLines = [
    `Hi ${guestName},`,
    ``,
    `Your ${cityName} city guide is ready:`,
    guideUrl,
    ``,
    ...(normalizeString(checkIn) && normalizeString(checkOut) ? [`Your dates: ${checkIn} – ${checkOut}`, ``] : []),
    `— OneLuxStay`,
  ];

  return {
    skipped: false,
    cityName,
    cityPath: data.cityPath,
    guideUrl,
    ...(normalizeString(reservationId) ? { reservationId: normalizeString(reservationId) } : {}),
    subject,
    html,
    text: textLines.join("\n"),
  };
};
