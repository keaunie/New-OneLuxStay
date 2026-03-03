import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getTargetElement = (selectors) => {
  if (!Array.isArray(selectors)) return null;
  for (const selector of selectors) {
    if (!selector || typeof selector !== "string") continue;
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
};

const getSpotlightRect = (element) => {
  if (!element) return null;
  const padding = 22;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rect = element.getBoundingClientRect();
  const left = clamp(rect.left - padding, 8, Math.max(8, viewportWidth - 16));
  const top = clamp(rect.top - padding, 8, Math.max(8, viewportHeight - 16));
  const right = clamp(rect.right + padding, 8, Math.max(8, viewportWidth - 8));
  const bottom = clamp(rect.bottom + padding, 8, Math.max(8, viewportHeight - 8));
  const width = Math.max(36, right - left);
  const height = Math.max(36, bottom - top);
  return { left, top, width, height };
};

const isVisibleEnough = (rect) => {
  if (!rect) return false;
  const margin = 72;
  return rect.bottom > margin && rect.top < window.innerHeight - margin;
};

function FeatureWalkthrough({
  steps = [],
  autoStart = true,
  storageKey = "ols_guest_walkthrough_seen_v1",
}) {
  const tourSteps = useMemo(
    () =>
      steps.filter(
        (step) =>
          step &&
          typeof step.title === "string" &&
          typeof step.description === "string" &&
          Array.isArray(step.selectors) &&
          step.selectors.length > 0,
      ),
    [steps],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const [isFooterInView, setIsFooterInView] = useState(false);

  const activeStep = tourSteps[stepIndex] || null;
  const isLastStep = stepIndex >= tourSteps.length - 1;
  const canGoBack = stepIndex > 0;

  const markSeen = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // Ignore storage failures.
    }
  }, [storageKey]);

  const openTour = useCallback(() => {
    if (!tourSteps.length) return;
    setStepIndex(0);
    setIsOpen(true);
  }, [tourSteps.length]);

  const closeTour = useCallback(
    (persistSeen) => {
      setIsOpen(false);
      setStepIndex(0);
      setSpotlightRect(null);
      if (persistSeen) markSeen();
    },
    [markSeen],
  );

  const syncSpotlight = useCallback(() => {
    if (!isOpen || !activeStep) return;
    const target = getTargetElement(activeStep.selectors);
    if (!target) {
      setSpotlightRect(null);
      return;
    }
    const viewportRect = target.getBoundingClientRect();
    if (!isVisibleEnough(viewportRect)) {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
    const updateRect = () => {
      const currentTarget = getTargetElement(activeStep.selectors);
      setSpotlightRect(getSpotlightRect(currentTarget));
    };
    updateRect();
    window.requestAnimationFrame(updateRect);
    window.setTimeout(updateRect, 180);
    window.setTimeout(updateRect, 340);
  }, [activeStep, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!autoStart || !tourSteps.length) return undefined;
    let shouldAutoStart = true;
    try {
      shouldAutoStart = window.localStorage.getItem(storageKey) !== "true";
    } catch {
      shouldAutoStart = true;
    }
    if (!shouldAutoStart) return undefined;
    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setIsOpen(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoStart, storageKey, tourSteps.length]);

  useEffect(() => {
    syncSpotlight();
  }, [syncSpotlight]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!isOpen || !activeStep) return undefined;
    const handleLayoutChange = () => syncSpotlight();
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);

    const target = getTargetElement(activeStep.selectors);
    let resizeObserver;
    if (target && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleLayoutChange);
      resizeObserver.observe(target);
    }

    return () => {
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
      resizeObserver?.disconnect();
    };
  }, [activeStep, isOpen, syncSpotlight]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour(true);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setStepIndex((current) => (current >= tourSteps.length - 1 ? current : current + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStepIndex((current) => (current <= 0 ? 0 : current - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeTour, isOpen, tourSteps.length]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    if (typeof IntersectionObserver === "undefined") return undefined;
    const target =
      document.querySelector(".policy-footer-bottom") ||
      document.querySelector(".policy-footer") ||
      document.querySelector("footer");
    if (!target) {
      setIsFooterInView(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsFooterInView(Boolean(entry?.isIntersecting));
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px 96px 0px",
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [tourSteps.length]);

  if (!tourSteps.length) return null;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const rightWidth = spotlightRect
    ? Math.max(0, viewportWidth - (spotlightRect.left + spotlightRect.width))
    : 0;
  const bottomHeight = spotlightRect
    ? Math.max(0, viewportHeight - (spotlightRect.top + spotlightRect.height))
    : 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {!isOpen && (
        <button
          type="button"
          className={`landing-tour-launch${isFooterInView ? " is-hidden" : ""}`}
          onClick={openTour}
          aria-haspopup="dialog"
        >
          Take the 60-second tour
        </button>
      )}
      {isOpen && activeStep && (
        <div className="landing-tour-overlay" role="dialog" aria-modal="true" aria-label="Website walkthrough">
          {spotlightRect ? (
            <>
              <div
                className="landing-tour-mask"
                style={{
                  top: "0px",
                  left: "0px",
                  width: "100vw",
                  height: `${spotlightRect.top}px`,
                }}
              />
              <div
                className="landing-tour-mask"
                style={{
                  top: `${spotlightRect.top}px`,
                  left: "0px",
                  width: `${spotlightRect.left}px`,
                  height: `${spotlightRect.height}px`,
                }}
              />
              <div
                className="landing-tour-mask"
                style={{
                  top: `${spotlightRect.top}px`,
                  left: `${spotlightRect.left + spotlightRect.width}px`,
                  width: `${rightWidth}px`,
                  height: `${spotlightRect.height}px`,
                }}
              />
              <div
                className="landing-tour-mask"
                style={{
                  top: `${spotlightRect.top + spotlightRect.height}px`,
                  left: "0px",
                  width: "100vw",
                  height: `${bottomHeight}px`,
                }}
              />
            </>
          ) : (
            <div className="landing-tour-mask" style={{ inset: 0 }} />
          )}
          {spotlightRect && (
            <div
              className="landing-tour-spotlight"
              aria-hidden="true"
              style={{
                top: `${spotlightRect.top}px`,
                left: `${spotlightRect.left}px`,
                width: `${spotlightRect.width}px`,
                height: `${spotlightRect.height}px`,
              }}
            />
          )}
          <section className="landing-tour-panel">
            <p className="landing-tour-panel__step">
              Step {stepIndex + 1} of {tourSteps.length}
            </p>
            <h2 className="landing-tour-panel__title">{activeStep.title}</h2>
            <p className="landing-tour-panel__description">{activeStep.description}</p>
            <div className="landing-tour-panel__actions">
              <button type="button" className="landing-tour-btn landing-tour-btn--ghost" onClick={() => closeTour(true)}>
                Skip
              </button>
              <button
                type="button"
                className="landing-tour-btn landing-tour-btn--ghost"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                disabled={!canGoBack}
              >
                Back
              </button>
              <button
                type="button"
                className="landing-tour-btn landing-tour-btn--primary"
                onClick={() => {
                  if (isLastStep) {
                    closeTour(true);
                    return;
                  }
                  setStepIndex((current) => Math.min(tourSteps.length - 1, current + 1));
                }}
              >
                {isLastStep ? "Finish" : "Next"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>,
    document.body,
  );
}

export default FeatureWalkthrough;
