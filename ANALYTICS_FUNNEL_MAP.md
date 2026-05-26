# OneLuxStay Analytics Funnel Map

## Funnel Stages
1. `stage_1_homepage_viewed`
2. `stage_2_city_viewed`
3. `stage_3_listing_viewed`
4. `stage_4_availability_interaction`
5. `stage_5_inquiry_started`
6. `stage_6_inquiry_submitted`
7. `stage_7_booking_clicked`
8. `stage_8_booking_redirected`

## Core Events
- `page_view`
- `city_view`
- `city_click`
- `listing_view`
- `listing_click`
- `availability_opened`
- `availability_search`
- `guest_count_changed`
- `calendar_abandoned`
- `inquiry_start`
- `inquiry_submit`
- `booking_start`
- `booking_redirect`
- `whatsapp_click`
- `phone_call_click`
- `cta_click`
- `navigation_click`
- `gallery_opened`
- `gallery_image_viewed`
- `reviews_viewed`
- `review_expanded`
- `review_scroll_engaged`
- `scroll_depth`
- `funnel_stage`

## Shared Event Metadata
- `session_id`
- `device_type`
- `source_page`
- `page_type`
- `city`
- `listing_id`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`

## Journey Coverage
- Route-level tracking:
  - page view
  - city view
  - listing view
  - funnel stage progression
- Landing page:
  - city chip clicks
  - date picker open/selection
  - guest/room changes
  - booking search submit
- Global units:
  - date picker open/selection
  - city and room filters
  - listing card/view-unit clicks
  - carousel image interactions
- Listing page:
  - listing modal open
  - availability checks
  - inquiry start/submission
  - booking start/redirect
  - modal gallery interactions
- Contact channels:
  - WhatsApp clicks
  - phone `tel:` clicks
  - footer CTA interactions
- Engagement:
  - scroll depth 25/50/75/90
  - review section viewed/engaged

## Attribution
- UTM parameters are persisted from URL to localStorage on init/route change.
- Attribution is injected into every tracked event payload.

## GTM Migration Readiness
- All analytics calls route through `src/lib/analytics.js`.
- Event names and funnel stages centralized in `src/lib/analyticsEvents.js`.
- GTM/Meta/Hotjar/Clarity bridge TODOs are defined in analytics core.

