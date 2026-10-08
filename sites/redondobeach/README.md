# redondobeach.oneluxstay.com

A standalone marketing site for **long-term (31+ night) furnished stays in Redondo Beach**. It lives in the
main repo so it can share dependencies, but it builds and deploys on its own and does not touch the main site.

## What's in it

| Page | Path | Purpose |
|------|------|---------|
| Home | `/` | Long-term pitch, residences, local highlights, how it works, FAQ, inquiry form |
| Residences | `/residences` | Floor plans grouped by building (live from the listings API) |
| Residence | `/residences/:slug` | Photo gallery, amenities, inquiry form |
| Explore Redondo Beach | `/explore` | Local guide: waterfront, neighbourhoods, nature, dining |
| Long-term stays | `/long-term-stays` | Pricing note, who it's for, steps, FAQ |
| Contact | `/contact` | Inquiry form, phone, WhatsApp, email |

Residences come from `https://admin.oneluxstay.com/.netlify/functions/listings` (same data as the main site),
filtered to `city = Redondo Beach` and grouped by building + bedroom count. If that service is unreachable the
site falls back to the built-in floor plans (no photos) so it never looks empty.

## Where to edit things

- **Wording, prices, contact details, FAQs, local guide:** `src/data/content.js`
- **Colours and layout:** `src/styles.css` (design tokens at the top)
- **Buildings and how listings are grouped:** `BUILDINGS` in `content.js` and `src/lib/residences.js`
- **Photos on the home/explore pages:** `public/images/` (real Redondo photos taken from the unit galleries)

## Run, build, deploy (from the repo root)

```
npm run dev:redondo        # local preview on http://127.0.0.1:5175
npm run build:redondo      # builds to sites/redondobeach/dist
npm run deploy:redondo     # build + publish to Cloudflare as "oneluxstay-redondobeach"
```

`sites/redondobeach/wrangler.jsonc` attaches the custom domain `redondobeach.oneluxstay.com`. Cloudflare creates
the DNS record itself on the first deploy, as long as that hostname has no existing record in the zone.

## How inquiries work

The form opens the guest's email app with a pre-filled message to `reservations@oneluxstay.com` (the same approach
the main site uses for long-term Redondo inquiries). WhatsApp and phone links sit beside it. There is no online
booking or payment on this site.

## Review before launch

- Monthly price range ($4,500 – $6,500, "seasonal monthly pricing") is copied from the main site's Redondo page.
- Walking/driving times in the local guide are copied from the main site's Redondo content and are measured from
  central Redondo Beach, not from each building. Check them per building.
- "Free parking on premises" is shown only for North Broadway, because that is what the listing data says.
- The FAQ answers about deposits, what's included in the rate, and pets are deliberately general. Edit them to
  match your actual terms.
