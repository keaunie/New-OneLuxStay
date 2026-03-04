import { useEffect, useRef, useState } from "react";

const cloneAnimationData = (value) => JSON.parse(JSON.stringify(value));

const ensureLayerTransform = (ks = {}) => ({
  o: ks.o ?? { a: 0, k: 100 },
  r: ks.r ?? { a: 0, k: 0 },
  p: ks.p ?? { a: 0, k: [0, 0, 0] },
  a: ks.a ?? { a: 0, k: [0, 0, 0] },
  s: ks.s ?? { a: 0, k: [100, 100, 100] },
});

const normalizeLottieData = (inputData) => {
  if (!inputData || !Array.isArray(inputData.layers)) return inputData;
  const normalized = cloneAnimationData(inputData);
  const defaultIp = Number.isFinite(normalized.ip) ? normalized.ip : 0;
  const defaultOp = Number.isFinite(normalized.op) ? normalized.op : 150;

  normalized.layers = normalized.layers.map((layer, index) => {
    const nextLayer = { ...layer };
    nextLayer.ddd = layer.ddd ?? 0;
    nextLayer.ind = layer.ind ?? index + 1;
    nextLayer.sr = layer.sr ?? 1;
    nextLayer.ao = layer.ao ?? 0;
    nextLayer.ip = Number.isFinite(layer.ip) ? layer.ip : defaultIp;
    nextLayer.op = Number.isFinite(layer.op) ? layer.op : defaultOp;
    nextLayer.st = Number.isFinite(layer.st) ? layer.st : defaultIp;
    nextLayer.bm = layer.bm ?? 0;
    nextLayer.ks = ensureLayerTransform(layer.ks);

    if (nextLayer.ty === 4 && Array.isArray(layer.shapes)) {
      const hasShapeGroups = layer.shapes.some((shape) => shape?.ty === "gr");
      if (!hasShapeGroups) {
        nextLayer.shapes = [
          {
            ty: "gr",
            nm: layer.nm || `Layer ${index + 1}`,
            it: [
              ...layer.shapes,
              {
                ty: "tr",
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 },
                sk: { a: 0, k: 0 },
                sa: { a: 0, k: 0 },
              },
            ],
          },
        ];
      }
    }
    return nextLayer;
  });

  return normalized;
};

const LottieInlineHint = ({
  src,
  className = "",
  ariaLabel = "Animation hint",
}) => {
  const containerRef = useRef(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isAnimationVisible, setIsAnimationVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return undefined;

    let destroyed = false;
    let animation = null;
    let handleDataFailed = null;
    let loadWatchdog = null;
    setHasFailed(false);
    setIsAnimationVisible(false);
    container.innerHTML = "";

    const hasRenderableNodes = () => {
      const svg = containerRef.current?.querySelector("svg");
      if (!svg) return false;
      return Boolean(
        svg.querySelector("path,rect,circle,ellipse,polygon,polyline,line,use,image,text"),
      );
    };

    Promise.all([import("lottie-web"), fetch(src)])
      .then(async ([module, response]) => {
        if (destroyed || !containerRef.current) return;
        if (!response.ok) throw new Error("Animation file request failed");
        const animationData = normalizeLottieData(await response.json());
        if (!animationData || !Array.isArray(animationData.layers)) {
          throw new Error("Animation data is invalid");
        }

        const lottieLib = module?.default || module;
        animation = lottieLib.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: {
            progressiveLoad: true,
            preserveAspectRatio: "xMidYMid meet",
          },
        });

        handleDataFailed = () => setHasFailed(true);
        animation.addEventListener("data_failed", handleDataFailed);
        animation.addEventListener("DOMLoaded", () => {
          if (destroyed) return;
          requestAnimationFrame(() => {
            if (hasRenderableNodes()) {
              setIsAnimationVisible(true);
            } else {
              setHasFailed(true);
            }
          });
        });
        loadWatchdog = window.setTimeout(() => {
          if (!destroyed && !hasRenderableNodes()) {
            setHasFailed(true);
          }
        }, 1200);
      })
      .catch(() => {
        if (!destroyed) setHasFailed(true);
      });

    return () => {
      destroyed = true;
      if (animation) {
        if (handleDataFailed) {
          animation.removeEventListener("data_failed", handleDataFailed);
        }
        animation.destroy();
      }
      if (loadWatchdog) {
        window.clearTimeout(loadWatchdog);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [src]);

  const shellStyle = {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: "150px",
    overflow: "hidden",
    borderRadius: "12px",
  };

  const fallbackStyle = {
    position: "absolute",
    inset: 0,
    display: "grid",
    gap: "10px",
    alignContent: "center",
    justifyItems: "center",
    background:
      "radial-gradient(circle at 20% 20%, rgba(255, 248, 237, 0.95), rgba(236, 216, 188, 0.85))",
    opacity: isAnimationVisible && !hasFailed ? 0.45 : 1,
  };

  const fallbackCardStyle = {
    width: "min(78%, 250px)",
    height: "88px",
    borderRadius: "14px",
    border: "1px solid rgba(183, 141, 96, 0.46)",
    background: "linear-gradient(145deg, rgba(198, 158, 115, 0.94), rgba(119, 87, 56, 0.94))",
    boxShadow: "0 12px 24px rgba(70, 48, 25, 0.26)",
    padding: "16px 15px",
    display: "grid",
    alignContent: "space-between",
  };

  const layerStyle = {
    position: "absolute",
    inset: 0,
    opacity: isAnimationVisible ? 1 : 0,
    transition: "opacity 0.25s ease",
  };

  return (
    <div
      className={`${className} la-inquiry-modal__payment-shell`}
      style={shellStyle}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="la-inquiry-modal__payment-fallback" style={fallbackStyle}>
        <div className="la-inquiry-modal__payment-fallback-card" style={fallbackCardStyle} aria-hidden="true">
          <span
            className="la-inquiry-modal__payment-fallback-chip"
            style={{
              width: "34px",
              height: "24px",
              borderRadius: "6px",
              background:
                "linear-gradient(135deg, rgba(255, 242, 213, 0.96), rgba(226, 197, 154, 0.92))",
              border: "1px solid rgba(131, 95, 59, 0.34)",
            }}
          />
          <span
            className="la-inquiry-modal__payment-fallback-digits"
            style={{
              fontSize: "0.88rem",
              letterSpacing: "0.1em",
              color: "rgba(255, 248, 236, 0.95)",
              fontWeight: 700,
            }}
          >
            **** **** **** 5493
          </span>
        </div>
        <p
          className="la-inquiry-modal__payment-fallback-copy"
          style={{
            margin: 0,
            fontSize: "0.75rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "rgba(90, 68, 44, 0.9)",
          }}
        >
          Secure card verification
        </p>
      </div>
      {!hasFailed && (
        <div
          ref={containerRef}
          className={"la-inquiry-modal__payment-layer" + (isAnimationVisible ? " is-visible" : "")}
          style={layerStyle}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default LottieInlineHint;
