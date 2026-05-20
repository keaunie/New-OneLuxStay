import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SiteFooter from "./components/SiteFooter";
import { filterLowQualityImages, getImageKeyFromUrl } from "./utils/imageQuality";
import apiBase from "./utils/apiBase";
import { trackGuestListingClick } from "./utils/guestAnalytics";
import { isHiddenUnit } from "./config/hiddenUnits";
import "./App.css";
const LOGO_URL = "https://oneluxstayprop.netlify.app/oneluxstay-logo.webp";

const KNOWN_CITIES = [
  "hollywood",
  "los angeles",
  "antwerp",
  "antwerpen",
  "dubai",
  "redondo beach",
  "miami",
  "miami beach",
];

const extractImageUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return (
      value.url ||
      value.src ||
      value.href ||
      value.secure_url ||
      value.secureUrl ||
      value.original ||
      value.large ||
      value.regular ||
      value.thumbnail ||
      ""
    );
  }
  return "";
};

const getListingImages = (listing) => {
  if (!listing) return [];
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const url = extractImageUrl(value);
    if (!url) return;
    const key = getImageKeyFromUrl(url) || url;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url);
  };

  if (Array.isArray(listing.pictures) && listing.pictures.length) {
    listing.pictures.forEach((image) => {
      add(image);
      if (image && typeof image === "object") {
        add(image.original);
        add(image.large);
        add(image.regular);
        add(image.thumbnail);
      }
    });
  } else {
    add(listing.picture);
    if (listing.picture && typeof listing.picture === "object") {
      add(listing.picture.original);
      add(listing.picture.large);
      add(listing.picture.regular);
      add(listing.picture.thumbnail);
    }
  }

  return filterLowQualityImages(out);
};

const getListingId = (listing) =>
  listing?.id || listing?._id || listing?.unitTypeId || "";

const isChildListing = (listing) => {
  if (!listing) return false;
  const type = typeof listing.type === "string" ? listing.type.toUpperCase() : "";
  if (type.includes("CHILD")) return true;
  if (listing?.parentId || listing?.parentListingId) return true;
  const listingId = listing?.id || listing?._id || null;
  if (listing?.unitTypeId && listingId && String(listing.unitTypeId) !== String(listingId)) {
    return true;
  }
  return false;
};

const normalizeCity = (listing) => {
  const titleLower = typeof listing?.title === "string" ? listing.title.toLowerCase() : "";
  if (titleLower.includes("hollywood")) return "Hollywood";

  const primary = listing?.city || listing?.address?.city;
  if (typeof primary === "string" && primary.trim()) {
    if (primary.trim().toLowerCase() === "miami beach") return "Miami";
    return primary.trim();
  }

  const tagCity =
    Array.isArray(listing?.tags) &&
    listing.tags.find((tag) => typeof tag === "string" && KNOWN_CITIES.includes(tag.toLowerCase()));

  if (typeof tagCity === "string" && tagCity.trim()) {
    if (tagCity.trim().toLowerCase() === "miami beach") return "Miami";
    return tagCity.trim();
  }

  if (titleLower) {
    const match = KNOWN_CITIES.find((city) => titleLower.includes(city));
    if (match) {
      if (match === "miami beach") return "Miami";
      return match
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }

  return "";
};

const citySlugFromName = (value) => {
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes("los angeles") || lower.includes("hollywood")) return "los-angeles";
  if (lower.includes("antwerp") || lower.includes("antwerpen")) return "antwerp";
  if (lower.includes("miami")) return "miami";
  if (lower.includes("redondo")) return "redondo-beach";
  if (lower.includes("dubai")) return "dubai";
  return "";
};

