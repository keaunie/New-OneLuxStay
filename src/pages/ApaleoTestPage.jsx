import { useEffect, useMemo, useState } from "react";
import {
  fetchApaleoTokenMeta,
  fetchApaleoAccount,
  fetchApaleoProperties,
  fetchApaleoUnitGroups,
  fetchApaleoAvailability,
} from "../services/apaleoService";
import "./ApaleoTestPage.css";

const toDate = (value = "") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const plusDays = (start, days = 1) => {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatJson = (value) => JSON.stringify(value ?? null, null, 2);

const firstText = (...values) => {
  for (const value of values) {
    const safe = String(value || "").trim();
    if (safe) return safe;
  }
  return "";
};

const statusClass = (ok, hasValue = true) => {
  if (ok && hasValue) return "ok";
  if (ok && !hasValue) return "warn";
  return "err";
};

function ApaleoTestPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tokenMeta, setTokenMeta] = useState(null);
  const [accountPayload, setAccountPayload] = useState(null);
  const [propertiesPayload, setPropertiesPayload] = useState(null);
  const [unitGroupsPayload, setUnitGroupsPayload] = useState(null);
  const [availabilityPayload, setAvailabilityPayload] = useState(null);
  const [endpointStatus, setEndpointStatus] = useState([]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      setError("");

      const statuses = [];
      const today = toDate(new Date());
      const fallbackCheckIn = plusDays(today, 7);
      const fallbackCheckOut = plusDays(today, 9);

      const timed = async (label, fn) => {
        const startedAt = performance.now();
        try {
          const payload = await fn();
          const durationMs = Math.round(performance.now() - startedAt);
          statuses.push({
            label,
            ok: true,
            durationMs,
            message: "ok",
            statusCode: payload?._meta?.statusCode || 200,
          });
          console.info(`[apaleo-test] ${label} success`, { durationMs, payload });
          return payload;
        } catch (err) {
          const durationMs = Math.round(performance.now() - startedAt);
          statuses.push({
            label,
            ok: false,
            durationMs,
            message: err?.message || String(err),
            statusCode: 0,
          });
          console.error(`[apaleo-test] ${label} failed`, {
            durationMs,
            message: err?.message || String(err),
          });
          throw err;
        }
      };

      try {
        const token = await timed("Token status", () => fetchApaleoTokenMeta());
        if (!active) return;
        setTokenMeta(token);

        const account = await timed("Account", () => fetchApaleoAccount());
        if (!active) return;
        setAccountPayload(account);

        const properties = await timed("Properties", () => fetchApaleoProperties({ city: "Antwerp", limit: 20 }));
        if (!active) return;
        setPropertiesPayload(properties);

        const firstPropertyId = firstText(
          properties?.results?.[0]?.id,
          properties?.results?.[0]?.propertyId,
          properties?.results?.[0]?.raw?.id,
        );

        const unitGroups = await timed("Unit groups", () =>
          fetchApaleoUnitGroups({
            city: "Antwerp",
            ...(firstPropertyId ? { propertyId: firstPropertyId } : {}),
            limit: 100,
          }),
        );
        if (!active) return;
        setUnitGroupsPayload(unitGroups);

        const availabilityPropertyId = firstText(
          firstPropertyId,
          unitGroups?.results?.[0]?.propertyId,
          unitGroups?.results?.[0]?.raw?.propertyId,
          unitGroups?.results?.[0]?.id,
        );

        if (availabilityPropertyId) {
          const availability = await timed("Availability", () =>
            fetchApaleoAvailability({
              city: "Antwerp",
              propertyId: availabilityPropertyId,
              checkIn: fallbackCheckIn,
              checkOut: fallbackCheckOut,
              guests: 2,
            }),
          );
          if (!active) return;
          setAvailabilityPayload(availability);
        } else {
          statuses.push({
            label: "Availability",
            ok: true,
            durationMs: 0,
            message: "Skipped: no property id available",
            statusCode: 204,
          });
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Unable to load Apaleo test data.");
      } finally {
        if (active) {
          setEndpointStatus(statuses);
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      active = false;
    };
  }, []);

  const providerBadge = useMemo(() => {
    const hasToken = Boolean(tokenMeta?.hasToken);
    const cls = statusClass(Boolean(tokenMeta?.ok !== false), hasToken);
    return { label: `Provider: Apaleo`, cls };
  }, [tokenMeta]);

  return (
    <main className="apaleo-test-page">
      <div className="apaleo-test-shell">
        <header className="apaleo-test-header">
          <span className="apaleo-test-kicker">Sandbox • Antwerp Only</span>
          <h1 className="apaleo-test-title">Apaleo Antwerp Test Environment</h1>
          <p className="apaleo-test-subtitle">
            Read-only integration sandbox. No reservations are created or modified on this page.
          </p>
          <div className="apaleo-status-row" style={{ marginTop: 12 }}>
            <span className={`apaleo-badge ${providerBadge.cls}`}>{providerBadge.label}</span>
            <span className={`apaleo-badge ${statusClass(!loading && !error)}`}>
              {loading ? "Loading..." : error ? "Connection issue" : "Connected"}
            </span>
            {tokenMeta?.tokenSource && <span className="apaleo-badge">Token: {tokenMeta.tokenSource}</span>}
          </div>
          {error && <p style={{ marginTop: 12, color: "#8f2525" }}>{error}</p>}
        </header>

        <section className="apaleo-test-grid">
          <article className="apaleo-card apaleo-col-4">
            <h2>Connection Status</h2>
            <ul className="apaleo-meta-list">
              <li>Read-only mode: enabled</li>
              <li>Target city: Antwerp</li>
              <li>Token available: {tokenMeta?.hasToken ? "Yes" : "No"}</li>
              <li>Account ID: {accountPayload?.account?.id || "Not available"}</li>
            </ul>
          </article>

          <article className="apaleo-card apaleo-col-8">
            <h2>Endpoint Inspector</h2>
            <ul className="apaleo-endpoint-list">
              {endpointStatus.map((item) => (
                <li key={item.label} className="apaleo-endpoint-item">
                  <div className="apaleo-endpoint-top">
                    <strong>{item.label}</strong>
                    <span className={`apaleo-badge ${item.ok ? "ok" : "err"}`}>{item.ok ? "Success" : "Failed"}</span>
                  </div>
                  <div className="apaleo-endpoint-meta">
                    status: {item.statusCode || "n/a"} • {item.durationMs}ms • {item.message}
                  </div>
                </li>
              ))}
              {!endpointStatus.length && <li className="apaleo-empty">Waiting for endpoint checks...</li>}
            </ul>
          </article>

          <article className="apaleo-card apaleo-col-6">
            <h3>Properties</h3>
            <div className="apaleo-section-list">
              {(propertiesPayload?.results || []).map((property) => (
                <details className="apaleo-entry" key={property.id}>
                  <summary>
                    <span>{property.title || property.id}</span>
                    <span className="apaleo-badge">Apaleo</span>
                  </summary>
                  <div className="apaleo-entry-body">
                    <p><strong>ID:</strong> {property.id}</p>
                    <p><strong>City:</strong> {property.city || "Unknown"}</p>
                    <p><strong>Address:</strong> {property.address || "N/A"}</p>
                    <pre className="apaleo-json">{formatJson(property.raw)}</pre>
                  </div>
                </details>
              ))}
              {!loading && !(propertiesPayload?.results || []).length && <p className="apaleo-empty">No properties returned.</p>}
            </div>
          </article>

          <article className="apaleo-card apaleo-col-6">
            <h3>Unit Groups & Inventory</h3>
            <div className="apaleo-section-list">
              {(unitGroupsPayload?.results || []).map((unitGroup) => (
                <details className="apaleo-entry" key={unitGroup.id}>
                  <summary>
                    <span>{unitGroup.name || unitGroup.id}</span>
                    <span className="apaleo-badge">{unitGroup.maxOccupancy || 0} guests</span>
                  </summary>
                  <div className="apaleo-entry-body">
                    <p><strong>Unit Group ID:</strong> {unitGroup.id}</p>
                    <p><strong>Property ID:</strong> {unitGroup.propertyId || "N/A"}</p>
                    <p><strong>Description:</strong> {unitGroup.description || "N/A"}</p>
                    <p><strong>Unit IDs:</strong> {(unitGroup.unitIds || []).join(", ") || "N/A"}</p>
                    <pre className="apaleo-json">{formatJson(unitGroup.raw)}</pre>
                  </div>
                </details>
              ))}
              {!loading && !(unitGroupsPayload?.results || []).length && <p className="apaleo-empty">No unit groups returned.</p>}
            </div>
          </article>

          <article className="apaleo-card apaleo-col-12">
            <h3>Availability</h3>
            <div className="apaleo-section-list">
              {(availabilityPayload?.results || []).map((entry, idx) => (
                <details className="apaleo-entry" key={`${entry.propertyId || "property"}-${idx}`}>
                  <summary>
                    <span>{entry.propertyId || "Unknown property"}</span>
                    <span className={`apaleo-badge ${entry.available ? "ok" : "warn"}`}>
                      {entry.available ? "Available" : "Unavailable"}
                    </span>
                  </summary>
                  <div className="apaleo-entry-body">
                    <p><strong>Price:</strong> {entry.price} {entry.currency || ""}</p>
                    <p><strong>Provider:</strong> {entry.provider}</p>
                    <pre className="apaleo-json">{formatJson(entry.raw)}</pre>
                  </div>
                </details>
              ))}
              {!loading && !(availabilityPayload?.results || []).length && (
                <p className="apaleo-empty">
                  {availabilityPayload?.noDataMessage || "No availability data returned from sandbox."}
                </p>
              )}
            </div>
          </article>

          <article className="apaleo-card apaleo-col-12">
            <h3>Raw API Debug Preview</h3>
            <details className="apaleo-entry" open>
              <summary>Token / Account / Properties / Unit Groups / Availability</summary>
              <div className="apaleo-entry-body">
                <pre className="apaleo-json">
                  {formatJson({
                    tokenMeta,
                    accountPayload,
                    propertiesPayload,
                    unitGroupsPayload,
                    availabilityPayload,
                  })}
                </pre>
              </div>
            </details>
          </article>
        </section>
      </div>
    </main>
  );
}

export default ApaleoTestPage;
