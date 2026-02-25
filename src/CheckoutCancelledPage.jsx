import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import "./App.css";

const isSafeInternalPath = (value = "") =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//");

const normalizeGuests = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return String(Math.max(1, Math.round(parsed)));
};

const cityRouteFromValue = (value = "") => {
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("los angeles") || normalized.includes("hollywood")) return "/losangeles";
  if (normalized.includes("antwerp") || normalized.includes("antwerpen")) return "/antwerp";
  if (normalized.includes("miami")) return "/miami";
  if (normalized.includes("redondo")) return "/redondo-beach";
  if (normalized.includes("dubai")) return "/dubai";
  return "";
};

const inferCityFromPath = (path = "") => {
  const normalized = String(path).toLowerCase();
  if (normalized.startsWith("/los-angeles") || normalized.startsWith("/losangeles")) return "Los Angeles";
  if (normalized.startsWith("/antwerp") || normalized.startsWith("/antwerpen")) return "Antwerp";
  if (normalized.startsWith("/miami") || normalized.startsWith("/miami-beach")) return "Miami";
  if (normalized.startsWith("/redondo") || normalized.startsWith("/redondo-beach")) return "Redondo Beach";
  if (normalized.startsWith("/dubai")) return "Dubai";
  return "";
};

const normalizeReturnTo = (value = "") => {
  if (!isSafeInternalPath(value)) return "";
  try {
    const parsed = new URL(value, "https://oneluxstay.local");
    if (!isSafeInternalPath(parsed.pathname)) return "";
    const nextParams = new URLSearchParams(parsed.search || "");
    nextParams.delete("checkout");
    const nextQuery = nextParams.toString();
    return `${parsed.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
  } catch {
    return "";
  }
};

const buildFallbackReturnTo = ({ city, checkIn, checkOut, guests }) => {
  const route = cityRouteFromValue(city) || "/listings";
  const params = new URLSearchParams();
  if (city && route === "/listings") params.set("city", city);
  if (checkIn) params.set("checkIn", checkIn);
  if (checkOut) params.set("checkOut", checkOut);
  if (guests) {
    params.set("guests", guests);
    params.set("adults", guests);
  }
  const query = params.toString();
  return `${route}${query ? `?${query}` : ""}`;
};

const CheckoutCancelledPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const checkIn = params.get("checkIn") || "";
  const checkOut = params.get("checkOut") || "";
  const guests = normalizeGuests(params.get("guests") || "");
  const cityParam = params.get("city") || params.get("destination") || "";
  const safeReturnTo = normalizeReturnTo(params.get("returnTo") || "");
  const returnTo = safeReturnTo || buildFallbackReturnTo({ city: cityParam, checkIn, checkOut, guests });
  const cityLabel = cityParam || inferCityFromPath(returnTo);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [navigate, returnTo]);

  return (
    <div className="ack-page">
      <div className="ack-card">
        <header className="ack-card__header">
          <p className="ack-card__kicker">OneLuxStay</p>
          <h1>Checkout Cancelled</h1>
          <p className="ack-card__sub">
            Your payment was cancelled and no charge was made. You can continue where you left off.
          </p>
        </header>

        <div className="ack-details">
          <p>Saved booking details</p>
          <ul>
            {cityLabel && <li>City: {cityLabel}</li>}
            {checkIn && <li>Check-in: {checkIn}</li>}
            {checkOut && <li>Check-out: {checkOut}</li>}
            {guests && <li>Guests: {guests}</li>}
          </ul>
        </div>

        <div className="ack-success">
          <p>Redirecting you back in a few seconds.</p>
          <Link to={returnTo} replace>
            Go back now
          </Link>
        </div>
      </div>
    </div>
  );
};

export default CheckoutCancelledPage;
