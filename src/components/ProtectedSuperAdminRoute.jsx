import { Navigate, useLocation } from "react-router-dom";
import {
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
} from "../utils/adminsOlsAuth";
import { useEffect, useState } from "react";
import apiBase from "../utils/apiBase";

const isSuperAdminSession = (session = null) => Boolean(session?.user?.isSuperAdmin === true);

function ProtectedSuperAdminRoute({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    const verify = async () => {
      const current = loadAdminsOlsSession();
      if (!current?.accessToken && !current?.sharedKey) {
        if (active) setStatus("unauthenticated");
        return;
      }

      if (current?.accessToken && isAdminsOlsSessionExpired(current)) {
        const refreshed = await refreshAdminsOlsSession(apiBase, current).catch(() => null);
        if (!active) return;
        setStatus(isSuperAdminSession(refreshed) ? "allowed" : refreshed ? "forbidden" : "unauthenticated");
        return;
      }

      if (!active) return;
      setStatus(isSuperAdminSession(current) ? "allowed" : "forbidden");
    };

    verify();
    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") return null;

  if (status === "unauthenticated") {
    return (
      <Navigate
        to={`/executive-ols/login?next=${encodeURIComponent(location.pathname + (location.search || ""))}`}
        replace
      />
    );
  }

  if (status === "forbidden") {
    return <Navigate to="/executive-ols" replace />;
  }

  return children;
}

export default ProtectedSuperAdminRoute;

