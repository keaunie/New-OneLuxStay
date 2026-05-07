import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function PhotoLightbox({ open, images, index, onClose }) {
  const cleanImages = Array.isArray(images) ? images.filter(Boolean) : [];
  const count = cleanImages.length;
  const safeInitial = Number.isFinite(index)
    ? Math.max(0, Math.min(count - 1, index))
    : 0;

  const [current, setCurrent] = useState(safeInitial);

  useEffect(() => {
    if (open) setCurrent(safeInitial);
  }, [open, safeInitial]);

  const goNext = useCallback(() => {
    if (count < 2) return;
    setCurrent((c) => (c + 1) % count);
  }, [count]);

  const goPrev = useCallback(() => {
    if (count < 2) return;
    setCurrent((c) => (c - 1 + count) % count);
  }, [count]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, goNext, goPrev, onClose]);

  const touchX = useRef(null);
  const handleTouchStart = useCallback((e) => {
    touchX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(
    (e) => {
      if (touchX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      touchX.current = null;
      if (Math.abs(dx) < 40) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!open || !portalTarget || count === 0) return null;

  const src = cleanImages[current];

  return createPortal(
    <div
      className="ols-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        className="ols-lightbox__close"
        onClick={onClose}
        aria-label="Close viewer"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {count > 1 && (
        <div
          className="ols-lightbox__counter"
          aria-live="polite"
          aria-atomic="true"
        >
          {current + 1} / {count}
        </div>
      )}

      {count > 1 && (
        <button
          type="button"
          className="ols-lightbox__nav ols-lightbox__nav--prev"
          onClick={goPrev}
          aria-label="Previous image"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      <div className="ols-lightbox__stage">
        <img
          key={`lb-${current}`}
          src={src}
          alt={`Photo ${current + 1} of ${count}`}
          className="ols-lightbox__img"
          draggable="false"
        />
      </div>

      {count > 1 && (
        <button
          type="button"
          className="ols-lightbox__nav ols-lightbox__nav--next"
          onClick={goNext}
          aria-label="Next image"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}
    </div>,
    portalTarget,
  );
}
