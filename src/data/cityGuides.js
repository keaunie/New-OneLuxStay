// Written guides shown under the listings on each city and neighbourhood page, and
// copied into the pre-rendered HTML by scripts/prerender-seo.js so search engines read
// the same text. Keep claims to what is true for every apartment in that place
// (amenities were checked against the live listings) and to well-known local facts.

const BOOKING_FAQS = [
  {
    q: "What is the cancellation policy?",
    a: "Cancellation is free until 14 days before check-in. Cancelling within 14 days of check-in, or not showing up, is charged the full accommodation cost.",
  },
  {
    q: "Is there a minimum stay?",
    a: "Most apartments can be booked from one or two nights. The calendar shows the minimum for the dates you pick and only lets you choose check-out days that meet it.",
  },
  {
    q: "Can I stay for several weeks or months?",
    a: "Yes. Our apartments are fully furnished with a kitchen and a washing machine, so they work well for longer work assignments, relocations and extended holidays. For stays of a month or more, contact us and we will help with dates and pricing.",
  },
  {
    q: "Why book direct with One Lux Stay?",
    a: "You deal with the team that manages the apartment, pay through our secure checkout and get your confirmation straight away, without a booking platform in between.",
  },
];

export const CITY_GUIDES = {
  antwerp: {
    title: "Staying in Antwerp",
    sections: [
      {
        paragraphs: [
          "Antwerp is compact, walkable and very well connected, which makes it one of the easiest cities in Europe to live in for a few nights or a few months. One Lux Stay has furnished apartments in five parts of the city: right next to Antwerp Central Station, in the Diamond District, near Central Station on the quieter Zurenborg side, on Lange Leemstraat towards the Fashion District, and in the historic city centre near the Meir.",
          "The apartments are self-contained, with Wi-Fi, a kitchen and a washing machine, so you can cook, work and do laundry as you would at home. Layouts range from studios to three-bedroom suites, which makes them practical for couples, families, business travellers and teams who would rather share a home than book several hotel rooms.",
        ],
      },
      {
        heading: "Which part of Antwerp should I stay in?",
        paragraphs: [
          "If you arrive by train or travel often for work, the apartments around Antwerp Central Station are the most practical: trains to Brussels take about 40 minutes, Brussels Airport has a direct train, and high-speed services run to Amsterdam and Paris. The Diamond District sits right beside the station and suits anyone working in the diamond trade.",
          "For a holiday or a first visit, the city centre puts the Grote Markt, the Cathedral of Our Lady, the river and the Meir shopping street on your doorstep. The Fashion District side is for design shops, the MoMu fashion museum and cafés, while the streets near Zurenborg are calmer and residential, with Belle Époque architecture and the bars around Dageraadplaats.",
        ],
      },
      {
        heading: "Getting around",
        paragraphs: [
          "Most of what visitors want to see is within a 30-minute walk of Central Station. Trams and De Lijn buses cover the rest of the city, and shared city bikes (Velo) have stations on almost every main street. A car is rarely needed inside Antwerp, and much of the centre lies inside a low-emission zone, so check your vehicle's registration before driving in.",
        ],
      },
    ],
    faqs: BOOKING_FAQS,
  },
  "los-angeles": {
    title: "Staying in Los Angeles",
    sections: [
      {
        paragraphs: [
          "Los Angeles is spread out, so where you stay shapes your whole trip. One Lux Stay has furnished apartments in two of the city's most convenient bases: Hollywood, just off Sunset Boulevard, and the Historic Core of Downtown Los Angeles on Spring Street.",
          "All our Los Angeles apartments have Wi-Fi, a full kitchen with a dishwasher, air conditioning, an in-unit washer and dryer, and access to a building gym. They range from one-bedroom apartments to three-bedroom homes, and several Hollywood apartments look out over the Hollywood Sign, the pool or the city.",
        ],
      },
      {
        heading: "Hollywood or Downtown?",
        paragraphs: [
          "Hollywood suits holidays and entertainment work. The Walk of Fame, the TCL Chinese Theatre, the Hollywood Bowl and Griffith Observatory are close by, studios such as Paramount are a short drive away, and the Hollywood apartments include free on-site parking, which matters in Los Angeles.",
          "Downtown suits business trips, conferences and anyone who prefers to get around without a car. From Spring Street you can walk to Grand Central Market, the Bradbury Building and Little Tokyo, reach the Walt Disney Concert Hall and The Broad on Grand Avenue, and use the Metro at nearby Pershing Square to get across the city.",
        ],
      },
      {
        heading: "Getting around",
        paragraphs: [
          "Plan around traffic: LAX is typically 30 to 60 minutes by car from either neighbourhood depending on the time of day. The Metro B Line links Downtown and Hollywood directly, and ride-hailing is easy to find in both areas.",
        ],
      },
    ],
    faqs: BOOKING_FAQS,
  },
  dubai: {
    title: "Staying in Downtown Dubai",
    sections: [
      {
        paragraphs: [
          "One Lux Stay's Dubai residences are in Downtown Dubai on Sheikh Mohammed bin Rashid Boulevard, the street that loops around the Burj Khalifa, Dubai Mall and the Dubai Fountain. The 2 and 3-bedroom apartments face either the Burj Khalifa directly or the fountain, and the Dubai Opera is a short walk away.",
          "Every residence has Wi-Fi, a full kitchen, air conditioning and a washing machine, and the building has lifts and a gym. With the space of a private apartment and Downtown on the doorstep, they suit families, groups of friends and business travellers staying a few nights or several weeks.",
        ],
      },
      {
        heading: "Why stay in Downtown Dubai?",
        paragraphs: [
          "Downtown is the most central place to stay in Dubai. You can walk to the Dubai Mall, Souk Al Bahar and the restaurants along the boulevard, watch the fountain shows in the evening, and go up the Burj Khalifa without needing transport. DIFC and Business Bay, the city's main business districts, are next door, which makes Downtown a practical base for work trips too.",
        ],
      },
      {
        heading: "Getting around",
        paragraphs: [
          "Dubai International Airport is usually 15 to 25 minutes away by taxi. The Burj Khalifa/Dubai Mall Metro station on the Red Line connects Downtown with Dubai Marina, the airport and the older parts of the city, and taxis and ride-hailing are inexpensive and easy to find along the boulevard.",
        ],
      },
    ],
    faqs: BOOKING_FAQS,
  },
};

