import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import apiBase from "./utils/apiBase";
import { saveAdminsOlsSession } from "./utils/adminsOlsAuth";
import "./AdminsOlsAuthPage.css";

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const parseParams = (value = "") => {
  const cleaned = String(value || "").replace(/^[#?]+/, "");
  try {
    return new URLSearchParams(cleaned);
  } catch {
    return new URLSearchParams();
  }
};

function AdminsOlsInviteAcceptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = useMemo(() => parseParams(location.search), [location.search]);
  const hashParams = useMemo(() => parseParams(location.hash), [location.hash]);

  const accessToken = sanitizeString(hashParams.get("access_token") || queryParams.get("access_token") || "", 4000);
  const refreshToken = sanitizeString(hashParams.get("refresh_token") || queryParams.get("refresh_token") || "", 4000);
  const inviteType = sanitizeString(hashParams.get("type") || queryParams.get("type") || "", 80).toLowerCase();
  const inviteError = sanitizeString(hashParams.get("error") || queryParams.get("error") || "", 120);
  const inviteErrorCode = sanitizeString(hashParams.get("error_code") || queryParams.get("error_code") || "", 120);
  const inviteErrorDescription = sanitizeString(
    hashParams.get("error_description") || queryParams.get("error_description") || "",
    500,
  );

  const [form, setForm] = useState(() => ({
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Accept Executive Invite";

    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = "noindex,nofollow,noarchive";
    robotsMeta.dataset.adminsOls = "true";
    document.head.appendChild(robotsMeta);

    // Remove tokens from the address bar once we’ve captured them.
    try {
      if (window?.history?.replaceState) {
        window.history.replaceState({}, document.title, `${location.pathname}${location.search}`);
      }
    } catch {
      // ignore history errors
    }

    return () => {
      document.title = previousTitle;
      robotsMeta.remove();
    };
  }, [location.pathname, location.search]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      if (!accessToken) {
        throw new Error("Missing invite token. Please open the invite email link again.");
      }
      if (inviteType && inviteType !== "invite") {
        // Supabase uses type=invite for invited users.
        throw new Error("This link does not look like an admin invite link.");
      }

      const firstName = String(form.firstName || "").trim();
      const lastName = String(form.lastName || "").trim();
      if (!firstName || !lastName) {
        throw new Error("Please enter your first name and last name.");
      }
      const fullName = `${firstName} ${lastName}`.trim();

      const password = String(form.password || "");
      const confirmPassword = String(form.confirmPassword || "");
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirmPassword) throw new Error("Password and confirmation do not match.");

      const response = await fetch(`${apiBase}/admins-ols-auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "accept_invite",
          accessToken,
          refreshToken,
          fullName,
          password,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.session?.accessToken) {
        throw new Error(payload?.error || "Unable to accept invite.");
      }

      saveAdminsOlsSession(payload.session);
      setNotice("Invite accepted. Redirecting to the admin panel...");
      navigate("/executive-ols", { replace: true });
    } catch (requestError) {
      setError(String(requestError?.message || "Unable to accept invite."));
    } finally {
      setLoading(false);
    }
  };

  const hasTokens = Boolean(accessToken);
  const hasInviteError = Boolean(inviteError || inviteErrorCode || inviteErrorDescription);

  return (
    <div className="admins-ols-auth-page">
      <div className="admins-ols-auth-shell">
        <section className="admins-ols-auth-panel">
          <div className="admins-ols-auth-copy">
            <div>
              <p className="admins-ols-auth-eyebrow">OneLuxStay Executive</p>
              <h1>Set Your Admin Password</h1>
              <p>
                You were invited to access the Concierge Intelligence Panel. Create a password below, then you can sign
                in anytime from <strong>/executive-ols/login</strong>.
              </p>
            </div>
            <div className="admins-ols-auth-highlights">
              <div>
                <strong>Secure access</strong>
                <span>Your invite link is one-time and will be marked as accepted after you set a password.</span>
              </div>
              <div>
                <strong>Admin tools</strong>
                <span>Review conversations, teach the AI sentiment coaching, and respond to guests as an admin.</span>
              </div>
              <div>
                <strong>Need help?</strong>
                <span>If this link is expired, ask a superadmin to re-send your invite.</span>
              </div>
            </div>
          </div>

          <div className="admins-ols-auth-card">
            <div className="admins-ols-auth-tabs" role="presentation">
              <button type="button" className="is-active" disabled>
                Accept Admin Invite
              </button>
            </div>

            {hasInviteError ? (
              <>
                <div className="admins-ols-auth-error">
                  {inviteErrorCode === "otp_expired"
                    ? "This invite link has expired. Ask a superadmin to resend your invite."
                    : "This invite link could not be verified."}
                  {inviteErrorDescription ? <div style={{ marginTop: "0.5rem" }}>{inviteErrorDescription}</div> : null}
                </div>
                <Link className="admins-ols-auth-back" to="/executive-ols/login">
                  Go to admin login
                </Link>
              </>
            ) : !hasTokens ? (
              <>
                <div className="admins-ols-auth-error">
                  Missing invite token. Please open the invite email link again.
                </div>
                <Link className="admins-ols-auth-back" to="/executive-ols/login">
                  Go to admin login
                </Link>
              </>
            ) : (
              <form className="admins-ols-auth-form" onSubmit={handleSubmit}>
                <label>
                  First name
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={handleChange("firstName")}
                    placeholder="First name"
                    autoComplete="given-name"
                    required
                    disabled={loading}
                  />
                </label>

                <label>
                  Last name
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={handleChange("lastName")}
                    placeholder="Last name"
                    autoComplete="family-name"
                    required
                    disabled={loading}
                  />
                </label>

                <label>
                  New password
                  <input
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                </label>

                <label>
                  Confirm password
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                </label>

                {error && <div className="admins-ols-auth-error">{error}</div>}
                {notice && <div className="admins-ols-auth-banner">{notice}</div>}

                <button type="submit" disabled={loading}>
                  {loading ? "Setting password..." : "Set Password and Continue"}
                </button>
              </form>
            )}

            <p className="admins-ols-auth-footnote">
              Already accepted your invite? <Link to="/executive-ols/login">Sign in here</Link>.
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

export default AdminsOlsInviteAcceptPage;
