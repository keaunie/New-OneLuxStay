import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";

const apiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions/index";
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const LOGO_URL = "https://oneluxstay.netlify.app/image/ols-logo.png";
const PROPERTY_ADDRESS = "Westlake, Los Angeles, CA";
const PROPERTY_COORDS = { lat: 34.0575, lng: -118.2776 };
const LANDMARKS = [
  "Hollywood Sign",
  "Griffith Observatory",
  "Rodeo Drive",
  "Santa Monica Pier",
  "The Grove",
  "LAX"
];
let mapsScriptPromise;

const loadGoogleMaps = (apiKey) => {
  if (!apiKey) return Promise.reject(new Error("Missing Google Maps API key"));
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
};

const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    : "--";

const diffNights = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const ms = endDate - startDate;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const formatDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getQuotePricing = (quoteData, listing, nights) => {
  if (!quoteData || !listing) return null;
  const normalizeRatePlan = (plan = {}) => {
    const labelSource = plan?.name || plan?.title || plan?.description || "";
    const isNonRefundable =
      plan?.cancellationPolicy?.isNonRefundable ??
      plan?.nonRefundable ??
      (/non[- ]?refundable/i.test(labelSource) ? true : false);
    const label = labelSource || (isNonRefundable ? "Non-refundable rate" : "Standard rate");
    return { label, isNonRefundable: Boolean(isNonRefundable) };
  };

  const plansRaw = Array.isArray(quoteData?.rates?.ratePlans)
    ? quoteData.rates.ratePlans
    : [];

  const buildPlanPricing = (plan, idx) => {
    const ratePlanMeta = plan?.ratePlan || {};
    const { label, isNonRefundable } = normalizeRatePlan(ratePlanMeta);
    const planId = ratePlanMeta?._id || plan?._id || `plan-${idx}`;
    const quoteMoney =
      plan?.money?.money ||
      plan?.money ||
      quoteData?.money?.money ||
      quoteData?.money ||
      null;
    const quoteDays = plan?.days || [];
    const quoteCurrency =
      quoteMoney?.currency || quoteDays[0]?.currency || listing.currency || "USD";
    const quotedNights = Array.isArray(quoteDays) && quoteDays.length > 0 ? quoteDays.length : nights;
    const manualDaySum = Array.isArray(quoteDays)
      ? quoteDays.reduce(
        (sum, d) => sum + (typeof d?.manualPrice === "number" ? d.manualPrice : 0),
        0
      )
      : null;
    const hasManualSum =
      Array.isArray(quoteDays) && quoteDays.some((d) => typeof d?.manualPrice === "number");
    const daySum = Array.isArray(quoteDays)
      ? quoteDays.reduce((sum, d) => {
        const price = d?.manualPrice ?? d?.price ?? d?.basePrice;
        return sum + (typeof price === "number" ? price : 0);
      }, 0)
      : null;

    const quoteTotalRaw =
      quoteMoney?.subTotalPrice ??
      quoteMoney?.totalPrice ??
      quoteMoney?.total ??
      quoteData?.total ??
      quoteData?.price?.total ??
      quoteData?.price?.totalAmount ??
      quoteData?.price?.totalPrice ??
      (typeof quoteData?.price?.total === "object" ? quoteData.price.total.amount : null) ??
      (typeof quoteData?.amount === "number" ? quoteData.amount : null) ??
      (typeof daySum === "number" && quotedNights ? daySum + (listing.cleaningFee || 0) : null);

    const quoteTotal = typeof quoteTotalRaw === "number" ? quoteTotalRaw : null;
    const quoteNightly =
      (quoteTotal && quotedNights ? quoteTotal / quotedNights : undefined) ??
      (typeof daySum === "number" && quotedNights ? daySum / quotedNights : undefined) ??
      (quoteDays[0]?.manualPrice ?? quoteDays[0]?.price ?? quoteDays[0]?.basePrice);

    const breakdown = (() => {
      const items = quoteMoney?.invoiceItems;
      if (!Array.isArray(items)) return null;
      const acc = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0 };
      items.forEach((item) => {
        const amt = typeof item?.amount === "number" ? item.amount : null;
        if (amt === null) return;
        const t = (item?.normalType || item?.type || "").toUpperCase();
        if (t === "AF" || t === "ACCOMMODATION_FARE") acc.accommodation += amt;
        else if (t === "CF" || t === "CLEANING_FEE") acc.cleaning += amt;
        else if (t === "OCT" || t === "TAX" || t === "OCCUPANCY_TAX") acc.taxes += amt;
        else acc.fees += amt;
      });
      return acc;
    })();

    const accommodationFromQuote =
      quoteMoney?.fareAccommodation ??
      null;
    const cleaningFromQuote =
      quoteMoney?.fareCleaning ??
      null;
    const taxesFromQuote =
      quoteMoney?.totalTaxes ??
      null;

    const accommodationBase =
      breakdown?.accommodation ??
      accommodationFromQuote ??
      (typeof daySum === "number" ? daySum : undefined) ??
      (Number.isFinite(quoteNightly) && quotedNights ? quoteNightly * quotedNights : undefined);
    const discountRate = isNonRefundable ? 0.15 : 0.1;
    const discountAmount =
      typeof accommodationBase === "number"
        ? accommodationBase * discountRate
        : 0;
    const accommodation =
      typeof accommodationBase === "number"
        ? accommodationBase - discountAmount
        : accommodationBase;
    const cleaning =
      cleaningFromQuote ??
      breakdown?.cleaning ??
      (typeof listing.cleaningFee === "number" ? listing.cleaningFee : 0);
    const taxes =
      taxesFromQuote ??
      breakdown?.taxes ??
      0;
    const fees = breakdown?.fees ?? 0;
    const subtotal =
      (typeof accommodation === "number" ? accommodation : 0) +
      (typeof cleaning === "number" ? cleaning : 0) +
      (typeof taxes === "number" ? taxes : 0) +
      (typeof fees === "number" ? fees : 0);
    const total = typeof subtotal === "number" ? subtotal : null;

    if (!Number.isFinite(quoteNightly)) return null;
    return {
      id: planId,
      label,
      isNonRefundable,
      nightly: quoteNightly,
      currency: quoteCurrency,
      nights: quotedNights || nights || 0,
      breakdown: {
        accommodation,
        discountAmount,
        discountRate,
        cleaning,
        taxes,
        fees,
        subtotal,
        total,
      },
      total,
    };
  };

  const plans = plansRaw.map(buildPlanPricing).filter(Boolean);
  if (!plans.length) return null;
  const standardPlan =
    plans.find((plan) => /standard/i.test(plan.label)) ||
    plans.find((plan) => !plan.isNonRefundable) ||
    null;
  return {
    plans,
    defaultPlanId: (standardPlan || plans[0]).id,
  };
};

const KNOWN_CITIES = ["los angeles", "la", "los-angeles", "hollywood", "west hollywood"];

const sanitizeText = (value = "") => {
  if (typeof value !== "string") return "";
  return value
    .replace(/\uFFFD/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
};

const normalizeCity = (listing) => {
  const titleLower = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
  const city = listing.city || listing.address?.city || listing.location || "";
  if (city) return city;

  const tagCity =
    Array.isArray(listing.tags) &&
    listing.tags.find((t) => typeof t === "string" && KNOWN_CITIES.includes(t.toLowerCase()));
  if (tagCity) return tagCity;

  if (titleLower) {
    const match = KNOWN_CITIES.find((c) => titleLower.includes(c));
    if (match) return match;
  }

  return "";
};

const formatAddress = (listing) => {
  const address = listing.address || {};
  const parts = [address.full, address.city, address.country].filter(Boolean);
  if (parts.length) return sanitizeText(parts.join(", "));
  if (typeof listing.location === "string") return sanitizeText(listing.location);
  return "Los Angeles";
};

const formatDescription = (value) => {
  if (!value) return "";
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "object") {
    return sanitizeText(value.summary || value.description || value.text || "");
  }
  return "";
};

const getImageUrl = (image) => {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.original || image.large || image.regular || image.thumbnail || "";
};

