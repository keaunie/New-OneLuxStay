import { useEffect, useRef } from "react";

export default function useInlineListingMap({
  activeListing,
  mapsApiKey,
  defaultCoords,
  getListingCoords,
  getListingAddressQuery,
  loadMaps,
}) {
  const inlineListingMapRef = useRef(null);
  const inlineListingMapInstanceRef = useRef(null);
  const inlineListingMapMarkerRef = useRef(null);

  useEffect(() => {
    if (!inlineListingMapRef.current || !activeListing || !mapsApiKey) return undefined;
    let cancelled = false;

    loadMaps(mapsApiKey)
      .then((maps) => {
        if (cancelled || !inlineListingMapRef.current) return;

        const initialCenter = getListingCoords(activeListing) || defaultCoords;
        const map = new maps.Map(inlineListingMapRef.current, {
          center: initialCenter,
          zoom: 15,
          minZoom: 10,
          maxZoom: 21,
          gestureHandling: "none",
          scrollwheel: false,
          draggable: false,
          keyboardShortcuts: false,
          zoomControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        inlineListingMapInstanceRef.current = map;

        if (inlineListingMapMarkerRef.current) {
          inlineListingMapMarkerRef.current.setMap?.(null);
          inlineListingMapMarkerRef.current = null;
        }

        const placeMarker = (position) => {
          if (cancelled) return;
          inlineListingMapMarkerRef.current = new maps.Marker({
            map,
            position,
            title: activeListing.title || "OneLuxStay",
          });
        };

        const coords = getListingCoords(activeListing);
        if (coords) {
          placeMarker(coords);
          return;
        }

        const address = getListingAddressQuery(activeListing);
        if (!address) {
          placeMarker(initialCenter);
          return;
        }

        const geocoder = new maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
          if (cancelled) return;
          if (status === "OK" && results?.[0]?.geometry?.location) {
            const location = results[0].geometry.location;
            map.setCenter(location);
            placeMarker(location);
          } else {
            placeMarker(initialCenter);
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (inlineListingMapInstanceRef.current?.__leafletMap?.remove) {
        inlineListingMapInstanceRef.current.__leafletMap.remove();
      }
      inlineListingMapInstanceRef.current = null;
      if (inlineListingMapMarkerRef.current) {
        inlineListingMapMarkerRef.current.setMap?.(null);
        inlineListingMapMarkerRef.current = null;
      }
    };
  }, [
    activeListing,
    mapsApiKey,
    defaultCoords,
    getListingCoords,
    getListingAddressQuery,
    loadMaps,
  ]);

  return inlineListingMapRef;
}
