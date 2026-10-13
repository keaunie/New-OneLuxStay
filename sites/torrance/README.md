# torrance.oneluxstay.com

A standalone marketing site for **long-term (31+ night) furnished stays in Torrance**. It lives in the
main repo so it can share dependencies, but it builds and deploys on its own and does not touch the main site.

## What's in it

| Page | Path | Purpose |
|------|------|---------|
| Home | `/` | Long-term pitch, residences, local highlights, how it works, FAQ, inquiry form |
| Residences | `/residences` | Floor plans grouped by building (live from the listings API) |
| Residence | `/residences/:slug` | Photo gallery, amenities, inquiry form |
| Explore Torrance | `/explore` | Local guide: waterfront, neighbourhoods, nature, dining |
| Long-term stays | `/long-term-stays` | Pricing note, who it's for, steps, FAQ |
| Contact | `/contact` | Inquiry form, phone, WhatsApp, email |

Residences come from `https://admin.oneluxstay.com/.netlify/functions/listings` (same data as the main site),
filtered to `city = Torrance` and grouped by building + bedroom count. If that service is unreachable the
site falls back to the built-in floor plans (no photos) so it never looks empty.

## Where to edit things

- **Wording, prices, contact details, FAQs, local guide:** `src/data/content.js`
- **Colours and layout:** `src/styles.css` (design tokens at the top)
- **Buildings and how listings are grouped:** `BUILDINGS` in `content.js` and `src/lib/residences.js`
- **Photos on the home/explore pages:** `public/images/` (real Redondo photos taken from the unit galleries)

## Run, build, deploy (from the repo root)

```
npm run dev:torrance        # local preview on http://127.0.0.1:5176
npm run build:torrance      # builds to sites/torrance/dist
npm run deploy:torrance     # build + publish to Cloudflare as "oneluxstay-torrance"
```

`sites/torrance/wrangler.jsonc` attaches the custom domains. Cloudflare creates the DNS records itself on
deploy, as long as those hostnames have no existing record in the zone.

- `torrance.oneluxstay.com` is the main address.
- `torrance.oneluxstay.com` is an alternate address guests may type. `worker.js` permanently (301) redirects it to the
  main address, keeping the page and query string, so search engines see one official site. To add more alternate
  addresses, add them to `ALIAS_HOSTS` in `worker.js` and to `routes` in `wrangler.jsonc`.

## How inquiries work

The form opens the guest's email app with a pre-filled message to `reservations@oneluxstay.com` (the same approach
the main site uses for long-term Redondo inquiries). WhatsApp and phone links sit beside it. There is no online
booking or payment on this site.

## Review before launch

- Monthly price range ($4,500 – $6,500, "seasonal monthly pricing") is copied from the main site's Redondo page.
- Walking/driving times in the local guide are copied from the main site's Redondo content and are measured from
  central Torrance, not from each building. Check them per building.
- "Free parking on premises" is shown only for North Broadway, because that is what the listing data says.
- The FAQ answers about deposits, what's included in the rate, and pets are deliberately general. Edit them to
  match your actual terms.

## How this differs from the Redondo Beach site

Same template, different identity: forest-green and terracotta palette (Redondo is ocean blue and gold), two-bedroom homes on Anza Avenue (3 buildings, filtered by city = Torrance), a golden-surf-to-coast scroll backdrop, and a Torrance local guide. The 3D scene was dropped.

## Review before launch

- No pricing is shown because the listings API has no Torrance base prices. Add a range to `SITE` if you want one.
- Drive times in the local guide are estimates from South Torrance.
- The backdrop and explore photos are stock images plus one South Bay beach shot; swap in real Torrance photos in `public/images/`.
- Confirm the farmers market days, pets, and deposit wording.
