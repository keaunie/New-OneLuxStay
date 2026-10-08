import { useEffect, useState } from "react";
import { fetchResidences, FALLBACK_RESIDENCES } from "./residences.js";

let cache = null;

// Loads the Redondo Beach residences once per visit and shares them across pages.
export default function useResidences() {
  const [state, setState] = useState(() =>
    cache ? { residences: cache, loading: false, live: true } : { residences: FALLBACK_RESIDENCES, loading: true, live: false },
  );

  useEffect(() => {
    if (cache) return undefined;
    const controller = new AbortController();
    fetchResidences(controller.signal)
      .then((residences) => {
        cache = residences;
        setState({ residences, loading: false, live: true });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState({ residences: FALLBACK_RESIDENCES, loading: false, live: false });
      });
    return () => controller.abort();
  }, []);

  return state;
}
