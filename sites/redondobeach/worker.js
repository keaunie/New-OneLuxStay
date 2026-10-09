// Entry point for the redondobeach.oneluxstay.com Cloudflare site.
//
// Static pages are served from ./dist by Cloudflare's asset handler. This small script only adds one
// rule: alternate hostnames guests might type (like redondo.oneluxstay.com) are permanently redirected
// to the main address, keeping the page and query string. One official address is better for search
// engines than two identical copies of the site.

export const CANONICAL_HOST = "redondobeach.oneluxstay.com";
export const ALIAS_HOSTS = ["redondo.oneluxstay.com"];

// Returns the address to redirect to, or null if the request is already on the canonical host.
export const canonicalRedirectUrl = (requestUrl) => {
  const url = new URL(requestUrl);
  if (!ALIAS_HOSTS.includes(url.hostname.toLowerCase())) return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";
  return url.toString();
};

export default {
  async fetch(request, env) {
    const target = canonicalRedirectUrl(request.url);
    if (target) return Response.redirect(target, 301);
    return env.ASSETS.fetch(request);
  },
};
