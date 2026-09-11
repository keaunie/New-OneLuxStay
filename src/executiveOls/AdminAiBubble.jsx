import { useCallback, useEffect, useRef, useState } from "react";
import apiBase from "../utils/apiBase";
import {
  clearExecutiveOlsSession,
  getExecutiveOlsAuthHeaders,
  isExecutiveOlsSessionExpired,
  loadExecutiveOlsSession,
  refreshExecutiveOlsSession,
} from "./utils/executiveOlsAuth";
import "./AdminAiBubble.css";

const BUBBLE_SIZE = 56;
const EDGE_GAP = 12;
const DRAG_THRESHOLD = 6;
const POSITION_STORAGE_KEY = "ols-admin-ai-bubble-position";

const clampPosition = ({ x, y }) => {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(EDGE_GAP, window.innerWidth - BUBBLE_SIZE - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, window.innerHeight - BUBBLE_SIZE - EDGE_GAP);
  return { x: Math.min(Math.max(x, EDGE_GAP), maxX), y: Math.min(Math.max(y, EDGE_GAP), maxY) };
};

const loadStoredPosition = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return clampPosition(parsed);
  } catch {
    // ignore corrupt/blocked storage
  }
  return null;
};

const defaultPosition = () => {
  if (typeof window === "undefined") return { x: EDGE_GAP, y: EDGE_GAP };
  return clampPosition({ x: window.innerWidth - BUBBLE_SIZE - 24, y: window.innerHeight - BUBBLE_SIZE - 100 });
};

// A draggable, always-on-top launcher for the admin AI Assistant — same
// backend as the full /executive-ols/assistant page, just reachable from
// anywhere in the admin area, like iOS AssistiveTouch. Intentionally
// separate from the guest-facing Lucy widget (ChatConcierge).
export default function AdminAiBubble() {
  const [session, setSession] = useState(() => loadExecutiveOlsSession());
  const [position, setPosition] = useState(() => loadStoredPosition() || defaultPosition());
  const [open, setOpen] = useState(false);
  const [propertyOptions, setPropertyOptions] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        "Ask me anything about our properties — amenities, unit counts, current bookings, or Wi-Fi/door codes for a property you select below.",
    },
  ]);

  const dragStateRef = useRef(null);
  const didDragRef = useRef(false);
  const messagesEndRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage?.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      // ignore storage failures
    }
  }, [position]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const ensureSession = useCallback(async () => {
    let current = session || loadExecutiveOlsSession();
    if (!current?.accessToken && !current?.sharedKey) return null;
    if (current?.accessToken && isExecutiveOlsSessionExpired(current)) {
      const refreshed = await refreshExecutiveOlsSession(current).catch(() => null);
      if (!refreshed?.accessToken) {
        clearExecutiveOlsSession();
        setSession(null);
        return null;
      }
      current = refreshed;
      setSession(refreshed);
    }
    return current;
  }, [session]);

  const loadProperties = useCallback(async () => {
    const current = await ensureSession();
    if (!current) return;
    try {
      const response = await fetch(`${apiBase}/executive-ols-assistant?range=this_week`, {
        method: "GET",
        headers: { ...getExecutiveOlsAuthHeaders(current) },
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        setPropertyOptions(Array.isArray(payload?.snapshot?.propertyOptions) ? payload.snapshot.propertyOptions : []);
      }
    } catch {
      // Property list only scopes questions to one listing; safe to skip on failure.
    }
  }, [ensureSession]);

  const togglePanel = () => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setOpen((current) => {
      const next = !current;
      if (next && !propertyOptions.length) loadProperties();
      return next;
    });
  };

  const handlePointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    didDragRef.current = false;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragStateRef.current) return;
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) didDragRef.current = true;
    if (!didDragRef.current) return;
    setPosition(clampPosition({ x: dragStateRef.current.originX + dx, y: dragStateRef.current.originY + dy }));
  };

  const handlePointerUp = (event) => {
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const submitQuery = async (event) => {
    event?.preventDefault?.();
    const prompt = draft.trim();
    // Guard synchronously with a ref, not just the `submitting` state — a
    // fast double-click/double-Enter can fire a second call before the
    // await below yields and React commits the state update, which was
    // sending the same question twice.
    if (!prompt || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      const current = await ensureSession();
      if (!current) {
        setError("Your session has expired. Reload the page and sign in again.");
        return;
      }

      const optimisticMessages = [...messages, { role: "user", content: prompt }];
      setMessages(optimisticMessages);
      setDraft("");

      const response = await fetch(`${apiBase}/executive-ols-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getExecutiveOlsAuthHeaders(current) },
        body: JSON.stringify({
          query: prompt,
          messages: optimisticMessages.slice(-8),
          range: "this_week",
          propertyId,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearExecutiveOlsSession();
          setSession(null);
          return;
        }
        throw new Error(payload?.error || "Executive assistant request failed.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: String(payload?.answer || "No answer returned.") },
      ]);
    } catch (requestError) {
      setError(String(requestError?.message || "Executive assistant request failed."));
      setMessages((current) => current.slice(0, -1));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!session?.accessToken && !session?.sharedKey) return null;

  const panelSide =
    position.x + BUBBLE_SIZE / 2 > (typeof window !== "undefined" ? window.innerWidth / 2 : 0) ? "left" : "right";

  return (
    <>
      <button
        type="button"
        className="admin-ai-bubble"
        style={{ left: position.x, top: position.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={togglePanel}
        aria-label="Open AI Assistant"
        title="AI Assistant — drag to move"
      >
        AI
      </button>
      {open && (
        <div className={`admin-ai-panel is-${panelSide}`} style={{ left: position.x, top: position.y }}>
          <header>
            <strong>AI Assistant</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close AI Assistant">
              ×
            </button>
          </header>
          {propertyOptions.length > 0 && (
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              <option value="">All properties</option>
              {propertyOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
          <div className="admin-ai-panel-messages">
            {messages.map((message, index) => (
              <div key={index} className={`admin-ai-message is-${message.role}`}>
                {message.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {error && <p className="admin-ai-panel-error">{error}</p>}
          <form onSubmit={submitQuery} className="admin-ai-panel-form">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about a property, booking, or access code…"
              disabled={submitting}
            />
            <button type="submit" disabled={submitting || !draft.trim()}>
              {submitting ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
