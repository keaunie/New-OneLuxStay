import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReservationHero from "../components/reservations/ReservationHero.jsx";
import ReservationFilters from "../components/reservations/ReservationFilters.jsx";
import ReservationGrid from "../components/reservations/ReservationGrid.jsx";
import ReservationModal from "../components/reservations/ReservationModal.jsx";
import "./GuestReservationPage.css";

const DEFAULT_FILTERS = { city: "", guests: "", search: "" };

// Merge an Apaleo property + optional unit group into the card shape
// that ReservationCard / ReservationModal consume.
const buildCard = (property, unitGroup = null) => {
  // Stable unique key: property::unitGroup or just property if no unit groups
  const id = unitGroup ? `${property.id}::${unitGroup.id}` : property.id;
  const title = unitGroup
    ? `${property.title} — ${unitGroup.name}`
    : property.title;

  return {
    id,
    _id: id,
    _apaleoPropertyId: property.id,
    _apaleoUnitGroupId: unitGroup?.id ?? null,
    _apaleoType: unitGroup ? "unit_group" : "property",
    title,
    propertyTitle: property.title,
    unitGroupName: unitGroup?.name ?? null,
    unitGroupId: unitGroup?.id ?? null,
    propertyId: property.id,
    city: property.city,
    address: { city: property.city, full: property.address },
    pictures: (property.images || []).map((url) => ({ original: url })),
    accommodates: unitGroup?.maxOccupancy ?? 0,
    bedrooms: null,
    bathrooms: null,
    amenities: property.amenities || [],
    description: unitGroup?.description || "",
    publicDescription: { summary: unitGroup?.description || "" },
    prices: { nightly: null, currency: "EUR", cleaningFee: 0 },
    provider: "apaleo",
    raw: { property: property.raw, unitGroup: unitGroup?.raw ?? null },
  };
};

const matchesFilters = (card, { city, guests, search }) => {
  if (city) {
    const cardCity = String(card.city || "").toLowerCase();
    if (!cardCity.includes(city.toLowerCase())) return false;
  }
  if (guests) {
    if ((card.accommodates || 0) < Number(guests)) return false;
  }
  if (search) {
    const q = search.toLowerCase();
    const hay = [card.title, card.propertyTitle, card.unitGroupName, card.city]
      .map((v) => String(v || "").toLowerCase())
      .join(" ");
    if (!hay.includes(q)) return false;
  }
  return true;
};

export default function GuestReservationPage() {
  const [properties, setProperties] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [filters,    setFilters]    = useState(DEFAULT_FILTERS);
  const [selected,   setSelected]   = useState(null);

  const abortRef = useRef(null);

  const loadProperties = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setError("");

    try {
      // Fetch Apaleo properties and unit groups in parallel — no Guesty, no Supabase listings
      const fetchOrThrow = async (url) => {
        try {
          return await fetch(url, { credentials: "omit", signal });
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          throw new Error(
            `Could not reach the server (${url.split("/").pop()}). ` +
            "Make sure 'netlify dev' is running locally, or check the Netlify deploy logs.",
          );
        }
      };

      const [propRes, ugRes] = await Promise.all([
        fetchOrThrow("/.netlify/functions/apaleo-properties"),
        fetchOrThrow("/.netlify/functions/apaleo-unit-groups"),
      ]);

      if (!propRes.ok) {
        const body = await propRes.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || `Property service error (${propRes.status})`);
      }

      const [propData, ugData] = await Promise.all([
        propRes.json(),
        ugRes.ok ? ugRes.json() : Promise.resolve({ results: [] }),
      ]);

      if (signal.aborted) return;

      const propList = Array.isArray(propData?.results) ? propData.results : [];
      const ugList   = Array.isArray(ugData?.results)  ? ugData.results   : [];

      console.log("[reserve] Apaleo properties", propList);
      console.log("[reserve] Apaleo unit groups", ugList);

      // Index unit groups by propertyId
      const ugsByProperty = new Map();
      ugList.forEach((ug) => {
        if (!ug?.id || !ug?.propertyId) return;
        const list = ugsByProperty.get(ug.propertyId) || [];
        list.push(ug);
        ugsByProperty.set(ug.propertyId, list);
      });

      // Emit one card per unit group. If a property has no unit groups,
      // emit one property-level card as fallback.
      const seen = new Set();
      const cards = [];

      propList.forEach((prop) => {
        if (!prop?.id) return;
        const groups = ugsByProperty.get(prop.id) || [];

        if (groups.length === 0) {
          if (!seen.has(prop.id)) {
            seen.add(prop.id);
            cards.push(buildCard(prop, null));
          }
        } else {
          groups.forEach((ug) => {
            const key = `${prop.id}::${ug.id}`;
            if (!seen.has(key)) {
              seen.add(key);
              cards.push(buildCard(prop, ug));
            }
          });
        }
      });

      setProperties(cards);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (!signal.aborted) setError(err.message || "Failed to load Apaleo properties");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [loadProperties]);

  // Derive city list directly from Apaleo results — no hardcoded cities
  const cities = useMemo(() => {
    const seen = new Set();
    return properties
      .map((p) => p.city)
      .filter((c) => c && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()))
      .sort();
  }, [properties]);

  const filtered = useMemo(
    () => properties.filter((p) => matchesFilters(p, filters)),
    [properties, filters],
  );

  return (
    <div className="grp-page">
      <ReservationHero />

      <ReservationFilters
        filters={filters}
        onFiltersChange={setFilters}
        cities={cities}
        count={filtered.length}
        total={properties.length}
        loading={loading}
      />

      <div className="grp-main">
        <ReservationGrid
          properties={filtered}
          loading={loading}
          error={error}
          loadingLabel="Loading Apaleo inventory…"
          emptyLabel="No Apaleo properties available."
          onSelect={setSelected}
          onRetry={loadProperties}
        />
      </div>

      {selected && (
        <ReservationModal
          property={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