const getReviewLabel = (reviews) => {
  if (!reviews) return "No review data";
  if (Array.isArray(reviews)) return `${reviews.length} reviews`;
  if (typeof reviews === "object") {
    const count = reviews.count || reviews.total || reviews.numberOfReviews;
    const rating = reviews.rating || reviews.score || reviews.average;
    if (count && rating) return `${rating} / 5 (${count} reviews)`;
    if (count) return `${count} reviews`;
    if (rating) return `${rating} / 5 rating`;
  }
  return "Reviews available";
};

const getReviewStats = (reviews) => {
  if (!reviews) return { rating: null, count: null };
  if (Array.isArray(reviews)) return { rating: null, count: reviews.length };
  if (typeof reviews === "object") {
    const count = reviews.count || reviews.total || reviews.numberOfReviews || null;
    const rating = reviews.rating || reviews.score || reviews.average || null;
    return { rating, count };
  }
  return { rating: null, count: null };
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(num) ? num : null;
};

const parseCoords = (latValue, lngValue) => {
  const lat = toNumber(latValue);
  const lng = toNumber(lngValue);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const parseCoordsArray = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const first = toNumber(coords[0]);
  const second = toNumber(coords[1]);
  if (first === null || second === null) return null;
  const firstAbs = Math.abs(first);
  const secondAbs = Math.abs(second);
  if (firstAbs <= 90 && secondAbs <= 180) return { lat: first, lng: second };
  if (secondAbs <= 90 && firstAbs <= 180) return { lat: second, lng: first };
  return null;
};

const getListingCoords = (listing) => {
  const directCoords = parseCoords(
    listing.latitude ?? listing.lat ?? listing.address?.latitude ?? listing.address?.lat,
    listing.longitude ?? listing.lng ?? listing.address?.longitude ?? listing.address?.lng
  );
  if (directCoords) return directCoords;

  const candidates = [
    listing.address?.location,
    listing.address?.coordinates,
    listing.location,
    listing.geoLocation,
    listing.coordinates,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      const coords = parseCoordsArray(candidate);
      if (coords) return coords;
    } else if (typeof candidate === "object") {
      const coords = parseCoords(
        candidate.lat ?? candidate.latitude,
        candidate.lng ?? candidate.longitude
      );
      if (coords) return coords;
      if (Array.isArray(candidate.coordinates)) {
        const arrayCoords = parseCoordsArray(candidate.coordinates);
        if (arrayCoords) return arrayCoords;
      }
    }
  }
  return null;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const rangeLabel = (values, suffix = "") => {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return "--";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return `${min}${suffix}`;
  return `${min}${suffix} - ${max}${suffix}`;
};

const SECTION_STORIES = {
  "la-downtown": {
    title: "Downtown Los Angeles",
    tagline: "Skyline energy, rooftop heat, and a city pulse that keeps moving.",
    copy:
      "Wake to glassy towers, drift through art-lined streets, then land at Union Station just as the lights flicker on. Everything feels close, fast, and possible—perfect for guests who want the city within arm’s reach.",
    landmarks: ["Grand Central Market", "The Broad", "Walt Disney Concert Hall", "Union Station", "Little Tokyo"],
    transit: ["Metro A & E Lines", "Union Station", "Bus corridors on Broadway"],
  },
  "la-hollywood": {
    title: "Hollywood",
    tagline: "Neon nights, canyon mornings, and a view that never gets old.",
    copy:
      "From the hills to the boulevard, Hollywood keeps the story rolling. Catch the sign at sunrise, sip on Sunset, and glide to Griffith in minutes. It’s a destination that feels cinematic the moment you arrive.",
    landmarks: ["Hollywood Sign", "Walk of Fame", "Griffith Observatory", "Hollywood Bowl", "Sunset Strip"],
    transit: ["Metro B Line (Red)", "Hollywood/Highland", "Hollywood/Vine"],
  },
  "la-hwh": {
    title: "HWH",
    tagline: "Bold rooftops, late-night glow, and a rhythm that draws you in.",
    copy:
      "HWH brings the energy without the rush—pool decks at dusk, design-forward streets, and a quick hop to the Strip. It’s hypnotic, magnetic, and made for guests who want the best of both sides.",
    landmarks: ["West Hollywood Park", "Sunset Strip", "Melrose Ave", "Roxy Theatre"],
    transit: ["Rapid 2", "WeHo CityLine", "Sunset Blvd routes"],
  },
  other: {
    title: "Near Dodger Stadium",
    tagline: "Golden light, stadium nights, and a steady city hum.",
    copy:
      "Settle into the calm just outside the core, then ride the wave into game nights and skyline views. It’s a sweet spot with breathing room—close enough to feel the buzz, far enough to recharge.",
    landmarks: ["Dodger Stadium", "Elysian Park", "Chinatown", "Echo Park Lake"],
    transit: ["Dodger Stadium Express", "Metro A Line", "Stadium Way routes"],
  },
};

const BUILDING_GROUPS = [
  { key: "la-hwh", label: "HWH", match: /\bhwh\b|west hollywood|weho/ },
  {
    key: "la-downtown",
    label: "Downtown Los Angeles",
    match: /downtown|dtla|la plaza|broadway|chinatown|union station/,
  },
  { key: "la-hollywood", label: "Hollywood", match: /hollywood/ },
];

