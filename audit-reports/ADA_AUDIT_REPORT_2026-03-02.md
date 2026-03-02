# ADA / Accessibility Audit Report
Date: 2026-03-02
Method: Lighthouse accessibility audits (mobile-emulated + desktop)
Environment: local production build (`vite preview`)

## Scope Covered
1. Core pages/routes:
- `/`
- `/?checkout=cancelled`
- `/antwerp`, `/los-angeles`, `/miami-beach`, `/redondo-beach`, `/dubai`
- `/listings`, `/global`
- `/privacy-policy`, `/terms`, `/california-privacy-policy`
- `/acknowledge`, `/booking-confirmation`

2. Listing-detail pages (sampled from sitemap, per city):
- 1 listing route + 1 dated booking route per city (10 total)

3. Area-specific city pages (sampled from sitemap, per city):
- 1 area route + 1 date-bundle area route per city (10 total)

## Non-Compliant Pages (Automated WCAG Failures)
### A) Core pages with failures
- `/`
- `/global`
- `/privacy-policy`
- `/terms`
- `/california-privacy-policy`
- `/acknowledge`
- `/booking-confirmation`
- `/?checkout=cancelled`

### B) Area pages with failures (all tested cities)
- `/antwerp/antwerpcentral`
- `/antwerp/antwerpcentral/2026-03-16&2026-03-19&2`
- `/los-angeles/downtownla`
- `/los-angeles/downtownla/2026-03-16&2026-03-19&2`
- `/miami-beach/brickell`
- `/miami-beach/brickell/2026-03-16&2026-03-19&2`
- `/redondo-beach/redondobeach`
- `/redondo-beach/redondobeach/2026-03-16&2026-03-19&2`
- `/dubai/businessbay`
- `/dubai/businessbay/2026-03-16&2026-03-19&2`

## Pages Passing Automated Weighted Accessibility Checks
- City root pages: `/antwerp`, `/los-angeles`, `/miami-beach`, `/redondo-beach`, `/dubai`
- `/listings`
- Listing-detail sample URLs (10/10 tested) in both mobile and desktop scans

## Primary Issues Found
1) `color-contrast` (WCAG 1.4.3)
- Appears on most non-compliant pages.
- Targets include:
  - `footer.policy-footer ... h3`
  - `.ack-card__kicker`
  - `.la-stat-label` (on area pages)

2) `landmark-one-main`
- Missing main landmark on:
  - `/acknowledge`
  - `/booking-confirmation`
  - `/?checkout=cancelled`
  - `/` (desktop run)

3) `heading-order`
- Found on `/global`

4) `aria-prohibited-attr`
- Found on all sampled area pages.
- Target element:
  - `.la-review-ticker__stars` (`div` with `aria-label` where attribute is not allowed for that role/state)

## Advisory (Not Weighted by Lighthouse Score but Important)
- `label-content-name-mismatch` seen on:
  - `/`
  - `/global`
  - `/listings`
- Targets are date-picker trigger buttons (`.la-date-input`) whose accessible name does not match visible label text exactly.

## Likely Source Files
- Footer contrast/heading issues:
  - `src/components/SiteFooter.jsx`
  - `src/App.css` (`.policy-footer-col h3` and related footer styles)
- Acknowledgement/confirmation/cancel pages:
  - `src/AcknowledgementPage.jsx`
  - `src/BookingConfirmationPage.jsx`
  - `src/CheckoutCancelledPage.jsx`
  - `src/App.css` (`.ack-card__kicker`)
- Missing main landmark on home:
  - `src/LandingPage.jsx`
- Area-page ARIA issue:
  - `src/AntwerpLandingPage.jsx`
  - `src/LosAngelesLandingPage.jsx`
  - `src/MiamiBeachLandingPage.jsx`
  - `src/RedondoBeachLandingPage.jsx`
  - `src/DubaiLandingPage.jsx`
  - Target class: `.la-review-ticker__stars`

## Manual ADA Checks Still Required
Automated scans cannot certify full ADA compliance. Manual checks still needed for:
- keyboard-only operation and focus order
- focus trap behavior in modals/dialogs
- screen-reader announcements and context changes
- alternative text quality and meaningfulness
- form error messaging clarity and announcement

## Report Files
- Consolidated all scans: `audit-reports/ada-summary-all-scans.json`
- Core page scans (mobile): `audit-reports/lighthouse/*.json`
- Core page scans (desktop): `audit-reports/lighthouse-desktop/*.json`
- Listing sample scans (mobile): `audit-reports/lighthouse-listing-mobile/*.json`
- Listing sample scans (desktop): `audit-reports/lighthouse-listing-desktop/*.json`
- Area sample scans (mobile): `audit-reports/lighthouse-area-mobile/*.json`
- Area sample scans (desktop): `audit-reports/lighthouse-area-desktop/*.json`
