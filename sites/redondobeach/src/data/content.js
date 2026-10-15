// Content for redondobeach.oneluxstay.com. Local-guide copy is adapted from the Redondo Beach
// section of the main OneLuxStay site (src/data/cityAttractions.js) so both sites tell the same story.
// Walking/driving times are the ones published there; review them per building before launch.

export const SITE = {
  name: "OneLuxStay Redondo Beach",
  domain: "https://redondobeach.oneluxstay.com",
  mainSite: "https://oneluxstay.com",
  minNights: 31,
  monthlyRange: "$3,600 per month",
  monthlyStarts: "Starting at $3,600 per month (6-month contract)",
  monthlyNote: "Simple monthly pricing",
  phone: { display: "+1 213 866 3589", href: "tel:+12138663589" },
  whatsapp: { display: "+1 213 866 3589", digits: "12138663589" },
  email: "reservations@oneluxstay.com",
  apiBase: "https://admin.oneluxstay.com/.netlify/functions",
};

const photo = (id, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=78`;

export const IMAGES = {
  hero: photo("1507525428034-b723cf961d3e", 2000),
  // Real Redondo Beach photos from our own unit galleries, stored with the site.
  waterfront: "/images/redondo-waterfront.jpg",
  neighbourhoods: "/images/redondo-neighbourhoods.jpg",
  nature: "/images/redondo-nature.jpg",
  food: "/images/redondo-food.jpg",
};

// The two buildings. `match` is tested against a listing's street address.
export const BUILDINGS = [
  {
    key: "407-north-broadway",
    name: "407 N Broadway",
    street: "407 North Broadway, Redondo Beach, CA 90277",
    coords: { lat: 33.8456984, lng: -118.3899757 },
    match: /407 north broadway/i,
    blurb: "One-bedroom homes with free on-site parking, a short stroll from the pier and the marina.",
    highlights: ["Free parking on premises", "Washer & dryer", "Dishwasher"],
  },
  {
    key: "419-north-broadway",
    name: "419 N Broadway",
    street: "419 North Broadway, Redondo Beach, CA 90277",
    coords: { lat: 33.8458431, lng: -118.3901390 },
    match: /419 north broadway/i,
    blurb: "A one-bedroom home with a parking space, a short stroll from the pier and the marina.",
    highlights: ["Free parking on premises", "Washer & dryer", "Dishwasher"],
  },
];

// The homes we offer, all one-bedroom. Photos and amenities come from our one-bedroom listings.
// A unit with `photoCount` uses its own photos from /images/units/unit-<number>/01.webp, 02.webp, ...
// (made by scripts/optimize-unit-photos.mjs). Units without it use the shared listing photos.
export const UNITS = [
  { number: "1", building: "407-north-broadway", photoCount: 62 },
  { number: "5", building: "419-north-broadway", photoCount: 69 },
  { number: "16", building: "407-north-broadway", photoCount: 57 },
];

// Same floor plan in every home.
export const SLEEPING = [
  { room: "Bedroom", beds: "2 queen beds" },
  { room: "Living room", beds: "2 sofa beds" },
];

// Listing amenities that belong under "Bathroom" on a residence page.
export const BATHROOM_AMENITY = /towels|shampoo|conditioner|body soap|shower gel|hair dryer|hot water/i;

export const WHY_LONG_TERM = [
  {
    title: "Move in with a suitcase",
    body: "Every home is fully furnished and set up for daily life: equipped kitchen, linens and towels, Wi-Fi, TV and in-home laundry.",
  },
  {
    title: "Flexible from 31 nights",
    body: "Stay a month, a season or longer. Simple monthly pricing and flexible arrangements if your plans change.",
  },
  {
    title: "Live like a local",
    body: "Redondo Beach is a relaxed South Bay beach town. Walk to the pier and the marina, bike The Strand, shop Riviera Village.",
  },
];

export const WHO_FOR = [
  "Relocating professionals between homes",
  "Remote workers who want ocean air",
  "Insurance and renovation stays",
  "Families on extended visits",
  "Visiting teams and contractors",
  "Winter escapes and seasonal stays",
];

export const STEPS = [
  { title: "Tell us your dates", body: "Share your move-in date, how long you plan to stay and how many people are coming." },
  { title: "We confirm availability and price", body: "Our team replies with the homes that fit and the monthly rate for your dates." },
  { title: "Sign and secure your stay", body: "We send the agreement and payment details, then your home is held for you." },
  { title: "Arrive and settle in", body: "Check in, unpack and start living in Redondo Beach. We're a message away during your stay." },
];

export const FAQS = [
  {
    q: "What is the minimum stay?",
    a: `${SITE.minNights} nights. These homes are offered for long-term stays only.`,
  },
  {
    q: "How is pricing structured?",
    a: `Pricing is monthly: homes start from ${SITE.monthlyRange} on a 6-month contract. Send us your dates and we'll confirm availability and your rate.`,
  },
  {
    q: "Are the homes furnished?",
    a: "Yes. Each home has furniture, a fully equipped kitchen, linens, towels, Wi-Fi and a TV. See each residence page for its full amenity list.",
  },
  {
    q: "Is there parking?",
    a: "Both buildings, 407 and 419 N Broadway, have free parking on the premises.",
  },
  {
    q: "Can I bring pets?",
    a: "Pets are generally not permitted unless a specific home says otherwise. Tell us your situation and we'll let you know what is possible.",
  },
  {
    q: "What is not included in the monthly rate?",
    a: "Ask us when you inquire. We'll confirm exactly what is included in your monthly rate, along with any deposit, before you commit.",
  },
];

