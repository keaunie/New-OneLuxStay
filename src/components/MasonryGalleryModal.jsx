import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

export default function MasonryGalleryModal({
  open,
  images,
  initialIndex = 0,
  title = "Photos",
  onClose,
}) {
  const cleanImages = useMemo(
    () => (Array.isArray(images) ? images.filter(Boolean) : []),
    [images],
  );
  const itemRefs = useRef(new Map());
  const hasScrolledRef = useRef(false);
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    if (!open) {
      hasScrolledRef.current = false;
      return undefined;
    }
    const handleEsc = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    const targetIndex = Math.min(
      Math.max(0, Number.isFinite(initialIndex) ? initialIndex : 0),
      Math.max(0, cleanImages.length - 1),
    );
    requestAnimationFrame(() => {
      const node = itemRefs.current.get(targetIndex);
      node?.scrollIntoView?.({ block: "start", behavior: "auto" });
    });
  }, [open, initialIndex, cleanImages.length]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div
      className="ols-masonry-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} gallery`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="ols-masonry-modal__inner">
        <header className="ols-masonry-modal__header">
          <button type="button" className="ols-masonry-modal__back" onClick={onClose}>
            Back to apartment
          </button>
          <div className="ols-masonry-modal__title">
            <strong>{title}</strong>
            {cleanImages.length ? <span>{cleanImages.length} photos</span> : null}
          </div>
          <button type="button" className="ols-masonry-modal__close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="ols-masonry-modal__content">
          <div className="ols-masonry-modal__masonry" role="list">
            {cleanImages.map((src, idx) => (
              <div
                key={`${src}-${idx}`}
                className="ols-masonry-modal__item"
                role="listitem"
                ref={(node) => {
                  if (!node) {
                    itemRefs.current.delete(idx);
                    return;
                  }
                  itemRefs.current.set(idx, node);
                }}
              >
                <img src={src} alt="" loading={idx < 4 ? "eager" : "lazy"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

