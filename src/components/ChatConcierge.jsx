import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import apiBase from "../utils/apiBase";

const STORAGE_KEY = "ols-chat-concierge-v1";
const SESSION_ID_KEY = "ols-chat-concierge-session-v1";
const FEEDBACK_KEY = "ols-chat-concierge-feedback-v1";
const MAX_VISIBLE_MESSAGES = 12;

const DEFAULT_SUGGESTIONS = [
  "Can you help me choose a property?",
  "Check availability for 2026-04-15 to 2026-04-20 for 2 guests",
  "Check my booking status (I have my reservation code)",
];

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const createLocalId = (prefix = "msg") =>
  `${sanitizeId(prefix, 16) || "msg"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const createSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return sanitizeId(crypto.randomUUID(), 80) || createLocalId("session");
  }
  return createLocalId("session");
};

const getOrCreateSessionId = () => {
  if (typeof window === "undefined") return createSessionId();
  try {
    const existing = sanitizeId(window.sessionStorage.getItem(SESSION_ID_KEY) || "", 80);
    if (existing) return existing;
    const next = createSessionId();
    window.sessionStorage.setItem(SESSION_ID_KEY, next);
    return next;
  } catch {
    return createSessionId();
  }
};

const resetSessionId = () => {
  const next = createSessionId();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(SESSION_ID_KEY, next);
    } catch {
      // ignore storage errors
    }
  }
  return next;
};

const isSafeHttpUrl = (value = "") => {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const renderMessageContent = (value = "") => {
  const text = String(value || "");
  const lines = text.split("\n");

  return lines.map((line, lineIndex) => {
    const matches = Array.from(line.matchAll(/https?:\/\/[^\s]+/gi));
    const pieces = [];
    let cursor = 0;

    matches.forEach((match, matchIndex) => {
      const url = String(match[0] || "");
      const start = match.index ?? 0;
      if (start > cursor) {
        pieces.push(line.slice(cursor, start));
      }

      if (isSafeHttpUrl(url)) {
        pieces.push(
          <a
            key={`url-${lineIndex}-${matchIndex}`}
            className="chat-concierge__message-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {url}
          </a>,
        );
      } else {
        pieces.push(url);
      }

      cursor = start + url.length;
    });

    if (cursor < line.length) {
      pieces.push(line.slice(cursor));
    }

    return (
      <Fragment key={`line-${lineIndex}`}>
        {pieces}
        {lineIndex < lines.length - 1 && <br />}
      </Fragment>
    );
  });
};

const cityLabelFromPath = (pathname = "") => {
  const lower = pathname.toLowerCase();
  if (lower.startsWith("/antwerp") || lower.startsWith("/antwerpen")) return "Antwerp";
  if (lower.startsWith("/los-angeles") || lower.startsWith("/losangeles")) return "Los Angeles";
  if (lower.startsWith("/miami")) return "Miami";
  if (lower.startsWith("/redondo")) return "Redondo Beach";
  if (lower.startsWith("/dubai")) return "Dubai";
  if (lower.startsWith("/global")) return "Global";
  return "";
};

const detectPageType = (pathname = "") => {
  const lower = pathname.toLowerCase();
  if (lower.includes("/listing/")) return "listing";
  if (lower === "/" || lower === "") return "home";
  if (lower.startsWith("/global")) return "global";
  if (
    lower.startsWith("/antwerp") ||
    lower.startsWith("/antwerpen") ||
    lower.startsWith("/los-angeles") ||
    lower.startsWith("/losangeles") ||
    lower.startsWith("/miami") ||
    lower.startsWith("/redondo") ||
    lower.startsWith("/dubai")
  ) {
    return "city";
  }
  return "content";
};

const extractListingId = (pathname = "") => {
  const match = pathname.match(/\/listing\/([^/]+)/i);
  return match?.[1] || "";
};

const getPageContext = (location) => {
  const pathname = location?.pathname || "/";
  return {
    pathname,
    search: location?.search || "",
    pageType: detectPageType(pathname),
    city: cityLabelFromPath(pathname),
    listingId: extractListingId(pathname),
    title: typeof document !== "undefined" ? document.title : "",
  };
};

const getSuggestions = (pageContext) => {
  if (pageContext.pageType === "listing") {
    return [
      "Tell me about this property",
      "Is this unit available for my dates?",
      "Check my booking status with reservation code",
    ];
  }

  if (pageContext.pageType === "city" && pageContext.city) {
    return [
      `Show me the best options in ${pageContext.city}`,
      `What kind of stays do you have in ${pageContext.city}?`,
      "What is the booking process like?",
    ];
  }

  return DEFAULT_SUGGESTIONS;
};

const sanitizeMessages = (messages) =>
  Array.isArray(messages)
    ? messages
        .filter((message) => message && typeof message.content === "string")
        .map((message) => ({
          id: sanitizeId(message.id, 120) || createLocalId(message.role === "assistant" ? "assistant" : "user"),
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content.trim().slice(0, 2000),
          cards: sanitizeCards(message.cards),
        }))
        .filter((message) => message.content)
        .slice(-MAX_VISIBLE_MESSAGES)
    : [];

function sanitizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card, index) => ({
      id: String(card?.id || `card-${index}`).trim().slice(0, 120),
      title: String(card?.title || "").trim().slice(0, 220),
      city: String(card?.city || "").trim().slice(0, 120),
      url: String(card?.url || "").trim().slice(0, 900),
      images: Array.isArray(card?.images)
        ? card.images
            .map((image) => String(image || "").trim().slice(0, 900))
            .filter((image) => /^https?:\/\//i.test(image))
            .slice(0, 3)
        : [],
    }))
    .filter((card) => card.title || card.url)
    .slice(0, 6);
}

const isIsoDate = (value = "") => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const normalizeGuestCount = (value = "") => {
  const parsed = Math.round(Number(value) || 0);
  return parsed > 0 ? parsed : 1;
};

const getAutoAvailabilityFromSearch = (pageContext) => {
  if (pageContext?.pageType !== "city") return null;

  try {
    const params = new URLSearchParams(String(pageContext?.search || "").replace(/^\?/, ""));
    const checkIn = String(params.get("checkIn") || params.get("check_in") || "").trim();
    const checkOut = String(params.get("checkOut") || params.get("check_out") || "").trim();
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkIn >= checkOut) return null;

    const guests = normalizeGuestCount(params.get("guests") || params.get("adults") || "1");
    return { checkIn, checkOut, guests };
  } catch {
    return null;
  }
};

function ChatConcierge() {
  const location = useLocation();
  const pageContext = useMemo(() => getPageContext(location), [location]);
  const suggestions = useMemo(() => getSuggestions(pageContext), [pageContext]);
  const [isOpen, setIsOpen] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(() => getOrCreateSessionId());
  const [messages, setMessages] = useState(() => {
    if (typeof window === "undefined") return [];

    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      return sanitizeMessages(raw ? JSON.parse(raw) : []);
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("live");
  const [feedbackByMessageId, setFeedbackByMessageId] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.sessionStorage.getItem(FEEDBACK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return {};
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([key, value]) => [sanitizeId(key, 120), String(value || "").toLowerCase()])
          .filter(([key, value]) => key && (value === "good" || value === "bad")),
      );
    } catch {
      return {};
    }
  });
  const scrollRef = useRef(null);
  const autoRunKeyRef = useRef("");
  const showSuggestions = messages.length === 0;
  const autoAvailability = useMemo(() => getAutoAvailabilityFromSearch(pageContext), [pageContext]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedbackByMessageId));
    } catch {
      // ignore storage errors
    }
  }, [feedbackByMessageId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen, isSending]);

  const recordChatTurn = useCallback(
    async ({ userMessage, assistantMessage, responseMode = "live", responseModel = "" } = {}) => {
      if (!chatSessionId || !assistantMessage?.content) return;
      try {
        await fetch(`${apiBase}/chat-learning`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "turn",
            chatSessionId,
            pageContext,
            responseMode,
            responseModel,
            userMessage: userMessage
              ? {
                  id: sanitizeId(userMessage.id, 120),
                  content: String(userMessage.content || ""),
                }
              : null,
            assistantMessage: {
              id: sanitizeId(assistantMessage.id, 120),
              content: String(assistantMessage.content || ""),
              cards: Array.isArray(assistantMessage.cards) ? assistantMessage.cards : [],
            },
          }),
        });
      } catch {
        // Non-blocking analytics capture.
      }
    },
    [chatSessionId, pageContext],
  );

  const sendFeedback = useCallback(
    async ({ messageId, rating, assistantContent = "", relatedUserContent = "" } = {}) => {
      const normalizedMessageId = sanitizeId(messageId, 120);
      const normalizedRating = String(rating || "").toLowerCase();
      if (!normalizedMessageId) return;
      if (normalizedRating !== "good" && normalizedRating !== "bad") return;

      setFeedbackByMessageId((current) => ({ ...current, [normalizedMessageId]: normalizedRating }));

      try {
        await fetch(`${apiBase}/chat-learning`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "feedback",
            chatSessionId,
            pageContext,
            assistantMessageId: normalizedMessageId,
            rating: normalizedRating,
            assistantContent: String(assistantContent || ""),
            relatedUserContent: String(relatedUserContent || ""),
          }),
        });
      } catch {
        setError("Feedback could not be saved right now.");
      }
    },
    [chatSessionId, pageContext],
  );

  const sendMessage = useCallback(
    async (rawValue) => {
      const value = String(rawValue || "").trim();
      if (!value || isSending) return;

      const userMessage = {
        id: createLocalId("user"),
        role: "user",
        content: value,
      };
      const nextMessages = [...messages, userMessage].slice(-MAX_VISIBLE_MESSAGES);
      setMessages(nextMessages);
      setDraft("");
      setError("");
      setNotice("");
      setMode("live");
      setIsOpen(true);
      setIsSending(true);

      try {
        const response = await fetch(`${apiBase}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nextMessages,
            pageContext,
            chatSessionId,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "The concierge is unavailable right now.");
        }

        const reply = String(payload?.reply || "").trim();
        if (!reply) {
          throw new Error("The concierge returned an empty reply.");
        }
        const cards = sanitizeCards(payload?.cards);
        const assistantMessage = {
          id: sanitizeId(payload?.assistantMessageId, 120) || createLocalId("assistant"),
          role: "assistant",
          content: reply,
          cards,
        };
        const responseMode = payload?.mode === "fallback" ? "fallback" : "live";
        const responseModel = String(payload?.model || "").trim();

        setMode(responseMode);
        setNotice(String(payload?.notice || "").trim());

        setMessages((current) =>
          [...current.slice(-MAX_VISIBLE_MESSAGES + 1), assistantMessage].slice(
            -MAX_VISIBLE_MESSAGES,
          ),
        );

        void recordChatTurn({
          userMessage,
          assistantMessage,
          responseMode,
          responseModel,
        });
      } catch (requestError) {
        const isLocalHost =
          typeof window !== "undefined" &&
          /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || "");
        const rawMessage = String(requestError?.message || "").trim();
        const fallbackMessage =
          isLocalHost && (!rawMessage || rawMessage === "Failed to fetch")
            ? "Local chat functions are unreachable. Start the site with netlify dev and open the Netlify local URL."
            : "The concierge is unavailable right now.";
        setMode("live");
        setError(rawMessage || fallbackMessage);
      } finally {
        setIsSending(false);
      }
    },
    [chatSessionId, isSending, messages, pageContext, recordChatTurn],
  );

  useEffect(() => {
    if (!isOpen || isSending) return;
    if (!autoAvailability) return;
    if (messages.length > 0) return;

    const key = [
      pageContext.pathname,
      autoAvailability.checkIn,
      autoAvailability.checkOut,
      String(autoAvailability.guests),
    ].join("|");
    if (autoRunKeyRef.current === key) return;
    autoRunKeyRef.current = key;

    const autoPrompt = `Check availability for ${autoAvailability.checkIn} to ${autoAvailability.checkOut} for ${autoAvailability.guests} guest${autoAvailability.guests > 1 ? "s" : ""} in ${pageContext.city || "this city"}.`;
    sendMessage(autoPrompt);
  }, [autoAvailability, isOpen, isSending, messages.length, pageContext.city, pageContext.pathname, sendMessage]);

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage(draft);
  };

  const handleClear = () => {
    autoRunKeyRef.current = "";
    setChatSessionId(resetSessionId());
    setMessages([]);
    setFeedbackByMessageId({});
    setDraft("");
    setError("");
    setNotice("");
    setMode("live");
  };

  return (
    <div className={`chat-concierge${isOpen ? " is-open" : ""}`}>
      {isOpen && (
        <section
          className="chat-concierge__panel"
          id="chat-concierge-panel"
          aria-label="One Lux Stay AI concierge"
        >
          <header className="chat-concierge__header">
            <div>
              <p className="chat-concierge__eyebrow">One Lux Stay</p>
              <h2 className="chat-concierge__title">AI Concierge</h2>
              <p className="chat-concierge__subtitle">
                Ask about stays, booking status, availability by dates, or what page you are on now.
              </p>
            </div>
            <div className="chat-concierge__header-actions">
              <button type="button" className="chat-concierge__ghost" onClick={handleClear}>
                Reset
              </button>
              <button
                type="button"
                className="chat-concierge__close"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                x
              </button>
            </div>
          </header>

          <div className="chat-concierge__meta">
            <span>{pageContext.city || "One Lux Stay"}</span>
            <span>{pageContext.pageType}</span>
            {pageContext.listingId && <span>Listing {pageContext.listingId}</span>}
          </div>

          {notice && (
            <div className={`chat-concierge__notice${mode === "fallback" ? " is-fallback" : ""}`} role="status">
              <span className="chat-concierge__notice-badge">
                {mode === "fallback" ? "Backup mode" : "Status"}
              </span>
              <p className="chat-concierge__notice-copy">{notice}</p>
            </div>
          )}

          <div className="chat-concierge__messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="chat-concierge__welcome">
                <p className="chat-concierge__welcome-title">How can I help today?</p>
                <p className="chat-concierge__welcome-copy">
                  I can check booking status by reservation code, find available units for your
                  dates, and link you to the right unit page.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <article
                key={message.id || `${message.role}-${index}-${message.content.slice(0, 24)}`}
                className={`chat-concierge__message chat-concierge__message--${message.role}`}
              >
                <p>{renderMessageContent(message.content)}</p>
                {message.role === "assistant" && Array.isArray(message.cards) && message.cards.length > 0 && (
                  <div className="chat-concierge__cards">
                    {message.cards.map((card) => (
                      <a
                        key={`${card.id}-${card.url}`}
                        className="chat-concierge__card"
                        href={card.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {Array.isArray(card.images) && card.images.length > 0 && (
                          <div className="chat-concierge__card-images">
                            {card.images.map((image, imageIndex) => (
                              <img
                                key={`${card.id}-img-${imageIndex}`}
                                className="chat-concierge__card-image"
                                src={image}
                                alt={card.title || "Listing image"}
                                loading="lazy"
                                decoding="async"
                              />
                            ))}
                          </div>
                        )}
                        <p className="chat-concierge__card-title">{card.title}</p>
                        {(card.city || card.url) && (
                          <p className="chat-concierge__card-meta">
                            {card.city ? `${card.city}` : "Open listing"}
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                )}
                {message.role === "assistant" && message.id && (
                  <div className="chat-concierge__feedback" aria-label="Rate this reply">
                    <button
                      type="button"
                      className={`chat-concierge__feedback-btn${feedbackByMessageId[message.id] === "good" ? " is-active" : ""}`}
                      data-rating="good"
                      onClick={() =>
                        sendFeedback({
                          messageId: message.id,
                          rating: "good",
                          assistantContent: message.content,
                          relatedUserContent:
                            [...messages.slice(0, index)]
                              .reverse()
                              .find((item) => item.role === "user")
                              ?.content || "",
                        })
                      }
                      disabled={isSending}
                      aria-label="Mark response as good"
                    >
                      👍 Good
                    </button>
                    <button
                      type="button"
                      className={`chat-concierge__feedback-btn${feedbackByMessageId[message.id] === "bad" ? " is-active" : ""}`}
                      data-rating="bad"
                      onClick={() =>
                        sendFeedback({
                          messageId: message.id,
                          rating: "bad",
                          assistantContent: message.content,
                          relatedUserContent:
                            [...messages.slice(0, index)]
                              .reverse()
                              .find((item) => item.role === "user")
                              ?.content || "",
                        })
                      }
                      disabled={isSending}
                      aria-label="Mark response as bad"
                    >
                      👎 Bad
                    </button>
                  </div>
                )}
              </article>
            ))}

            {isSending && (
              <div className="chat-concierge__message chat-concierge__message--assistant is-loading">
                <p>Thinking through that now...</p>
              </div>
            )}
          </div>

          {showSuggestions && (
            <div className="chat-concierge__suggestions" aria-label="Suggested prompts">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chat-concierge__suggestion"
                  onClick={() => sendMessage(suggestion)}
                  disabled={isSending}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="chat-concierge__error" role="status">
              {error}
            </p>
          )}

          <form className="chat-concierge__composer" onSubmit={handleSubmit}>
            <label className="chat-concierge__sr-only" htmlFor="chat-concierge-input">
              Message the AI concierge
            </label>
            <textarea
              id="chat-concierge-input"
              className="chat-concierge__input"
              placeholder="Ask about cities, stays, booking, or this page..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              disabled={isSending}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage(draft);
                }
              }}
            />
            <button type="submit" className="chat-concierge__send" disabled={isSending || !draft.trim()}>
              Send
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="chat-concierge__toggle"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls="chat-concierge-panel"
      >
        <span className="chat-concierge__toggle-badge">AI</span>
        <span className="chat-concierge__toggle-copy">{isOpen ? "Close Concierge" : "Ask Concierge"}</span>
      </button>
    </div>
  );
}

export default ChatConcierge;