export const EXPLORE = [
  {
    id: "waterfront",
    label: "Beach & Waterfront",
    image: IMAGES.waterfront,
    narrative:
      "The pier has been the town's gathering point since 1889. Everything here begins and ends at the water: the smell of salt in the morning, pelicans coasting at eye level, the light going golden over the marina.",
    places: [
      {
        name: "Redondo Beach Pier & Boardwalk",
        tag: "Pier · Seafood",
        distance: "5 min walk",
        body: "The iconic horseshoe pier is the heart of Redondo Beach, lined with seafood restaurants, tackle shops and fishing spots. Watch pelicans dive for fish while sipping a craft beer at sunset.",
      },
      {
        name: "King Harbor Marina",
        tag: "Marina · Boating",
        distance: "5 min walk",
        body: "A busy small-craft marina with sailboats and charter vessels. Browse the waterfront restaurants, take a fishing charter, or rent a kayak.",
      },
      {
        name: "The Strand — Coastal Bike Path",
        tag: "Cycling · Coastal path",
        distance: "Start from the pier",
        body: "A paved path along the ocean connects Redondo Beach to the other South Bay beach towns and beyond. Rent a bike or rollerblade and ride the coast.",
      },
      {
        name: "Seaside Lagoon",
        tag: "Family · Swimming",
        distance: "10 min walk",
        body: "A protected saltwater swimming lagoon next to the marina, calmer than the open ocean and popular with families, with a sandy beach and lifeguards on duty.",
      },
    ],
  },
  {
    id: "neighbourhoods",
    label: "Neighbourhoods & Beach Towns",
    image: IMAGES.neighbourhoods,
    narrative:
      "Beyond Redondo's boardwalk, the South Bay is a string of beach towns, each with its own character. Walk north for ten minutes and you're somewhere else entirely.",
    places: [
      {
        name: "Riviera Village",
        tag: "Shopping · Cafés",
        distance: "15 min walk",
        body: "Redondo's charming shopping district, a short walk up from the water, packed with independent boutiques, cafés, wine bars and family-run restaurants.",
      },
      {
        name: "Hermosa Beach",
        tag: "Volleyball · Nightlife",
        distance: "15 min walk",
        body: "Redondo's slightly wilder neighbour: a beach-volleyball scene, a lively Pier Avenue strip of bars and restaurants, and a pier known for local festivals.",
      },
      {
        name: "Manhattan Beach",
        tag: "Surf · Boutiques",
        distance: "20 min walk / 5 min drive",
        body: "The most walkable of the South Bay beach towns, with its own pier, a boutique Main Street of shops and restaurants, and some of the area's best surf.",
      },
    ],
  },
  {
    id: "nature",
    label: "Nature & Parks",
    image: IMAGES.nature,
    narrative:
      "The Palos Verdes Peninsula rises from the flat coastline like a chapter break, a reminder that California's wild side is a short drive from the pier.",
    places: [
      {
        name: "Palos Verdes Peninsula",
        tag: "Hiking · Ocean views",
        distance: "15 min drive",
        body: "Clifftop trails with sweeping Pacific views, tidepools and the Point Vicente Lighthouse.",
      },
      {
        name: "Abalone Cove Shoreline Park",
        tag: "Tidepools · Nature reserve",
        distance: "20 min drive",
        body: "A natural reserve with sea caves, tidepools and an accessible beach beneath towering cliffs.",
      },
      {
        name: "Veterans Park",
        tag: "Community park",
        distance: "10 min walk",
        body: "A peaceful park beside the marina with tennis courts, a recreation centre and seasonal summer concerts on the lawn.",
      },
    ],
  },
  {
    id: "food",
    label: "Dining & Local Life",
    image: IMAGES.food,
    narrative:
      "Redondo Beach eats fresh. The fish was in the ocean yesterday, the farmers' market came in with the morning, and the craft beer was brewed down the road.",
    places: [
      {
        name: "International Boardwalk",
        tag: "Seafood · Casual dining",
        distance: "5 min walk",
        body: "The lower pier's row of seafood shacks and restaurants is the place for crab, chowder in a bread bowl and fish tacos eaten with your feet in the sand.",
      },
      {
        name: "Redondo Beach Farmers Market",
        tag: "Farmers market",
        distance: "5 min walk",
        body: "A lively weekly market takes over the pier parking lot, with local produce, artisan foods and cut flowers. Check the current day and hours before you go.",
      },
      {
        name: "South Bay craft breweries",
        tag: "Craft beer",
        distance: "10–20 min drive",
        body: "The South Bay has quietly become one of LA's best craft-beer areas, with a cluster of taprooms within a short drive.",
      },
    ],
  },
];

export const QUICK_FACTS = [
  { label: "Stay length", value: `${SITE.minNights}+ nights` },
  { label: "Homes", value: "Fully furnished 1-bedroom residences" },
  { label: "Pricing", value: SITE.monthlyStarts },
];
