import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";

const apiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions/index";
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const LOGO_URL = "https://oneluxstay.netlify.app/image/ols-logo.png";
const PROPERTY_ADDRESS = "Hollywood Blvd, Los Angeles, CA";
const PROPERTY_COORDS = { lat: 34.1016, lng: -118.3269 };
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
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : "--";

const KNOWN_CITIES = ["los angeles", "la", "los-angeles", "hollywood", "west hollywood"];

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
  if (parts.length) return parts.join(", ");
  if (typeof listing.location === "string") return listing.location;
  return "Los Angeles";
};

const formatDescription = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return value.summary || value.description || value.text || "";
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


const getFirstSentence = (text) => {
  if (!text) return "";
  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text.split("\n")[0].trim();
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
  const autoScrollRef = useRef(null);
  const thumbsRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapsApiRef = useRef(null);
  const listingMarkersRef = useRef([]);
  const listingInfoRef = useRef(null);
  const mapLoadedRef = useRef(false);

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
    }
  }, [activeSectionKey]);

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

            if (losAngelesListings.length) {
              syncListingMarkers();
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

  const syncListingMarkers = () => {
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
    losAngelesListings.forEach((listing) => {
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
    }
  };

  useEffect(() => {
    syncListingMarkers();
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
        .map((listing) => ({
          id: listing.id || listing._id,
          unitTypeId: listing.unitTypeId,
        }))
        .filter((item) => item.id);
      const checks = await Promise.all(
        items.map(async ({ id, unitTypeId }) => {
          const qs = new URLSearchParams({
            startDate: sectionCheckIn,
            endDate: sectionCheckOut,
            minOccupancy: sectionGuests || "1",
          });
          if (unitTypeId) qs.set("unitTypeId", unitTypeId);
          const res = await fetch(`${apiBase}/api/listings/${id}/availability?${qs.toString()}`, {
            cache: "no-store",
          });
          if (!res.ok) return { id, available: false };
          const json = await res.json();
          return { id, available: Boolean(json?.isAvailable) };
        })
      );
      const availableIds = new Set(checks.filter((item) => item.available).map((item) => item.id));
      const availableListings = activeSection.listings.filter((listing) =>
        availableIds.has(listing.id || listing._id)
      );
      setSectionAvailability(availableListings);
      setSectionAvailabilityActive(true);
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
        <section className="antwerp-section" aria-label="Map of nearby landmarks and transport">
          <div className="antwerp-section__head">
            <div>
              <p className="antwerp-kicker">Neighborhood map</p>
              <h2>Walkable highlights in Los Angeles</h2>
              <p className="antwerp-muted">
                See nearby landmarks and public transport around Hollywood Blvd.
              </p>
            </div>
          </div>
          <div
            ref={mapRef}
            aria-label="Google map showing Hollywood Blvd with nearby landmarks and public transport"
            style={{
              width: "100%",
              height: "420px",
              borderRadius: "20px",
              border: "1px solid rgba(201, 181, 156, 0.6)",
              overflow: "hidden",
              background: "rgba(249, 248, 246, 0.8)",
            }}
          />
        </section>

        <section className="antwerp-section" id="los-angeles-units">
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
                      From {groupStats.baseRange} {groupStats.currency}
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
                      onClick={() => setActiveSectionKey(group.key)}
                    >
                      View units in {group.label}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
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
                      {images[0] ? (
                        <img src={images[0]} alt={`${activeSection.label} featured`} loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    <div className="la-section-hero__side">
                      {[images[1], images[2]].map((src, idx) =>
                        src ? (
                          <img key={`side-${idx}`} src={src} alt="" loading="lazy" />
                        ) : (
                          <div key={`side-${idx}`} className="la-unit-modal__placeholder">
                            Image loading
                          </div>
                        )
                      )}
                    </div>
                    {images.length > 3 && (
                      <div className="la-section-hero__thumbs" role="list">
                        {images.map((src, idx) => (
                          <button key={`${src}-${idx}`} type="button">
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
                      <a href="tel:+13105550101">+1 (310) 555-0101</a>
                      <a href="mailto:stay@oneluxstay.com">stay@oneluxstay.com</a>
                      <a href="mailto:stay@oneluxstay.com" className="la-unit-modal__contact-cta">
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
            <div className="la-booking-list">
              {(sectionAvailabilityActive ? sectionAvailability : activeSection.listings).length === 0 ? (
                <div className="la-section-hero__notice">
                  No units are available for the selected dates. Try a different range.
                </div>
              ) : (
                (sectionAvailabilityActive ? sectionAvailability : activeSection.listings).map((listing) => {
                  const listingId = listing.id || listing._id;
                  const image = getImageUrl(listing.picture) || getImageUrl(listing.pictures?.[0]);
                  const listingCurrency = listing.currency || "USD";
                  const tagList = Array.isArray(listing.tags) ? listing.tags.slice(0, 6) : [];
                  const fullDescription = formatFullDescription(listing);
                  const shortDescription = getFirstSentence(fullDescription);
                  return (
                    <article key={listingId} className="la-booking-card">
                    <div className="la-booking-card__media">
                      {image ? (
                        <img src={image} alt={listing.title} loading="lazy" />
                      ) : (
                        <div className="antwerp-card__placeholder">No image</div>
                      )}
                    </div>
                    <div className="la-booking-card__body">
                      <div>
                        <p className="la-booking-card__eyebrow">
                          {listing.propertyType || listing.roomType || "Residence"}
                        </p>
                        <h4>{listing.title}</h4>
                        <span className="la-booking-card__address">{formatAddress(listing)}</span>
                        <p className="la-booking-card__summary">
                          {shortDescription || "Signature OneLuxStay residence in Los Angeles."}
                        </p>
                        <div className="la-booking-card__meta">
                          <span>Sleeps {listing.accommodates || "--"}</span>
                          <span>{listing.bedrooms || "--"} BR</span>
                          <span>{listing.bathrooms || "--"} BA</span>
                          <span>{getReviewLabel(listing.reviews)}</span>
                        </div>
                        <div className="la-booking-card__tags">
                          {tagList.length ? tagList.join(", ") : "OneLuxStay Select"}
                        </div>
                      </div>
                      <div className="la-booking-card__aside">
                        <div>
                          <p>Base</p>
                          <strong>{formatCurrency(listing.basePrice, listingCurrency)}</strong>
                        </div>
                        <div>
                          <p>Cleaning</p>
                          <strong>{formatCurrency(listing.cleaningFee, listingCurrency)}</strong>
                        </div>
                        <button
                          type="button"
                          className="antwerp-card__ghost"
                          onClick={() => setActiveListing(listing)}
                        >
                          View full details
                        </button>
                      </div>
                    </div>
                    </article>
                  );
                })
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
                <h3>{activeListing.title}</h3>
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
              const safeIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0));
              const current = images[safeIndex];
              const sideOne = images[(safeIndex + 1) % images.length];
              const sideTwo = images[(safeIndex + 2) % images.length];
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
                        <img src={current} alt={activeListing.title} loading="lazy" />
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
                {(amenityList.length ? amenityList : ["Fast Wi-Fi", "Kitchen", "Washer", "Heating", "Essentials"]).map(
                  (item) => (
                    <span key={item}>{item}</span>
                  )
                )}
              </div>
            </div>
            <div className="la-unit-modal__section">
              <h4>About this property</h4>
              <p>{aboutText || "Comfortable, calm, and ready the moment you arrive."}</p>
            </div>
            <div className="la-unit-modal__section">
              <h4>Most popular facilities</h4>
              <div className="la-unit-modal__amenities">
                {(amenityList.slice(0, 6).length ? amenityList.slice(0, 6) : ["Wi-Fi", "Kitchen", "Washer"]).map(
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
                  <strong>{activeListing.title}</strong>
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