const getListingText = (listing) => {
  const tagText = Array.isArray(listing.tags) ? listing.tags.join(" ") : "";
  const desc = formatDescription(listing.publicDescription);
  return [
    listing.title,
    listing.nickname,
    listing.propertyType,
    listing.roomType,
    listing.address?.full,
    listing.address?.city,
    listing.location,
    tagText,
    desc,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const getBuildingKey = (listing) => {
  const text = getListingText(listing);
  const hwh = BUILDING_GROUPS.find((group) => group.key === "la-hwh");
  if (hwh && hwh.match.test(text)) return hwh.key;
  const downtown = BUILDING_GROUPS.find((group) => group.key === "la-downtown");
  if (downtown && downtown.match.test(text) && !/\bhwh\b|west hollywood|weho/.test(text)) {
    return downtown.key;
  }
  for (const group of BUILDING_GROUPS) {
    if (group.key === "la-hwh" || group.key === "la-downtown") continue;
    if (group.match.test(text)) return group.key;
  }
  return "other";
};

const getGroupStats = (listings) => {
  const basePrices = listings.map((l) => l.basePrice);
  const sleeps = listings.map((l) => l.accommodates);
  const bedrooms = listings.map((l) => l.bedrooms);
  const currencies = new Set(listings.map((l) => l.currency).filter(Boolean));
  return {
    baseRange: rangeLabel(basePrices),
    sleepsRange: rangeLabel(sleeps),
    bedroomRange: rangeLabel(bedrooms),
    currency: currencies.size === 1 ? [...currencies][0] : "USD",
  };
};

const LA_ITINERARY = [
  {
    title: "Day 1 - Downtown and Arts District",
    stops: [
      "Breakfast at Grand Central Market",
      "Walk The Broad and MOCA",
      "Sunset views at Griffith Observatory",
    ],
  },
  {
    title: "Day 2 - Hollywood and West Hollywood",
    stops: [
      "Hollywood Walk of Fame and TCL Chinese Theatre",
      "Lunch on Melrose or Sunset Strip",
      "Golden hour at Runyon Canyon",
    ],
  },
  {
    title: "Day 3 - Beach and Marina",
    stops: [
      "Morning in Santa Monica",
      "Bike the Strand to Venice",
      "Dinner at Marina del Rey",
    ],
  },
  {
    title: "Day 4 - Pasadena and the Hills",
    stops: [
      "Old Town Pasadena stroll",
      "Hike Eaton Canyon Falls",
      "Dinner in Highland Park",
    ],
  },
  {
    title: "Day 5 - Culver City and Beverly Hills",
    stops: [
      "Coffee in Culver City",
      "Rodeo Drive walk",
      "Sunset at Baldwin Hills Scenic Overlook",
    ],
  },
  {
    title: "Day 6 - Malibu",
    stops: [
      "Point Dume morning",
      "Lunch at Malibu Pier",
      "Sunset at El Matador Beach",
    ],
  },
  {
    title: "Day 7 - Day trip",
    stops: [
      "Laguna Beach or Long Beach",
      "Local markets and galleries",
      "Return for rooftop dinner",
    ],
  },
];


const getFirstSentence = (text) => {
  if (!text) return "";
  const clean = sanitizeText(text);
  const match = clean.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : clean.split("\n")[0].trim();
};

const formatFullDescription = (listing) => {
  const text = formatDescription(listing.publicDescription);
  if (text) return text;
  const fallback = [
    listing.propertyType,
    listing.roomType,
    listing.nickname,
    listing.timezone,
  ].filter(Boolean);
  return fallback.length ? `Details: ${fallback.join(" | ")}` : "No description available.";
};

function LosAngelesLandingPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeListing, setActiveListing] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [sectionCheckIn, setSectionCheckIn] = useState("");
  const [sectionCheckOut, setSectionCheckOut] = useState("");
  const [sectionGuests, setSectionGuests] = useState("2");
  const [sectionAvailability, setSectionAvailability] = useState([]);
  const [sectionAvailabilityLoading, setSectionAvailabilityLoading] = useState(false);
  const [sectionAvailabilityError, setSectionAvailabilityError] = useState("");
  const [sectionAvailabilityActive, setSectionAvailabilityActive] = useState(false);
  const [sectionHeroIndex, setSectionHeroIndex] = useState(0);
  const [sectionQuotes, setSectionQuotes] = useState({});
  const [selectedRatePlans, setSelectedRatePlans] = useState({});
  const [autoCheckOnOpen, setAutoCheckOnOpen] = useState(false);
  const [expandedQuoteRows, setExpandedQuoteRows] = useState({});
  const [buildingPrices, setBuildingPrices] = useState({});
  const [itineraryDays, setItineraryDays] = useState("3");
  const autoScrollRef = useRef(null);
  const thumbsRef = useRef(null);
  const sectionThumbsRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapsApiRef = useRef(null);
  const listingMarkersRef = useRef([]);
  const listingInfoRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const losAngelesListingsRef = useRef([]);

  const activeAmenityList = useMemo(() => {
    if (!activeListing) return [];
    const amenityListRaw = Array.isArray(activeListing.amenities)
      ? activeListing.amenities
      : Array.isArray(activeListing.tags)
        ? activeListing.tags
        : [];
    return [...new Set(amenityListRaw.filter((item) => typeof item === "string"))];
  }, [activeListing]);

  const activeAboutText = useMemo(() => {
    if (!activeListing) return "";
    return formatFullDescription(activeListing);
  }, [activeListing]);

  const stopAutoScroll = () => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };

  const startAutoScroll = (direction) => {
    if (!thumbsRef.current) return;
    if (autoScrollRef.current) return;
    autoScrollRef.current = setInterval(() => {
      thumbsRef.current.scrollBy({ left: direction * 6, behavior: "auto" });
    }, 16);
  };

  const handleThumbsMove = (event) => {
    if (!thumbsRef.current) return;
    const rect = thumbsRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const edge = rect.width * 0.2;
    if (x < edge) {
      startAutoScroll(-1);
    } else if (x > rect.width - edge) {
      startAutoScroll(1);
    } else {
      stopAutoScroll();
    }
  };

  const handleSectionThumbsMove = (event) => {
    if (!sectionThumbsRef.current) return;
    const rect = sectionThumbsRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const edge = rect.width * 0.2;
    if (x > rect.width - edge) {
      startAutoScroll(1);
    } else if (x < edge) {
      startAutoScroll(-1);
    } else {
      stopAutoScroll();
    }
  };

  useEffect(() => stopAutoScroll, []);

  useEffect(() => {
    if (!activeListing) {
      stopAutoScroll();
      setActiveImageIndex(0);
    }
  }, [activeListing]);

  useEffect(() => {
    if (activeSectionKey) {
      setActiveListing(null);
      setSectionAvailabilityError("");
      setSectionAvailabilityActive(false);
      setSectionHeroIndex(0);
      setSectionQuotes({});
      setExpandedQuoteRows({});
    }
  }, [activeSectionKey]);

  useEffect(() => {
    if (!autoCheckOnOpen) return;
    if (!activeSectionKey || !sectionCheckIn || !sectionCheckOut) return;
    fetchAvailabilityListings();
    setAutoCheckOnOpen(false);
  }, [autoCheckOnOpen, activeSectionKey, sectionCheckIn, sectionCheckOut]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        if (!active) return;
        setListings(json.results || []);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Unable to load listings.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!listings.length) return;
    const targetId = "66e1e3875a1f6300d736f28e";
    const match = listings.find((listing) => (listing.id || listing._id) === targetId);
    if (match) {
      console.log("[LA debug] listing match", match);
    } else {
      console.log("[LA debug] listing not found for id", targetId);
    }
  }, [listings]);

  useEffect(() => {
    if (!mapRef.current || mapLoadedRef.current || !mapsApiKey) return;
    const target = mapRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || mapLoadedRef.current) return;
        mapLoadedRef.current = true;
        loadGoogleMaps(mapsApiKey)
          .then((maps) => {
            const map = new maps.Map(target, {
              center: PROPERTY_COORDS,
              zoom: 15,
              gestureHandling: "greedy",
              zoomControl: true,
              fullscreenControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              styles: [
                { featureType: "poi", stylers: [{ visibility: "off" }] },
                { featureType: "poi.business", stylers: [{ visibility: "off" }] },
                { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
              ],
            });
            mapsApiRef.current = maps;
            mapInstanceRef.current = map;

            const infoWindow = new maps.InfoWindow();

            const geocoder = new maps.Geocoder();
            geocoder.geocode({ address: PROPERTY_ADDRESS }, (results, status) => {
              if (status === "OK" && results?.[0]?.geometry?.location) {
                map.setCenter(results[0].geometry.location);
              }
            });

            const transitLayer = new maps.TransitLayer();
            transitLayer.setMap(map);

            const placesService = new maps.places.PlacesService(map);
            LANDMARKS.forEach((name) => {
              placesService.textSearch(
                {
                  query: name,
                  location: map.getCenter(),
                  radius: 2500,
                },
                (results, status) => {
                  if (status !== maps.places.PlacesServiceStatus.OK || !results?.length) return;
                  const place = results[0];
                  const marker = new maps.Marker({
                    map,
                    position: place.geometry?.location,
                    title: place.name,
                  });
                  marker.addListener("click", () => {
                    infoWindow.setContent(`<strong>${place.name}</strong>`);
                    infoWindow.open(map, marker);
                  });
                }
              );
            });

            if (losAngelesListingsRef.current.length) {
              syncListingMarkers(losAngelesListingsRef.current);
            }
          })
          .catch((err) => {
            console.error(err);
          });
      },
      { threshold: 0.25 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const losAngelesListings = useMemo(() => {
    return listings.filter((listing) => {
      const city = normalizeCity(listing).toLowerCase();
      return KNOWN_CITIES.some((known) => city.includes(known));
    });
  }, [listings]);

  const syncListingMarkers = (listingsToUse = losAngelesListingsRef.current) => {
    const maps = mapsApiRef.current;
    const map = mapInstanceRef.current;
    if (!maps || !map) return;

    listingMarkersRef.current.forEach((marker) => marker.setMap(null));
    listingMarkersRef.current = [];

    let infoWindow = listingInfoRef.current;
    if (!infoWindow) {
      infoWindow = new maps.InfoWindow();
      listingInfoRef.current = infoWindow;
    }

    const listingMarkerIcon = {
      path: maps.SymbolPath.CIRCLE,
      scale: 26,
      fillColor: "#1f1c19",
      fillOpacity: 1,
      strokeColor: "#c9b59c",
      strokeWeight: 2,
    };
    const listingLogoIcon = {
      url: LOGO_URL,
      scaledSize: new maps.Size(26, 26),
      anchor: new maps.Point(13, 13),
    };

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;
    listingsToUse.forEach((listing) => {
      const coords = getListingCoords(listing);
      if (!coords) return;
      const title = listing.title || listing.nickname || "OneLuxStay";
      const backgroundMarker = new maps.Marker({
        map,
        position: coords,
        icon: listingMarkerIcon,
        zIndex: 10,
      });
      const marker = new maps.Marker({
        map,
        position: coords,
        title,
        icon: listingLogoIcon,
        zIndex: 11,
      });
      marker.addListener("click", () => {
        const content = `
          <div>
            <strong>${escapeHtml(title)}</strong><br />
            ${escapeHtml(formatAddress(listing))}
          </div>`;
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
      });
      listingMarkersRef.current.push(backgroundMarker, marker);
      bounds.extend(coords);
      hasBounds = true;
    });

    if (hasBounds) {
      map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
      const westlake = new maps.LatLng(PROPERTY_COORDS.lat, PROPERTY_COORDS.lng);
      if (bounds.contains(westlake)) {
        map.panTo(westlake);
      }
    }
  };

  useEffect(() => {
    losAngelesListingsRef.current = losAngelesListings;
    syncListingMarkers(losAngelesListings);
  }, [losAngelesListings]);

  const groupedListings = useMemo(() => {
    const groups = BUILDING_GROUPS.reduce((acc, group) => {
      acc[group.key] = { label: group.label, listings: [] };
      return acc;
    }, {});
    const other = [];
    losAngelesListings.forEach((listing) => {
      const key = getBuildingKey(listing);
      if (groups[key]) groups[key].listings.push(listing);
      else other.push(listing);
    });
    const ordered = BUILDING_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      listings: groups[group.key].listings,
    }));
    if (other.length) {
      ordered.push({ key: "other", label: "Near Dodger Stadium", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [losAngelesListings]);

  const sectionsByKey = useMemo(() => {
    return groupedListings.reduce((acc, group) => {
      acc[group.key] = group;
      return acc;
    }, {});
  }, [groupedListings]);

  const activeSection = activeSectionKey ? sectionsByKey[activeSectionKey] : null;

  useEffect(() => {
    if (!groupedListings.length) return;
    let active = true;
    const load = async () => {
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      const checkIn = formatDateLocal(today);
      const checkOut = formatDateLocal(tomorrow);
      const nights = diffNights(checkIn, checkOut);
      const results = {};
      const getManualTotal = (quoteData) => {
        const plans = Array.isArray(quoteData?.rates?.ratePlans)
          ? quoteData.rates.ratePlans
          : [];
        let minTotal = null;
        plans.forEach((plan) => {
          const money = plan?.money?.money || plan?.money || quoteData?.money?.money || quoteData?.money || {};
          const invoiceItems = Array.isArray(money?.invoiceItems) ? money.invoiceItems : [];
          const invoiceTotal = invoiceItems.reduce(
            (acc, item) => acc + (typeof item?.amount === "number" ? item.amount : 0),
            0
          );
          const label = plan?.ratePlan?.name || plan?.ratePlan?.title || plan?.ratePlan?.description || "";
          const isNonRefundable =
            /non[- ]?refundable/i.test(label) ||
            Boolean(plan?.ratePlan?.cancellationPolicy?.isNonRefundable);
          const discountRate = isNonRefundable ? 0.15 : 0.1;
          const accommodationItem = invoiceItems.find((item) => {
            const type = (item?.normalType || item?.type || "").toUpperCase();
            return type === "AF" || type === "ACCOMMODATION_FARE";
          });
          const accommodationAmount =
            typeof accommodationItem?.amount === "number"
              ? accommodationItem.amount
              : typeof money?.fareAccommodation === "number"
                ? money.fareAccommodation
                : 0;
          const cleaningAmount =
            typeof money?.fareCleaning === "number" ? money.fareCleaning : 0;
          const taxAmount =
            typeof money?.totalTaxes === "number" ? money.totalTaxes : 0;
          const discountedAccommodation =
            accommodationAmount > 0 ? accommodationAmount * (1 - discountRate) : accommodationAmount;
          const total = discountedAccommodation + cleaningAmount + taxAmount;
          if (minTotal === null || total < minTotal) {
            minTotal = total;
          }
        });
        return { total: minTotal };
      };

      for (const group of groupedListings) {
        let minTotal = null;
        let currency = "USD";
        for (const listing of group.listings) {
          const listingId = listing.unitTypeId || listing.id || listing._id;
          if (!listingId) continue;
          try {
            const res = await fetch(`${apiBase}/api/reservations/quotes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId,
                checkInDateLocalized: checkIn,
                checkOutDateLocalized: checkOut,
                guestsCount: "1",
              }),
            });
            if (!res.ok) continue;
            const quoteJson = await res.json();
            const quoteData = quoteJson?.results?.[0] || quoteJson?.results || quoteJson;
            const pricing = getQuotePricing(quoteData, listing, nights);
            const manualTotals = getManualTotal(quoteData);
            const total =
              (typeof manualTotals?.total === "number" && manualTotals.total > 0
                ? manualTotals.total
                : pricing?.breakdown?.total ?? pricing?.breakdown?.subtotal) ?? null;
            if (typeof total === "number" && (minTotal === null || total < minTotal)) {
              minTotal = total;
              currency = pricing?.currency || listing.currency || "USD";
            }
          } catch {
            // ignore quote failures
          }
        }
        if (minTotal !== null) {
          results[group.key] = { total: minTotal, currency };
        }
      }

      if (active) setBuildingPrices(results);
    };
    load();
    return () => {
      active = false;
    };
  }, [groupedListings]);
  useEffect(() => {
    if (!sectionQuotes) return;
    setSelectedRatePlans((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(sectionQuotes).forEach(([listingId, quote]) => {
        const plans = quote?.plans || [];
        if (!plans.length) return;
        const defaultId = quote.defaultPlanId || plans[0].id;
        if (!next[listingId]) {
          next[listingId] = defaultId;
          changed = true;
          return;
        }
        if (!plans.some((plan) => plan.id === next[listingId])) {
          next[listingId] = defaultId;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sectionQuotes]);

  const fetchAvailabilityListings = async () => {
    if (!activeSection) return;
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    setSectionAvailabilityLoading(true);
    setSectionAvailabilityError("");
    try {
      const items = activeSection.listings
        .map((listing) => listing.id || listing._id)
        .filter(Boolean);
      const nights = diffNights(sectionCheckIn, sectionCheckOut);
      const qs = new URLSearchParams({
        startDate: sectionCheckIn,
        endDate: sectionCheckOut,
        minOccupancy: sectionGuests || "1",
      }).toString();
      const checks = await Promise.all(
        items.map(async (id) => {
          const tryAvailability = async (listingId) => {
            const res = await fetch(`${apiBase}/api/listings/${listingId}/availability?${qs}`, {
              cache: "no-store",
            });
            if (!res.ok) return { ok: false, status: res.status };
            const json = await res.json();
            return { ok: true, available: Boolean(json?.isAvailable) };
          };

          const primary = await tryAvailability(id);
          if (primary.ok) return { id, available: primary.available };
          return { id, available: false };
        })
      );
      const availableIds = new Set(checks.filter((item) => item.available).map((item) => item.id));
      const availableListings = activeSection.listings.filter((listing) =>
        availableIds.has(listing.id || listing._id)
      );
      setSectionAvailability(availableListings);
      setSectionAvailabilityActive(true);

      const quotes = {};
      await Promise.all(
        availableListings.map(async (listing) => {
          const listingKey = listing.id || listing._id;
          const quoteListingId = listing.unitTypeId || listing.id || listing._id;
          if (!listingKey || !quoteListingId) return;
          try {
            const res = await fetch(`${apiBase}/api/reservations/quotes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                listingId: quoteListingId,
                checkInDateLocalized: sectionCheckIn,
                checkOutDateLocalized: sectionCheckOut,
                guestsCount: sectionGuests || "1",
              }),
            });
            if (!res.ok) return;
            const quoteJson = await res.json();
            const quoteData = quoteJson?.results?.[0] || quoteJson?.results || quoteJson;
            const pricing = getQuotePricing(quoteData, listing, nights);
            if (pricing) quotes[listingKey] = pricing;
          } catch {
            // fall back to base price
          }
        })
      );
      setSectionQuotes(quotes);
    } catch (err) {
      setSectionAvailabilityError(err.message || "Unable to load availability.");
    } finally {
      setSectionAvailabilityLoading(false);
    }
  };

  const heroImages = useMemo(() => {
    const picks = [];
    losAngelesListings.forEach((listing) => {
      const hero = getImageUrl(listing.picture);
      if (hero) picks.push(hero);
      if (Array.isArray(listing.pictures)) {
        listing.pictures.slice(0, 2).forEach((pic) => {
          const url = getImageUrl(pic);
          if (url) picks.push(url);
        });
      }
    });
    return [...new Set(picks)].slice(0, 4);
  }, [losAngelesListings]);

  const stats = useMemo(() => {
    const basePrices = losAngelesListings.map((l) => l.basePrice);
    const cleaningFees = losAngelesListings.map((l) => l.cleaningFee);
    const bedrooms = losAngelesListings.map((l) => l.bedrooms);
    const bathrooms = losAngelesListings.map((l) => l.bathrooms);
    const sleeps = losAngelesListings.map((l) => l.accommodates);
    const currencies = new Set(losAngelesListings.map((l) => l.currency).filter(Boolean));
    const propertyTypes = new Set(losAngelesListings.map((l) => l.propertyType).filter(Boolean));

    return {
      units: losAngelesListings.length,
      nightly: rangeLabel(basePrices),
      cleaning: rangeLabel(cleaningFees),
      bedrooms: rangeLabel(bedrooms),
      bathrooms: rangeLabel(bathrooms),
      sleeps: rangeLabel(sleeps),
      currency: currencies.size === 1 ? [...currencies][0] : "Multiple",
      propertyCount: propertyTypes.size || 0,
    };
  }, [losAngelesListings]);

  const itinerary = useMemo(() => {
    const days = Math.min(Number(itineraryDays) || 3, LA_ITINERARY.length);
    return LA_ITINERARY.slice(0, days);
  }, [itineraryDays]);

  return (
    <div className="antwerp-page">
      <header className="antwerp-hero">
        <div className="antwerp-hero__content">
          <span className="antwerp-kicker">OneLuxStay / Los Angeles, California</span>
          <h1 className="antwerp-title">Los Angeles collection</h1>
          <p className="antwerp-lede">
            A curated landing page built directly from live listing data. Every detail below mirrors what is available
            right now for Los Angeles units.
          </p>
          <div className="antwerp-hero__actions">
            <Link to="/stay?city=Los%20Angeles#listings" className="antwerp-cta">
              Browse live availability
            </Link>
            <a href="#los-angeles-units" className="antwerp-ghost">
              Explore units
            </a>
          </div>
          <div className="antwerp-stats">
            <div className="antwerp-stat">
              <span>Units</span>
              <strong>{stats.units || "--"}</strong>
            </div>
            <div className="antwerp-stat">
              <span>Nightly range</span>
              <strong>
                {stats.nightly !== "--" ? `${stats.nightly} ${stats.currency}` : "--"}
              </strong>
            </div>
            <div className="antwerp-stat">
              <span>Cleaning</span>
              <strong>
                {stats.cleaning !== "--" ? `${stats.cleaning} ${stats.currency}` : "--"}
              </strong>
            </div>
            <div className="antwerp-stat">
              <span>Bedrooms</span>
              <strong>{stats.bedrooms}</strong>
            </div>
            <div className="antwerp-stat">
              <span>Bathrooms</span>
              <strong>{stats.bathrooms}</strong>
            </div>
            <div className="antwerp-stat">
              <span>Sleeps</span>
              <strong>{stats.sleeps}</strong>
            </div>
          </div>
        </div>
        <div className="antwerp-hero__media">
          {heroImages.length ? (
            heroImages.map((src, idx) => (
              <div
                key={`${src}-${idx}`}
                className={`antwerp-hero__image antwerp-hero__image--${idx + 1}`}
                style={{ backgroundImage: `url(${src})` }}
                aria-hidden="true"
              />
            ))
          ) : (
            <div className="antwerp-hero__image antwerp-hero__image--empty" aria-hidden="true">
              Los Angeles imagery loading
            </div>
          )}
        </div>
      </header>

      <main className="antwerp-main">
        <section className="la-itinerary" aria-label="Los Angeles itinerary">
          <div className="la-itinerary__head">
            <div>
              <p className="antwerp-kicker">Itinerary</p>
              <h2>Plan your Los Angeles stay</h2>
              <p className="antwerp-muted">
                Choose how many days you want to explore, and we will map out a paced itinerary.
              </p>
            </div>
            <div className="la-itinerary__control">
              <label htmlFor="la-itinerary-days">Trip length</label>
              <select
                id="la-itinerary-days"
                value={itineraryDays}
                onChange={(event) => setItineraryDays(event.target.value)}
              >
                <option value="2">2 days</option>
                <option value="3">3 days</option>
                <option value="4">4 days</option>
                <option value="5">5 days</option>
                <option value="7">7 days</option>
              </select>
            </div>
          </div>
          <div className="la-itinerary__grid">
            {itinerary.map((day, index) => (
              <article key={day.title} className="la-itinerary__card">
                <span className="la-itinerary__day">Day {index + 1}</span>
                <h3>{day.title}</h3>
                <ul>
                  {day.stops.map((stop) => (
                    <li key={`${day.title}-${stop}`}>{stop}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="antwerp-section" id="los-angeles-units">
          <div className="la-units-layout">
            <div className="la-units-main">
              <div className="antwerp-section__head">
                <div>
                  <p className="antwerp-kicker">Available now</p>
                  <h2>Los Angeles buildings</h2>
                  <p className="antwerp-muted">
                    Every card below is derived from the live Guesty listing response, including pricing, capacity, and
                    amenities metadata.
                  </p>
                </div>
                <div className="antwerp-chip-row">
                  <span>{stats.propertyCount} property types</span>
                  <span>{stats.units || "--"} listings</span>
                  <span>Currency: {stats.currency}</span>
                </div>
              </div>

              {loading && (
                <div className="antwerp-loading">
                  <div className="antwerp-skeleton" />
                  <div className="antwerp-skeleton" />
                </div>
              )}

              {error && (
                <div role="alert" className="antwerp-error">
                  {error}
                </div>
              )}

              {!loading && !error && losAngelesListings.length === 0 && (
                <div className="antwerp-empty">
                  No Los Angeles listings are available in the current response.
                </div>
              )}

              {groupedListings.map((group) => {
                const story = SECTION_STORIES[group.key] || SECTION_STORIES.other;
                const storyImages = group.listings
                  .map((listing) => getImageUrl(listing.picture) || getImageUrl(listing.pictures?.[0]))
                  .filter(Boolean)
                  .slice(0, 2);
                const groupStats = getGroupStats(group.listings);
                const buildingPrice = buildingPrices[group.key];
                const latestPrice = buildingPrice
                  ? formatCurrency(buildingPrice.total, buildingPrice.currency)
                  : null;
                return (
                  <section key={group.key} className="antwerp-building">
                    <div className="antwerp-building__head">
                      <div>
                        <p className="antwerp-kicker">{group.label}</p>
                        <h3>{group.label}</h3>
                      </div>
                      <div className="antwerp-building__stats">
                        <span>{group.listings.length} units</span>
                        <span>
                          Sleeps {groupStats.sleepsRange}
                        </span>
                        <span>
                          {latestPrice
                            ? `From ${latestPrice}`
                            : `From ${groupStats.baseRange} ${groupStats.currency}`}
                        </span>
                        <span>
                          Bedrooms {groupStats.bedroomRange}
                        </span>
                      </div>
                    </div>
                    <div className="la-story">
                      <div className="la-story__media" aria-hidden="true">
                        {storyImages.length ? (
                          storyImages.map((src, idx) => (
                            <div
                              key={`${group.key}-story-${idx}`}
                              className="la-story__image"
                              style={{ backgroundImage: `url(${src})` }}
                            />
                          ))
                        ) : (
                          <div className="la-story__image la-story__image--empty">Image loading</div>
                        )}
                      </div>
                    <div className="la-story__content">
                      <p className="la-story__tag">{story.title}</p>
                      <h4>{story.tagline}</h4>
                      <p className="la-story__copy">{story.copy}</p>
                      <div className="la-story__row" aria-label="Landmarks and transit near this area">
                      <div className="la-story__track">
                        {[...story.landmarks, ...story.transit].map((item, idx) => (
                          <span key={`${group.key}-story-${idx}`} className="la-story__pill">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="antwerp-card__ghost"
                      onClick={() => {
                        const today = new Date();
                        const tomorrow = new Date();
                        tomorrow.setDate(today.getDate() + 1);
                        setSectionCheckIn(formatDateLocal(today));
                        setSectionCheckOut(formatDateLocal(tomorrow));
                        setActiveSectionKey(group.key);
                        setAutoCheckOnOpen(true);
                      }}
                    >
                      View units in {group.label}
                    </button>
                    <p className="la-story__price" aria-live="polite">
                      {latestPrice
                        ? `From ${latestPrice} total (manual + cleaning + tax)`
                        : "Pricing updates when quotes load."}
                    </p>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
            <aside className="la-units-aside">
              <div className="la-units-map-card">
                <p className="antwerp-kicker">Neighborhood map</p>
                <h3>Walkable highlights</h3>
                <p className="antwerp-muted">
                  See nearby landmarks and public transport around Hollywood Blvd.
                </p>
                <div
                  ref={mapRef}
                  aria-label="Google map showing Hollywood Blvd with nearby landmarks and public transport"
                  className="la-units-map"
                  style={{
                    width: "100%",
                    borderRadius: "20px",
                    border: "1px solid rgba(201, 181, 156, 0.6)",
                    overflow: "hidden",
                    background: "rgba(249, 248, 246, 0.8)",
                  }}
                />
              </div>
            </aside>
          </div>
        </section>
      </main>

      {activeSection && (
        <div className="antwerp-modal__overlay" role="dialog" aria-modal="true" aria-label="Listings modal">
          <div className="la-section-modal">
            <div className="la-section-modal__header">
              <button
                type="button"
                className="la-section-modal__back"
                aria-label="Close listings"
                onClick={() => setActiveSectionKey(null)}
              >
                Back to destinations
              </button>
              <div>
                <p className="la-section-modal__tag">Available now</p>
                <h3>{activeSection.label}</h3>
                <p className="la-section-modal__subtitle">
                  {activeSection.listings.length} units ready for your dates.
                </p>
              </div>
            </div>
            {(() => {
              const images = activeSection.listings
                .flatMap((listing) => [
                  getImageUrl(listing.picture),
                  ...(Array.isArray(listing.pictures)
                    ? listing.pictures.map((pic) => getImageUrl(pic))
                    : []),
                ])
                .filter(Boolean)
                .slice(0, 8);
              const safeIndex = Math.min(sectionHeroIndex, Math.max(images.length - 1, 0));
              const mainImage = images[safeIndex];
              const sideImages = [images[(safeIndex + 1) % images.length], images[(safeIndex + 2) % images.length]];
              const stats = activeSection.listings.reduce(
                (acc, listing) => {
                  const { rating, count } = getReviewStats(listing.reviews);
                  if (rating) {
                    acc.ratingSum += Number(rating);
                    acc.ratingCount += 1;
                  }
                  if (count) acc.reviewCount += Number(count);
                  return acc;
                },
                { ratingSum: 0, ratingCount: 0, reviewCount: 0 }
              );
              const averageRating = stats.ratingCount
                ? (stats.ratingSum / stats.ratingCount).toFixed(1)
                : null;
              const coords =
                activeSection.listings.map(getListingCoords).find(Boolean) || PROPERTY_COORDS;
              const mapUrl =
                coords && mapsApiKey
                  ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=13&size=520x320&maptype=roadmap&markers=color:0x1f1c19|${coords.lat},${coords.lng}&key=${mapsApiKey}`
                  : "";
              return (
                <div className="la-section-hero">
                  <div className="la-section-hero__media">
                    <div className="la-section-hero__main">
                      {mainImage ? (
                        <button
                          type="button"
                          className="la-section-hero__button"
                          onClick={() => setSectionHeroIndex(safeIndex)}
                        >
                          <img src={mainImage} alt={`${activeSection.label} featured`} loading="lazy" />
                        </button>
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    <div className="la-section-hero__side">
                      {sideImages.map((src, idx) =>
                        src ? (
                          <button
                            key={`side-${idx}`}
                            type="button"
                            className="la-section-hero__button"
                            onClick={() => setSectionHeroIndex((safeIndex + idx + 1) % images.length)}
                          >
                            <img src={src} alt="" loading="lazy" />
                          </button>
                        ) : (
                          <div key={`side-${idx}`} className="la-unit-modal__placeholder">
                            Image loading
                          </div>
                        )
                      )}
                    </div>
                    {images.length > 3 && (
                      <div
                        className="la-section-hero__thumbs"
                        role="list"
                        ref={sectionThumbsRef}
                        onMouseMove={handleSectionThumbsMove}
                        onMouseLeave={stopAutoScroll}
                      >
                        {images.map((src, idx) => (
                          <button
                            key={`${src}-${idx}`}
                            type="button"
                            className={idx === safeIndex ? "is-active" : ""}
                            onClick={() => setSectionHeroIndex(idx)}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <img src={src} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <aside className="la-section-hero__aside">
                    <div className="la-section-hero__contact" aria-label="Reservation contact">
                      <p>For Reservation Contact</p>
                      <strong>OneLuxStay Los Angeles</strong>
                      <a href="tel:+12138663589">+1 213 866 3589</a>
                      <a href="mailto:reservations@oneluxstay.com">reservations@oneluxstay.com</a>
                      <a href="mailto:reservations@oneluxstay.com" className="la-unit-modal__contact-cta">
                        Message concierge
                      </a>
                    </div>
                    <div className="la-section-hero__review">
                      <div>
                        <strong>Guest pulse</strong>
                        <span>{stats.reviewCount ? `${stats.reviewCount} reviews` : "No review data"}</span>
                      </div>
                      <div className="la-section-hero__score">
                        {averageRating ? `${averageRating} / 5` : "—"}
                      </div>
                      <p>
                        Guests love the easy flow between stays, skyline views, and quick access to local landmarks.
                      </p>
                    </div>
                    <div className="la-section-hero__map">
                      {mapUrl ? (
                        <img src={mapUrl} alt="Map showing the building location" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Map loading</div>
                      )}
                    </div>
                  </aside>
                </div>
              );
            })()}
            {(() => {
              const amenityPool = activeSection.listings.flatMap((listing) => {
                if (Array.isArray(listing.amenities)) return listing.amenities;
                if (Array.isArray(listing.tags)) return listing.tags;
                return [];
              });
              const amenityList = [...new Set(amenityPool.filter((item) => typeof item === "string"))].slice(0, 12);
              return (
                <>
                  <div className="la-unit-modal__booking" aria-label="Availability check">
                    <div>
                      <label htmlFor="la-section-checkin">Check-in</label>
                      <input
                        id="la-section-checkin"
                        type="date"
                        value={sectionCheckIn}
                        onChange={(event) => setSectionCheckIn(event.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="la-section-checkout">Check-out</label>
                      <input
                        id="la-section-checkout"
                        type="date"
                        value={sectionCheckOut}
                        onChange={(event) => setSectionCheckOut(event.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="la-section-guests">Guests</label>
                      <select
                        id="la-section-guests"
                        value={sectionGuests}
                        onChange={(event) => setSectionGuests(event.target.value)}
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    </div>
                    <button type="button" onClick={fetchAvailabilityListings}>
                      {sectionAvailabilityLoading ? "Checking..." : "Check availability"}
                    </button>
                  </div>
                  {sectionAvailabilityError && (
                    <div role="alert" className="la-section-hero__notice">
                      {sectionAvailabilityError}
                    </div>
                  )}
                  <div className="la-unit-modal__section">
                    <h4>Amenities</h4>
                    <div className="la-unit-modal__amenities">
                      {(amenityList.length
                        ? amenityList
                        : ["Fast Wi-Fi", "Kitchen", "Washer", "Heating", "Essentials", "Parking"]
                      ).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="la-unit-modal__section">
                    <h4>About this property</h4>
                    <p>
                      A calm base with quick access to the neighborhood’s best corners. Expect bright spaces, effortless
                      arrivals, and a stay that keeps everything close—landmarks, transit, and the city’s rhythm.
                    </p>
                  </div>
                </>
              );
            })()}
            <div
              className={`la-booking-table${sectionAvailabilityLoading ? " is-loading" : ""}`}
              role="table"
              aria-label="Available units"
              aria-busy={sectionAvailabilityLoading ? "true" : "false"}
            >
              {sectionAvailabilityLoading && (
                <div className="la-booking-table__progress" role="status" aria-live="polite">
                  <div className="la-booking-table__progress-bar" />
                </div>
              )}
              <div className="la-booking-table__head" role="row">
                <div role="columnheader">Room type</div>
                <div role="columnheader">Guests</div>
                <div role="columnheader">Today&apos;s price</div>
                <div role="columnheader">Your choices</div>
                <div role="columnheader">Virtual tour</div>
              </div>
              {sectionAvailabilityLoading ? (
                <>
                  {[0, 1, 2].map((idx) => (
                    <div key={`la-skeleton-${idx}`} className="la-booking-table__row la-booking-table__row--skeleton">
                      <div className="la-booking-table__cell">
                        <div className="la-booking-table__title">
                          <div className="la-skeleton-block la-skeleton-image" />
                          <div className="la-skeleton-stack">
                            <div className="la-skeleton-block la-skeleton-line sm" />
                            <div className="la-skeleton-block la-skeleton-line lg" />
                            <div className="la-skeleton-block la-skeleton-line md" />
                            <div className="la-skeleton-block la-skeleton-line md" />
                          </div>
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-stack">
                          <div className="la-skeleton-block la-skeleton-line sm" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-stack">
                          <div className="la-skeleton-block la-skeleton-line lg" />
                          <div className="la-skeleton-block la-skeleton-line md" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-stack">
                          <div className="la-skeleton-block la-skeleton-select" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-block la-skeleton-button" />
                      </div>
                    </div>
                  ))}
                </>
              ) : (sectionAvailabilityActive ? sectionAvailability : activeSection.listings).length === 0 ? (
                <div className="la-section-hero__notice">
                  No units are available for the selected dates. Try a different range.
                </div>
              ) : (
                <>
                  {(sectionAvailabilityActive ? sectionAvailability : activeSection.listings).map((listing) => {
                    const listingId = listing.id || listing._id;
                    const image = getImageUrl(listing.picture) || getImageUrl(listing.pictures?.[0]);
                    const listingCurrency = listing.currency || "USD";
                    const fullDescription = formatFullDescription(listing);
                    const shortDescription = getFirstSentence(fullDescription);
                    const quote = listingId ? sectionQuotes[listingId] : null;
                    const planOptions = quote?.plans || [];
                    const selectedPlanId =
                      selectedRatePlans[listingId] ||
                      quote?.defaultPlanId ||
                      planOptions[0]?.id ||
                      "";
                    const selectedPlan =
                      planOptions.find((plan) => plan.id === selectedPlanId) || planOptions[0];
                    const baseNightly = selectedPlan?.nightly ?? listing.basePrice;
                    const priceCurrency = selectedPlan?.currency ?? listingCurrency;
                    const breakdown = selectedPlan?.breakdown;
                    const isLoadingRates = sectionAvailabilityLoading;
                    const fallbackTotal =
                      typeof baseNightly === "number" && quote?.nights
                        ? baseNightly * quote.nights +
                          (typeof listing.cleaningFee === "number" ? listing.cleaningFee : 0)
                        : null;
                    const total =
                      breakdown?.total ??
                      breakdown?.subtotal ??
                      selectedPlan?.total ??
                      fallbackTotal ??
                      null;
                    const priceValue =
                      typeof total === "number"
                        ? total
                        : typeof baseNightly === "number"
                          ? baseNightly
                          : baseNightly;
                    const breakdownId = `la-quote-${listingId}`;
                    const isExpanded = Boolean(expandedQuoteRows[listingId]);
                    return (
                      <article key={listingId} className="la-booking-table__row" role="row">
                        <div className="la-booking-table__cell" role="cell">
                          <div className="la-booking-table__title">
                            {image ? (
                              <img src={image} alt="" loading="lazy" />
                            ) : (
                              <div className="la-booking-table__placeholder" aria-hidden="true" />
                            )}
                            <div>
                              <p className="la-booking-table__eyebrow">
                                {listing.propertyType || listing.roomType || "Residence"}
                              </p>
                              <h4>{sanitizeText(listing.title)}</h4>
                              <p className="la-booking-table__room-meta">
                                <span className="la-booking-table__meta-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <path d="M3 10.5c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3V20h-2v-3H5v3H3v-9.5zm2 4.5h14v-4.5c0-.6-.4-1-1-1H6c-.6 0-1 .4-1 1V15zm2-8h2v2H7V7zm8 0h2v2h-2V7z" />
                                  </svg>
                                </span>
                                <span>
                                  {typeof listing.beds === "number" || typeof listing.bedrooms === "number"
                                    ? `Beds ${listing.beds ?? listing.bedrooms}`
                                    : "Beds --"}
                                </span>
                              </p>
                              <p className="la-booking-table__address">{formatAddress(listing)}</p>
                              <p className="la-booking-table__summary">
                                {shortDescription || "Signature OneLuxStay residence in Los Angeles."}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="la-booking-table__cell" role="cell">
                          <div className="la-booking-table__guests" aria-label={`Sleeps ${listing.accommodates || "--"}`}>
                            <div className="la-booking-table__guest-icons" aria-hidden="true">
                              {Array.from({ length: Math.min(Number(listing.accommodates) || 1, 5) }).map((_, idx) => (
                                <svg key={`${listingId}-guest-${idx}`} viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                  <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
                                </svg>
                              ))}
                            </div>
                            <span className="sr-only">Sleeps {listing.accommodates || "--"}</span>
                          </div>
                        </div>
                        <div className="la-booking-table__cell" role="cell">
                          <div className="la-booking-table__price">
                            {isLoadingRates ? (
                              <>
                                <strong>Checking rates...</strong>
                                <span>Updating totals</span>
                              </>
                            ) : (
                              <>
                                <strong>{formatCurrency(priceValue, priceCurrency)}</strong>
                                <span>
                                  Total (cleaning + tax included)
                                </span>
                              </>
                            )}
                            <button
                              type="button"
                              className="la-booking-table__breakdown-toggle"
                              aria-expanded={isExpanded}
                              aria-controls={breakdownId}
                              disabled={isLoadingRates}
                              onClick={() =>
                                setExpandedQuoteRows((prev) => ({
                                  ...prev,
                                  [listingId]: !prev[listingId],
                                }))
                              }
                            >
                              {isLoadingRates
                                ? "Price breakdown loading..."
                                : isExpanded
                                  ? "Hide price breakdown"
                                  : "View price breakdown"}
                            </button>
                            {isExpanded && (
                              <div className="la-booking-table__breakdown" role="region" id={breakdownId}>
                                {breakdown ? (
                                  <>
                                    <div>
                                      <span>Accommodation</span>
                                      <strong>{formatCurrency(breakdown.accommodation, priceCurrency)}</strong>
                                    </div>
                                    {breakdown.discountAmount > 0 && (
                                      <div>
                                        <span>
                                          Direct booking discount ({Math.round(breakdown.discountRate * 100)}%)
                                        </span>
                                        <strong>
                                          -{formatCurrency(breakdown.discountAmount, priceCurrency)}
                                        </strong>
                                      </div>
                                    )}
                                    <div>
                                      <span>Cleaning</span>
                                      <strong>{formatCurrency(breakdown.cleaning, priceCurrency)}</strong>
                                    </div>
                                    <div>
                                      <span>Taxes</span>
                                      <strong>{formatCurrency(breakdown.taxes, priceCurrency)}</strong>
                                    </div>
                                    <div>
                                      <span>Fees</span>
                                      <strong>{formatCurrency(breakdown.fees, priceCurrency)}</strong>
                                    </div>
                                    <div className="la-booking-table__total">
                                      <span>Total</span>
                                      <strong>{formatCurrency(breakdown.total, priceCurrency)}</strong>
                                    </div>
                                  </>
                                ) : (
                                  <p>Quote unavailable. Showing base price.</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="la-booking-table__cell" role="cell">
                          <ul className="la-booking-table__choices">
                            {planOptions.length > 0 ? (
                              <li>
                                <label htmlFor={`rate-plan-${listingId}`} className="sr-only">
                                  Select rate plan
                                </label>
                                <select
                                  id={`rate-plan-${listingId}`}
                                  value={selectedPlanId}
                                  disabled={isLoadingRates}
                                  onChange={(e) =>
                                    setSelectedRatePlans((prev) => ({
                                      ...prev,
                                      [listingId]: e.target.value,
                                    }))
                                  }
                                  className="la-booking-table__rate-select"
                                >
                                  {planOptions.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                      {plan.label}
                                    </option>
                                  ))}
                                </select>
                              </li>
                            ) : null}
                            <li>Policies shown at checkout</li>
                          </ul>
                        </div>
                        <div className="la-booking-table__cell" role="cell">
                          <button
                            type="button"
                            className="la-booking-table__cta"
                            disabled={isLoadingRates}
                          >
                            Virtual tour
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeListing && (
        <div className="antwerp-modal__overlay" role="dialog" aria-modal="true">
          <div className="la-unit-modal">
            <div className="la-unit-modal__header">
              <button
                type="button"
                className="la-unit-modal__back"
                onClick={() => {
                  setActiveListing(null);
                  setActiveImageIndex(0);
                }}
              >
                Back to listings
              </button>
              <div className="la-unit-modal__contact" aria-label="Reservation contact">
                <p>For Reservation Contact</p>
                <strong>OneLuxStay Los Angeles</strong>
                <a href="tel:+13105550101">+1 (310) 555-0101</a>
                <a href="mailto:stay@oneluxstay.com">stay@oneluxstay.com</a>
                <a href="mailto:stay@oneluxstay.com" className="la-unit-modal__contact-cta">
                  Message concierge
                </a>
              </div>
            </div>
            <div className="la-unit-modal__intro">
              <div>
                <h3>{sanitizeText(activeListing.title)}</h3>
                <div className="la-unit-modal__chips">
                  <span>Exceptional location</span>
                  <span>Fast arrival</span>
                </div>
                <p className="la-unit-modal__address">{formatAddress(activeListing)}</p>
                {(() => {
                  const { rating, count } = getReviewStats(activeListing.reviews);
                  if (!rating && !count) return null;
                  return (
                    <p className="la-unit-modal__rating">
                      Rating: {rating ? `${rating} / 5` : "—"}{count ? ` (${count} reviews)` : ""}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="la-unit-modal__tabs" role="tablist" aria-label="Listing sections">
              <button type="button" className="is-active">Overview</button>
              <button type="button">Facilities</button>
              <button type="button">Rooms</button>
              <button type="button">Guest reviews</button>
              <button type="button">House rules</button>
            </div>
            {(() => {
              const images = [
                getImageUrl(activeListing.picture),
                ...(Array.isArray(activeListing.pictures)
                  ? activeListing.pictures.map((pic) => getImageUrl(pic))
                  : []),
              ].filter(Boolean);
              const hasImages = images.length > 0;
              const safeIndex = hasImages
                ? Math.min(activeImageIndex, images.length - 1)
                : 0;
              const current = hasImages ? images[safeIndex] : "";
              const sideOne =
                images.length > 1 ? images[(safeIndex + 1) % images.length] : "";
              const sideTwo =
                images.length > 2 ? images[(safeIndex + 2) % images.length] : "";
              const coords = getListingCoords(activeListing);
              const mapUrl =
                coords && mapsApiKey
                  ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=14&size=480x280&maptype=roadmap&markers=color:0x1f1c19|${coords.lat},${coords.lng}&key=${mapsApiKey}`
                  : "";
              const amenityListRaw = Array.isArray(activeListing.amenities)
                ? activeListing.amenities
                : Array.isArray(activeListing.tags)
                  ? activeListing.tags
                  : [];
              const amenityList = [...new Set(amenityListRaw.filter((item) => typeof item === "string"))].slice(0, 10);
              const aboutText = formatFullDescription(activeListing);
              return (
                <div className="la-unit-modal__grid">
                  <div className="la-unit-modal__gallery">
                    <div className="la-unit-modal__main">
                      {current ? (
                        <img src={current} alt={sanitizeText(activeListing.title)} loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    <div className="la-unit-modal__side">
                      {sideOne ? (
                        <img src={sideOne} alt="" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                      {sideTwo ? (
                        <img src={sideTwo} alt="" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    {images.length > 1 && (
                      <div
                        className="la-unit-modal__thumbs"
                        role="list"
                        ref={thumbsRef}
                        onMouseMove={handleThumbsMove}
                        onMouseLeave={stopAutoScroll}
                      >
                        {images.map((src, idx) => (
                          <button
                            key={`${src}-${idx}`}
                            type="button"
                            className={idx === safeIndex ? "is-active" : ""}
                            onClick={() => setActiveImageIndex(idx)}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <img src={src} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="la-unit-modal__sidebar">
                    <div className="la-unit-modal__card">
                      <div className="la-unit-modal__card-head">
                        <strong>{getReviewLabel(activeListing.reviews)}</strong>
                      </div>
                      <p>
                        Guests talk about the view, the stillness between city moments, and how easy it is to settle in.
                      </p>
                    </div>
                    <div className="la-unit-modal__card la-unit-modal__map">
                      {mapUrl ? (
                        <img src={mapUrl} alt="Map showing the unit location" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Map loading</div>
                      )}
                    </div>
                    <div className="la-unit-modal__card la-unit-modal__meta">
                      <div>
                        <span>Base price</span>
                        <strong>{formatCurrency(activeListing.basePrice, activeListing.currency || "USD")}</strong>
                      </div>
                      <div>
                        <span>Cleaning fee</span>
                        <strong>{formatCurrency(activeListing.cleaningFee, activeListing.currency || "USD")}</strong>
                      </div>
                      <div>
                        <span>Sleeps</span>
                        <strong>{activeListing.accommodates || "--"}</strong>
                      </div>
                      <div>
                        <span>Bedrooms</span>
                        <strong>{activeListing.bedrooms || "--"}</strong>
                      </div>
                      <div>
                        <span>Bathrooms</span>
                        <strong>{activeListing.bathrooms || "--"}</strong>
                      </div>
                    </div>
                    <div className="la-unit-modal__actions">
                      <Link to="/stay?city=Los%20Angeles#listings" className="antwerp-card__link">
                        Check live availability
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="la-unit-modal__booking" aria-label="Availability check">
              <div>
                <label htmlFor="la-checkin">Check-in</label>
                <input id="la-checkin" type="text" placeholder="MM/DD/YYYY" />
              </div>
              <div>
                <label htmlFor="la-checkout">Check-out</label>
                <input id="la-checkout" type="text" placeholder="MM/DD/YYYY" />
              </div>
              <div>
                <label htmlFor="la-guests">Guests</label>
                <select id="la-guests" defaultValue="2">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
              <button type="button">Check availability</button>
            </div>
            <div className="la-unit-modal__section">
              <h4>Amenities</h4>
              <div className="la-unit-modal__amenities">
                {(
                  activeAmenityList.length
                    ? activeAmenityList
                    : ["Fast Wi-Fi", "Kitchen", "Washer", "Heating", "Essentials"]
                ).map(
                  (item) => (
                    <span key={item}>{item}</span>
                  )
                )}
              </div>
            </div>
            <div className="la-unit-modal__section">
              <h4>About this property</h4>
              <p>{activeAboutText || "Comfortable, calm, and ready the moment you arrive."}</p>
            </div>
            <div className="la-unit-modal__section">
              <h4>Most popular facilities</h4>
              <div className="la-unit-modal__amenities">
                {(
                  activeAmenityList.slice(0, 6).length
                    ? activeAmenityList.slice(0, 6)
                    : ["Wi-Fi", "Kitchen", "Washer"]
                ).map(
                  (item) => (
                    <span key={`popular-${item}`}>{item}</span>
                  )
                )}
              </div>
            </div>
            <div className="la-unit-modal__section">
              <h4>Room options</h4>
              <div className="la-unit-modal__rooms">
                <div>
                  <strong>{sanitizeText(activeListing.title)}</strong>
                  <p>
                    Bedrooms: {activeListing.bedrooms || "--"} | Bathrooms: {activeListing.bathrooms || "--"} | Sleeps{" "}
                    {activeListing.accommodates || "--"}
                  </p>
                </div>
                <div className="la-unit-modal__room-actions">
                  <button type="button">Virtual tour</button>
                  <Link to="/stay?city=Los%20Angeles#listings" className="antwerp-card__link">
                    Book now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LosAngelesLandingPage;
