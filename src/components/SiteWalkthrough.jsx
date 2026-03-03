import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import FeatureWalkthrough from "./FeatureWalkthrough";

const CITY_PATH_PREFIXES = [
  "/antwerp",
  "/antwerpen",
  "/los-angeles",
  "/losangeles",
  "/miami",
  "/miami-beach",
  "/redondo",
  "/redondo-beach",
  "/dubai",
];

const HOME_COMMON_STEPS = [
  {
    title: "Booking island",
    description: "This is where you can search your next luxury stays around the world.",
    selectors: ["[data-tour-target='booking-island']", ".landing-hero-form", ".ols-booking-card"],
  },
  {
    title: "Choose your destination",
    description: "Pick a city quickly with the shortcuts or destination selector before you search.",
    selectors: ["[data-tour-target='destination-shortcuts']", ".landing-chip-row", ".ols-booking-field--destination"],
  },
  {
    title: "Offers and promos",
    description: "Swipe through current offers to unlock discounts for weekly, monthly, and early bookings.",
    selectors: ["[data-tour-target='offers']", "#offers .landing-offers-row", "#offers .landing-offers-inner"],
  },
  {
    title: "Signature stays",
    description: "Explore curated destinations here and open the homes that match your travel style.",
    selectors: ["[data-tour-target='collection']", "#collection .landing-destination-panel", "#collection"],
  },
];

const HOME_FEATURED_STEP = {
  title: "Featured units",
  description: "These are featured stays. Drag, scroll, or tap a card to jump straight into a specific listing.",
  selectors: [
    "[data-tour-target='featured-units']",
    ".landing-circular-gallery--hero",
    ".landing-circular-gallery__loading",
  ],
};

const CITY_ROOT_STEPS = [
  {
    title: "City collection",
    description: "This hero section introduces the destination and featured homes in this city.",
    selectors: [".antwerp-hero", ".la-listing-hero", ".la-section-hero"],
  },
  {
    title: "Explore units",
    description: "Use these quick actions to jump into tours or go straight to available buildings.",
    selectors: [".antwerp-hero__actions", ".antwerp-ghost", ".antwerp-cta", ".la-hero-swap-controls"],
  },
  {
    title: "Available buildings",
    description: "This section shows live building collections and available listings for this city.",
    selectors: [".la-units-layout", ".antwerp-section", ".antwerp-building"],
  },
  {
    title: "Neighborhood map",
    description: "This is where guests can see the location and nearby landmarks around it.",
    selectors: [".la-units-map-card", ".la-units-map", ".la-units-map--placeholder"],
  },
];

const CITY_DETAIL_STEPS = [
  {
    title: "Set your stay details",
    description: "Choose check-in, check-out, and guests here, then check availability.",
    selectors: ["#la-rooms", ".la-unit-modal__booking", ".la-section-hero__aside"],
  },
  {
    title: "Compare and reserve",
    description: "Browse available stays, compare prices, and reserve the best option for your trip.",
    selectors: [".la-booking-table", ".la-booking-table__head", ".la-section-hero"],
  },
];

const isCityPath = (pathname) =>
  CITY_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const isCityRootPath = (pathname) =>
  CITY_PATH_PREFIXES.some((prefix) => pathname === prefix);

function SiteWalkthrough() {
  const location = useLocation();
  const route = (location.pathname || "").toLowerCase();
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mobileQuery = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsMobileViewport(mobileQuery.matches);
    sync();
    mobileQuery.addEventListener?.("change", sync);
    return () => mobileQuery.removeEventListener?.("change", sync);
  }, []);

  const config = useMemo(() => {
    if (route === "/") {
      const homeSteps = isMobileViewport
        ? HOME_COMMON_STEPS
        : [HOME_COMMON_STEPS[0], HOME_FEATURED_STEP, ...HOME_COMMON_STEPS.slice(1)];
      return {
        key: isMobileViewport ? "home_mobile_v1" : "home_desktop_v1",
        steps: homeSteps,
      };
    }

    if (isCityPath(route) && !route.includes("/listing/")) {
      if (isCityRootPath(route)) {
        return {
          key: "city_root_v2",
          steps: CITY_ROOT_STEPS,
        };
      }
      return {
        key: "city_detail_v1",
        steps: CITY_DETAIL_STEPS,
      };
    }

    return null;
  }, [isMobileViewport, route]);

  if (!config?.steps?.length) return null;

  return (
    <FeatureWalkthrough
      steps={config.steps}
      storageKey={`ols_guest_walkthrough_seen_${config.key}`}
    />
  );
}

export default SiteWalkthrough;
