import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import apiBase from "../utils/apiBase";
import {
  isExecutiveOlsSessionExpired,
  loadExecutiveOlsSession,
  refreshExecutiveOlsSession,
  saveExecutiveOlsSession,
} from "./utils/executiveOlsAuth";
import "./ExecutiveOls.css";

const DEFAULT_FORM = {
  email: "",
  password: "",
};

function ExecutiveOlsAuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const redirectTarget = params.get("next") || "/executive-ols";
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const previousTitle = document.title;
    document.title = "OneLuxStay Executive Login";

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.executiveOls = "true";
    document.head.appendChild(robotsMeta);

    const reuseSession = async () => {
      const existingSession = loadExecutiveOlsSession();
      if (!existingSession?.accessToken) return;

      if (!isExecutiveOlsSessionExpired(existingSession)) {
        navigate(redirectTarget, { replace: true });
        return;
      }

      const refreshedSession = await refreshExecutiveOlsSession(existingSession).catch(() => null);
      if (!active || !refreshedSession?.accessToken) return;
      navigate(redirectTarget, { replace: true });
    };

    reuseSession();

    return () => {
      active = false;
      document.title = previousTitle;
      robotsMeta.remove();
    };
  }, [navigate, redirectTarget]);

  const handleChange = (field) => (event) => {
    const nextValue = event.target.value;
    setForm((current) => ({ ...current, [field]: nextValue }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${apiBase}/executive-ols-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "sign_in",
          email: form.email,
          password: form.password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.session) {
        throw new Error(payload?.error || "Unable to complete executive authentication.");
      }

      saveExecutiveOlsSession(payload.session);
      setNotice("Signed in. Redirecting...");
      navigate(redirectTarget, { replace: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to complete executive authentication."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="executive-ols-auth-page">
      <div className="executive-ols-auth-shell">
        <section className="executive-ols-auth-panel">
          <div className="executive-ols-auth-copy">
            <p className="executive-ols-eyebrow">OneLuxStay Executive</p>
            <h1>Executive Admin Login</h1>
            <p>
              Open the executive control room to review live Guesty-backed business context and ask the assistant
              direct questions about reservations, listings, and operational issues.
            </p>
            <div className="executive-ols-auth-highlights">
              <div>
                <strong>Separate executive access</strong>
                <span>A dedicated login and dashboard path for leadership workflows.</span>
              </div>
              <div>
                <strong>Guesty-connected assistant</strong>
                <span>Ask for revenue, booking, listing, and property context in plain language.</span>
              </div>
              <div>
                <strong>Private by default</strong>
                <span>This executive area is marked noindex and uses authenticated server requests.</span>
              </div>
            </div>
          </div>

          <div className="executive-ols-auth-card">
            <form className="executive-ols-auth-form" onSubmit={handleSubmit}>
              <label>
                Executive email
                <input
                  type="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="executive@oneluxstay.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={form.password}
                  onChange={handleChange("password")}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </label>

              {error && <div className="executive-ols-auth-error">{error}</div>}
              {notice && <div className="executive-ols-auth-banner">{notice}</div>}

              <button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Open Executive Dashboard"}
              </button>
            </form>

            <p className="executive-ols-auth-footnote">
              Use an executive admin account already provisioned in Supabase Authentication.
            </p>

            <Link className="executive-ols-auth-back" to="/">
              Return to website
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ExecutiveOlsAuthPage;
