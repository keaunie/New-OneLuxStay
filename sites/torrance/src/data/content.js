// Content for torrance.oneluxstay.com. Built from the Redondo Beach site's template, with Torrance homes
// (all on Anza Avenue, South Torrance) and a Torrance local guide.
// Drive times are approximate and measured from South Torrance, not from each building. Review before launch.

export const SITE = {
  name: "OneLuxStay Torrance",
  domain: "https://torrance.oneluxstay.com",
  mainSite: "https://oneluxstay.com",
  minNights: 31,
  monthlyNote: "Monthly pricing, quoted for your dates",
  phone: { display: "+1 213 866 3589", href: "tel:+12138663589" },
  whatsapp: { display: "+1 213 866 3589", digits: "12138663589" },
  email: "reservations@oneluxstay.com",
  inquiryTo: ["reservations@oneluxstay.com", "ash@oneluxstay.com"],
  apiBase: "https://admin.oneluxstay.com/.netlify/functions",
};

const photo = (id, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=78`;

export const IMAGES = {
  hero: photo("1500375592092-40eb2168fd21", 2000),
  waterfront: "/images/torrance-waves.jpg",
  neighbourhoods: "/images/torrance-neighbourhoods.jpg",
  nature: "/images/torrance-parks.jpg",
  food: "/images/torrance-dining.jpg",
};

// The buildings. `match` is tested against a listing's street address.
export const BUILDINGS = [
  {
    key: "anza-23451",
    name: "23451 Anza Avenue",
    street: "23451 Anza Avenue, Torrance, CA 90505",
    match: /23451\s+anza/i,
    blurb: "Two-bedroom South Torrance homes with free on-site parking, set in a quiet residential street.",
    highlights: ["Free parking on premises", "Washer & dryer", "Dishwasher"],
  },
  {
    key: "anza-23621",
    name: "23621 Anza Avenue",
    street: "23621 Anza Avenue, Torrance, CA 90505",
    match: /23621\s+anza/i,
    blurb: "Two-bedroom, two-bath homes that sleep six, a short drive from Torrance Beach.",
    highlights: ["Free parking on premises", "Washer & dryer", "Dishwasher"],
  },
  {
    key: "anza-23817",
    name: "23817 Anza Avenue",
    street: "23817 Anza Avenue, Torrance, CA 90505",
    match: /23817\s+anza/i,
    blurb: "Coastal two-bedroom homes in South Torrance, close to the beach and the South Bay's best views.",
    highlights: ["Free parking on premises", "Washer & dryer", "Dishwasher"],
  },
];

export const WHY_LONG_TERM = [
  {
    title: "Space to spread out",
    body: "Two-bedroom homes with a full kitchen, dining table, in-home laundry and room for a family, a team or a work-from-home setup.",
  },
  {
    title: "Flexible from 31 nights",
    body: "Stay a month, a season or longer. Simple monthly pricing and flexible arrangements if your plans change.",
  },
  {
    title: "The quiet side of the South Bay",
    body: "Torrance is residential, green and easy to get around, with the beach, the marsh and every South Bay town a short drive away.",
  },
];

export const WHO_FOR = [
  "Relocating professionals and families",
  "Aerospace, tech and hospital contractors",
  "Insurance and renovation stays",
  "Remote workers who want room for an office",
  "Extended visits from friends and family",
  "Visiting teams and traveling nurses",
];

export const STEPS = [
  { title: "Tell us your dates", body: "Share your move-in date, how long you plan to stay and how many people are coming." },
  { title: "We confirm availability and price", body: "Our team replies with the homes that fit and the monthly rate for your dates." },
  { title: "Sign and secure your stay", body: "We send the agreement and payment details, then your home is held for you." },
  { title: "Arrive and settle in", body: "Check in, unpack and start living in Torrance. We're a message away during your stay." },
];

export const FAQS = [
  {
    q: "What is the minimum stay?",
    a: `${SITE.minNights} nights. These homes are offered for long-term stays only.`,
  },
  {
    q: "How is pricing structured?",
    a: "Pricing is monthly and depends on the home and your dates. Send us your plans and we'll quote you.",
  },
  {
    q: "Are the homes furnished?",
    a: "Yes. Each home has furniture, a fully equipped kitchen, linens, towels, Wi-Fi and a TV. See each residence page for its full amenity list.",
  },
  {
    q: "Is there parking?",
    a: "Yes. Free parking is available on the premises.",
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
    label: "Beaches & Coast",
    image: IMAGES.waterfront,
    narrative:
      "Torrance sits on the sunny southern edge of the South Bay, with a long, wide beach, bluffs behind it and the Palos Verdes hills curving off to the south.",
    places: [
      {
        name: "Torrance Beach",
        tag: "Beach · Surf",
        distance: "10 min drive",
        body: "A wide, quieter stretch of sand backed by bluffs, with lifeguards, volleyball courts and room to spread out. Locals come for the sunsets and the bike path.",
      },
      {
        name: "The Strand — Coastal Bike Path",
        tag: "Cycling · Coastal path",
        distance: "10 min drive",
        body: "A paved path along the ocean links Torrance Beach north through Redondo, Hermosa and Manhattan Beach. Rent a bike and ride the coast.",
      },
      {
        name: "Redondo Beach Pier & King Harbor",
        tag: "Pier · Seafood",
        distance: "15 min drive",
        body: "The horseshoe pier next door, with seafood restaurants, a marina, kayak rentals and fishing charters.",
      },
    ],
  },
  {
    id: "neighbourhoods",
    label: "Neighbourhoods & Beach Towns",
    image: IMAGES.neighbourhoods,
    narrative:
      "Torrance is a city of its own, and around it the South Bay is a string of beach towns, each with its own character.",
    places: [
      {
        name: "Riviera Village",
        tag: "Shopping · Cafés",
        distance: "10 min drive",
        body: "A charming shopping district in nearby Redondo Beach, packed with independent boutiques, cafés, wine bars and family-run restaurants.",
      },
      {
        name: "Old Torrance",
        tag: "Historic downtown",
        distance: "15 min drive",
        body: "Torrance's historic downtown around Sartori Avenue, with local restaurants, a cultural arts centre and a calm, small-town feel.",
      },
      {
        name: "Manhattan Beach & Hermosa Beach",
        tag: "Surf · Boutiques",
        distance: "15–20 min drive",
        body: "Two of the South Bay's best-known beach towns, with piers, boutique streets, volleyball and a lively evening scene.",
      },
    ],
  },
  {
    id: "nature",
    label: "Parks & Nature",
    image: IMAGES.nature,
    narrative:
      "Green space is a Torrance habit: wetlands in the middle of the city, parks on every other block and the wild Palos Verdes coast a short drive away.",
    places: [
      {
        name: "Madrona Marsh Preserve",
        tag: "Wetland · Birdwatching",
        distance: "10 min drive",
        body: "A rare freshwater marsh and nature centre in the heart of the city, with walking trails, wildflowers in spring and plenty of birdlife.",
      },
      {
        name: "Palos Verdes Peninsula",
        tag: "Hiking · Ocean views",
        distance: "15–20 min drive",
        body: "Clifftop trails with sweeping Pacific views, tidepools and the Point Vicente Lighthouse.",
      },
      {
        name: "Wilson Park",
        tag: "Community park",
        distance: "15 min drive",
        body: "A big neighbourhood park with playgrounds, sports fields and shaded lawns, popular for weekend picnics.",
      },
    ],
  },
  {
    id: "food",
    label: "Dining & Shopping",
    image: IMAGES.food,
    narrative:
      "Torrance is known for its food: a long-standing Japanese community, excellent ramen and sushi, Korean barbecue and everything in between.",
    places: [
      {
        name: "Del Amo Fashion Center",
        tag: "Shopping · Dining",
        distance: "12 min drive",
        body: "One of the largest shopping centres in the country, with hundreds of stores, restaurants and a cinema, all under one roof.",
      },
      {
        name: "Torrance's ramen & sushi scene",
        tag: "Japanese · Casual dining",
        distance: "10–15 min drive",
        body: "Torrance is one of LA's top spots for Japanese food, with ramen shops, izakayas, bakeries and sushi counters along Sepulveda and Torrance Boulevards.",
      },
      {
        name: "Torrance Farmers Market",
        tag: "Farmers market",
        distance: "15 min drive",
        body: "Fresh local produce, flowers and prepared food. Check the current days and hours before you go.",
      },
    ],
  },
];

export const QUICK_FACTS = [
  { label: "Stay length", value: `${SITE.minNights}+ nights` },
  { label: "Apartments", value: "2-bedroom, furnished" },
  { label: "Area", value: "South Torrance" },
  { label: "Pricing", value: "Monthly" },
];