const formatCurrency = (value, currency = "USD") => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Price on request";
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${Math.round(value)}`;
  }
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const firstNumber = (...values) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const getListingFallbackPrice = (listing) =>
  firstNumber(
    listing?.basePrice,
    listing?.prices?.basePrice,
    listing?.prices?.basePricePerNight,
    listing?.prices?.nightly,
    listing?.prices?.basePrice?.amount,
    listing?.prices?.nightly?.amount
  );

const getListingCurrency = (listing) =>
  listing?.currency ||
  listing?.prices?.basePrice?.currency ||
  listing?.prices?.nightly?.currency ||
  "USD";

const buildListingPath = (listing) => {
  const id = getListingId(listing);
  if (!id) return "/listings";
  const slug = citySlugFromName(normalizeCity(listing));
  if (!slug) return `/listings?listingId=${encodeURIComponent(id)}`;
  return `/${slug}/listing/${encodeURIComponent(id)}`;
};

const toDomId = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");

const parseDateValue = (value) => {
  if (!value) return null;
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const formatDateForDisplay = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getListingIdentityIds = (listing) =>
  [listing?.id, listing?._id, listing?.unitTypeId]
    .filter(Boolean)
    .map((value) => String(value));

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const checkInLabelId = useId();
  const checkOutLabelId = useId();
  const dialogId = useId();
  const containerRef = useRef(null);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => parseDateValue(value.checkIn) || today);

  const startDate = useMemo(() => parseDateValue(value.checkIn), [value.checkIn]);
  const endDate = useMemo(() => parseDateValue(value.checkOut), [value.checkOut]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!open) return;
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const buildMonth = (baseDate) => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array(startOffset).fill(null);
    for (let i = 1; i <= daysInMonth; i += 1) cells.push(new Date(year, month, i));
    return { year, month, cells };
  };

  const isSameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const inRange = (day) => {
    if (!day || !startDate) return false;
    if (startDate && endDate) return day >= startDate && day <= endDate;
    return isSameDay(day, startDate);
  };

  const syncViewToBaseMonth = () => {
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  };

  const openPicker = () => {
    syncViewToBaseMonth();
    setOpen(true);
  };

  const handleDayClick = (day) => {
    if (!day || day < today) return;
    let nextStart = startDate;
    let nextEnd = endDate;
    if (!startDate || (startDate && endDate)) {
      nextStart = day;
      nextEnd = null;
    } else if (day < startDate) {
      nextStart = day;
      nextEnd = null;
    } else {
      nextEnd = day;
    }
    onChange({
      checkIn: nextStart ? toIsoDate(nextStart) : "",
      checkOut: nextEnd ? toIsoDate(nextEnd) : "",
    });
    if (nextStart && nextEnd) setOpen(false);
  };

  const primaryMonth = buildMonth(view);
  const secondaryMonth = buildMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1));
  const isMobileMonthHeader = typeof window !== "undefined" && window.innerWidth <= 640;
  const primaryMonthLabel = new Date(primaryMonth.year, primaryMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const secondaryMonthLabel = new Date(secondaryMonth.year, secondaryMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const monthLabel = isMobileMonthHeader ? primaryMonthLabel : `${primaryMonthLabel} - ${secondaryMonthLabel}`;

  return (
    <div className={`landing-date-picker la-date-picker${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="la-date-grid">
        <div className="la-date-field">
          <label id={checkInLabelId} className="la-date-label">Check-in</label>
          <button
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkInLabelId}
            aria-label={`Check-in date, ${startDate
              ? startDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="la-date-input"
          >
            {startDate ? startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
        <div className="la-date-field">
          <label id={checkOutLabelId} className="la-date-label">Check-out</label>
          <button
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkOutLabelId}
            aria-label={`Check-out date, ${endDate
              ? endDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="la-date-input"
          >
            {endDate ? endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
      </div>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-label="Choose dates"
          className="listing-date-dropdown landing-date-dropdown"
        >
          <div className="la-date-header">
            <div className="la-date-title">{monthLabel}</div>
            <div className="la-date-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="la-date-nav-btn"
              >
                {"<"}
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="la-date-nav-btn"
              >
                {">"}
              </button>
            </div>
          </div>
          <div className="la-date-body">
            <div className="la-date-months">
              {[primaryMonth, secondaryMonth].map((monthObj) => (
                <div key={`${monthObj.year}-${monthObj.month}`} className="la-date-month">
                  <div className="la-date-month-title">
                    {new Date(monthObj.year, monthObj.month, 1).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <div className="la-date-week" role="row">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} role="columnheader">{d}</div>
                    ))}
                  </div>
                  <div className="la-date-days" role="grid">
                    {monthObj.cells.map((day, idx) => {
                      const disabled = !day || day < today;
                      const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                      const between = inRange(day) && !selected;
                      const dayLabel = day
                        ? day.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                        : "";
                      const stateClass = disabled
                        ? "is-disabled"
                        : selected
                          ? "is-selected"
                          : between
                            ? "is-between"
                            : "is-default";
                      return (
                        <button
                          key={`${monthObj.year}-${monthObj.month}-${idx}`}
                          type="button"
                          disabled={disabled}
                          aria-selected={selected}
                          aria-disabled={disabled}
                          aria-label={dayLabel}
                          aria-hidden={day ? undefined : true}
                          onClick={() => handleDayClick(day)}
                          className={`listing-date-cell ${stateClass}`}
                        >
                          {day ? (
                            <span className="listing-date-cell__day">{day.getDate()}</span>
                          ) : (
                            ""
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="la-date-footer">
              <button
                type="button"
                onClick={() => onChange({ checkIn: "", checkOut: "" })}
                className="la-date-clear"
              >
                Clear dates
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="la-date-done"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function GlobalUnitsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("All");
  const [roomsFilter, setRoomsFilter] = useState(1);
  const [todayPrices, setTodayPrices] = useState({});
  const [todayPricesLoading, setTodayPricesLoading] = useState(false);
  const [stayDates, setStayDates] = useState({ checkIn: "", checkOut: "" });
  const [availableListingIds, setAvailableListingIds] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [imageIndexes, setImageIndexes] = useState({});
  const [imageFading, setImageFading] = useState({});
  const swipeStartXRef = useRef({});
  const imageFadeTimersRef = useRef({});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cityParam = params.get("city") || params.get("destination") || "";
    const checkInParam = params.get("checkIn") || "";
    const checkOutParam = params.get("checkOut") || "";
    const roomsParam = Number.parseInt(params.get("rooms") || "", 10);
    if (cityParam) setCityFilter(cityParam);
    if (checkInParam || checkOutParam) {
      setStayDates((prev) => ({
        checkIn: checkInParam || prev.checkIn,
        checkOut: checkOutParam || prev.checkOut,
      }));
    }
    if (Number.isFinite(roomsParam) && roomsParam > 0) {
      setRoomsFilter(Math.min(8, roomsParam));
    }
  }, [location.search]);

  useEffect(() => {
    let active = true;
    const loadListings = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${apiBase}/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load One Lux Stay Global units.");
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        const parentOnly = results.filter((listing) => !isChildListing(listing));
        const unique = [];
        const seen = new Set();
        parentOnly.forEach((listing) => {
          const key = getListingId(listing);
          if (!key || seen.has(key)) return;
          seen.add(key);
          unique.push(listing);
        });
        unique.sort((a, b) => {
          const cityA = normalizeCity(a) || "Unknown";
          const cityB = normalizeCity(b) || "Unknown";
          if (cityA !== cityB) return cityA.localeCompare(cityB);
          return (a?.title || "").localeCompare(b?.title || "");
        });
        if (!active) return;
        setListings(unique);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Unable to load units.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadListings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTodayPrices = async () => {
      const ids = [...new Set(listings.map(getListingId).filter(Boolean).map(String))];
      if (!ids.length) {
        if (active) setTodayPrices({});
        return;
      }

      setTodayPricesLoading(true);
      const todayIso = toIsoDate(new Date());
      const nextPrices = {};
      const BATCH_SIZE = 35;

      for (let index = 0; index < ids.length; index += BATCH_SIZE) {
        const batchIds = ids.slice(index, index + BATCH_SIZE);
        const qs = new URLSearchParams({
          listingIds: batchIds.join(","),
          startDate: todayIso,
          endDate: todayIso,
          includeAllotment: "true",
        });

        try {
          const res = await fetch(`${apiBase}/check-units/listings/calendar-multi?${qs.toString()}`, {
            cache: "no-store",
          });
          if (!res.ok) continue;
          const data = await res.json();
          const calendars =
            data && typeof data.normalizedCalendars === "object" && data.normalizedCalendars
              ? data.normalizedCalendars
              : {};

          Object.entries(calendars).forEach(([listingId, days]) => {
            if (!Array.isArray(days) || !days.length) return;
            const day = days.find((entry) => entry?.date === todayIso) || days[0];
            if (!day || typeof day.price !== "number" || !Number.isFinite(day.price)) return;
            nextPrices[String(listingId)] = {
              price: day.price,
              currency: typeof day.currency === "string" && day.currency ? day.currency : undefined,
            };
          });
        } catch {
          // Ignore individual batch failures and keep any successful pricing data.
        }
      }

      if (!active) return;
      setTodayPrices(nextPrices);
      setTodayPricesLoading(false);
    };

    loadTodayPrices();
    return () => {
      active = false;
    };
  }, [listings]);

  useEffect(() => {
    if (!stayDates.checkIn || !stayDates.checkOut) {
      setAvailabilityLoading(false);
      setAvailabilityError("");
      setAvailableListingIds(null);
      return;
    }
    const listingIds = [...new Set(listings.map(getListingId).filter(Boolean).map(String))];
    if (!listingIds.length) {
      setAvailabilityLoading(false);
      setAvailabilityError("");
      setAvailableListingIds(new Set());
      return;
    }

    let active = true;
    const run = async () => {
      setAvailabilityLoading(true);
      setAvailabilityError("");
      try {
        const BATCH_SIZE = 35;
        const chunks = [];
        for (let i = 0; i < listingIds.length; i += BATCH_SIZE) {
          chunks.push(listingIds.slice(i, i + BATCH_SIZE));
        }

        const responses = await Promise.all(
          chunks.map(async (chunk) => {
            const qs = new URLSearchParams({
              ids: chunk.join(","),
              checkIn: stayDates.checkIn,
              checkOut: stayDates.checkOut,
              minOccupancy: "1",
            });
            const res = await fetch(
              `${apiBase}/check-units/listings/availability-query?${qs.toString()}`,
              { cache: "no-store" }
            );
            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              throw new Error(errText || `Availability failed (${res.status})`);
            }
            return res.json();
          })
        );

        const nextAvailableIds = new Set();
        responses.forEach((payload) => {
          const rows = Array.isArray(payload?.results) ? payload.results : [];
          rows.forEach((item) => {
            const id = item?.id ? String(item.id) : "";
            if (!id) return;
            if (item?.available === false) return;
            nextAvailableIds.add(id);
          });
        });

        if (!active) return;
        setAvailableListingIds(nextAvailableIds);
      } catch (err) {
        if (!active) return;
        setAvailabilityError(err?.message || "Unable to check availability right now.");
        setAvailableListingIds(null);
      } finally {
        if (active) setAvailabilityLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [listings, stayDates.checkIn, stayDates.checkOut]);

  const cityOptions = useMemo(() => {
    const uniqueCities = new Set(["All"]);
    listings.forEach((listing) => {
      const city = normalizeCity(listing);
      if (city) uniqueCities.add(city);
    });
    return Array.from(uniqueCities);
  }, [listings]);

  const visibleListings = useMemo(
    () => listings.filter((listing) => !isHiddenUnit(getListingId(listing) || listing)),
    [listings],
  );

  const cityAndSearchFilteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleListings.filter((listing) => {
      const city = normalizeCity(listing);
      if (cityFilter !== "All" && city !== cityFilter) return false;
      const listingRoomsRaw = firstNumber(
        listing?.bedrooms,
        listing?.bedroomCount,
        listing?.roomCount,
        listing?.rooms
      );
      const listingRooms = Number.isFinite(listingRoomsRaw) && listingRoomsRaw > 0 ? listingRoomsRaw : 1;
      if (roomsFilter > 1 && listingRooms < roomsFilter) return false;
      if (!q) return true;
      const haystack = [
        listing?.title,
        listing?.nickname,
        city,
        listing?.address?.full,
        listing?.propertyType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleListings, cityFilter, roomsFilter, search]);

  const buildListingLink = (listing) => {
    const basePath = buildListingPath(listing);
    const [pathname, existingQuery = ""] = basePath.split("?");
    const params = new URLSearchParams(existingQuery);
    if (stayDates.checkIn) params.set("checkIn", stayDates.checkIn);
    if (stayDates.checkOut) params.set("checkOut", stayDates.checkOut);
    if (roomsFilter) params.set("rooms", String(roomsFilter));
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };

  const handleListingNavigation = (listing, link, sourceLabel = "") => {
    trackGuestListingClick({
      city: normalizeCity(listing),
      listingId: getListingId(listing),
      listingTitle: listing?.title || listing?.nickname || "One Lux Stay unit",
      destinationPath: link,
      sourceSection: "global_units",
      sourceLabel,
    });
    navigate(link);
  };

  const filteredListings = useMemo(() => {
    if (!stayDates.checkIn || !stayDates.checkOut || !availableListingIds) {
      return cityAndSearchFilteredListings;
    }
    return cityAndSearchFilteredListings.filter((listing) =>
      getListingIdentityIds(listing).some((id) => availableListingIds.has(id))
    );
  }, [cityAndSearchFilteredListings, stayDates.checkIn, stayDates.checkOut, availableListingIds]);

  const getImageIndex = (listingId, totalImages) => {
    if (!listingId || totalImages <= 0) return 0;
    const rawIndex = imageIndexes[listingId] ?? 0;
    const normalized = ((rawIndex % totalImages) + totalImages) % totalImages;
    return normalized;
  };

  const shiftImage = (listingId, totalImages, step) => {
    if (!listingId || totalImages <= 1) return;
    if (imageFadeTimersRef.current[listingId]) {
      clearTimeout(imageFadeTimersRef.current[listingId]);
      delete imageFadeTimersRef.current[listingId];
    }
    setImageFading((prev) => ({ ...prev, [listingId]: true }));
    imageFadeTimersRef.current[listingId] = setTimeout(() => {
      setImageIndexes((prev) => {
        const rawIndex = prev[listingId] ?? 0;
        const current = ((rawIndex % totalImages) + totalImages) % totalImages;
        const next = (current + step + totalImages) % totalImages;
        return { ...prev, [listingId]: next };
      });
      requestAnimationFrame(() => {
        setImageFading((prev) => ({ ...prev, [listingId]: false }));
      });
      delete imageFadeTimersRef.current[listingId];
    }, 130);
  };

  useEffect(() => {
    return () => {
      Object.values(imageFadeTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      imageFadeTimersRef.current = {};
    };
  }, []);

  const handleTouchStart = (listingId, event) => {
    const touch = event.touches?.[0];
    if (!touch || !listingId) return;
    swipeStartXRef.current[listingId] = touch.clientX;
  };

  const handleTouchEnd = (listingId, totalImages, event) => {
    if (!listingId || totalImages <= 1) return;
    const startX = swipeStartXRef.current[listingId];
    delete swipeStartXRef.current[listingId];
    const touch = event.changedTouches?.[0];
    if (typeof startX !== "number" || !touch) return;
    const delta = touch.clientX - startX;
    if (Math.abs(delta) < 32) return;
    shiftImage(listingId, totalImages, delta < 0 ? 1 : -1);
  };

  const handleCarouselKeyDown = (event, listingId, totalImages) => {
    if (totalImages <= 1) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      shiftImage(listingId, totalImages, -1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      shiftImage(listingId, totalImages, 1);
    }
  };

  return (
    <div className="policy-page">
      <header className="global-hero">
        <div className="global-hero__bg" aria-hidden="true" />
        <div className="policy-topbar global-hero__topbar">
          <p className="global-hero__kicker-top">One Lux Stay Global</p>
        </div>
        <div className="global-hero__inner">
          <Link
            to="/"
            className="landing-logo-mark landing-logo-mark--image global-hero__brand"
            aria-label="One Lux Stay home"
          >
            <img
              src={LOGO_URL}
              alt="One Lux Stay"
              className="landing-logo-image global-hero__logo"
              loading="eager"
              onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
            />
          </Link>
          <h1 className="global-hero__title landing-display">View All Our Units Worldwide</h1>
          <p className="global-hero__tagline">Luxury Without Borders.</p>
          <p className="global-hero__subtitle">
            Guests can browse every OneLuxStay unit we offer across all destinations worldwide.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="global-units-filters mb-5 rounded-2xl border border-[rgba(201,181,156,0.5)] bg-white/70 p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-sm text-[var(--ink-soft)] lg:col-span-1">
              Search
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by unit, city, address"
                className="rounded-lg border border-[rgba(201,181,156,0.6)] bg-white px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--landing-amber)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--ink-soft)] lg:col-span-1">
              City
              <select
                value={cityFilter}
                onChange={(event) => setCityFilter(event.target.value)}
                className="rounded-lg border border-[rgba(201,181,156,0.6)] bg-white px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--landing-amber)]"
              >
                {cityOptions.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--ink-soft)] lg:col-span-1">
              Rooms
              <select
                value={roomsFilter}
                onChange={(event) => setRoomsFilter(Number(event.target.value) || 1)}
                className="rounded-lg border border-[rgba(201,181,156,0.6)] bg-white px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--landing-amber)]"
              >
                <option value={1}>Any</option>
                {[2, 3, 4, 5, 6, 7, 8].map((roomCount) => (
                  <option key={roomCount} value={roomCount}>
                    {roomCount}+
                  </option>
                ))}
              </select>
            </label>
            <div className="global-units-date-picker sm:col-span-2 lg:col-span-2">
              <DateRangePicker value={stayDates} onChange={setStayDates} />
            </div>
          </div>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Showing {filteredListings.length} of {listings.length} units.
          </p>
          {stayDates.checkIn && stayDates.checkOut && (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {availabilityLoading
                ? "Checking live availability for your selected dates..."
                : availabilityError
                  ? `Availability check issue: ${availabilityError}`
                  : `Showing units available from ${formatDateForDisplay(stayDates.checkIn)} to ${formatDateForDisplay(stayDates.checkOut)}.`}
            </p>
          )}
        </section>

        {loading && (
          <div className="rounded-2xl border border-[rgba(201,181,156,0.5)] bg-white/70 p-6 text-[var(--ink-soft)]">
            Loading global units...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            {error}
          </div>
        )}

        {!loading && !error && filteredListings.length === 0 && (
          <div className="rounded-2xl border border-[rgba(201,181,156,0.5)] bg-white/70 p-6 text-[var(--ink-soft)]">
            No units match your filters.
          </div>
        )}

        {!loading && !error && filteredListings.length > 0 && (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredListings.map((listing) => {
              const id = getListingId(listing);
              const city = normalizeCity(listing) || "Unknown city";
              const images = getListingImages(listing);
              const listingId = String(id || "");
              const imageCount = images.length;
              const imageIndex = getImageIndex(listingId, imageCount);
              const heroImage = imageCount ? images[imageIndex] : "";
              const link = buildListingLink(listing);
              const todayPriceEntry = todayPrices[listingId];
              const fallbackPrice = getListingFallbackPrice(listing);
              const fallbackCurrency = getListingCurrency(listing);
              const nightlyValue = typeof todayPriceEntry?.price === "number" ? todayPriceEntry.price : fallbackPrice;
              const nightlyCurrency = todayPriceEntry?.currency || fallbackCurrency;
              const nightly = formatCurrency(nightlyValue, nightlyCurrency);
              const carouselId = `global-unit-carousel-${toDomId(listingId)}`;
              const listingTitle = listing?.title || listing?.nickname || "One Lux Stay unit";
              const nightlyLabel = todayPriceEntry
                ? `Today's price ${nightly} / night`
                : todayPricesLoading && fallbackPrice === null
                  ? "Loading today's price..."
                  : `${nightly} / night`;

              return (
                <article
                  key={id || `${listing?.title || "unit"}-${city}`}
                  role="link"
                  tabIndex={0}
                  aria-label={`View ${listingTitle}`}
                  onClick={(event) => {
                    if (event.defaultPrevented) return;
                    const target = event.target;
                    if (target instanceof Element && target.closest("a,button,input,select,textarea,[role='button']")) {
                      return;
                    }
                    handleListingNavigation(listing, link, "listing_card");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const target = event.target;
                    if (target instanceof Element && target.closest("a,button,input,select,textarea,[role='button']")) {
                      return;
                    }
                    event.preventDefault();
                    handleListingNavigation(listing, link, "listing_card_keyboard");
                  }}
                  className="cursor-pointer overflow-hidden rounded-2xl border border-[rgba(201,181,156,0.55)] bg-white shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-amber)]"
                >
                  <div
                    id={carouselId}
                    className="group relative aspect-[16/10] w-full overflow-hidden bg-[rgba(239,233,227,0.8)]"
                    role="region"
                    aria-roledescription="carousel"
                    aria-label={`${listing?.title || "Unit"} image gallery`}
                    tabIndex={imageCount > 1 ? 0 : -1}
                    onKeyDown={(event) => handleCarouselKeyDown(event, listingId, imageCount)}
                    onTouchStart={(event) => handleTouchStart(listingId, event)}
                    onTouchEnd={(event) => handleTouchEnd(listingId, imageCount, event)}
                  >
                    {heroImage ? (
                      <img
                        key={`${listingId}-${imageIndex}-${heroImage}`}
                        src={heroImage}
                        alt={`${listing?.title || "One Lux Stay unit"} image ${imageIndex + 1} of ${Math.max(1, imageCount)}`}
                        loading="lazy"
                        className={`global-unit-card__image h-full w-full object-cover${imageFading[listingId] ? " is-fading" : ""}`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--ink-soft)]">
                        Image unavailable
                      </div>
                    )}
                    {imageCount > 1 && (
                      <>
                        <button
                          type="button"
                          aria-controls={carouselId}
                          aria-label="Previous image"
                          onClick={() => shiftImage(listingId, imageCount, -1)}
                          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/50 bg-black/58 px-3 py-2 text-xl font-bold leading-none text-white shadow-lg backdrop-blur-[1px] transition hover:bg-black/72 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-amber)]"
                        >
                          <span aria-hidden="true">{"<"}</span>
                        </button>
                        <button
                          type="button"
                          aria-controls={carouselId}
                          aria-label="Next image"
                          onClick={() => shiftImage(listingId, imageCount, 1)}
                          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/50 bg-black/58 px-3 py-2 text-xl font-bold leading-none text-white shadow-lg backdrop-blur-[1px] transition hover:bg-black/72 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-amber)]"
                        >
                          <span aria-hidden="true">{">"}</span>
                        </button>
                        <div
                          className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white"
                          aria-hidden="true"
                        >
                          {imageIndex + 1}/{imageCount}
                        </div>
                        <p className="sr-only" aria-live="polite">
                          Showing image {imageIndex + 1} of {imageCount}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">{city}</p>
                      <h2 className="text-lg font-semibold text-[var(--ink)]">
                        {listingTitle}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]">
                      <span className="rounded-full bg-[rgba(239,233,227,0.85)] px-2 py-1">
                        Sleeps {listing?.accommodates ?? "--"}
                      </span>
                      <span className="rounded-full bg-[rgba(239,233,227,0.85)] px-2 py-1">
                        Beds {listing?.bedrooms ?? "--"}
                      </span>
                      <span className="rounded-full bg-[rgba(239,233,227,0.85)] px-2 py-1">
                        Baths {listing?.bathrooms ?? "--"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--ink)]">{nightlyLabel}</p>
                      <Link
                        to={link}
                        onClick={(event) => {
                          event.preventDefault();
                          handleListingNavigation(listing, link, "view_unit_button");
                        }}
                        className="rounded-lg border border-[var(--landing-amber)] bg-[var(--landing-amber-soft)] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(201,181,156,0.3)]"
                      >
                        View unit
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

export default GlobalUnitsPage;
