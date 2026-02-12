import { useMemo, useState } from "react";

const toPx = (value, fallback) => {
  if (typeof value === "number") return `${value}px`;
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
};

const normalizeItems = (items = []) =>
  items
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { id: null, image: item, title: "One Lux Stay", price: "" };
      }
      return {
        id: item.id || null,
        image: item.image || item.src,
        title: item.title || "One Lux Stay",
        price: item.price || "",
      };
    })
    .filter((item) => item?.image);

const buildBaseTransforms = (count) => {
  const centerIndex = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => {
    const offset = index - centerIndex;
    return {
      x: offset * 34,
      y: Math.abs(offset) * -16,
      rotate: offset * 5,
    };
  });
};

const BounceCards = ({
  items = [],
  className = "",
  containerWidth = 520,
  containerHeight = 360,
  imageSize = 300,
  enableHover = true,
  onCardClick,
}) => {
  const normalizedItems = useMemo(() => normalizeItems(items), [items]);
  const baseTransforms = useMemo(
    () => buildBaseTransforms(normalizedItems.length),
    [normalizedItems.length]
  );
  const [activeIndex, setActiveIndex] = useState(null);
  const spreadDistance = useMemo(() => {
    if (typeof containerWidth === "number") {
      return Math.max(150, Math.min(350, containerWidth * 0.62));
    }
    return 260;
  }, [containerWidth]);

  const responsiveWidth =
    typeof containerWidth === "number"
      ? `min(100%, ${containerWidth}px)`
      : toPx(containerWidth, "520px");
  const responsiveHeight =
    typeof containerHeight === "number"
      ? `clamp(240px, 62vw, ${containerHeight}px)`
      : toPx(containerHeight, "360px");
  const responsiveCardSize =
    typeof imageSize === "number"
      ? `clamp(170px, 54vw, ${imageSize}px)`
      : toPx(imageSize, "230px");

  const containerStyle = {
    width: responsiveWidth,
    maxWidth: "100%",
    height: responsiveHeight,
    "--bounce-card-size": responsiveCardSize,
  };

  return (
    <div
      className={`la-bounce-cards ${className}`.trim()}
      style={containerStyle}
      onMouseLeave={() => setActiveIndex(null)}
    >
      {normalizedItems.map((item, index) => {
        const base = baseTransforms[index];
        const isActive = activeIndex === index;
        const hasHover = activeIndex !== null;
        const offset = index - (activeIndex ?? 0);
        const spread = hasHover ? Math.sign(offset) * spreadDistance : 0;
        const zIndex = isActive ? 5 : 1;
        return (
          <div
            key={`${item.image}-${index}`}
            className="la-bounce-cards__item"
            style={{
              transform: `translate(-50%, -50%) translate(${base.x + spread}px, ${
                base.y + (isActive ? 20 : 0)
              }px)`,
              zIndex,
            }}
          >
            <button
              type="button"
              className={
                isActive
                  ? "la-bounce-cards__card is-active"
                  : hasHover
                    ? "la-bounce-cards__card is-dim"
                    : "la-bounce-cards__card"
              }
              style={{
                transform: `rotate(${isActive ? 0 : base.rotate}deg) scale(${isActive ? 1.03 : 1})`,
              }}
              onMouseEnter={() => enableHover && setActiveIndex(index)}
              onFocus={() => enableHover && setActiveIndex(index)}
              onClick={() => onCardClick?.(item, index)}
            >
              <img src={item.image} alt={item.title} loading={index < 2 ? "eager" : "lazy"} />
              <div className="la-bounce-cards__meta">
                <p className="la-bounce-cards__title">{item.title}</p>
                {item.price ? <p className="la-bounce-cards__price">{item.price}</p> : null}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default BounceCards;
