import { useCallback, useState } from "react";

// A photo that shows a shimmer and spinner while it loads, fades in once ready, and shows a calm
// "unavailable" message if it fails. It fills its parent, so give the parent a size
// (an aspect-ratio box, grid cell, etc). Use `key={src}` when the photo can change in place so the
// loading state starts fresh.
export default function PhotoImage({ src, alt = "", eager = false, fit = "cover", width, height }) {
  const [status, setStatus] = useState("loading");

  // If the browser already has the image (cached), skip the loading state to avoid a flash.
  const imageRef = useCallback((node) => {
    if (node && node.complete && node.naturalWidth > 0) setStatus("loaded");
  }, []);

  return (
    <span className={`photo photo--${status}`} aria-busy={status === "loading"}>
      {status !== "error" && (
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          style={{ objectFit: fit }}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      )}
      {status === "loading" && <span className="photo__spinner" role="status" aria-label="Loading photo" />}
      {status === "error" && <span className="photo__error">Photo unavailable</span>}
    </span>
  );
}
