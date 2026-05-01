const U = (id, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=78`;

export const CITY_ATTRACTIONS = {
  antwerp: {
    cityName: "Antwerp",
    country: "Belgium",
    tagline: "A city of diamonds, art, and Flemish grandeur.",
    intro:
      "Antwerp is Belgium's second-largest city and one of Europe's most cultured destinations — home to world-class museums, a thriving fashion scene, and a medieval old town threaded with cobblestone alleys and cathedral spires.",
    cityPath: "/antwerp",
    bookPath: "/antwerp",
    heroGradient: "linear-gradient(135deg, #2c2420 0%, #4a3728 60%, #6b4f38 100%)",
    heroImage: U("1518005020951-eccb494ad742", 1800),
    accentColor: "#c9a96e",
    categories: [
      {
        id: "culture",
        label: "Culture & History",
        icon: "museum",
        image: U("1543783207-ec64e4d95325"),
        narrative:
          "Begin in the shadow of Gothic spires where Peter Paul Rubens once walked these same cobblestones. Antwerp's past is not locked in glass cases — it breathes through every street, every guild house, every cathedral door left open to the afternoon light.",
        attractions: [
          {
            name: "Cathedral of Our Lady",
            description:
              "This magnificent Gothic cathedral, a UNESCO World Heritage Site, houses four Rubens masterpieces and towers over the Antwerp skyline. Its 123-metre spire is the city's most iconic silhouette.",
            tag: "UNESCO · Gothic",
            distance: "City centre",
          },
          {
            name: "Grote Markt",
            description:
              "Antwerp's stunning main square is flanked by gilded guild houses, a Baroque city hall, and the Brabo Fountain. Perfect for an evening aperitif on a café terrace.",
            tag: "Historic Square",
            distance: "City centre",
          },
          {
            name: "MAS Museum aan de Stroom",
            description:
              "This striking red-sandstone tower on the riverbank is Antwerp's museum of the city and the world. Ride the free escalators to the rooftop for panoramic views of the port.",
            tag: "Museum · Rooftop Views",
            distance: "10 min walk",
          },
          {
            name: "Rubenshuis",
            description:
              "Peter Paul Rubens' former home and studio is now a beautifully preserved museum. Stroll through the Baroque garden and see original paintings in the very rooms where they were created.",
            tag: "Art Museum",
            distance: "5 min walk",
          },
          {
            name: "Plantin-Moretus Museum",
            description:
              "A UNESCO-listed printing house that is the only printing workshop in the world on the World Heritage List. Explore 16th-century presses, rare books, and a remarkable courtyard garden.",
            tag: "UNESCO · Printing History",
            distance: "5 min walk",
          },
          {
            name: "Royal Museum of Fine Arts",
            description:
              "After an extensive renovation, Antwerp's premier art museum showcases Flemish masters from Van Eyck to Ensor across beautifully restored halls — one of Belgium's finest art collections.",
            tag: "Fine Arts",
            distance: "15 min walk",
          },
        ],
      },
      {
        id: "shopping",
        label: "Shopping & Fashion",
        icon: "shopping",
        image: U("1483985988355-763728e1935b"),
        narrative:
          "Antwerp gave the world the Antwerp Six. This is where fashion is not followed but invented, block by block, from the grand boulevard to the indie backstreets where tomorrow's designers are quietly at work.",
        attractions: [
          {
            name: "Meir",
            description:
              "Antwerp's elegant main shopping boulevard stretches through 19th-century architecture and hosts flagship stores, Belgian chocolate boutiques, and the opulent Stadsfeestzaal shopping gallery.",
            tag: "Shopping Boulevard",
            distance: "5 min walk",
          },
          {
            name: "The Diamond District",
            description:
              "Antwerp handles over 80% of the world's rough diamonds. The four-block district around Antwerp Central Station glitters with diamond dealers, jewellers, and gem wholesalers.",
            tag: "Diamonds",
            distance: "15 min walk",
          },
          {
            name: "Nationalestraat",
            description:
              "The heartbeat of Antwerp's world-famous fashion scene. This street and its surrounding neighbourhood are home to the city's independent designers, concept stores, and the MoMu fashion museum.",
            tag: "Fashion District",
            distance: "10 min walk",
          },
          {
            name: "Kammenstraat",
            description:
              "A bohemian street packed with vintage shops, record stores, skate culture boutiques, and quirky cafés — Antwerp's laid-back counterpart to its high-fashion reputation.",
            tag: "Vintage · Indie",
            distance: "8 min walk",
          },
        ],
      },
      {
        id: "food",
        label: "Food & Drink",
        icon: "food",
        image: U("1414235077428-338989a2e8c0"),
        narrative:
          "The Belgians take their pleasure seriously. A late afternoon in an Antwerp café, with a glass of something local and nowhere particular to be, is not an indulgence — it is a civic duty.",
        attractions: [
          {
            name: "Zurenborg Neighbourhood",
            description:
              "Wander through this extraordinary Art Nouveau quarter — the street known as Cogels-Osylei is called 'the most beautiful street in Belgium'. Stay for brunch at one of the neighbourhood's cosy bistros.",
            tag: "Art Nouveau · Brunch",
            distance: "20 min walk",
          },
          {
            name: "Antwerp Beer Culture",
            description:
              "Belgium's beer heritage is alive in Antwerp's brown cafés and craft taprooms. Try a hand-pumped Trappist ale at a traditional 'bruine kroeg' or explore De Koninck, Antwerp's beloved local brewery.",
            tag: "Belgian Beer",
            distance: "City-wide",
          },
          {
            name: "Foodmarket Spijker",
            description:
              "A vibrant indoor food hall in the old Spijker warehouse near the port, serving street food from around the world alongside local artisan produce and natural wines.",
            tag: "Food Hall",
            distance: "10 min walk",
          },
        ],
      },
      {
        id: "outdoor",
        label: "Parks & the River",
        icon: "nature",
        image: U("1505118380757-91f5f5632de0"),
        narrative:
          "The Scheldt has carried ships for centuries. Its banks today are for walking, cycling, and simply being still while the world drifts past on the current. Antwerp's relationship with this river is the oldest love story in the city.",
        attractions: [
          {
            name: "Scheldt River Promenade",
            description:
              "The broad River Scheldt defines Antwerp's west side. Walk or cycle along the redesigned waterfront, watch massive cargo ships drift past, and take a free ferry across to the left bank.",
            tag: "Waterfront",
            distance: "5 min walk",
          },
          {
            name: "Stadspark",
            description:
              "Antwerp's elegant 19th-century city park is ideal for a peaceful morning stroll among fountains, statues, and a lake. It connects directly to the Royal Museum of Fine Arts.",
            tag: "City Park",
            distance: "10 min walk",
          },
          {
            name: "Antwerp Central Station",
            description:
              "Nicknamed 'the railway cathedral', Antwerp Central is widely regarded as one of the world's most beautiful train stations. The vaulted main hall and neo-Baroque dome are a sight in themselves.",
            tag: "Architecture",
            distance: "15 min walk",
          },
        ],
      },
    ],
  },

  "los-angeles": {
    cityName: "Los Angeles",
    country: "USA",
    tagline: "Sun, culture, and endless California energy.",
    intro:
      "Los Angeles is a sprawling, sun-drenched metropolis where world-class art museums sit beside surf beaches, celebrity neighbourhoods blend with ethnic enclaves, and the creative spirit of Hollywood infuses everything.",
    cityPath: "/los-angeles",
    bookPath: "/los-angeles",
    heroGradient: "linear-gradient(135deg, #1a2a3a 0%, #2c4a6e 60%, #4a7fa0 100%)",
    heroImage: U("1534430480872-3498386e7856", 1800),
    accentColor: "#f0a850",
    categories: [
      {
        id: "culture",
        label: "Culture & Arts",
        icon: "museum",
        image: U("1580657018950-f5f1de37ac69"),
        narrative:
          "Behind the spectacle and the sunshine, Los Angeles has quietly built some of the world's most remarkable art institutions. The Getty alone — perched above the Pacific — is worth flying here for.",
        attractions: [
          {
            name: "The Getty Center",
            description:
              "Perched high in the Santa Monica Mountains, the Getty offers one of the finest free art collections in the world alongside stunning architecture and sweeping views from Malibu to downtown LA.",
            tag: "World-Class Museum · Free Entry",
            distance: "25 min drive",
          },
          {
            name: "LACMA",
            description:
              "The Los Angeles County Museum of Art is the largest art museum in the western United States, with over 147,000 objects spanning 6,000 years. Don't miss Chris Burden's iconic 'Urban Light' installation.",
            tag: "Art Museum",
            distance: "20 min drive",
          },
          {
            name: "The Broad",
            description:
              "Downtown LA's contemporary art museum houses an extraordinary collection of post-war and contemporary art — Jeff Koons, Jean-Michel Basquiat, Cindy Sherman — all under a striking honeycomb facade.",
            tag: "Contemporary Art",
            distance: "25 min drive",
          },
          {
            name: "Griffith Observatory",
            description:
              "A beloved LA landmark perched on the slopes of the Santa Monica Mountains. The views of the city and the Hollywood Sign are spectacular, and the public telescopes are open nightly.",
            tag: "Observatory · Views",
            distance: "25 min drive",
          },
        ],
      },
      {
        id: "entertainment",
        label: "Entertainment & Icons",
        icon: "star",
        image: U("1541963463532-d68292c34b19"),
        narrative:
          "There is a reason people still come here to dream. This is where the mythology of modern life was invented — the Walk of Fame, the studio lots, the stadium crowds. Mythic and completely real at the same time.",
        attractions: [
          {
            name: "Hollywood Walk of Fame",
            description:
              "Over 2,700 stars embedded in the Hollywood Boulevard sidewalk honour the entertainment industry's legends. Walk from TCL Chinese Theatre to Dolby Theatre and soak in the spectacle.",
            tag: "Hollywood Icon",
            distance: "30 min drive",
          },
          {
            name: "Universal Studios Hollywood",
            description:
              "One of the world's oldest and most famous Hollywood studios, offering behind-the-scenes tram tours and full-scale theme park experiences — from The Wizarding World of Harry Potter to Jurassic World.",
            tag: "Theme Park · Studio Tour",
            distance: "35 min drive",
          },
          {
            name: "Dodger Stadium",
            description:
              "Catch a Dodgers game at one of baseball's most storied venues, set in Chavez Ravine with panoramic views. The food, the crowd, and the atmosphere make it a quintessential LA experience.",
            tag: "Baseball · Sports",
            distance: "30 min drive",
          },
          {
            name: "The Original Farmers Market",
            description:
              "Since 1934, this beloved LA institution has been a gathering place for locals and visitors. Over 100 stalls sell gourmet food, fresh produce, and souvenirs next to The Grove shopping centre.",
            tag: "Market · Food",
            distance: "20 min drive",
          },
        ],
      },
      {
        id: "outdoor",
        label: "Beaches & Outdoors",
        icon: "nature",
        image: U("1507525428034-b723cf961d3e"),
        narrative:
          "The Pacific runs through the DNA of this city. Follow it from the Santa Monica Pier to the canyons above Malibu — the coast is where Los Angeles stops performing and simply exists.",
        attractions: [
          {
            name: "Santa Monica Beach & Pier",
            description:
              "The end of Route 66 and the heart of LA beach culture — a 1920s pier with an amusement park, Pacific Park Ferris wheel, and the world-famous Muscle Beach outdoor gym.",
            tag: "Beach · Pier",
            distance: "30 min drive",
          },
          {
            name: "Venice Beach Boardwalk",
            description:
              "A one-of-a-kind stretch of humanity — street performers, skaters, bodybuilders, and artists line the boardwalk. Rent a bike and continue down to Marina del Rey.",
            tag: "Boardwalk · Beach Culture",
            distance: "35 min drive",
          },
          {
            name: "Runyon Canyon Park",
            description:
              "One of LA's most popular hiking parks, just steps from Hollywood. The trails wind steeply up to panoramic views of the city — a favourite spot for celebrities and their dogs.",
            tag: "Hiking · Views",
            distance: "30 min drive",
          },
        ],
      },
      {
        id: "shopping",
        label: "Shopping & Neighbourhoods",
        icon: "shopping",
        image: U("1476610182048-b716b8518aae"),
        narrative:
          "Los Angeles is not one city but dozens of villages, each with its own character. The best way to understand it is to walk its streets — from the luxury of Rodeo Drive to the murals of Melrose.",
        attractions: [
          {
            name: "Rodeo Drive",
            description:
              "Beverly Hills' legendary three-block luxury shopping street is lined with Chanel, Gucci, and Cartier. Even window shopping here feels like a scene from a film — because it often was.",
            tag: "Luxury Shopping",
            distance: "30 min drive",
          },
          {
            name: "Melrose Avenue",
            description:
              "A mile-long stretch of independent boutiques, vintage stores, tattoo parlours, and some of LA's most photographed street murals. Check out the famous Paul Smith pink wall.",
            tag: "Independent · Vintage",
            distance: "25 min drive",
          },
          {
            name: "Grand Central Market",
            description:
              "Downtown LA's vibrant food hall has operated since 1917 and now brings together vendors from all over the world — from traditional Mexican stalls to trendy ramen bars and craft coffee.",
            tag: "Food Hall · Downtown",
            distance: "30 min drive",
          },
        ],
      },
    ],
  },

  miami: {
    cityName: "Miami",
    country: "USA",
    tagline: "Neon nights, turquoise water, and the art of living loud.",
    intro:
      "Miami is a city of contrasts — Art Deco elegance meets modern high-rises, Latin warmth meets cosmopolitan cool, and white-sand beaches meet a world-class art scene. There is no city quite like it.",
    cityPath: "/miami",
    bookPath: "/miami",
    heroGradient: "linear-gradient(135deg, #0d2b40 0%, #1a5276 60%, #148f77 100%)",
    heroImage: U("1533106418989-88406c7cc8ca", 1800),
    accentColor: "#f4c87a",
    categories: [
      {
        id: "culture",
        label: "Art & Culture",
        icon: "museum",
        image: U("1558618666-fcd25c85cd64"),
        narrative:
          "Miami doesn't ask permission to be vivid. Its art lives on warehouse walls and bayfront terraces, in palatial villas and converted factories. This is a city that turned creativity into a civic religion.",
        attractions: [
          {
            name: "Wynwood Walls",
            description:
              "An outdoor museum of world-class murals painted by international street artists on the walls of a former warehouse district. Wynwood has grown into Miami's most creative neighbourhood, full of galleries and design studios.",
            tag: "Street Art · Galleries",
            distance: "20 min drive",
          },
          {
            name: "Pérez Art Museum Miami",
            description:
              "PAMM's stunning bayfront building — suspended gardens, tropical light, Herzog & de Meuron architecture — is the setting for a bold collection of 20th- and 21st-century international art.",
            tag: "Contemporary Art",
            distance: "25 min drive",
          },
          {
            name: "Vizcaya Museum & Gardens",
            description:
              "An Italian Renaissance-style villa built in 1916 on Biscayne Bay, surrounded by ten acres of formal European gardens. One of Miami's most romantic and photogenic destinations.",
            tag: "Historic Estate · Gardens",
            distance: "20 min drive",
          },
          {
            name: "Art Deco Historic District",
            description:
              "South Beach's pastel-painted Art Deco strip along Ocean Drive and Collins Avenue is the largest concentration of Art Deco architecture in the world — best appreciated on a self-guided evening walk.",
            tag: "Architecture · Historic",
            distance: "30 min drive",
          },
        ],
      },
      {
        id: "outdoor",
        label: "Beaches & Nature",
        icon: "nature",
        image: U("1507525428034-b723cf961d3e"),
        narrative:
          "The water here is not a backdrop — it is the reason for everything. South Beach, the Everglades, the quiet barrier islands. They tell the same story of impossible beauty at the edge of the continent.",
        attractions: [
          {
            name: "South Beach",
            description:
              "Miami's most iconic stretch of white sand and turquoise water, lined with Art Deco hotels, beach clubs, and a non-stop parade of colour. The best people-watching in America.",
            tag: "Beach · Iconic",
            distance: "30 min drive",
          },
          {
            name: "Brickell Key & Bayfront Park",
            description:
              "Step out into Bayfront Park for green lawns and bay views right in the heart of downtown, or walk over to Brickell Key for a quiet waterfront promenade with skyline panoramas.",
            tag: "Waterfront · Parks",
            distance: "Downtown",
          },
          {
            name: "Everglades National Park",
            description:
              "One of the world's great wilderness areas — a UNESCO site just one hour from Miami. Take an airboat through sawgrass marshes to spot alligators, manatees, and rare birds.",
            tag: "UNESCO · Wildlife",
            distance: "1 hr drive",
          },
          {
            name: "Key Biscayne",
            description:
              "A tranquil barrier island connected to Miami by the Rickenbacker Causeway. Crandon Park beach is calmer and less crowded than South Beach, with crystal-clear shallow water.",
            tag: "Island · Beach",
            distance: "25 min drive",
          },
        ],
      },
      {
        id: "food",
        label: "Food & Nightlife",
        icon: "food",
        image: U("1414235077428-338989a2e8c0"),
        narrative:
          "Miami's table is set by the Caribbean, Latin America, and the entire world. Pull up a chair on Calle Ocho, order a cortadito, and let the city feed you. The night, when it comes, is another story entirely.",
        attractions: [
          {
            name: "Little Havana",
            description:
              "Miami's Cuban-American heart beats loudest on Calle Ocho. Sample Cuban coffee and a medianoche sandwich, watch a dominoes game at Maximo Gomez Park, and stay for the Friday night salsa on the street.",
            tag: "Cuban Culture · Food",
            distance: "20 min drive",
          },
          {
            name: "Design District",
            description:
              "Miami's Design District blends luxury fashion flagships (Dior, Louis Vuitton, Hermès), outdoor art installations, world-class restaurants, and cutting-edge galleries in a compact walkable area.",
            tag: "Luxury · Dining",
            distance: "20 min drive",
          },
          {
            name: "Brickell City Centre",
            description:
              "A modern urban mall with a spectacular 'Climate Ribbon' canopy — home to upscale dining, boutiques, and a rooftop cinema, right in Miami's booming financial district.",
            tag: "Shopping · Dining",
            distance: "Downtown",
          },
        ],
      },
      {
        id: "entertainment",
        label: "Shopping & Entertainment",
        icon: "star",
        image: U("1477959858617-67f85cf4f1df"),
        narrative:
          "In Miami, even a walk down Lincoln Road becomes an event. There is always something performing, opening, or arriving — a city permanently in the act of staging itself.",
        attractions: [
          {
            name: "Lincoln Road Mall",
            description:
              "South Beach's pedestrian spine is lined with open-air restaurants, chain stores, boutiques, and is the setting for a lively Sunday farmers' market. A classic Miami ritual: people-watch over café con leche.",
            tag: "Open-Air Mall · Cafés",
            distance: "30 min drive",
          },
          {
            name: "Bayside Marketplace",
            description:
              "A lively waterfront marketplace on Biscayne Bay featuring live music, boat tours, and an eclectic mix of restaurants and shops — the most convenient starting point for a Bay cruise.",
            tag: "Waterfront · Entertainment",
            distance: "20 min drive",
          },
          {
            name: "Zoo Miami",
            description:
              "The largest and oldest zoo in Florida — home to over 3,000 animals across 750 species in one of the US's only subtropical zoos, where many animals roam free-range habitats.",
            tag: "Family · Wildlife",
            distance: "40 min drive",
          },
        ],
      },
    ],
  },

  "redondo-beach": {
    cityName: "Redondo Beach",
    country: "USA",
    tagline: "Where the Pacific breeze meets laid-back South Bay living.",
    intro:
      "Redondo Beach is one of LA's beloved South Bay beach cities — quieter and more residential than Santa Monica, but bursting with pier culture, fresh seafood, ocean-path cycling, and the kind of golden coastal life that makes California legendary.",
    cityPath: "/redondo-beach",
    bookPath: "/redondo-beach",
    heroGradient: "linear-gradient(135deg, #1a3040 0%, #1a5276 60%, #2e86a8 100%)",
    heroImage: U("1507525428034-b723cf961d3e", 1800),
    accentColor: "#f0c060",
    categories: [
      {
        id: "outdoor",
        label: "Beach & Waterfront",
        icon: "nature",
        image: U("1468436385273-8abca6dfd8d3"),
        narrative:
          "The pier has been the town's gathering point since 1889. Everything here begins and ends at the water — the smell of salt in the morning, pelicans coasting at eye level, the light going golden over the marina.",
        attractions: [
          {
            name: "Redondo Beach Pier & Boardwalk",
            description:
              "The iconic horseshoe pier is the heart of Redondo Beach — lined with seafood restaurants, tackle shops, and fishing spots. Watch pelicans dive for fish while sipping a craft beer at sunset.",
            tag: "Pier · Seafood",
            distance: "5 min walk",
          },
          {
            name: "King Harbor Marina",
            description:
              "Southern California's largest small-craft marina is home to hundreds of sailboats and charter vessels. Browse the waterfront restaurants, take a fishing charter, or rent a kayak.",
            tag: "Marina · Boating",
            distance: "5 min walk",
          },
          {
            name: "The Strand — Coastal Bike Path",
            description:
              "A 22-mile continuous paved path along the ocean connects Redondo Beach to Santa Monica. Rent a bike or rollerblade and ride the coast past Hermosa, Manhattan Beach, and El Segundo.",
            tag: "Cycling · Coastal Path",
            distance: "Start from pier",
          },
          {
            name: "Seaside Lagoon",
            description:
              "A protected saltwater swimming lagoon adjacent to the marina — calmer than the open ocean and perfect for families, with a sandy beach, paddleboats, and lifeguards on duty.",
            tag: "Family · Swimming",
            distance: "10 min walk",
          },
        ],
      },
      {
        id: "neighbourhoods",
        label: "Local Neighbourhoods",
        icon: "star",
        image: U("1476610182048-b716b8518aae"),
        narrative:
          "Beyond Redondo's boardwalk, the South Bay reveals itself as a string of beach towns, each quietly extraordinary. Walk north for ten minutes and you're somewhere else entirely.",
        attractions: [
          {
            name: "Hermosa Beach Pier",
            description:
              "Redondo's slightly wilder neighbour has a legendary beach volleyball scene, a buzzing Pier Avenue strip of bars and restaurants, and a pier famous for surf fishing and local festivals.",
            tag: "Volleyball · Nightlife",
            distance: "15 min walk",
          },
          {
            name: "Manhattan Beach",
            description:
              "The most upscale of the South Bay beach cities — home to the Manhattan Beach Pier, a boutique Main Street of shops and restaurants, and some of the best surf breaks in LA County.",
            tag: "Surf · Boutiques",
            distance: "20 min walk / 5 min drive",
          },
          {
            name: "Riviera Village",
            description:
              "Redondo's charming neighborhood shopping district, a short walk up from the water, packed with independent boutiques, cafés, wine bars, and family-run restaurants with a neighbourhood feel.",
            tag: "Shopping · Cafés",
            distance: "15 min walk",
          },
        ],
      },
      {
        id: "nature",
        label: "Nature & Parks",
        icon: "nature",
        image: U("1494526585095-c41746248156"),
        narrative:
          "The Palos Verdes Peninsula rises from the flat coastline like a chapter break — a reminder that California's wildness is never far away, that the dramatic cliffs and tidal pools are just a short drive from the pier.",
        attractions: [
          {
            name: "Palos Verdes Peninsula",
            description:
              "Rising dramatically from the South Bay, the Palos Verdes peninsula offers clifftop trails with spectacular Pacific views, tidepools, and the iconic Point Vicente Lighthouse.",
            tag: "Hiking · Ocean Views",
            distance: "15 min drive",
          },
          {
            name: "Abalone Cove Shoreline Park",
            description:
              "A stunning natural reserve with sea caves, tidepools, and an accessible beach set beneath towering cliffs. One of the best spots on the LA coast to find sea urchins and starfish.",
            tag: "Tidepools · Nature Reserve",
            distance: "20 min drive",
          },
          {
            name: "Veteran's Park",
            description:
              "A peaceful community park next to the marina, with tennis courts, a recreation centre, and seasonal summer concerts on the lawn — a favourite gathering spot for Redondo locals.",
            tag: "Community Park",
            distance: "10 min walk",
          },
        ],
      },
      {
        id: "food",
        label: "Dining & Local Life",
        icon: "food",
        image: U("1504674900247-0877df9cc836"),
        narrative:
          "Redondo Beach eats fresh. The fish was in the ocean yesterday. The farmers' market came with the morning fog. The craft beer was brewed down the road. This is South Bay living at its most honest.",
        attractions: [
          {
            name: "International Boardwalk",
            description:
              "The lower pier area's row of seafood shacks and restaurants is the place for fresh Dungeness crab, clam chowder in a bread bowl, and classic fish tacos eaten with your feet in the sand.",
            tag: "Seafood · Casual Dining",
            distance: "5 min walk",
          },
          {
            name: "Redondo Beach Farmers Market",
            description:
              "Every Tuesday afternoon, a lively farmers market takes over the pier parking lot, with local produce, artisan foods, cut flowers, and a relaxed South Bay atmosphere.",
            tag: "Farmers Market",
            distance: "5 min walk",
          },
          {
            name: "Aviation Boulevard Craft Breweries",
            description:
              "The South Bay has quietly become one of LA's best craft beer scenes. A cluster of taprooms within a short drive — like Monkish, El Segundo Brewing, and Strand Brewing Co. — are worth the trip.",
            tag: "Craft Beer",
            distance: "10–20 min drive",
          },
        ],
      },
    ],
  },

  dubai: {
    cityName: "Dubai",
    country: "UAE",
    tagline: "The city that turned ambition into architecture.",
    intro:
      "Dubai is a city that operates at a scale unlike any other — record-breaking towers, man-made islands, indoor ski slopes, and world-class dining, all wrapped in a desert landscape and a deeply hospitable Emirati culture.",
    cityPath: "/dubai",
    bookPath: "/dubai",
    heroGradient: "linear-gradient(135deg, #1a1a2e 0%, #2d2d4a 60%, #5c3d1e 100%)",
    heroImage: U("1512453979798-5ea266f8880c", 1800),
    accentColor: "#d4af6a",
    categories: [
      {
        id: "icons",
        label: "Iconic Landmarks",
        icon: "star",
        image: U("1512453979798-5ea266f8880c"),
        narrative:
          "Dubai decided to become the tallest, the largest, the most extraordinary — and then it did. Standing at the base of the Burj Khalifa, that ambition is no longer abstract. It is simply there, above you.",
        attractions: [
          {
            name: "Burj Khalifa & Dubai Fountain",
            description:
              "The world's tallest building at 828 metres is a marvel of engineering. Book the 'At The Top' observation deck for views stretching to the Gulf, then stay for the evening fountain show — 900 water jets choreographed to music.",
            tag: "World's Tallest · Must-See",
            distance: "Downtown Dubai",
          },
          {
            name: "Palm Jumeirah",
            description:
              "The world's largest man-made island extends into the Gulf in the shape of a palm tree. Ride the Palm Monorail, visit Atlantis at the frond tip, or simply drive across the trunk for jaw-dropping marina views.",
            tag: "Man-Made Island",
            distance: "20 min drive",
          },
          {
            name: "Dubai Frame",
            description:
              "A 150-metre picture frame standing at the border of old and new Dubai — one side overlooks the historic Deira and Creek, the other the modern skyline of Sheikh Zayed Road. A glass-floored sky bridge connects the two.",
            tag: "Architecture · Views",
            distance: "15 min drive",
          },
          {
            name: "Museum of the Future",
            description:
              "Dubai's newest landmark — a torus-shaped building clad in Arabic calligraphy — is an immersive journey into what the world might look like in 2071. One of the most architecturally distinctive buildings on earth.",
            tag: "Museum · Futurism",
            distance: "15 min drive",
          },
        ],
      },
      {
        id: "culture",
        label: "Culture & Heritage",
        icon: "museum",
        image: U("1539113718695-a17361f5d954"),
        narrative:
          "Behind every gleaming tower is a thousand-year-old trade route. Cross Dubai Creek by wooden abra, step into the Gold Souk at dusk, and watch the city's first chapter quietly tell its story.",
        attractions: [
          {
            name: "Al Fahidi Historic District & Dubai Museum",
            description:
              "Old Dubai's most atmospheric quarter — a maze of windtower houses, art galleries, and the Dubai Museum set inside a 200-year-old fort. A world away from the glass towers just a few minutes' drive away.",
            tag: "Old Dubai · Heritage",
            distance: "25 min drive",
          },
          {
            name: "Dubai Creek & Abra Ride",
            description:
              "The Creek divides old Dubai into Deira and Bur Dubai. Cross it by traditional wooden abra (water taxi) for just 1 AED — one of Dubai's most authentic and affordable experiences.",
            tag: "Heritage · Waterway",
            distance: "25 min drive",
          },
          {
            name: "Gold Souk & Spice Souk",
            description:
              "Deira's legendary souks are a sensory feast — kilo upon kilo of 18-, 21-, and 24-karat gold jewellery in the Gold Souk, and sacks of saffron, frankincense, and dried lemon in the Spice Souk a short walk away.",
            tag: "Traditional Market",
            distance: "25 min drive",
          },
          {
            name: "Jumeirah Mosque",
            description:
              "One of Dubai's most beautiful mosques and one of the few open to non-Muslim visitors. The Sheikh Mohammed Centre for Cultural Understanding offers guided tours with Q&A sessions every morning.",
            tag: "Architecture · Culture",
            distance: "15 min drive",
          },
        ],
      },
      {
        id: "outdoor",
        label: "Desert & Outdoors",
        icon: "nature",
        image: U("1509316785289-025f5b846b35"),
        narrative:
          "Before the glass towers, there was the desert. Vast, ancient, and utterly indifferent to records. It is still there, an hour from the city, waiting — and the Gulf's warm waters stretch out on the other side.",
        attractions: [
          {
            name: "Desert Safari",
            description:
              "An unmissable Dubai experience — dune bashing in 4WDs, camel riding, sandboarding, and a traditional Bedouin camp dinner under the stars with belly dancing and falcon shows.",
            tag: "Desert · Adventure",
            distance: "45 min drive",
          },
          {
            name: "Jumeirah Beach",
            description:
              "Dubai's premier free public beach, backed by the skyline and the Burj Al Arab. Swim in calm Gulf waters, rent a sun lounger, or walk the beach boardwalk that stretches all the way to Kite Beach.",
            tag: "Beach · Public",
            distance: "15 min drive",
          },
          {
            name: "Dubai Marina Walk",
            description:
              "A 7-km waterfront promenade lined with yachts, skyscrapers, and restaurants. Walk, jog, or rent a bicycle along the canal, and take a water bus between Marina Mall and the beach.",
            tag: "Marina · Promenade",
            distance: "10 min drive",
          },
        ],
      },
      {
        id: "shopping",
        label: "Shopping & Dining",
        icon: "shopping",
        image: U("1441986300917-64674bd600d8"),
        narrative:
          "Dubai turned shopping into architecture, dining into theatre, and leisure into a spectacle. Even an afternoon at the mall is, somehow, an experience worth having — especially when that mall has an indoor ski slope.",
        attractions: [
          {
            name: "The Dubai Mall",
            description:
              "The world's largest shopping mall — 1,200 stores, an Olympic-size ice rink, an underwater zoo, VR Park, and the Dubai Aquarium & Underwater Zoo. Set aside a full day and still not see everything.",
            tag: "World's Largest Mall",
            distance: "Downtown Dubai",
          },
          {
            name: "Mall of the Emirates",
            description:
              "Famous for Ski Dubai — an indoor ski slope with real snow inside a desert mall — plus over 600 stores, a Carrefour hypermarket, and a 24-screen cinema complex.",
            tag: "Indoor Ski · Shopping",
            distance: "20 min drive",
          },
          {
            name: "Global Village",
            description:
              "A seasonal outdoor festival running October to April — 90 pavilions representing countries from around the world with their food, handicrafts, performances, and products in one vast open-air space.",
            tag: "Seasonal · Cultural Fair",
            distance: "30 min drive",
          },
          {
            name: "Business Bay Dining",
            description:
              "Dubai's Business Bay district, surrounding our units, hosts some of the city's best rooftop restaurants, waterfront cafés, and luxury hotel bars along the Dubai Canal — all within walking distance.",
            tag: "Local Dining · Canal Views",
            distance: "Walking distance",
          },
        ],
      },
    ],
  },
};

export const getCityAttractions = (slug) => {
  if (!slug) return null;
  const normalized = String(slug).toLowerCase().trim();
  if (CITY_ATTRACTIONS[normalized]) return CITY_ATTRACTIONS[normalized];
  if (normalized === "antwerpen") return CITY_ATTRACTIONS["antwerp"];
  if (normalized === "losangeles") return CITY_ATTRACTIONS["los-angeles"];
  if (normalized === "miami-beach") return CITY_ATTRACTIONS["miami"];
  if (normalized === "redondo") return CITY_ATTRACTIONS["redondo-beach"];
  return null;
};
