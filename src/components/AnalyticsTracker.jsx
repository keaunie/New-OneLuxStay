import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../lib/analytics";

export default function AnalyticsTracker() {
  const location = useLocation();
  const fullPath = useMemo(
    () => `${location.pathname || "/"}${location.search || ""}`,
    [location.pathname, location.search],
  );

  useEffect(() => {
    trackPageView(fullPath);
  }, [fullPath]);

  return null;
}

