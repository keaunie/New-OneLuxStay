import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import apiBase from "../utils/apiBase";
import {
  clearExecutiveOlsSession,
  getExecutiveOlsAuthHeaders,
  loadExecutiveOlsSession,
} from "./utils/executiveOlsAuth";
import "./ExecutiveOls.css";

const BELGIUM_VOICE_CALL_NUMBER_KEY = "ols-belgium-voice-call-number";
const BELGIUM_COUNTRY_CODE = "+32";
const BELGIUM_TWILIO_NUMBER = "+32460254886";

const sanitizePhoneInput = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return hasPlus ? "+" : "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

const formatDate = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatDateTime = (value = "") => {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const toTimestamp = (value = "") => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isMessagingConversation = (thread = {}) => {
  const pageType = String(thread?.pageType || "").trim().toLowerCase();
  const sessionId = String(thread?.sessionId || "").trim().toLowerCase();
  return (
    pageType === "whatsapp" ||
    pageType === "sms" ||
    sessionId.startsWith("whatsapp:") ||
    sessionId.startsWith("sms:")
  );
};

const getPhoneE164 = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim();
  const lower = sessionId.toLowerCase();
  const prefix = lower.startsWith("sms:") ? "sms:" : lower.startsWith("whatsapp:") ? "whatsapp:" : "";
  if (!prefix) return "";
  const digits = sessionId.slice(prefix.length).replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

const getPhoneLabel = (thread = {}) => {
  const e164 = getPhoneE164(thread);
  if (!e164) return "";
  const digits = e164.slice(1);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
};

const getLatestMessage = (thread = {}) => {
  const msgs = Array.isArray(thread?.messages) ? thread.messages : [];
  return msgs[msgs.length - 1] || null;
};

const getLatestGuestMessage = (thread = {}) => {
  const msgs = Array.isArray(thread?.messages) ? [...thread.messages] : [];
  return msgs.reverse().find((m) => getSenderType(m) === "guest") || null;
};

const getTitle = (thread = {}) => {
  if (isMessagingConversation(thread)) {
    const channel = String(thread?.sessionId || "").toLowerCase().startsWith("sms:") ? "SMS" : "WhatsApp";
    return `${channel} ${getPhoneLabel(thread) || "guest"}`;
  }
  return String(thread?.city || "Guest conversation").trim() || "Guest conversation";
};

const getPreview = (thread = {}) => {
  const content = String(getLatestMessage(thread)?.content || "").trim();
  return content.length > 140 ? `${content.slice(0, 137)}...` : content || "No messages yet.";
};

const getAvatarLabel = (thread = {}) => {
  const phone = getPhoneLabel(thread);
  return phone ? phone.slice(-2) : "BE";
};

const getSenderType = (message = {}) => {
  if (message?.role === "user") return "guest";
  const st = String(message?.metadata?.senderType || "").trim().toLowerCase();
  if (st === "admin") return "admin";
  return "assistant";
};

const getSenderLabel = (message = {}) => {
  const st = getSenderType(message);
  if (st === "guest") return "Guest";
  if (st === "admin") return message?.metadata?.senderName || "OneLuxStay Team";
  return "Lucy";
};

const getSenderAvatarLabel = (message = {}) => {
  const st = getSenderType(message);
  if (st === "guest") return "G";
  if (st === "admin") return "OL";
  return "LU";
};

const getBubbleClass = (message = {}) => {
  if (message?.role === "user") return "executive-ols-thread-bubble--guest";
  return getSenderType(message) === "admin"
    ? "executive-ols-thread-bubble--admin"
    : "executive-ols-thread-bubble--assistant";
};

const injectReply = (threads = [], sessionId = "", message = {}) =>
  (Array.isArray(threads) ? threads : []).map((t) => {
    if (t?.sessionId !== sessionId) return t;
    const existing = Array.isArray(t?.messages) ? t.messages : [];
    const next = [...existing.filter((m) => m?.messageId !== message?.messageId), message].sort(
      (a, b) => toTimestamp(a?.createdAt) - toTimestamp(b?.createdAt),
    );
    return { ...t, lastSeenAt: message?.createdAt || t?.lastSeenAt || "", messageCount: next.length, messages: next };
  });

const polishDraft = (value = "") => {
  const norm = String(value || "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  if (!norm) return "";
  return norm.split("\n").map((line) => {
    const compact = line.replace(/\s+([,!.?])/g, "$1");
    const capped = compact.charAt(0).toUpperCase() + compact.slice(1);
    return /[.!?]$/.test(capped) ? capped : `${capped}.`;
  }).join("\n");
};

const getAssistSummary = (thread = {}, draft = "") => {
  const guestMsg = getLatestGuestMessage(thread);
  const guestText = String(guestMsg?.content || "").trim();
  const polished = polishDraft(draft);
  const lower = guestText.toLowerCase();
  let guidance = "Answer clearly, confirm the main request, and end with one helpful next step.";
  if (/\b(available|availability|dates|check[- ]?in|check[- ]?out)\b/.test(lower)) {
    guidance = "Confirm the exact dates and guest count, then answer availability simply and directly.";
  } else if (/\b(price|pricing|rate|cost)\b/.test(lower)) {
    guidance = "Acknowledge the request, then share the rate or ask for stay details to quote it.";
  } else if (/\b(status|reservation|booking code|confirmation)\b/.test(lower)) {
    guidance = "Confirm the booking reference before giving a status update.";
  } else if (/\b(problem|issue|complaint|bad|broken|late|dirty)\b/.test(lower)) {
    guidance = "Lead with empathy, apologize briefly, and offer the next action right away.";
  }
  return {
    guestSummary: guestText || "No recent guest message selected.",
    guidance,
    polished,
    hasPolishChanges: polished && polished !== String(draft || "").trim(),
  };
};

const getNotifSignature = (thread = {}) => {
  const sessionId = String(thread?.sessionId || "").trim();
  if (!sessionId) return "";
  return `${sessionId}:${String(thread?.lastSeenAt || "")}:${Number(thread?.messageCount || 0)}`;
};

const loadStoredCallNumber = () => {
  if (typeof window === "undefined") return "";
  try {
    const stored = sanitizePhoneInput(window.localStorage?.getItem(BELGIUM_VOICE_CALL_NUMBER_KEY) || "");
    return /^\+\d{7,}$/.test(stored) ? stored : "";
  } catch {
    return "";
  }
};

const Icon = ({ name = "chat", className = "" }) => {
  const p = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  if (name === "send") return <svg {...p}><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4 18-7Z" /></svg>;
  if (name === "spark") return <svg {...p}><path d="M12 3v5" /><path d="M12 16v5" /><path d="M4.9 4.9l3.5 3.5" /><path d="m15.6 15.6 3.5 3.5" /><path d="M3 12h5" /><path d="M16 12h5" /><path d="m4.9 19.1 3.5-3.5" /><path d="m15.6 8.4 3.5-3.5" /></svg>;
  if (name === "clock") return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.8v4.6l3.2 1.9" /></svg>;
  if (name === "phone") return <svg {...p}><path d="M20 16.2v2.6a1.8 1.8 0 0 1-2 1.8A17.8 17.8 0 0 1 3.4 6a1.8 1.8 0 0 1 1.8-2H7.8a1.8 1.8 0 0 1 1.8 1.5l.5 3a1.8 1.8 0 0 1-.5 1.6l-1.3 1.3a14.5 14.5 0 0 0 4.3 4.3l1.3-1.3a1.8 1.8 0 0 1 1.6-.5l3 .5a1.8 1.8 0 0 1 1.5 1.8Z" /></svg>;
  if (name === "search") return <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
  if (name === "erase") return <svg {...p}><path d="m9 4 9 9" /><path d="M5.6 13.4 12 7l4.6 4.6-6.4 6.4a2 2 0 0 1-2.8 0l-1.8-1.8a2 2 0 0 1 0-2.8Z" /><path d="M14 19h6" /></svg>;
  if (name === "check-double") return <svg {...p}><path d="m6.5 12.5 2.2 2.2 4.3-4.3" /><path d="m11 12.5 2.2 2.2 4.3-4.3" /></svg>;
  if (name === "menu") return <svg {...p}><path d="M5 7h14" /><path d="M5 12h14" /><path d="M5 17h14" /></svg>;
  if (name === "smile") return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" /></svg>;
  if (name === "attach") return <svg {...p}><path d="m14.5 7.5-5.8 5.8a3 3 0 1 0 4.2 4.2l7.1-7.1a4.5 4.5 0 0 0-6.4-6.4l-7.4 7.4a6 6 0 0 0 8.5 8.5l5.1-5.1" /></svg>;
  return <svg {...p}><path d="M7 18.5 3.5 21V6.8A2.8 2.8 0 0 1 6.3 4h11.4a2.8 2.8 0 0 1 2.8 2.8v8.4a2.8 2.8 0 0 1-2.8 2.8H7Z" /><path d="M8.5 9.5h7" /><path d="M8.5 13h4.5" /></svg>;
};

function BelgiumPhonePage() {
  const [session, setSession] = useState(() => loadExecutiveOlsSession());
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState({});
  const [callNumber, setCallNumber] = useState(() => loadStoredCallNumber());
  const [newPhone, setNewPhone] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [sendingNew, setSendingNew] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistSuggestions, setAssistSuggestions] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [callLog, setCallLog] = useState([]);
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported",
  );

  const audioRef = useRef(null);
  const audioPrimedRef = useRef(false);
  const hydratedRef = useRef(false);
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    const prev = document.title;
    document.title = "Belgium Number — OneLuxStay";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    meta.dataset.belgiumPage = "true";
    document.head.appendChild(meta);
    return () => { document.title = prev; meta.remove(); };
  }, []);

  useEffect(() => {
    try {
      const norm = sanitizePhoneInput(callNumber);
      if (/^\+\d{7,}$/.test(norm)) {
        window.localStorage?.setItem(BELGIUM_VOICE_CALL_NUMBER_KEY, norm);
      } else {
        window.localStorage?.removeItem(BELGIUM_VOICE_CALL_NUMBER_KEY);
      }
    } catch { /* ignore */ }
  }, [callNumber]);

  useEffect(() => {
    if (!threads.length) { setSelectedId(""); return; }
    if (!selectedId || !threads.some((t) => t?.sessionId === selectedId)) {
      setSelectedId(String(threads[0]?.sessionId || ""));
    }
  }, [selectedId, threads]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => setNotifPerm("Notification" in window ? window.Notification.permission : "unsupported");
    update();
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const prime = async () => {
      if (audioPrimedRef.current) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        if (!audioRef.current) audioRef.current = new AC();
        if (audioRef.current?.state === "suspended") await audioRef.current.resume();
        audioPrimedRef.current = true;
      } catch { /* ignore */ }
    };
    window.addEventListener("pointerdown", prime, { passive: true });
    window.addEventListener("keydown", prime);
    return () => { window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return undefined;
    let active = true;

    const load = async ({ silent = false } = {}) => {
      if (!silent) { setLoading(true); setError(""); }
      try {
        const res = await fetch(`${apiBase}/admins-ols`, {
          method: "GET",
          headers: { ...getExecutiveOlsAuthHeaders(session) },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) { clearExecutiveOlsSession(); setSession(null); return; }
          throw new Error(payload?.error || "Unable to load conversations.");
        }
        if (!active) return;
        const next = Array.isArray(payload?.recentConversations)
          ? payload.recentConversations.filter(isMessagingConversation)
          : [];
        setThreads(next);
      } catch (err) {
        if (!active || silent) return;
        setError(String(err?.message || "Unable to load conversations."));
      } finally {
        if (active && !silent) setLoading(false);
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load({ silent: true }).catch(() => null);
    }, 6000);

    return () => { active = false; window.clearInterval(intervalId); };
  }, [session]);

  useEffect(() => {
    if (!threads.length) { hydratedRef.current = true; return; }
    const sigs = threads.map(getNotifSignature).filter(Boolean);
    if (!hydratedRef.current) {
      sigs.forEach((s) => notifiedRef.current.add(s));
      hydratedRef.current = true;
      return;
    }
    const newGuest = threads.filter((t) => {
      const sig = getNotifSignature(t);
      if (!sig || notifiedRef.current.has(sig)) return false;
      return getLatestMessage(t)?.role === "user";
    });
    sigs.forEach((s) => notifiedRef.current.add(s));
    if (!newGuest.length) return;

    const newest = [...newGuest].sort((a, b) => toTimestamp(b?.lastSeenAt) - toTimestamp(a?.lastSeenAt))[0];
    const latest = getLatestMessage(newest);

    const playAlert = async () => {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        if (!audioRef.current) audioRef.current = new AC();
        const ctx = audioRef.current;
        if (ctx.state === "suspended") await ctx.resume();
        const t = ctx.currentTime + 0.02;
        [0, 0.24].forEach((off) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(off === 0 ? 988 : 1318, t + off);
          gain.gain.setValueAtTime(0.0001, t + off);
          gain.gain.exponentialRampToValueAtTime(0.08, t + off + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.2);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t + off); osc.stop(t + off + 0.22);
        });
      } catch { /* ignore */ }
    };

    const showNotif = () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (window.Notification.permission !== "granted") return;
      if (!document.hidden && document.hasFocus?.()) return;
      try {
        const n = new window.Notification("New Message — Belgium", {
          body: `${getTitle(newest)}: ${String(latest?.content || "").trim() || "New guest message"}`,
          tag: getNotifSignature(newest),
          renotify: true,
          requireInteraction: true,
        });
        n.onclick = () => { window.focus?.(); setSelectedId(newest.sessionId); n.close(); };
      } catch { /* ignore */ }
    };

    void playAlert();
    showNotif();
  }, [threads]);

  const handleLogout = () => { clearExecutiveOlsSession(); setSession(null); };

  const handleEnableAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError("Browser notifications are not supported.");
      return;
    }
    try {
      const perm = await window.Notification.requestPermission();
      setNotifPerm(perm);
      if (perm === "granted") setNotice("Alerts enabled.");
      else if (perm === "denied") setError("Notifications blocked. Enable them in browser settings.");
    } catch { setError("Unable to enable notifications."); }
  };

  const handleSendReply = async (event) => {
    event.preventDefault();
    if (!selectedId || !session?.accessToken) return;
    const thread = threads.find((t) => t?.sessionId === selectedId);
    const content = String(drafts[selectedId] || "").trim();
    if (!thread || !content) return;

    setSendingReply(true); setError(""); setNotice("");
    try {
      const res = await fetch(`${apiBase}/admins-ols`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getExecutiveOlsAuthHeaders(session) },
        body: JSON.stringify({
          action: "send_reply",
          sessionId: thread.sessionId,
          content,
          pageContext: { pageType: thread.pageType, city: thread.city, listingId: thread.listingId, pathname: thread.pathname },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { clearExecutiveOlsSession(); setSession(null); return; }
        throw new Error(payload?.error || "Unable to send reply.");
      }
      if (payload?.message?.messageId) {
        setThreads((curr) => injectReply(curr, thread.sessionId, payload.message));
      }
      setDrafts((curr) => ({ ...curr, [selectedId]: "" }));
      setNotice("Reply sent.");
    } catch (err) {
      setError(String(err?.message || "Unable to send reply."));
    } finally {
      setSendingReply(false);
    }
  };

  const handleStartConversation = async (event) => {
    event.preventDefault();
    if (!session?.accessToken) return;
    const phone = sanitizePhoneInput(newPhone);
    const message = String(newMsg || "").trim();
    if (!phone || !message) return;

    setSendingNew(true); setError(""); setNotice("");
    try {
      const res = await fetch(`${apiBase}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getExecutiveOlsAuthHeaders(session) },
        body: JSON.stringify({ phone_number: phone, message, channel: "sms", from: BELGIUM_TWILIO_NUMBER }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { clearExecutiveOlsSession(); setSession(null); return; }
        throw new Error(payload?.error || "Unable to send SMS.");
      }
      const inboxRes = await fetch(`${apiBase}/admins-ols`, { method: "GET", headers: { ...getExecutiveOlsAuthHeaders(session) } });
      const inboxPayload = await inboxRes.json().catch(() => ({}));
      const next = Array.isArray(inboxPayload?.recentConversations)
        ? inboxPayload.recentConversations.filter(isMessagingConversation)
        : [];
      setThreads(next);
      if (payload?.session_id) setSelectedId(String(payload.session_id));
      setNewPhone(""); setNewMsg("");
      setNotice("SMS sent and conversation started.");
    } catch (err) {
      setError(String(err?.message || "Unable to send SMS."));
    } finally {
      setSendingNew(false);
    }
  };

  const handleStartVoiceCall = async () => {
    if (!session?.accessToken || !selectedThread) return;
    const agentPhone = sanitizePhoneInput(callNumber);
    if (!agentPhone.startsWith("+") || agentPhone.replace(/[^\d]/g, "").length < 7) {
      setError("Enter your callback number in E.164 format (e.g. +32474123456) before calling.");
      setNotice("");
      return;
    }

    setStartingCall(true); setError(""); setNotice("");
    try {
      const res = await fetch(`${apiBase}/admins-ols`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getExecutiveOlsAuthHeaders(session) },
        body: JSON.stringify({ action: "start_voice_call", sessionId: selectedThread.sessionId, agentPhoneNumber: agentPhone }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { clearExecutiveOlsSession(); setSession(null); return; }
        throw new Error(payload?.error || "Unable to start voice call.");
      }
      setCallLog((curr) => [{
        id: `call-${Date.now()}`,
        guestPhone: getPhoneE164(selectedThread),
        guestTitle: getTitle(selectedThread),
        agentPhone,
        startedAt: new Date().toISOString(),
      }, ...curr]);
      setNotice(`Twilio is calling ${agentPhone} now. Once you answer, it will connect you to ${getTitle(selectedThread)}.`);
    } catch (err) {
      setError(String(err?.message || "Unable to start voice call."));
    } finally {
      setStartingCall(false);
    }
  };

  const handleGetAssist = async () => {
    if (!selectedThread || !session?.accessToken || assistLoading) return;
    const guestMsg = getLatestGuestMessage(selectedThread);
    if (!guestMsg?.content) return;

    setAssistLoading(true); setError("");
    try {
      const recentMsgs = (Array.isArray(selectedThread.messages) ? selectedThread.messages : [])
        .slice(-8)
        .map((m) => ({ role: getSenderType(m) === "guest" ? "user" : "assistant", content: String(m.content || "") }));
      const res = await fetch(`${apiBase}/executive-ols-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getExecutiveOlsAuthHeaders(session) },
        body: JSON.stringify({
          query: `Draft a brief, professional text message reply as the OneLuxStay team to the guest's latest message: "${guestMsg.content}". Keep it 1-3 sentences, warm and direct, end with one clear next step. Reply with the message text only, no labels or quotes.`,
          messages: recentMsgs,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) { clearExecutiveOlsSession(); setSession(null); return; }
        throw new Error(payload?.error || "Unable to generate suggestion.");
      }
      const suggestion = String(payload?.answer || "").trim();
      if (suggestion && selectedId) {
        setAssistSuggestions((curr) => ({ ...curr, [selectedId]: suggestion }));
      }
    } catch (err) {
      setError(String(err?.message || "Unable to generate suggestion."));
    } finally {
      setAssistLoading(false);
    }
  };

  if (!session?.accessToken) return <Navigate to="/executive-ols/login" replace />;

  const belgiumThreads = threads.filter((t) => getPhoneE164(t).startsWith(BELGIUM_COUNTRY_CODE));
  const displayed = showAll ? threads : belgiumThreads;
  const normSearch = search.trim().toLowerCase();
  const filtered = normSearch
    ? displayed.filter((t) =>
        [getTitle(t), getPreview(t), getPhoneLabel(t), t?.sessionId].join(" ").toLowerCase().includes(normSearch),
      )
    : displayed;
  const countLabel = normSearch
    ? `${filtered.length} of ${displayed.length} chats`
    : `${displayed.length} active chat${displayed.length !== 1 ? "s" : ""}`;
  const selectedThread = threads.find((t) => t?.sessionId === selectedId) || null;
  const draft = selectedId ? String(drafts[selectedId] || "") : "";
  const assist = getAssistSummary(selectedThread, draft);
  const aiSuggestion = selectedId ? String(assistSuggestions[selectedId] || "") : "";
  const hasUsable = !!aiSuggestion && aiSuggestion !== draft.trim();
  const replyPreview = aiSuggestion || assist.polished;
  const showUse = hasUsable || assist.hasPolishChanges;
  const guestE164 = getPhoneE164(selectedThread);

  return (
    <div className="executive-ols-page">
      <div className="executive-ols-shell is-whatsapp">
        <div className="executive-ols-layout is-whatsapp">
          <aside className="executive-ols-sidebar" aria-label="Belgium number navigation">
            <div className="executive-ols-brand-card">
              <p className="executive-ols-eyebrow">OneLuxStay</p>
              <h1>Belgium Number</h1>
            </div>

            <div className="executive-ols-side-card">
              <p className="executive-ols-side-label">Navigate</p>
              <div className="executive-ols-side-actions">
                <Link to="/executive-ols" className="executive-ols-inline-link is-button">Executive Dashboard</Link>
                <Link to="/executive-ols/whatsapp" className="executive-ols-inline-link is-button">WhatsApp Inbox</Link>
              </div>
            </div>

            <div className="executive-ols-side-card">
              <p className="executive-ols-side-label">Session</p>
              <strong>{session?.user?.fullName || session?.user?.email || "Executive"}</strong>
              <span>{session?.user?.email || "Authenticated access"}</span>
              <div className="executive-ols-side-actions" style={{ marginTop: "0.7rem" }}>
                <button
                  type="button"
                  className={`executive-ols-ghost-btn executive-ols-alert-toggle${notifPerm === "granted" ? " is-enabled" : ""}`}
                  onClick={handleEnableAlerts}
                  disabled={notifPerm === "unsupported"}
                >
                  {notifPerm === "granted" ? "Alerts On" : notifPerm === "denied" ? "Alerts Blocked" : "Enable Alerts"}
                </button>
                <button type="button" className="executive-ols-ghost-btn" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            </div>

            {callLog.length > 0 && (
              <div className="executive-ols-side-card">
                <p className="executive-ols-side-label">Call log</p>
                <div className="executive-ols-stack">
                  {callLog.map((entry) => (
                    <article key={entry.id} className="executive-ols-context-item">
                      <strong style={{ fontSize: "0.84rem" }}>{entry.guestTitle || entry.guestPhone}</strong>
                      <span style={{ fontSize: "0.78rem" }}>Called to: {entry.agentPhone}</span>
                      <span style={{ fontSize: "0.76rem", color: "#9a7a55" }}>{formatDateTime(entry.startedAt)}</span>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <main className="executive-ols-main is-whatsapp">
            <nav className="executive-ols-nav">
              <Link to="/executive-ols" className="executive-ols-nav-item">Executive</Link>
              <Link to="/executive-ols/whatsapp" className="executive-ols-nav-item">WhatsApp</Link>
              <span className="executive-ols-nav-item is-active">Belgium</span>
            </nav>

            {error && <div className="executive-ols-alert is-error">{error}</div>}
            {notice && !error && <div className="executive-ols-alert">{notice}</div>}

            <div className="executive-ols-content-grid is-single-panel">
              <section className="executive-ols-chat-card is-whatsapp">
                <div className="executive-ols-card-head">
                  <div>
                    <p className="executive-ols-eyebrow">Belgium — +32 460 254 886</p>
                    <div className="executive-ols-whatsapp-title-row">
                      <span className="executive-ols-icon-badge">
                        <Icon name="phone" className="executive-ols-inline-icon" />
                      </span>
                      <div>
                        <h3>Belgium Number</h3>
                        <p>Belgium SMS line · +32 460 254 886 · Antwerp guest conversations, calls, and SMS.</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.55rem", alignItems: "center", flexShrink: 0 }}>
                    <button
                      type="button"
                      className={`executive-ols-nav-item${!showAll ? " is-active" : ""}`}
                      onClick={() => setShowAll(false)}
                    >
                      Belgium (+32)
                    </button>
                    <button
                      type="button"
                      className={`executive-ols-nav-item${showAll ? " is-active" : ""}`}
                      onClick={() => setShowAll(true)}
                    >
                      All numbers
                    </button>
                  </div>
                </div>

                <div className="executive-ols-whatsapp-inbox">
                  <div className="executive-ols-whatsapp-sessions-wrap">
                    <div className="executive-ols-whatsapp-panel-topbar">
                      <div>
                        <strong>Conversations</strong>
                        <span>{countLabel}</span>
                      </div>
                      <span className="executive-ols-whatsapp-meta-pill">
                        <Icon name="spark" className="executive-ols-inline-icon" />
                        Live
                      </span>
                    </div>
                    <div className="executive-ols-whatsapp-panel-tools">
                      <label className="executive-ols-whatsapp-search" aria-label="Search conversations">
                        <Icon name="search" className="executive-ols-inline-icon" />
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search guest, number, or message"
                        />
                      </label>
                    </div>

                    <div className="executive-ols-whatsapp-sessions" role="list" aria-label="Conversations">
                      {loading && !threads.length && (
                        <p className="executive-ols-empty">Loading conversations...</p>
                      )}

                      {!loading && filtered.map((thread) => (
                        <button
                          key={thread.sessionId}
                          type="button"
                          className={`executive-ols-whatsapp-session${thread.sessionId === selectedId ? " is-active" : ""}`}
                          onClick={() => setSelectedId(thread.sessionId)}
                        >
                          <div className="executive-ols-whatsapp-session-avatar">
                            <span>{getAvatarLabel(thread)}</span>
                            <Icon name="phone" className="executive-ols-inline-icon" />
                          </div>
                          <div className="executive-ols-whatsapp-session-body">
                            <div className="executive-ols-whatsapp-session-head">
                              <div className="executive-ols-whatsapp-session-title">
                                <strong>{getTitle(thread)}</strong>
                                {thread.sessionId === selectedId && (
                                  <span className="executive-ols-whatsapp-session-status">Open</span>
                                )}
                              </div>
                              <small>
                                <Icon name="clock" className="executive-ols-inline-icon" />
                                {formatDate(thread.lastSeenAt)}
                              </small>
                            </div>
                            <div className="executive-ols-whatsapp-session-sub">
                              <span className="executive-ols-whatsapp-contact-pill">
                                <Icon name="phone" className="executive-ols-inline-icon" />
                                {getPhoneLabel(thread) || "Guest"}
                              </span>
                              <span className="executive-ols-whatsapp-counter">{thread.messageCount || 0}</span>
                            </div>
                            <p>{getPreview(thread)}</p>
                          </div>
                        </button>
                      ))}

                      {!loading && !displayed.length && (
                        <div className="executive-ols-whatsapp-empty">
                          <p className="executive-ols-empty">
                            {showAll ? "No conversations yet." : "No Belgium (+32) conversations yet."}
                          </p>
                          <small>
                            {showAll
                              ? "Start an SMS conversation below."
                              : "Switch to \"All numbers\" or send the first SMS to a Belgium number below."}
                          </small>
                        </div>
                      )}

                      {!loading && !!displayed.length && !filtered.length && (
                        <div className="executive-ols-whatsapp-empty">
                          <p className="executive-ols-empty">No chats match that search.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="executive-ols-whatsapp-thread-panel">
                    {selectedThread ? (
                      <>
                        <div className="executive-ols-whatsapp-thread-head">
                          <div className="executive-ols-whatsapp-thread-identity">
                            <div className="executive-ols-whatsapp-thread-avatar">
                              <span>{getAvatarLabel(selectedThread)}</span>
                              <Icon name="chat" className="executive-ols-inline-icon" />
                            </div>
                            <div>
                              <p className="executive-ols-eyebrow">Conversation</p>
                              <h3>{getTitle(selectedThread)}</h3>
                            </div>
                          </div>
                          <div className="executive-ols-whatsapp-thread-toolbar" aria-hidden="true">
                            <span className="executive-ols-whatsapp-action-chip">
                              <Icon name="phone" className="executive-ols-inline-icon" />
                            </span>
                            <span className="executive-ols-whatsapp-action-chip">
                              <Icon name="search" className="executive-ols-inline-icon" />
                            </span>
                            <span className="executive-ols-whatsapp-action-chip">
                              <Icon name="menu" className="executive-ols-inline-icon" />
                            </span>
                          </div>
                        </div>

                        <div className="executive-ols-hero-meta executive-ols-whatsapp-thread-meta">
                          <span className="executive-ols-whatsapp-meta-pill">
                            <Icon name="phone" className="executive-ols-inline-icon" />
                            {getPhoneLabel(selectedThread) || "Guest"}
                          </span>
                          <span className="executive-ols-whatsapp-meta-pill">
                            <Icon name="spark" className="executive-ols-inline-icon" />
                            {String(selectedThread?.sessionId || "").toLowerCase().startsWith("sms:") ? "Twilio SMS" : "Twilio WhatsApp"}
                          </span>
                          <span className="executive-ols-whatsapp-meta-pill">
                            <Icon name="clock" className="executive-ols-inline-icon" />
                            {formatDateTime(selectedThread.lastSeenAt)}
                          </span>
                        </div>

                        <div className="executive-ols-whatsapp-callbar">
                          <label className="executive-ols-whatsapp-call-input">
                            <span>Call me on</span>
                            <input
                              type="tel"
                              value={callNumber}
                              onChange={(e) => setCallNumber(sanitizePhoneInput(e.target.value))}
                              placeholder="+32474123456"
                            />
                          </label>
                          <div className="executive-ols-whatsapp-call-actions">
                            {guestE164 && (
                              <a className="executive-ols-ghost-btn executive-ols-whatsapp-call-link" href={`tel:${guestE164}`}>
                                <Icon name="phone" className="executive-ols-inline-icon" />
                                Open dialer
                              </a>
                            )}
                            <button
                              type="button"
                              className="executive-ols-primary-btn"
                              onClick={handleStartVoiceCall}
                              disabled={startingCall || !guestE164 || !/^\+\d{7,}$/.test(sanitizePhoneInput(callNumber))}
                            >
                              <Icon name="phone" className="executive-ols-inline-icon" />
                              {startingCall ? "Calling..." : "Call guest"}
                            </button>
                          </div>
                        </div>

                        <div className="executive-ols-whatsapp-thread" aria-live="polite">
                          {(Array.isArray(selectedThread.messages) ? selectedThread.messages : []).map((message) => {
                            const isTeam = getSenderType(message) !== "guest";
                            return (
                              <article
                                key={`${selectedThread.sessionId}-${message.messageId}`}
                                className={`executive-ols-thread-bubble ${getBubbleClass(message)}`}
                              >
                                <div className="executive-ols-thread-bubble-meta">
                                  <span className="executive-ols-thread-bubble-avatar">
                                    {getSenderAvatarLabel(message)}
                                  </span>
                                  <span className="executive-ols-message-role">{getSenderLabel(message)}</span>
                                </div>
                                <div className="executive-ols-thread-bubble-body">
                                  <p>{message.content || "No message content."}</p>
                                </div>
                                <div className="executive-ols-thread-bubble-foot">
                                  <small>{formatDateTime(message.createdAt)}</small>
                                  {isTeam && (
                                    <span className="executive-ols-thread-delivery">
                                      <Icon name="check-double" className="executive-ols-inline-icon" />
                                      Sent
                                    </span>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>

                        <form className="executive-ols-composer executive-ols-whatsapp-compose-shell" onSubmit={handleSendReply}>
                          <div className="executive-ols-whatsapp-assist">
                            <div className="executive-ols-whatsapp-assist-head">
                              <button
                                type="button"
                                className="executive-ols-whatsapp-meta-pill executive-ols-reply-assist-btn"
                                onClick={handleGetAssist}
                                disabled={
                                  assistLoading ||
                                  sendingReply ||
                                  !assist.guestSummary ||
                                  assist.guestSummary === "No recent guest message selected."
                                }
                              >
                                <Icon name="spark" className={`executive-ols-inline-icon${assistLoading ? " is-spinning" : ""}`} />
                                {assistLoading ? "Generating..." : "Reply assist"}
                              </button>
                              {showUse && (
                                <button
                                  type="button"
                                  className="executive-ols-ghost-btn"
                                  onClick={() => setDrafts((curr) => ({ ...curr, [selectedId]: replyPreview }))}
                                  disabled={sendingReply}
                                >
                                  {aiSuggestion ? "Use AI reply" : "Use polished reply"}
                                </button>
                              )}
                            </div>
                            <div className="executive-ols-whatsapp-assist-grid">
                              <article className="executive-ols-whatsapp-assist-card">
                                <span>Guest said</span>
                                <p>{assist.guestSummary}</p>
                              </article>
                              <article className="executive-ols-whatsapp-assist-card">
                                <span>Suggested direction</span>
                                <p>{assist.guidance}</p>
                              </article>
                              <article className="executive-ols-whatsapp-assist-card is-preview">
                                <span>{aiSuggestion ? "AI reply suggestion" : "Polished preview"}</span>
                                <p>
                                  {replyPreview ||
                                    (assistLoading
                                      ? "Generating..."
                                      : "Click \"Reply assist\" to generate a suggestion.")}
                                </p>
                              </article>
                            </div>
                          </div>

                          <div className="executive-ols-whatsapp-compose-head">
                            <div>
                              <span className="executive-ols-whatsapp-meta-pill">
                                <Icon name="chat" className="executive-ols-inline-icon" />
                                Reply as OneLuxStay
                              </span>
                              <p className="executive-ols-whatsapp-compose-copy">
                                Keep it warm, crisp, and easy for the guest to act on.
                              </p>
                            </div>
                            <div className="executive-ols-whatsapp-compose-tools" aria-hidden="true">
                              <span className="executive-ols-whatsapp-action-chip">
                                <Icon name="smile" className="executive-ols-inline-icon" />
                              </span>
                              <span className="executive-ols-whatsapp-action-chip">
                                <Icon name="attach" className="executive-ols-inline-icon" />
                              </span>
                            </div>
                          </div>

                          <div className="executive-ols-whatsapp-compose-input">
                            <textarea
                              value={draft}
                              onChange={(e) => setDrafts((curr) => ({ ...curr, [selectedId]: e.target.value }))}
                              rows={4}
                              placeholder="Reply to this guest as the OneLuxStay team..."
                              disabled={sendingReply}
                            />
                          </div>

                          <div className="executive-ols-composer-actions">
                            <button
                              type="button"
                              className="executive-ols-ghost-btn"
                              onClick={() => setDrafts((curr) => ({ ...curr, [selectedId]: "" }))}
                              disabled={sendingReply}
                            >
                              <Icon name="erase" className="executive-ols-inline-icon" />
                              Clear draft
                            </button>
                            <button
                              type="submit"
                              className="executive-ols-primary-btn"
                              disabled={sendingReply || !draft.trim()}
                            >
                              <Icon name="send" className="executive-ols-inline-icon" />
                              {sendingReply ? "Sending..." : "Send reply"}
                            </button>
                          </div>
                        </form>
                      </>
                    ) : (
                      <div className="executive-ols-whatsapp-empty is-thread">
                        <div className="executive-ols-whatsapp-start">
                          <div>
                            <p className="executive-ols-eyebrow">Start conversation</p>
                            <h3>Send the first SMS message</h3>
                            <p className="executive-ols-whatsapp-start-copy">
                              Use a real guest phone number in E.164 format. For Belgium guests use +32 followed by the local number (e.g. +32474123456).
                            </p>
                          </div>

                          <form
                            className="executive-ols-composer executive-ols-whatsapp-compose-shell"
                            onSubmit={handleStartConversation}
                          >
                            <label className="executive-ols-field">
                              <span>Guest phone number</span>
                              <input
                                type="tel"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                                placeholder="+32474123456"
                                disabled={sendingNew}
                              />
                            </label>
                            <textarea
                              value={newMsg}
                              onChange={(e) => setNewMsg(e.target.value)}
                              rows={4}
                              placeholder="Write the first SMS message..."
                              disabled={sendingNew}
                            />
                            <div className="executive-ols-composer-actions">
                              <button
                                type="button"
                                className="executive-ols-ghost-btn"
                                onClick={() => setNewMsg("Hi, this is Lucy from OneLuxStay. How can I help you today?")}
                                disabled={sendingNew}
                              >
                                Use welcome message
                              </button>
                              <button
                                type="submit"
                                className="executive-ols-primary-btn"
                                disabled={sendingNew || !newPhone.trim() || !newMsg.trim()}
                              >
                                {sendingNew ? "Sending..." : "Start SMS chat"}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default BelgiumPhonePage;
