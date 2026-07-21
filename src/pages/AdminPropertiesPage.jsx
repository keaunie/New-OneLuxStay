import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import PropertyManager from "../components/admin/PropertyManager";
import apiBase from "../utils/apiBase";
import { isAdminsOlsSessionExpired, loadAdminsOlsSession, refreshAdminsOlsSession } from "../utils/adminsOlsAuth";

export default function AdminPropertiesPage() {
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;
    const verify = async () => {
      let current = loadAdminsOlsSession();
      if (current?.accessToken && isAdminsOlsSessionExpired(current)) current = await refreshAdminsOlsSession(apiBase, current).catch(() => null);
      if (!active) return;
      setSession(current);
      setStatus(current?.accessToken || current?.sharedKey ? "allowed" : "unauthenticated");
    };
    verify();
    return () => { active = false; };
  }, []);

  if (status === "checking") return <p style={{ padding: "2rem" }}>Verifying admin access…</p>;
  if (status === "unauthenticated") return <Navigate to={`/executive-ols/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <PropertyManager apiBase={apiBase} session={session} standalone />;
}
