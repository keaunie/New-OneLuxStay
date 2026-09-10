// Compiled, building-level property data — one entry per physical address,
// aggregated across every active unit/floor-plan the PMS has for that
// address. Generated from the live `listings` table (grouped by address,
// same digit-signature grouping used by PropertyStoryPage.jsx and the
// homepage's featured-stays grid) so it reflects what guests can actually
// book, not marketing copy.
//
// Used by:
//  - netlify/functions/chat.js — lets Lucy answer detailed property
//    questions ("does the Fashion District building have parking?") using
//    real amenity/floor-plan data, either because the guest is on that
//    property's page (see ChatConcierge.jsx's pageContext.propertyKey) or
//    because they asked about it by name/city in a general conversation.
//  - src/PropertyStoryPage.jsx — pairs with its own PROPERTY_STORIES
//    (narrative "the neighborhood" copy) for the Antwerp story pages;
//    propertyKey values for Antwerp match that file's CANONICAL_SLUG_BY_KEY.
//
// No guest, reservation, or payment data lives here — this is
// property/inventory facts only (address, floor plans, amenities).
//
// Regenerate by re-running the grouping queries against the `listings`
// table (grouped by city + digits-only address signature) whenever units
// are added/removed or amenities change meaningfully.

export const propertyProfiles = [
  // ---------------------------------------------------------------- Antwerp
  {
    key: "antwerp-fashion-district",
    city: "Antwerp",
    citySlug: "antwerp",
    areaLabel: "Fashion District",
    address: "Lange Leemstraat 103, 2018 Antwerpen, Belgium",
    totalUnits: 16,
    floorPlans: [
      { title: "Studio Suite Antwerp Fashion District", bedrooms: 0, bathrooms: 1, beds: 1, accommodates: 2, units: 3 },
      { title: "Luxury 1BR Near Fashion District", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 2, units: 3 },
      { title: "Luxury Dlx 1BR Near Fashion District", bedrooms: 1, bathrooms: 1, beds: 3, accommodates: 3, units: 3 },
      { title: "Luxury 2BR 1BA Near Fashion District", bedrooms: 2, bathrooms: 1, beds: 3, accommodates: 4, units: 4 },
      { title: "Luxury 2BR 2BA Near Fashion District", bedrooms: 2, bathrooms: 1, beds: 3, accommodates: 4, units: 3 },
    ],
    amenities: [
      "Bed linens", "Body soap", "Carbon monoxide detector", "Cleaning products", "Clothing storage",
      "Coffee", "Coffee maker", "Conditioner", "Cookware", "Dining table", "Dishes and silverware",
      "Essentials", "Fire extinguisher", "Freezer", "Hair dryer", "Hangers", "Heating", "Hot water",
      "Internet", "Iron", "Kettle", "Kitchen", "Laptop friendly workspace", "Long term stays allowed",
      "Luggage dropoff allowed", "Oven", "Paid parking off premises", "Patio or balcony", "Pets allowed",
      "Refrigerator", "Shampoo", "Shower gel", "Smoke detector", "Suitable for children (2-12 years)",
      "Suitable for infants (under 2 years)", "TV", "Washer", "Wireless Internet",
    ],
  },
  {
    key: "antwerp-diamond-district",
    city: "Antwerp",
    citySlug: "antwerp",
    areaLabel: "Diamond District",
    address: "Jacob Jordaensstraat 96, 2000 Antwerpen, Belgium",
    totalUnits: 23,
    floorPlans: [
      { title: "Modern 1BR Near Diamond District", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 2, units: 6 },
      { title: "Modern 2BR 1.5 BA Near Diamond District", bedrooms: 2, bathrooms: 1, beds: 4, accommodates: 4, units: 6 },
      { title: "Modern 2BR Penthouse Near Diamond District", bedrooms: 2, bathrooms: 2, beds: 3, accommodates: 4, units: 4 },
      { title: "Spacious 3BR 2.5 BA Near Diamond District", bedrooms: 3, bathrooms: 2, beds: 6, accommodates: 6, units: 7 },
    ],
    amenities: [
      "Bed linens", "Carbon monoxide detector", "Cleaning products", "Clothing storage", "Coffee",
      "Coffee maker", "Conditioner", "Cookware", "Dining table", "Dishes and silverware", "Essentials",
      "Fire extinguisher", "Freezer", "Hair dryer", "Hangers", "Heating", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Laptop friendly workspace", "Long term stays allowed", "Luggage dropoff allowed",
      "Oven", "Paid parking off premises", "Refrigerator", "Shampoo", "Shower gel", "Smoke detector",
      "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "TV", "Washer",
      "Wireless Internet",
    ],
  },
  {
    key: "antwerp-central",
    city: "Antwerp",
    citySlug: "antwerp",
    areaLabel: "Antwerp Central",
    address: "Lange Leemstraat 5, 2018 Antwerpen, Belgium",
    totalUnits: 24,
    floorPlans: [
      { title: "One Lux Stay Near Antwerp Central - Studio Apartment", bedrooms: 0, bathrooms: 1, beds: 1, accommodates: 2, units: 3 },
      { title: "One Lux Stay Near Antwerp Central - 1 Bedroom", bedrooms: 1, bathrooms: 1, beds: 0, accommodates: 6, units: 2 },
      { title: "One Lux Stay Near Antwerp Central - 2 Bedroom 1.5 Bathroom", bedrooms: 2, bathrooms: null, beds: 0, accommodates: 6, units: 3 },
      { title: "One Lux Stay Near Antwerp Central - 3 Bedroom 1.5 Bathroom", bedrooms: 3, bathrooms: 1.5, beds: 5, accommodates: 6, units: 6 },
      { title: "One Lux Stay Near Antwerp Central - 3 Bedroom 2 full bathrooms", bedrooms: 3, bathrooms: 2, beds: 5, accommodates: 6, units: 6 },
      { title: "One Lux Stay Near Antwerp Central Grande Deluxe 3 bedroom suite", bedrooms: 3, bathrooms: 3.5, beds: 5, accommodates: 6, units: 4 },
    ],
    amenities: [
      "Bed linens", "Body soap", "Carbon monoxide detector", "Cleaning products", "Clothing storage",
      "Coffee", "Coffee maker", "Conditioner", "Cookware", "Dining table", "Dishes and silverware",
      "Dishwasher", "Dryer", "Essentials", "Extra pillows and blankets", "Fire extinguisher", "Freezer",
      "Hair dryer", "Hangers", "Heating", "Hot water", "Internet", "Iron", "Kettle", "Kitchen",
      "Laptop friendly workspace", "Long term stays allowed", "Luggage dropoff allowed", "Microwave",
      "Oven", "Paid parking off premises", "Pets allowed", "Refrigerator", "Shampoo", "Shower gel",
      "Smoke detector", "Stove", "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)",
      "Toaster", "Towels provided", "TV", "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
  {
    key: "antwerp-city-centre",
    city: "Antwerp",
    citySlug: "antwerp",
    areaLabel: "City Centre",
    address: "Kribbestraat 6, 2000 Antwerpen, Belgium",
    totalUnits: 11,
    floorPlans: [
      { title: "Cozy 1BR City Centre Near Meir Shopping", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 3, units: 11 },
    ],
    amenities: [
      "Bed linens", "Carbon monoxide detector", "Cleaning products", "Clothing storage", "Coffee",
      "Coffee maker", "Conditioner", "Cookware", "Dining table", "Dishes and silverware", "Essentials",
      "Fire extinguisher", "Freezer", "Hair dryer", "Hangers", "Heating", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Laptop friendly workspace", "Long term stays allowed", "Luggage dropoff allowed",
      "Oven", "Paid parking off premises", "Pets allowed", "Refrigerator", "Shampoo", "Shower gel",
      "Smoke detector", "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "TV",
      "Washer", "Wireless Internet",
    ],
  },
  {
    key: "antwerp-near-central-station",
    city: "Antwerp",
    citySlug: "antwerp",
    areaLabel: "Near Central Station",
    address: "Lange Kievitstraat 4, 2018 Antwerpen, Belgium",
    totalUnits: 16,
    floorPlans: [
      { title: "One Lux Stay 1BR/ 1BA Antwerp near Central Station", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 6, units: 2 },
      { title: "One Lux Stay 2BR/ 2BA Antwerp near Central Station", bedrooms: 2, bathrooms: 2, beds: 4, accommodates: 6, units: 3 },
      { title: "One Lux Stay 3BR / 2.5BA Antwerp near Central Station", bedrooms: 3, bathrooms: 2.5, beds: 6, accommodates: 6, units: 5 },
      { title: "One Lux Stay 3BR / 2.5BA with Kids Room at Antwerp near Central Station", bedrooms: 3, bathrooms: 2.5, beds: 6, accommodates: 6, units: 3 },
      { title: "One Lux Stay 3BR/2.5BA with Terrace at Antwerp near Central Station", bedrooms: 3, bathrooms: 2.5, beds: 6, accommodates: 6, units: 3 },
    ],
    amenities: [
      "Bed linens", "Body soap", "Carbon monoxide detector", "Cleaning products", "Clothing storage",
      "Coffee", "Coffee maker", "Conditioner", "Cookware", "Dining table", "Dishes and silverware",
      "Dishwasher", "Dryer", "Essentials", "Extra pillows and blankets", "Fire extinguisher", "Freezer",
      "Hair dryer", "Hangers", "Heating", "Hot water", "Internet", "Iron", "Kettle", "Kitchen",
      "Laptop friendly workspace", "Long term stays allowed", "Luggage dropoff allowed", "Microwave",
      "Oven", "Paid parking off premises", "Refrigerator", "Shampoo", "Shower gel", "Smoke detector",
      "Stove", "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "Toaster",
      "Towels provided", "TV", "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
  // ------------------------------------------------------------ Los Angeles
  {
    key: "la-broadway-555",
    city: "Los Angeles",
    citySlug: "los-angeles",
    areaLabel: "Downtown LA — Broadway",
    address: "555 N Broadway, Los Angeles, CA 90012, USA",
    totalUnits: 16,
    floorPlans: [
      { title: "Stylish 1BR Family Apartment by DTLA", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 4, units: 7 },
      { title: "Stylish 2BR Family Apartment by DTLA", bedrooms: 2, bathrooms: 2, beds: 3, accommodates: 5, units: 9 },
    ],
    amenities: [
      "Air conditioning", "BBQ grill", "Bed linens", "Body soap", "Carbon monoxide detector",
      "Cleaning products", "Clothing storage", "Coffee", "Coffee maker", "Conditioner", "Cookware",
      "Dining table", "Dishes and silverware", "Dishwasher", "Downtown", "Dryer", "Elevator", "Essentials",
      "Fire extinguisher", "Free parking on premises", "Freezer", "Gym", "Hair dryer", "Hangers", "Heating",
      "Hot tub", "Hot water", "Internet", "Iron", "Kettle", "Kitchen", "Laptop friendly workspace",
      "Long term stays allowed", "Luggage dropoff allowed", "Microwave", "Outdoor pool",
      "Outdoor seating (furniture)", "Oven", "Paid parking off premises", "Patio or balcony",
      "Pets allowed", "Refrigerator", "Shampoo", "Shower gel", "Smoke detector", "Stove",
      "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "Toaster", "TV",
      "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
  {
    key: "la-broadway-555-b1",
    city: "Los Angeles",
    citySlug: "los-angeles",
    areaLabel: "Downtown LA — Broadway (Block B1)",
    address: "B1, 555 N Broadway, Los Angeles, CA 90012, USA",
    totalUnits: 6,
    floorPlans: [
      { title: "Stylish 2BR Deluxe Family Apartment by DTLA", bedrooms: 2, bathrooms: null, beds: 3, accommodates: 5, units: 6 },
    ],
    amenities: [
      "Air conditioning", "BBQ grill", "Bed linens", "Body soap", "Carbon monoxide detector",
      "Cleaning products", "Clothing storage", "Coffee", "Coffee maker", "Communal pool", "Conditioner",
      "Cookware", "Dining table", "Dishes and silverware", "Dishwasher", "Dryer", "Elevator", "Essentials",
      "Extra pillows and blankets", "Family/kid friendly", "Fire extinguisher", "Free parking on premises",
      "Freezer", "Gym", "Hair dryer", "Hangers", "Heating", "High chair", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Laptop friendly workspace", "Long term stays allowed", "Luggage dropoff allowed",
      "Outdoor pool", "Oven", "Paid parking off premises", "Patio or balcony", "Pets allowed",
      "Refrigerator", "Shampoo", "Shower gel", "Smoke detector", "Stove",
      "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "Swimming pool",
      "Toaster", "Towels provided", "TV", "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
  {
    key: "la-hollywood-de-longpre",
    city: "Los Angeles",
    citySlug: "los-angeles",
    areaLabel: "Hollywood",
    address: "5620 De Longpre Ave, Los Angeles, CA 90028, USA",
    totalUnits: 19,
    floorPlans: [
      { title: "1 Bedroom Apartment in Hollywood", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 3, units: 4 },
      { title: "2 Bedroom Apartment in Hollywood with City View", bedrooms: 2, bathrooms: 2, beds: 2, accommodates: 5, units: 3 },
      { title: "2 Bedroom Apartment with Hollywood Sign View", bedrooms: 2, bathrooms: 2, beds: 2, accommodates: 5, units: 5 },
      { title: "2 Bedroom in Hollywood with Pool View", bedrooms: 2, bathrooms: 2, beds: 2, accommodates: 5, units: 4 },
      { title: "3 Bedroom in Hollywood with Hollywood Sign View", bedrooms: 3, bathrooms: 2, beds: 3, accommodates: 6, units: 3 },
    ],
    amenities: [
      "Air conditioning", "BBQ grill", "Bed linens", "Blender", "Body soap", "Carbon monoxide detector",
      "Cleaning products", "Clothing storage", "Coffee", "Coffee maker", "Communal pool", "Conditioner",
      "Cookware", "Dining table", "Dishes and silverware", "Dishwasher", "Dryer", "Elevator", "Essentials",
      "Extra pillows and blankets", "Family/kid friendly", "Fire extinguisher", "Free parking on premises",
      "Freezer", "Gym", "Hair dryer", "Hangers", "Heating", "High chair", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Laptop friendly workspace", "Long term stays allowed", "Luggage dropoff allowed",
      "Outdoor pool", "Oven", "Paid parking off premises", "Patio or balcony", "Pets allowed",
      "Refrigerator", "Shampoo", "Shower gel", "Smoke detector", "Stove",
      "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "Swimming pool",
      "Toaster", "Towels provided", "TV", "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
  {
    key: "la-dtla-spring-354",
    city: "Los Angeles",
    citySlug: "los-angeles",
    areaLabel: "Downtown LA — Historic Core / Spring St",
    address: "354 S Spring St, Los Angeles, CA 90013, USA",
    totalUnits: 10,
    floorPlans: [
      { title: "Stylish 1BR At HWH", bedrooms: 1, bathrooms: 1, beds: 1, accommodates: 2, units: 2 },
      { title: "Stylish 1BR Deluxe Large at HWH", bedrooms: 1, bathrooms: null, beds: 2, accommodates: 3, units: 1 },
      { title: "Stylish 2BR/1BA at HWH", bedrooms: 2, bathrooms: 1, beds: 2, accommodates: 4, units: 3 },
      { title: "Stylish 2BR/2BA At HWH", bedrooms: 2, bathrooms: 2, beds: 2, accommodates: 4, units: 4 },
    ],
    amenities: [
      "Air conditioning", "Barbeque utensils", "Bathtub", "BBQ grill", "Bed linens", "Body soap",
      "Carbon monoxide detector", "Cleaning products", "Coffee maker", "Conditioner", "Cookware",
      "Dining table", "Dishes and silverware", "Dishwasher", "Downtown", "Dryer", "Elevator", "Essentials",
      "Extra pillows and blankets", "Fire extinguisher", "Freezer", "Garden or backyard", "Gym",
      "Hair dryer", "Hangers", "Heating", "Hot tub", "Hot water", "Iron", "Kettle", "Kitchen",
      "Long term stays allowed", "Microwave", "Outdoor pool", "Outdoor seating (furniture)", "Oven",
      "Paid parking off premises", "Patio or balcony", "Refrigerator", "Rooftop pool", "Shampoo",
      "Shower gel", "Smoke detector", "Stove", "Suitable for children (2-12 years)",
      "Suitable for infants (under 2 years)", "Toaster", "TV", "Washer", "Wine glasses",
      "Wireless Internet",
    ],
  },
  {
    key: "la-spring-st",
    city: "Los Angeles",
    citySlug: "los-angeles",
    areaLabel: "Downtown LA — Historic Core / Spring St",
    address: "S Spring St, Los Angeles, CA 90013, USA",
    totalUnits: 5,
    floorPlans: [
      { title: "Stylish 2BR/1BA at HWH", bedrooms: 2, bathrooms: 1, beds: 2, accommodates: 4, units: 5 },
    ],
    amenities: [
      "Air conditioning", "Barbeque utensils", "Bathtub", "BBQ grill", "Bed linens", "Body soap",
      "Carbon monoxide detector", "Cleaning products", "Coffee maker", "Conditioner", "Cookware",
      "Dining table", "Dishes and silverware", "Dishwasher", "Downtown", "Dryer", "Elevator", "Essentials",
      "Extra pillows and blankets", "Fire extinguisher", "Freezer", "Gym", "Hair dryer", "Hangers",
      "Heating", "Hot tub", "Hot water", "Iron", "Kettle", "Kitchen", "Long term stays allowed",
      "Microwave", "Outdoor pool", "Outdoor seating (furniture)", "Oven", "Paid parking off premises",
      "Patio or balcony", "Refrigerator", "Rooftop pool", "Shampoo", "Shower gel", "Smoke detector",
      "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "TV", "Washer",
      "Wireless Internet",
    ],
  },
  // -------------------------------------------------------------- Redondo Beach
  {
    key: "redondo-barbara-street",
    city: "Redondo Beach",
    citySlug: "redondo-beach",
    areaLabel: "Redondo Beach",
    address: "1113 Barbara Street, Redondo Beach, California 90277, United States",
    totalUnits: 9,
    floorPlans: [
      { title: "Oneluxstay 1BR Home Near the Beach", bedrooms: 2, bathrooms: 2, beds: 3, accommodates: 6, units: 3 },
      { title: "Oneluxstay 3BR Home Near the Beach", bedrooms: 3, bathrooms: 2, beds: 3, accommodates: 7, units: 6 },
    ],
    amenities: [
      "Air conditioning", "Beach", "Bed linens", "Body soap", "Cable TV", "Carbon monoxide detector",
      "Cleaning products", "Coffee maker", "Conditioner", "Cookware", "Dining table",
      "Dishes and silverware", "Dishwasher", "Downtown", "Dryer", "Essentials", "Fire extinguisher",
      "First aid kit", "Hair dryer", "Hangers", "Hot water", "Internet", "Iron", "Kettle", "Kitchen",
      "Microwave", "Near Ocean", "Oven", "Refrigerator", "Shampoo", "Shower gel", "Smoke detector",
      "Stove", "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)", "Toaster",
      "Towels provided", "TV", "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
  {
    key: "redondo-north-broadway",
    city: "Redondo Beach",
    citySlug: "redondo-beach",
    areaLabel: "Redondo Beach",
    address: "407 North Broadway, Redondo Beach, California 90277, United States",
    totalUnits: 8,
    floorPlans: [
      { title: "One Lux Stay 1BR Home Near the Beach", bedrooms: 1, bathrooms: 1, beds: 0, accommodates: 4, units: 5 },
      { title: "Oneluxstay 1BR Home Near the Beach", bedrooms: 1, bathrooms: 1, beds: 2, accommodates: 4, units: 3 },
    ],
    amenities: [
      "Beach", "Bed linens", "Body soap", "Cable TV", "Carbon monoxide detector", "Cleaning products",
      "Coffee maker", "Conditioner", "Cookware", "Dining table", "Dishes and silverware", "Dishwasher",
      "Downtown", "Dryer", "Essentials", "Free parking on premises", "Hair dryer", "Hangers", "Hot water",
      "Internet", "Iron", "Kettle", "Kitchen", "Microwave", "Near Ocean", "Oven", "Refrigerator",
      "Shampoo", "Shower gel", "Smoke detector", "Stove", "Suitable for children (2-12 years)",
      "Suitable for infants (under 2 years)", "Towels provided", "TV", "Washer", "Wine glasses",
      "Wireless Internet",
    ],
  },
  // ------------------------------------------------------------------ Torrance
  {
    key: "torrance-anza-23451",
    city: "Torrance",
    citySlug: "los-angeles",
    areaLabel: "Torrance",
    address: "23451 Anza Avenue, Torrance, California 90505, United States",
    totalUnits: 3,
    floorPlans: [
      { title: "Cozy 2BR South Torrance Retreat", bedrooms: 2, bathrooms: null, beds: 3, accommodates: 6, units: 3 },
    ],
    amenities: [
      "Bed linens", "Body soap", "Carbon monoxide detector", "Cleaning products", "Coffee maker",
      "Conditioner", "Cookware", "Dining table", "Dishes and silverware", "Dishwasher", "Dryer",
      "Essentials", "Free parking on premises", "Hair dryer", "Heating", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Long term stays allowed", "Microwave", "Oven", "Refrigerator", "Shampoo",
      "Shower gel", "Smoke detector", "Stove", "Suitable for children (2-12 years)",
      "Suitable for infants (under 2 years)", "Towels provided", "TV", "Washer", "Wine glasses",
      "Wireless Internet",
    ],
  },
  {
    key: "torrance-anza-23621",
    city: "Torrance",
    citySlug: "los-angeles",
    areaLabel: "Torrance",
    address: "23621 Anza Avenue, Torrance, California 90505, United States",
    totalUnits: 2,
    floorPlans: [
      { title: "One Lux Stay Coastal 2BR Retreat near the Beach", bedrooms: 2, bathrooms: 2, beds: 3, accommodates: 6, units: 2 },
    ],
    amenities: [
      "Bed linens", "Body soap", "Carbon monoxide detector", "Cleaning products", "Coffee maker",
      "Conditioner", "Cookware", "Dining table", "Dishes and silverware", "Dishwasher", "Dryer",
      "Essentials", "Free parking on premises", "Hair dryer", "Heating", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Long term stays allowed", "Microwave", "Oven", "Refrigerator", "Shampoo",
      "Shower gel", "Smoke detector", "Stove", "Suitable for children (2-12 years)",
      "Suitable for infants (under 2 years)", "Towels provided", "TV", "Washer", "Wine glasses",
      "Wireless Internet",
    ],
  },
  {
    key: "torrance-anza-23817",
    city: "Torrance",
    citySlug: "los-angeles",
    areaLabel: "Torrance",
    address: "23817 Anza Ave, Torrance, CA 90505, USA",
    totalUnits: 6,
    floorPlans: [
      { title: "One Lux Stay Coastal 1BR Retreat near the Beach", bedrooms: 2, bathrooms: null, beds: 3, accommodates: 5, units: 3 },
      { title: "One Lux Stay Coastal 2BR Retreat near the Beach", bedrooms: 2, bathrooms: 1, beds: 3, accommodates: 5, units: 3 },
    ],
    amenities: [
      "Bed linens", "Body soap", "Carbon monoxide detector", "Cleaning products", "Coffee maker",
      "Conditioner", "Cookware", "Dining table", "Dishes and silverware", "Dishwasher", "Dryer",
      "Essentials", "Free parking on premises", "Hair dryer", "Heating", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Long term stays allowed", "Microwave", "Oven", "Refrigerator", "Shampoo",
      "Shower gel", "Smoke detector", "Stove", "Suitable for children (2-12 years)",
      "Suitable for infants (under 2 years)", "Towels provided", "TV", "Washer", "Wine glasses",
      "Wireless Internet",
    ],
  },
  // ----------------------------------------------------------------------- Dubai
  {
    key: "dubai-signature-residence",
    city: "Dubai",
    citySlug: "dubai",
    areaLabel: "Downtown Dubai",
    address: "Sheikh Mohammed bin Rashid Boulevard, Dubai, United Arab Emirates",
    totalUnits: 13,
    floorPlans: [
      { title: "Grande Signature Residence 1BR - Stunning Fountain Views", bedrooms: 1, bathrooms: 1, beds: 3, accommodates: 6, units: 2 },
      { title: "Grande Signature Residence 2BR - Stunning Fountain Views", bedrooms: 2, bathrooms: 2, beds: 3, accommodates: 6, units: 6 },
      { title: "Grande Signature Residence 2BR - Direct Burj Khalifa View", bedrooms: 2, bathrooms: 3, beds: 3, accommodates: 6, units: 2 },
      { title: "Grande Signature Residence 3BR - Direct Burj Khalifa View", bedrooms: 4, bathrooms: 3, beds: 5, accommodates: 8, units: 3 },
    ],
    amenities: [
      "Air conditioning", "Bed linens", "Body soap", "Carbon monoxide detector", "Clothing storage",
      "Coffee maker", "Cookware", "Dining table", "Dishes and silverware", "Downtown", "Elevator",
      "Essentials", "Extra pillows and blankets", "Family/kid friendly", "Fire extinguisher", "Gym",
      "Hair dryer", "Hangers", "High touch surfaces disinfected", "Hot water", "Internet", "Iron",
      "Kettle", "Kitchen", "Long term stays allowed", "Microwave", "Outdoor pool",
      "Outdoor seating (furniture)", "Patio or balcony", "Refrigerator", "Shampoo", "Shower gel",
      "Smoke detector", "Stove", "Suitable for children (2-12 years)", "Suitable for infants (under 2 years)",
      "Swimming pool", "Toaster", "Towels provided", "TV", "Washer", "Wine glasses", "Wireless Internet",
    ],
  },
];

export const getPropertyProfileByKey = (key = "") =>
  propertyProfiles.find((property) => property.key === String(key || "").trim()) || null;

export default propertyProfiles;
