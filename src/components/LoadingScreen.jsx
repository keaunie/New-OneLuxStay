import { useEffect } from "react";

const lottieSrc =
  import.meta.env.VITE_LOTTIE_LOADING_SRC ||
  "";

const ensureLottiePlayer = () => {
  if (typeof window === "undefined") return;
  if (window.customElements?.get("lottie-player")) return;
  const script = document.createElement("script");
  script.src = "https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js";
  script.async = true;
  document.head.appendChild(script);
};

const LoadingScreen = ({ active }) => {
  useEffect(() => {
    if (lottieSrc) ensureLottiePlayer();
  }, []);

  return (
    <div className={`app-loading-overlay${active ? " is-active" : " is-hidden"}`}>
      <div className="app-loading-card">
        {lottieSrc ? (
          <lottie-player
            src={lottieSrc}
            background="transparent"
            speed="1"
            loop
            autoplay
            className="app-loading-lottie"
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
