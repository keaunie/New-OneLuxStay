import { useEffect } from "react";

const DEFAULT_LOTTIE_SRC = import.meta.env.VITE_LOTTIE_LOADING_SRC || "";

const ensureLottiePlayer = () => {
  if (typeof window === "undefined") return;
  if (window.customElements?.get("lottie-player")) return;
  if (window.__lottiePlayerLoading) return;
  if (document.getElementById("lottie-player-script")) return;
  window.__lottiePlayerLoading = true;
  const script = document.createElement("script");
  script.id = "lottie-player-script";
  script.src = "https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js";
  script.async = true;
  script.onload = () => {
    window.__lottiePlayerLoading = false;
  };
  script.onerror = () => {
    window.__lottiePlayerLoading = false;
    script.remove();
  };
  document.head.appendChild(script);
};

const LoadingScreen = ({ active, lottieSrc }) => {
  const resolvedLottieSrc = lottieSrc || DEFAULT_LOTTIE_SRC;

  useEffect(() => {
    if (resolvedLottieSrc) ensureLottiePlayer();
  }, [resolvedLottieSrc]);

  return (
    <div className={`app-loading-overlay${active ? " is-active" : " is-hidden"}`}>
      <div className="app-loading-card">
        {resolvedLottieSrc ? (
          <lottie-player
            src={resolvedLottieSrc}
            background="transparent"
            speed="1"
            loop
            autoplay
            className="app-loading-lottie"
            key={resolvedLottieSrc}
          />
        ) : (
          <div className="app-loading-fallback">
            <div className="app-loading-spinner" aria-hidden="true" />
            <p className="app-loading-text">Preparing your stay...</p>
          </div>
        )}
        <p className="app-loading-text">Loading your OneLuxStay experience</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
