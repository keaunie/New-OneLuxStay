export const conciergeKnowledge = {
  brand: {
    name: "One Lux Stay",
    description:
      "Luxury short-term stays and curated property experiences across selected international cities.",
    contactEmail: "reservations@oneluxstay.com",
    contactPhone: "",
    contactWhatsApp: "+1 715 921 8069 (USA) | +32 460 25 48 86 (Belgium)",
    bookingSummary:
      "Guests typically choose a city or listing, select dates and guest count, review the stay details, and continue through checkout on the website.",
    humanEscalation:
      "For anything sensitive, uncertain, or policy-specific, direct guests to the One Lux Stay team through the website contact channels.",
  },
  cities: [
    {
      name: "Antwerp",
      summary: "European city stay options with a central, stylish urban feel.",
      notes: [
        "Useful for guests looking for walkable city stays.",
        "Good fit for visitors comparing neighborhoods and central access.",
      ],
    },
    {
      name: "Los Angeles",
      summary: "City stays for guests who want an LA base near key neighborhoods and attractions.",
      notes: [
        "Useful for guests comparing location and trip style.",
      ],
    },
    {
      name: "Miami",
      summary: "Florida stay options for guests who want a vibrant coastal city trip.",
      notes: [
        "Useful for guests comparing city energy, beach access, and trip vibe.",
      ],
    },
    {
      name: "Redondo Beach",
      summary: "Coastal stay options for guests who want a more relaxed beach-area base.",
      notes: [
        "Useful for guests who prefer a calmer beach stay.",
      ],
    },
    {
      name: "Dubai",
      summary: "Luxury city stays for guests who want a modern, upscale destination.",
      notes: [
        "Useful for guests comparing premium city experiences and neighborhoods.",
      ],
    },
  ],
  policies: {
    checkIn: "Standard check-in time is 3:00 PM for One Lux Stay units.",
    checkOut: "Standard check-out time is 11:00 AM for One Lux Stay units.",
    cancellation: "Add your cancellation policy here.",
    pets: "Add your pet policy here.",
    parking: "Add your parking guidance here.",
    smoking: "Add your smoking policy here.",
    houseRules: "Add your core house rules here.",
    depositsAndFees: "Add your deposit, hold, or fee guidance here.",
  },
  faq: [
    {
      question: "What cities do you have stays in?",
      answer: "One Lux Stay currently features stays in Antwerp, Los Angeles, Miami, Redondo Beach, and Dubai.",
    },
    {
      question: "How do I book with One Lux Stay?",
      answer:
        "Choose a city or listing, select dates and guest count, review the stay details, and continue through checkout on the website.",
    },
    {
      question: "How should the concierge answer if details are uncertain?",
      answer:
        "Do not invent facts. Tell the guest when something is not confirmed and guide them to the listing page or the One Lux Stay team.",
    },
  ],
  pageGuidance: {
    home: "The home page helps guests discover destinations and start browsing stays.",
    city: "A city page helps guests compare options in one destination and move toward booking.",
    listing: "A listing page helps guests review a specific stay and continue into booking.",
    global: "The global page helps guests browse options across multiple destinations.",
  },
};

export default conciergeKnowledge;
