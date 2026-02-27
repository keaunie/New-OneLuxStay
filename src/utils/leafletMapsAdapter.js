import L from "leaflet";
import "leaflet/dist/leaflet.css";
import apiBase from "./apiBase";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const GEOCODE_PROXY_URL = `${apiBase}/geocode`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getLatLngTuple = (value, fallback = [0, 0]) => {
  if (!value) return fallback;
  if (Array.isArray(value) && value.length >= 2) {
    const lat = toNumber(value[0]);
    const lng = toNumber(value[1]);
    if (lat !== null && lng !== null) return [lat, lng];
  }
  if (typeof value.lat === "function" && typeof value.lng === "function") {
    const lat = toNumber(value.lat());
    const lng = toNumber(value.lng());
    if (lat !== null && lng !== null) return [lat, lng];
  }
  if (typeof value.lat === "number" && typeof value.lng === "number") {
    return [value.lat, value.lng];
  }
  return fallback;
};

const normalizeCoords = (value) => {
  if (!value) return null;
  const [lat, lng] = getLatLngTuple(value, [null, null]);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const buildViewBox = (location, radiusMeters = 2500) => {
  const coords = normalizeCoords(location);
  if (!coords) return null;
  const latRadius = Math.max(radiusMeters / 111320, 0.01);
  const cosLat = Math.cos((coords.lat * Math.PI) / 180) || 1;
  const lngRadius = Math.max(radiusMeters / (111320 * Math.max(Math.abs(cosLat), 0.2)), 0.01);
  const left = coords.lng - lngRadius;
  const right = coords.lng + lngRadius;
  const top = coords.lat + latRadius;
  const bottom = coords.lat - latRadius;
  return `${left},${top},${right},${bottom}`;
};

const geocodeAddress = async (address, { location = null, radius = 2500 } = {}) => {
  if (!address || !String(address).trim()) return null;
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    q: String(address).trim(),
  });
  const viewbox = buildViewBox(location, radius);
  if (viewbox) {
    params.set("viewbox", viewbox);
    params.set("bounded", "1");
  }
  const response = await fetch(`${GEOCODE_PROXY_URL}?${params.toString()}`);
  if (!response.ok) return null;
  const payload = await response.json();
  if (!Array.isArray(payload) || !payload.length) return null;
  const lat = toNumber(payload[0]?.lat);
  const lng = toNumber(payload[0]?.lon);
  if (lat === null || lng === null) return null;
  return {
    lat,
    lng,
    label: payload[0]?.display_name || String(address).trim(),
  };
};

class LatLngAdapter {
  constructor(lat, lng) {
    this._lat = toNumber(lat) ?? 0;
    this._lng = toNumber(lng) ?? 0;
  }

  lat() {
    return this._lat;
  }

  lng() {
    return this._lng;
  }
}

class SizeAdapter {
  constructor(width, height) {
    this.width = Number(width) || 0;
    this.height = Number(height) || 0;
  }
}

class PointAdapter {
  constructor(x, y) {
    this.x = Number(x) || 0;
    this.y = Number(y) || 0;
  }
}

class LatLngBoundsAdapter {
  constructor() {
    this._bounds = L.latLngBounds([]);
  }

  extend(value) {
    this._bounds.extend(getLatLngTuple(value));
    return this;
  }

  contains(value) {
    if (!this._bounds.isValid()) return false;
    return this._bounds.contains(getLatLngTuple(value));
  }
}

class MapAdapter {
  constructor(target, options = {}) {
    this._map = L.map(target, {
      zoomControl: options.zoomControl !== false,
      scrollWheelZoom: options.scrollwheel !== false,
      dragging: options.draggable !== false,
      keyboard: options.keyboardShortcuts !== false,
      minZoom: Number.isFinite(options.minZoom) ? options.minZoom : 2,
      maxZoom: Number.isFinite(options.maxZoom) ? options.maxZoom : 20,
    });
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 20,
    }).addTo(this._map);
    const [lat, lng] = getLatLngTuple(options.center, [0, 0]);
    const zoom = Number.isFinite(options.zoom) ? options.zoom : 13;
    this._map.setView([lat, lng], zoom);
  }

  setCenter(value) {
    const [lat, lng] = getLatLngTuple(value, [0, 0]);
    this._map.setView([lat, lng], this._map.getZoom(), { animate: false });
  }

  getCenter() {
    const center = this._map.getCenter();
    return new LatLngAdapter(center.lat, center.lng);
  }

  getZoom() {
    return this._map.getZoom();
  }

  fitBounds(bounds, padding = {}) {
    if (!bounds?._bounds?.isValid?.()) return;
    this._map.fitBounds(bounds._bounds, {
      paddingTopLeft: [padding.left || 0, padding.top || 0],
      paddingBottomRight: [padding.right || 0, padding.bottom || 0],
    });
  }

  panTo(value) {
    this._map.panTo(getLatLngTuple(value, [0, 0]));
  }
}

const toLeafletIcon = (icon) => {
  if (!icon) return null;
  if (icon.path === "CIRCLE") return null;
  if (!icon.url) return null;
  const width = Number(icon.scaledSize?.width) || 24;
  const height = Number(icon.scaledSize?.height) || 24;
  const anchorX = Number(icon.anchor?.x) || Math.round(width / 2);
  const anchorY = Number(icon.anchor?.y) || Math.round(height / 2);
  return L.icon({
    iconUrl: icon.url,
    iconSize: [width, height],
    iconAnchor: [anchorX, anchorY],
  });
};

