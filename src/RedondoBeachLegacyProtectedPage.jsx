import { Helmet } from "react-helmet-async";
import { Navigate, useLocation } from "react-router-dom";
import RedondoBeachLandingPage from "./RedondoBeachLandingPage";

const LEGACY_KEY_PARAM = "key";

const getExpectedLegacyKey = () => String(import.meta.env.VITE_REDONDO_LEGACY_KEY || "").trim();

const hasAuthorizedLegacyKey = (search = "") => {
  const expected = getExpectedLegacyKey();
  if (!expected) return false;
  const params = new URLSearchParams(search || "");
  const provided = String(params.get(LEGACY_KEY_PARAM) || "").trim();
  return provided === expected;
};

export default function RedondoBeachLegacyProtectedPage() {
  const location = useLocation();
  const isAuthorized = hasAuthorizedLegacyKey(location.search);

  if (!isAuthorized) {
    return <Navigate to="/redondo-beach" replace state={{ skipCityLoader: true }} />;
  }

  return (
    <>
      <Helmet>
        <title>Redondo Beach Legacy Experience (Internal) | OneLuxStay</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div
        style={{
          position: "fixed",
          right: 12,
          top: 12,
          zIndex: 40,
          border: "1px solid rgba(171, 141, 111, 0.5)",
          background: "rgba(255, 248, 238, 0.94)",
          color: "#6c4d30",
          borderRadius: 999,
          fontSize: 11,
          lineHeight: 1,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          padding: "7px 10px",
          boxShadow: "0 8px 20px rgba(22, 16, 10, 0.15)",
        }}
      >
        Internal Legacy Experience
      </div>
      <RedondoBeachLandingPage experience="legacy" />
    </>
  );
}
