import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import apiBase from "./utils/apiBase";
import {
  isAdminsOlsSessionExpired,
  loadAdminsOlsSession,
  refreshAdminsOlsSession,
  saveAdminsOlsSession,
} from "./utils/adminsOlsAuth";
import "./AdminsOlsAuthPage.css";

const DEFAULT_FORM = {
  email: "",
  password: "",
};

function AdminsOlsAuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const redirectTarget = params.get("next") || "/admins-ols";
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const previousTitle = document.title;
    document.title = "OneLuxStay Admin Login";

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.adminsOls = "true";
    document.head.appendChild(robotsMeta);

    const reuseSession = async () => {
      const existingSession = loadAdminsOlsSession();
      if (!existingSession?.accessToken && !existingSession?.sharedKey) return;

      if (existingSession?.sharedKey) {
        navigate(redirectTarget, { replace: true });
        return;
      }

      if (!isAdminsOlsSessionExpired(existingSession)) {
        navigate(redirectTarget, { replace: true });
        return;
      }

      const refreshedSession = await refreshAdminsOlsSession(apiBase, existingSession).catch(() => null);
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
      const response = await fetch(`${apiBase}/admins-ols-auth`, {
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
        throw new Error(payload?.error || "Unable to complete admin authentication.");
      }

      saveAdminsOlsSession(payload.session);
      setNotice("Signed in. Redirecting...");
      navigate(redirectTarget, { replace: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to complete admin authentication."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admins-ols-auth-page">
      <div className="admins-ols-auth-shell">
        <section className="admins-ols-auth-panel">
          <div className="admins-ols-auth-copy">
            <p className="admins-ols-auth-eyebrow">OneLuxStay Internal</p>
            <h1>Admin Access</h1>
            <p>
              Sign in with your existing Supabase Authentication user to open the admin
              concierge intelligence panel, review concierge activity, and manage sentiment coaching for the
              AI concierge.
            </p>
            <div className="admins-ols-auth-highlights">
              <div>
                <strong>Supabase-backed login</strong>
                <span>Uses the same Authentication users already configured in your Supabase project.</span>
              </div>
              <div>
                <strong>AI teaching controls</strong>
                <span>Adjust how the concierge responds to frustrated, neutral, or delighted guests.</span>
              </div>
              <div>
                <strong>Protected dashboard</strong>
                <span>Sessions, feedback, assistant turns, and system visibility.</span>
              </div>
            </div>
          </div>

          <div className="admins-ols-auth-card">
            <div className="admins-ols-auth-tabs" role="presentation">
              <button type="button" className="is-active" disabled>
                Supabase Admin Sign In
              </button>
            </div>

            <form className="admins-ols-auth-form" onSubmit={handleSubmit}>
              <label>
                Email address
                <input
                  type="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="admin@oneluxstay.com"
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
                  placeholder="Enter your Supabase password"
                  autoComplete="current-password"
                  required
                />
              </label>

              {error && <div className="admins-ols-auth-error">{error}</div>}
              {notice && <div className="admins-ols-auth-banner">{notice}</div>}

              <button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign In to Admin Panel"}
              </button>
            </form>

            <p className="admins-ols-auth-footnote">
              Use one of the admin users already listed in Supabase Authentication.
            </p>

            <Link className="admins-ols-auth-back" to="/">
              Return to website
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminsOlsAuthPage;