export const AREA_GUIDES = {
  antwerp: {
    "diamond-district": {
      title: "Furnished apartments in Antwerp's Diamond District",
      paragraphs: [
        "Our Diamond District apartments are on Jacob Jordaensstraat, a few minutes' walk from the diamond exchanges around Hoveniersstraat and Pelikaanstraat and from Antwerp Central Station. This square kilometre has been the centre of the world's diamond trade for centuries, so the neighbourhood is busy with traders on weekdays and quiet in the evenings.",
        "The building has 1 and 2-bedroom apartments, a 2-bedroom penthouse and spacious 3-bedroom layouts, each with Wi-Fi, a kitchen and a washing machine. That makes it a popular choice for diamond professionals visiting regularly, as well as families who want to be close to the station, the zoo and the city centre.",
      ],
    },
    "antwerp-central": {
      title: "Furnished apartments next to Antwerp Central Station",
      paragraphs: [
        "These apartments are on Lange Leemstraat, a short walk from Antwerp Central Station, one of the most admired railway stations in the world. You can step off a train from Brussels, Brussels Airport, Amsterdam or Paris and be at the door within minutes, and Antwerp Zoo and Koningin Astridplein are around the corner.",
        "Layouts range from studios to three-bedroom suites, including a Grande Deluxe three-bedroom, so the building works for solo business trips as well as families and teams travelling together. Trams from the station reach the city centre and the river in about ten minutes.",
      ],
    },
    "near-central-station": {
      title: "Furnished apartments near Central Station, Zurenborg side",
      paragraphs: [
        "On Lange Kievitstraat, these apartments sit just behind Antwerp Central Station on its quieter side, between the station and the Zurenborg neighbourhood. You get fast train and tram connections without the bustle of the station square, and Zurenborg's Belle Époque houses on Cogels-Osylei and the cafés on Dageraadplaats are an easy walk away.",
        "The apartments are three-bedroom, two-and-a-half-bathroom homes, some with a terrace or a dedicated children's room, each with Wi-Fi, a kitchen with a dishwasher, and a washer and dryer. They are a good fit for families and groups who want space for a longer stay.",
      ],
    },
    "fashion-district": {
      title: "Furnished apartments on Lange Leemstraat, Fashion District side",
      paragraphs: [
        "Our Lange Leemstraat 103 building has studios, one and two-bedroom apartments and deluxe one-bedroom suites. It sits between Central Station and the southern side of the city, with trams heading towards Nationalestraat, Kammenstraat and the MoMu fashion museum, the centre of Antwerp's design and fashion scene.",
        "Each apartment has Wi-Fi, a kitchen and a washing machine, which makes the building a comfortable base for stays of a few nights to several months, whether you are in Antwerp for work, study or a long weekend of shopping and museums.",
      ],
    },
    "city-centre": {
      title: "Furnished apartments in Antwerp city centre",
      paragraphs: [
        "On Kribbestraat, in the middle of old Antwerp, these one-bedroom apartments put the Meir shopping street, the Grote Markt, the Cathedral of Our Lady and the Rubens House within a few minutes' walk. The Scheldt river, the Steen castle and the MAS museum on the Eilandje are close by too.",
        "Each apartment has Wi-Fi, a kitchen and a washing machine. It is the neighbourhood we recommend for a first visit to Antwerp, a city break for two, or anyone who wants restaurants, museums and shops on their doorstep rather than a tram ride away.",
      ],
    },
  },
  "los-angeles": {
    hollywood: {
      title: "Furnished apartments in Hollywood",
      paragraphs: [
        "Our Hollywood apartments are on De Longpre Avenue, just off Sunset Boulevard, a few blocks from Hollywood Boulevard, the Walk of Fame and the Metro B Line. Several of them look out over the Hollywood Sign, the pool or the city, and the choice runs from one-bedroom apartments to three-bedroom homes.",
        "Every apartment has a full kitchen with a dishwasher, air conditioning, an in-unit washer and dryer, Wi-Fi, access to the gym and free on-site parking. That combination suits production crews and entertainment professionals on longer assignments as much as families on holiday.",
      ],
    },
    hwh: {
      title: "Furnished apartments in Downtown Los Angeles (HWH)",
      paragraphs: [
        "HWH is on Spring Street in the Historic Core of Downtown Los Angeles, a block from Grand Central Market and the Bradbury Building and a short walk from Little Tokyo, Pershing Square and the Arts District. The Walt Disney Concert Hall, The Broad and the Downtown business towers are all within reach on foot or by Metro.",
        "The 1 and 2-bedroom apartments come with air conditioning, a full kitchen with a dishwasher, an in-unit washer and dryer, Wi-Fi and a patio or balcony, in a building with lifts and a gym. They are a practical base for business trips, conferences and longer stays without needing a car.",
      ],
    },
  },
  dubai: {
    downtowndubai: {
      title: "Furnished residences in Downtown Dubai",
      paragraphs: [
        "These residences are on Sheikh Mohammed bin Rashid Boulevard in Downtown Dubai, with 2 and 3-bedroom layouts looking directly at the Burj Khalifa or over the Dubai Fountain. The Dubai Mall, Souk Al Bahar and the Dubai Opera are a short walk away, and the Burj Khalifa/Dubai Mall Metro station connects you to the rest of the city.",
        "Each residence has air conditioning, a full kitchen, a washing machine and Wi-Fi, in a building with lifts and a gym. They suit families and groups who want the space of a home, and business travellers working in DIFC or Business Bay next door.",
      ],
    },
  },
};

const AREA_SLUG_ALIASES = {
  antwerp: {
    diamonddistrict: "diamond-district",
    diamond: "diamond-district",
    antwerpcentral: "antwerp-central",
    central: "antwerp-central",
    nearcentral: "near-central-station",
    nearcentralstation: "near-central-station",
    fashiondistrict: "fashion-district",
    fashion: "fashion-district",
    citycentre: "city-centre",
    citycenter: "city-centre",
  },
  "los-angeles": { hollywood: "hollywood", hwh: "hwh" },
  dubai: { downtowndubai: "downtowndubai", downtown: "downtowndubai" },
};

// Guide for a city page, or for one of its neighbourhoods when the slug names one.
export const getCityGuide = (cityKey, areaSlug = "") => {
  const normalized = String(areaSlug || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const areaKey = AREA_SLUG_ALIASES[cityKey]?.[normalized];
  const area = areaKey ? AREA_GUIDES[cityKey]?.[areaKey] : null;
  if (area) {
    return { title: area.title, sections: [{ paragraphs: area.paragraphs }], faqs: BOOKING_FAQS };
  }
  return CITY_GUIDES[cityKey] || null;
};