class MarkerAdapter {
  constructor({ map, position, title = "", icon = null, zIndex = 0 } = {}) {
    this._mapAdapter = null;
    this._layer = null;
    this._position = getLatLngTuple(position, [0, 0]);
    const leafletIcon = toLeafletIcon(icon);
    if (icon?.path === "CIRCLE") {
      const radius = Math.max(8, Math.round((Number(icon.scale) || 18) / 2));
      this._layer = L.circleMarker(this._position, {
        radius,
        color: icon.strokeColor || "#1f1c19",
        weight: Number(icon.strokeWeight) || 1,
        fillColor: icon.fillColor || "#1f1c19",
        fillOpacity: Number.isFinite(icon.fillOpacity) ? icon.fillOpacity : 1,
      });
    } else if (leafletIcon) {
      this._layer = L.marker(this._position, { icon: leafletIcon, title });
    } else {
      this._layer = L.circleMarker(this._position, {
        radius: 8,
        color: "#1f1c19",
        weight: 1,
        fillColor: "#1f1c19",
        fillOpacity: 1,
      });
    }
    if (typeof this._layer.setZIndexOffset === "function") {
      this._layer.setZIndexOffset(Number(zIndex) || 0);
    }
    if (map) this.setMap(map);
  }

  addListener(eventName, callback) {
    const leafletEvent = eventName === "click" ? "click" : eventName;
    this._layer.on(leafletEvent, callback);
    return {
      remove: () => this._layer.off(leafletEvent, callback),
    };
  }

  setMap(nextMap) {
    if (this._mapAdapter?.__leafletMap) {
      this._layer.removeFrom(this._mapAdapter.__leafletMap);
    }
    if (nextMap?.__leafletMap) {
      this._layer.addTo(nextMap.__leafletMap);
      this._mapAdapter = nextMap;
    } else {
      this._mapAdapter = null;
    }
  }

  getPosition() {
    if (typeof this._layer.getLatLng === "function") {
      const pos = this._layer.getLatLng();
      return new LatLngAdapter(pos.lat, pos.lng);
    }
    return new LatLngAdapter(this._position[0], this._position[1]);
  }
}

class InfoWindowAdapter {
  constructor() {
    this._content = "";
  }

  setContent(content) {
    this._content = content || "";
  }

  open(map, marker) {
    const leafletMap = map?.__leafletMap || marker?._mapAdapter?.__leafletMap;
    if (!leafletMap) return;
    const markerPosition = marker?.getPosition?.();
    const [lat, lng] = getLatLngTuple(markerPosition, [
      leafletMap.getCenter().lat,
      leafletMap.getCenter().lng,
    ]);
    L.popup({ maxWidth: 280 })
      .setLatLng([lat, lng])
      .setContent(this._content || "")
      .openOn(leafletMap);
  }
}

class GeocoderAdapter {
  geocode({ address }, callback) {
    geocodeAddress(address)
      .then((result) => {
        if (!result) {
          callback([], "ZERO_RESULTS");
          return;
        }
        callback(
          [
            {
              geometry: {
                location: new LatLngAdapter(result.lat, result.lng),
              },
            },
          ],
          "OK"
        );
      })
      .catch(() => callback([], "ERROR"));
  }
}

class PlacesServiceAdapter {
  constructor(map) {
    this._map = map;
  }

  textSearch(request = {}, callback) {
    geocodeAddress(request.query, {
      location: request.location || this._map?.getCenter?.(),
      radius: request.radius || 2500,
    })
      .then((result) => {
        if (!result) {
          callback([], "ZERO_RESULTS");
          return;
        }
        callback(
          [
            {
              name: request.query || result.label,
              geometry: {
                location: new LatLngAdapter(result.lat, result.lng),
              },
            },
          ],
          "OK"
        );
      })
      .catch(() => callback([], "ERROR"));
  }
}

class TransitLayerAdapter {
  setMap() {}
}

const mapEventAdapter = {
  addListener(target, eventName, callback) {
    if (!target?.__leafletMap) return { remove: () => {} };
    const mappedEvent = eventName === "zoom_changed" ? "zoomend" : eventName;
    target.__leafletMap.on(mappedEvent, callback);
    return {
      remove: () => target.__leafletMap.off(mappedEvent, callback),
    };
  },
};

const createMapsApiAdapter = () => ({
  Map: class extends MapAdapter {
    constructor(target, options) {
      super(target, options);
      this.__leafletMap = this._map;
    }
  },
  Marker: MarkerAdapter,
  Geocoder: GeocoderAdapter,
  InfoWindow: InfoWindowAdapter,
  TransitLayer: TransitLayerAdapter,
  LatLng: LatLngAdapter,
  LatLngBounds: LatLngBoundsAdapter,
  Size: SizeAdapter,
  Point: PointAdapter,
  SymbolPath: {
    CIRCLE: "CIRCLE",
  },
  event: mapEventAdapter,
  places: {
    PlacesService: PlacesServiceAdapter,
    PlacesServiceStatus: {
      OK: "OK",
    },
  },
});

let adapterPromise = null;

export const loadLeafletMaps = () => {
  if (!adapterPromise) {
    adapterPromise = Promise.resolve(createMapsApiAdapter());
  }
  return adapterPromise;
};

export const buildStaticMapUrl = (coords, size = "400x280", zoom = 14) => {
  const normalized = normalizeCoords(coords);
  if (!normalized) return "";
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${normalized.lat},${normalized.lng}&zoom=${zoom}&size=${size}&markers=${normalized.lat},${normalized.lng},red-pushpin`;
};

export const buildEmbedMapUrl = (coords, zoom = 15) => {
  const normalized = normalizeCoords(coords);
  if (!normalized) return "";
  const span = Math.max(0.003, (20 - Math.min(Math.max(zoom, 3), 19)) * 0.0025);
  const left = normalized.lng - span;
  const right = normalized.lng + span;
  const top = normalized.lat + span;
  const bottom = normalized.lat - span;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${normalized.lat}%2C${normalized.lng}`;
};
