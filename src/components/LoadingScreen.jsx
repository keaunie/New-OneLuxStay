import { useEffect, useRef, useState } from "react";

const DEFAULT_LOTTIE_SRC = (import.meta.env.VITE_LOTTIE_LOADING_SRC || "").trim();
const LOCAL_FALLBACK_LOTTIE_SRC = "/3D%20Isometric%20Smart-Living%20Room.json";

const LoadingScreen = ({ active, lottieSrc }) => {
  const resolvedLottieSrc =
    (lottieSrc || DEFAULT_LOTTIE_SRC || LOCAL_FALLBACK_LOTTIE_SRC).trim();
  const containerRef = useRef(null);
  const [primaryFailedSrc, setPrimaryFailedSrc] = useState("");
  const [fatalSrc, setFatalSrc] = useState("");
  const hasFailed = fatalSrc === resolvedLottieSrc;
  const currentSrc =
    primaryFailedSrc === resolvedLottieSrc
      ? LOCAL_FALLBACK_LOTTIE_SRC
      : resolvedLottieSrc;

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container || !currentSrc || hasFailed) return undefined;

    let destroyed = false;
    let animation = null;
    let handleDataFailed = null;
    container.innerHTML = "";

    import("lottie-web")
      .then((module) => {
        if (destroyed || !containerRef.current) return;
        const lottieLib = module?.default || module;
        animation = lottieLib.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path: currentSrc,
          rendererSettings: {
            progressiveLoad: true,
            preserveAspectRatio: "xMidYMid meet",
          },
        });

        handleDataFailed = () => {
          if (currentSrc !== LOCAL_FALLBACK_LOTTIE_SRC) {
            setPrimaryFailedSrc(resolvedLottieSrc);
            return;
          }
          setFatalSrc(resolvedLottieSrc);
        };

        animation.addEventListener("data_failed", handleDataFailed);
      })
      .catch(() => {
        if (destroyed) return;
        if (currentSrc !== LOCAL_FALLBACK_LOTTIE_SRC) {
          setPrimaryFailedSrc(resolvedLottieSrc);
        } else {
          setFatalSrc(resolvedLottieSrc);
        }
      });

    return () => {
      destroyed = true;
      if (animation) {
        if (handleDataFailed) {
          animation.removeEventListener("data_failed", handleDataFailed);
        }
        animation.destroy();
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [active, currentSrc, hasFailed, resolvedLottieSrc]);

  return (
    <div className={`app-loading-overlay${active ? " is-active" : " is-hidden"}`}>
      <div className="app-loading-card">
        {!hasFailed ? (
          <div
            ref={containerRef}
            className="app-loading-lottie"
            aria-hidden="true"
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
