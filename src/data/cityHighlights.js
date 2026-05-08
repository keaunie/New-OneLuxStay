export const CITY_HIGHLIGHTS = {
  antwerp: {
    title: "Neighborhood highlights",
    intro:
      "Stay in the heart of Antwerp's fashion and diamond district — steps from landmarks, transit, and destination dining.",
    items: [
      {
        title: "Grote Markt & Old Town",
        distance: "12 min walk",
        desc: "The living heart of old Antwerp, framed by cafe terraces, heritage facades, and the Cathedral of Our Lady.",
      },
      {
        title: "Fashion District",
        distance: "7 min walk",
        desc: "Home to the Antwerp Six legacy, MoMu, and an international community of designers.",
      },
      {
        title: "Tram & Transit Access",
        distance: "1 min walk",
        desc: "Direct tram and De Lijn bus lines connect you to every corner of Antwerp with ease.",
      },
    ],
  },
  dubai: {
    title: "Neighborhood highlights",
    intro:
      "Positioned for effortless movement between Dubai's waterfront, dining, and retail destinations.",
    items: [
      {
        title: "Dubai Marina",
        distance: "8 min drive",
        desc: "A lively promenade of waterfront dining, cafes, and evening city lights.",
      },
      {
        title: "JBR Beach",
        distance: "10 min drive",
        desc: "Golden shoreline, beach clubs, and family-friendly day-to-night activities.",
      },
      {
        title: "Metro & Sheikh Zayed",
        distance: "5 min drive",
        desc: "Fast access across the city for business districts, malls, and landmarks.",
      },
    ],
  },
  "los-angeles": {
    title: "Neighborhood highlights",
    intro:
      "A connected base near Hollywood's entertainment, dining, and everyday essentials.",
    items: [
      {
        title: "Hollywood Boulevard",
        distance: "10 min drive",
        desc: "Iconic attractions, theaters, and nightlife moments in the center of LA culture.",
      },
      {
        title: "Dining & Cafes",
        distance: "Walkable",
        desc: "From neighborhood brunch spots to late-night dining, options are always close.",
      },
      {
        title: "Transit Corridors",
        distance: "Quick access",
        desc: "Convenient routes toward Downtown, West Hollywood, and major LA districts.",
      },
    ],
  },
  miami: {
    title: "Neighborhood highlights",
    intro:
      "A curated Miami stay with quick access to beaches, design districts, and nightlife energy.",
    items: [
      {
        title: "Miami Beach",
        distance: "12 min drive",
        desc: "Sun, sand, and vibrant oceanfront scenes from morning to late evening.",
      },
      {
        title: "Design District & Wynwood",
        distance: "15 min drive",
        desc: "Art walls, galleries, flagship retail, and top culinary destinations.",
      },
      {
        title: "Airport & Downtown",
        distance: "20 min drive",
        desc: "Efficient links for arrivals, departures, and business appointments.",
      },
    ],
  },
  "redondo-beach": {
    title: "Neighborhood highlights",
    intro:
      "A coastal base with easy access to the Redondo waterfront and South Bay essentials.",
    items: [
      {
        title: "Redondo Pier",
        distance: "8 min drive",
        desc: "Ocean views, seafood spots, and sunset walks along the South Bay shoreline.",
      },
      {
        title: "Beachfront Paths",
        distance: "10 min drive",
        desc: "Bike and walk routes connecting Redondo, Hermosa, and Manhattan Beach.",
      },
      {
        title: "LAX & Freeway Links",
        distance: "20 min drive",
        desc: "Streamlined airport and city access for both leisure and business stays.",
      },
    ],
  },
};

export const getCityHighlights = (cityKey) => CITY_HIGHLIGHTS[cityKey] || CITY_HIGHLIGHTS.antwerp;
