"use strict";

// Public Mapbox token used by this client-side Mapbox GL JS project.
// Never replace it with a secret token beginning with "sk.".
const MAPBOX_TOKEN = "pk.eyJ1IjoiZWxpYW4zMTc4IiwiYSI6ImNtcnZlZGpkdDBvbXgyd3B2eGMyajdseDUifQ.GlgugnGUmcRzqOLIaF_16w";

const CAMPUS = [-73.9626, 40.8075];
const CONTEXT_PATH = "columbia_delivery_context.geojson";
const FALLBACK_RESTAURANTS_PATH = "columbia_restaurants_fallback.geojson";

// A smaller, selected request is more reliable than downloading every inspection field.
const RESTAURANT_API_BASE = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const RESTAURANT_API_PARAMS = new URLSearchParams({
  "$select": [
    "camis", "dba", "boro", "building", "street", "zipcode",
    "cuisine_description", "inspection_date", "action", "score", "grade",
    "record_date", "latitude", "longitude"
  ].join(","),
  "$limit": "5000",
  "$order": "inspection_date DESC",
  "$where": "zipcode in ('10025','10026','10027','10031') AND latitude IS NOT NULL AND longitude IS NOT NULL"
});
const RESTAURANT_API = `${RESTAURANT_API_BASE}?${RESTAURANT_API_PARAMS.toString()}`;

const CAMPUS_VIEW = {
  center: CAMPUS,
  zoom: 14.25,
  pitch: 34,
  bearing: -12,
  duration: 1350
};

const DISTRICT_VIEW = {
  center: [-73.9605, 40.8107],
  zoom: 13.15,
  pitch: 0,
  bearing: 0,
  duration: 1450
};

const FOOD_COLORS = {
  "Pizza": "#e4572e",
  "Coffee & Bakery": "#8a5a44",
  "Asian": "#276fbf",
  "Latin & Caribbean": "#6f8f3a",
  "American & Fast Food": "#dca62a",
  "Other": "#77777f"
};

const state = {
  map: null,
  contextData: null,
  restaurants: [],
  selectedCuisine: "all",
  selectedRadius: 800,
  selectedGrade: "all",
  selectedCorridor: "all",
  displayMode: "points",
  dataMode: "unknown",
  dataWarning: ""
};

const statusElement = document.getElementById("status");
const dataSourceBadge = document.getElementById("data-source-badge");
const errorPanel = document.getElementById("error-panel");
const errorMessage = document.getElementById("error-message");
const exitPresentationButton = document.getElementById("exit-presentation");

function setStatus(message, warning = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-warning", warning);
}

function setDataMode(mode) {
  state.dataMode = mode;
  dataSourceBadge.classList.remove("is-live", "is-fallback");
  if (mode === "live") {
    dataSourceBadge.textContent = "LIVE NYC OPEN DATA";
    dataSourceBadge.classList.add("is-live");
  } else if (mode === "fallback") {
    dataSourceBadge.textContent = "OFFLINE FALLBACK";
    dataSourceBadge.classList.add("is-fallback");
  } else {
    dataSourceBadge.textContent = "DATA —";
  }
}

function showFatalError(message) {
  errorMessage.textContent = message;
  errorPanel.hidden = false;
  setStatus("Map error — see the message in the center of the page.", true);
}

function validToken(token) {
  return typeof token === "string" &&
    token.startsWith("pk.") &&
    token.length > 40 &&
    !token.includes("...") &&
    !token.includes("…");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const latitude1 = toRadians(a[1]);
  const latitude2 = toRadians(b[1]);
  const latitudeDelta = toRadians(b[1] - a[1]);
  const longitudeDelta = toRadians(b[0] - a[0]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

function destinationPoint(center, radiusMeters, bearingDegrees) {
  const earthRadius = 6371000;
  const angularDistance = radiusMeters / earthRadius;
  const bearing = toRadians(bearingDegrees);
  const latitude = toRadians(center[1]);
  const longitude = toRadians(center[0]);
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
    Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude = longitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude)
  );
  return [toDegrees(destinationLongitude), toDegrees(destinationLatitude)];
}

function pointToSegmentMeters(point, start, end) {
  const latitudeScale = 111320;
  const longitudeScale = 111320 * Math.cos(toRadians(point[1]));
  const px = point[0] * longitudeScale;
  const py = point[1] * latitudeScale;
  const ax = start[0] * longitudeScale;
  const ay = start[1] * latitudeScale;
  const bx = end[0] * longitudeScale;
  const by = end[1] * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointToLineMeters(point, coordinates) {
  let minimum = Infinity;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    minimum = Math.min(minimum, pointToSegmentMeters(point, coordinates[index], coordinates[index + 1]));
  }
  return minimum;
}

function circleFeature(center, radiusMeters, steps = 96) {
  const coordinates = [];
  for (let step = 0; step <= steps; step += 1) {
    coordinates.push(destinationPoint(center, radiusMeters, step / steps * 360));
  }
  return {
    type: "Feature",
    properties: { radius_m: radiusMeters, label: radiusMeters === 800 ? "800 M FOCUS" : `${radiusMeters.toLocaleString()} m` },
    geometry: { type: "Polygon", coordinates: [coordinates] }
  };
}

function classifyCuisine(cuisine) {
  const value = String(cuisine || "").toLowerCase();
  if (value.includes("pizza")) return "Pizza";
  if (["coffee", "café", "cafe", "bakery", "donut", "tea", "juice", "dessert", "ice cream", "bagel", "pastry"].some(term => value.includes(term))) {
    return "Coffee & Bakery";
  }
  if (["chinese", "japanese", "korean", "thai", "indian", "pakistani", "vietnamese", "asian", "filipino", "indonesian", "bangladeshi", "southeast asian"].some(term => value.includes(term))) {
    return "Asian";
  }
  if (["latin", "mexican", "caribbean", "spanish", "cuban", "peruvian", "colombian", "dominican", "brazilian", "ecuadorian"].some(term => value.includes(term))) {
    return "Latin & Caribbean";
  }
  if (["american", "hamburger", "chicken", "sandwich", "hotdog", "barbecue", "steak", "salad", "fast food"].some(term => value.includes(term))) {
    return "American & Fast Food";
  }
  return "Other";
}

function gradeCategory(properties) {
  const grade = String(properties.grade || "").trim().toUpperCase();
  const action = String(properties.action || "").toLowerCase();
  if (grade === "A") return "A";
  if (["B", "C", "N", "P", "Z"].includes(grade) || action.includes("closed")) return "attention";
  return "ungraded";
}

function contextFeatures(type) {
  return (state.contextData?.features || []).filter(feature => feature.properties?.feature_type === type);
}

function assignSpatialContext(coordinates) {
  const corridors = contextFeatures("analysis_corridor");
  const gates = contextFeatures("access_gate");

  let nearestCorridor = "Cross streets / other";
  let nearestCorridorDistance = Infinity;
  for (const corridor of corridors) {
    const distance = pointToLineMeters(coordinates, corridor.geometry.coordinates);
    if (distance < nearestCorridorDistance) {
      nearestCorridorDistance = distance;
      nearestCorridor = corridor.properties.corridor || corridor.properties.name;
    }
  }
  if (nearestCorridorDistance > 130) nearestCorridor = "Cross streets / other";

  let nearestGate = "Not available";
  let nearestGateDistance = Infinity;
  for (const gate of gates) {
    const distance = distanceMeters(coordinates, gate.geometry.coordinates);
    if (distance < nearestGateDistance) {
      nearestGateDistance = distance;
      nearestGate = gate.properties.name;
    }
  }

  return {
    corridor_proxy: nearestCorridor,
    corridor_distance_m: Number.isFinite(nearestCorridorDistance) ? Math.round(nearestCorridorDistance) : null,
    nearest_gate: nearestGate,
    gate_distance_m: Number.isFinite(nearestGateDistance) ? Math.round(nearestGateDistance) : null
  };
}

function recordsFromDataset(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (rawData?.type === "FeatureCollection") {
    return (rawData.features || []).map(feature => ({
      ...(feature.properties || {}),
      longitude: feature.geometry?.coordinates?.[0],
      latitude: feature.geometry?.coordinates?.[1]
    }));
  }
  return [];
}

function processRestaurantData(rawData, sourceMode) {
  const latestByRestaurant = new Map();
  const records = recordsFromDataset(rawData);

  for (const record of records) {
    const properties = { ...record };
    const longitude = Number(properties.longitude);
    const latitude = Number(properties.latitude);
    const restaurantId = properties.camis || `${properties.dba}-${longitude}-${latitude}`;
    if (!restaurantId || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

    const coordinates = [longitude, latitude];
    const campusDistance = Math.round(distanceMeters(CAMPUS, coordinates));
    if (campusDistance > 1800) continue;

    const inspectionTime = Date.parse(properties.inspection_date || "") || 0;
    const previous = latestByRestaurant.get(restaurantId);
    if (previous && previous.inspectionTime >= inspectionTime) continue;

    Object.assign(properties, {
      camis: restaurantId,
      food_group: classifyCuisine(properties.cuisine_description),
      distance_m: campusDistance,
      grade_category: gradeCategory(properties),
      inspection_timestamp: inspectionTime,
      source_mode: sourceMode,
      ...assignSpatialContext(coordinates)
    });

    latestByRestaurant.set(restaurantId, {
      inspectionTime,
      feature: {
        type: "Feature",
        properties,
        geometry: { type: "Point", coordinates }
      }
    });
  }

  return [...latestByRestaurant.values()]
    .map(item => item.feature)
    .sort((a, b) => a.properties.distance_m - b.properties.distance_m);
}

function restaurantFilter() {
  const filters = [];
  if (state.selectedCuisine !== "all") filters.push(["==", ["get", "food_group"], state.selectedCuisine]);
  if (state.selectedRadius !== "all") filters.push(["<=", ["get", "distance_m"], Number(state.selectedRadius)]);
  if (state.selectedGrade !== "all") filters.push(["==", ["get", "grade_category"], state.selectedGrade]);
  if (state.selectedCorridor !== "all") filters.push(["==", ["get", "corridor_proxy"], state.selectedCorridor]);
  return filters.length ? ["all", ...filters] : null;
}

function visibleRestaurants() {
  return state.restaurants.filter(feature => {
    const p = feature.properties;
    return (state.selectedCuisine === "all" || p.food_group === state.selectedCuisine) &&
      (state.selectedRadius === "all" || p.distance_m <= Number(state.selectedRadius)) &&
      (state.selectedGrade === "all" || p.grade_category === state.selectedGrade) &&
      (state.selectedCorridor === "all" || p.corridor_proxy === state.selectedCorridor);
  });
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function updateVisibleMetrics() {
  const visible = visibleRestaurants();
  const medianDistance = median(visible.map(feature => Number(feature.properties.distance_m)).filter(Number.isFinite));
  const cuisineDiversity = new Set(visible.map(feature => feature.properties.food_group).filter(Boolean)).size;

  document.getElementById("visible-count").textContent = visible.length.toLocaleString();
  document.getElementById("median-distance").textContent = medianDistance === null ? "—" : `${medianDistance.toLocaleString()} m`;
  document.getElementById("cuisine-diversity").textContent = cuisineDiversity ? cuisineDiversity.toLocaleString() : "—";

  const baseMessage = `${visible.length.toLocaleString()} restaurants visible · click a point for details.`;
  setStatus(state.dataWarning ? `${baseMessage} ${state.dataWarning}` : baseMessage, Boolean(state.dataWarning));
}

function updateFilters() {
  if (!state.map) return;
  const filter = restaurantFilter();
  ["restaurant-halo", "restaurants", "restaurant-labels", "restaurant-heat"].forEach(layerId => {
    if (state.map.getLayer(layerId)) state.map.setFilter(layerId, filter);
  });
  updateVisibleMetrics();
}

function setDisplayMode(mode) {
  state.displayMode = mode;
  const map = state.map;
  if (!map) return;

  const pointsVisibility = mode === "points" ? "visible" : "none";
  const heatVisibility = mode === "density" ? "visible" : "none";
  ["restaurant-halo", "restaurants", "restaurant-labels"].forEach(layerId => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", pointsVisibility);
  });
  if (map.getLayer("restaurant-heat")) map.setLayoutProperty("restaurant-heat", "visibility", heatVisibility);

  document.querySelectorAll(".mode-button").forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function add3DBuildings(map) {
  if (!map.getSource("composite") || map.getLayer("3d-buildings")) return;
  const labelLayer = map.getStyle().layers.find(layer =>
    layer.type === "symbol" && layer.layout && layer.layout["text-field"]
  );

  map.addLayer({
    id: "3d-buildings",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "true"],
    type: "fill-extrusion",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": "#d4d7d1",
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "min_height"],
      "fill-extrusion-opacity": 0.57
    }
  }, labelLayer ? labelLayer.id : undefined);
}

async function fetchJSON(url, timeoutMilliseconds = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function addMapLayers(map, contextData, restaurants) {
  const radiusData = {
    type: "FeatureCollection",
    features: [400, 800, 1200].map(radius => circleFeature(CAMPUS, radius))
  };
  const radiusLabels = {
    type: "FeatureCollection",
    features: [400, 800, 1200].map(radius => ({
      type: "Feature",
      properties: { radius_m: radius, label: radius === 800 ? "800 M FOCUS" : `${radius.toLocaleString()} M` },
      geometry: { type: "Point", coordinates: destinationPoint(CAMPUS, radius, 72) }
    }))
  };

  map.addSource("delivery-rings", { type: "geojson", data: radiusData });
  map.addSource("delivery-ring-labels", { type: "geojson", data: radiusLabels });
  map.addSource("delivery-context", { type: "geojson", data: contextData });
  map.addSource("restaurant-data", {
    type: "geojson",
    data: { type: "FeatureCollection", features: restaurants }
  });

  map.addLayer({
    id: "campus-boundary",
    type: "fill",
    source: "delivery-context",
    filter: ["==", ["get", "feature_type"], "campus_boundary"],
    paint: {
      "fill-color": "#244a3c",
      "fill-opacity": 0.045,
      "fill-outline-color": "#244a3c"
    }
  });

  map.addLayer({
    id: "delivery-ring-fill",
    type: "fill",
    source: "delivery-rings",
    paint: {
      "fill-color": ["case", ["==", ["get", "radius_m"], 800], "#e4572e", "#244a3c"],
      "fill-opacity": ["case", ["==", ["get", "radius_m"], 800], 0.035, 0.006]
    }
  });

  map.addLayer({
    id: "delivery-ring-reference-lines",
    type: "line",
    source: "delivery-rings",
    filter: ["!=", ["get", "radius_m"], 800],
    paint: {
      "line-color": "#244a3c",
      "line-width": 0.9,
      "line-dasharray": [3, 3],
      "line-opacity": 0.46
    }
  });

  map.addLayer({
    id: "delivery-ring-focus-halo",
    type: "line",
    source: "delivery-rings",
    filter: ["==", ["get", "radius_m"], 800],
    paint: {
      "line-color": "#e4572e",
      "line-width": 7,
      "line-blur": 4,
      "line-opacity": 0.13
    }
  });

  map.addLayer({
    id: "delivery-ring-focus",
    type: "line",
    source: "delivery-rings",
    filter: ["==", ["get", "radius_m"], 800],
    paint: {
      "line-color": "#e4572e",
      "line-width": 2.4,
      "line-opacity": 0.92
    }
  });

  map.addLayer({
    id: "delivery-ring-labels",
    type: "symbol",
    source: "delivery-ring-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-size": ["case", ["==", ["get", "radius_m"], 800], 10, 8],
      "text-letter-spacing": 0.08,
      "text-allow-overlap": true
    },
    paint: {
      "text-color": ["case", ["==", ["get", "radius_m"], 800], "#e4572e", "#244a3c"],
      "text-halo-color": "rgba(244,239,229,.96)",
      "text-halo-width": 1.4
    }
  });

  map.addLayer({
    id: "delivery-corridors",
    type: "line",
    source: "delivery-context",
    filter: ["==", ["get", "feature_type"], "analysis_corridor"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#18211e",
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.1, 16, 2.8],
      "line-dasharray": [1.2, 1.8],
      "line-opacity": 0.4
    }
  });

  map.addLayer({
    id: "restaurant-heat",
    type: "heatmap",
    source: "restaurant-data",
    maxzoom: 16.5,
    layout: { visibility: "none" },
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "distance_m"], 0, 1, 1800, 0.25],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, 0.7, 16, 1.6],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 12, 15, 16, 32],
      "heatmap-opacity": 0.75,
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(244,239,229,0)",
        0.2, "rgba(39,111,191,0.32)",
        0.42, "rgba(111,143,58,0.48)",
        0.65, "rgba(220,166,42,0.64)",
        0.86, "rgba(228,87,46,0.82)",
        1, "rgba(112,33,22,0.94)"
      ]
    }
  });

  add3DBuildings(map);

  map.addLayer({
    id: "restaurant-halo",
    type: "circle",
    source: "restaurant-data",
    paint: {
      "circle-radius": [
        "+",
        ["interpolate", ["linear"], ["get", "distance_m"], 0, 8.5, 400, 7.7, 800, 6.2, 1200, 4.9, 1800, 3.8],
        2.3
      ],
      "circle-color": "rgba(244,239,229,0.76)",
      "circle-blur": 0.16
    }
  });

  map.addLayer({
    id: "restaurants",
    type: "circle",
    source: "restaurant-data",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "distance_m"], 0, 8.5, 400, 7.7, 800, 6.2, 1200, 4.9, 1800, 3.8],
      "circle-color": [
        "match", ["get", "food_group"],
        "Pizza", FOOD_COLORS.Pizza,
        "Coffee & Bakery", FOOD_COLORS["Coffee & Bakery"],
        "Asian", FOOD_COLORS.Asian,
        "Latin & Caribbean", FOOD_COLORS["Latin & Caribbean"],
        "American & Fast Food", FOOD_COLORS["American & Fast Food"],
        FOOD_COLORS.Other
      ],
      "circle-opacity": 0.91,
      "circle-stroke-width": 1.1,
      "circle-stroke-color": "#f4efe5"
    }
  });

  map.addLayer({
    id: "restaurant-labels",
    type: "symbol",
    source: "restaurant-data",
    minzoom: 15.35,
    layout: {
      "text-field": ["get", "dba"],
      "text-size": 8.6,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-max-width": 9,
      "text-allow-overlap": false
    },
    paint: {
      "text-color": "#18211e",
      "text-halo-color": "rgba(244,239,229,0.97)",
      "text-halo-width": 1.25
    }
  });

  map.addLayer({
    id: "access-gates",
    type: "symbol",
    source: "delivery-context",
    filter: ["==", ["get", "feature_type"], "access_gate"],
    layout: {
      "text-field": "◆",
      "text-size": 11,
      "text-allow-overlap": true
    },
    paint: {
      "text-color": "#18211e",
      "text-halo-color": "#f4efe5",
      "text-halo-width": 1.5
    }
  });

  map.addLayer({
    id: "campus-anchor",
    type: "circle",
    source: "delivery-context",
    filter: ["==", ["get", "feature_type"], "campus_anchor"],
    paint: {
      "circle-radius": 7.5,
      "circle-color": "#18211e",
      "circle-stroke-color": "#f4efe5",
      "circle-stroke-width": 3
    }
  });

  map.addLayer({
    id: "campus-label",
    type: "symbol",
    source: "delivery-context",
    filter: ["==", ["get", "feature_type"], "campus_anchor"],
    layout: {
      "text-field": "COLUMBIA UNIVERSITY",
      "text-size": 9.5,
      "text-offset": [0, -1.7],
      "text-anchor": "bottom",
      "text-letter-spacing": 0.11
    },
    paint: {
      "text-color": "#18211e",
      "text-halo-color": "rgba(244,239,229,0.98)",
      "text-halo-width": 1.5
    }
  });
}

function buildPopupHTML(feature) {
  const p = feature.properties;
  const address = [p.building, p.street, p.zipcode].filter(Boolean).join(" ");
  const inspectionDate = p.inspection_date
    ? new Date(p.inspection_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Not included in fallback";
  const sourceLabel = p.source_mode === "live" ? "NYC DOHMH live record" : "Curated offline fallback";

  return `
    <article class="popup">
      <p class="popup-kicker">${escapeHTML(p.food_group)} · ${escapeHTML(p.corridor_proxy)}</p>
      <h3>${escapeHTML(p.dba || "Restaurant")}</h3>
      <p class="popup-address">${escapeHTML(address || "Address unavailable")}</p>
      <div class="popup-grid">
        <span>Cuisine</span><strong>${escapeHTML(p.cuisine_description || "Not available")}</strong>
        <span>Campus distance</span><strong>${Number(p.distance_m).toLocaleString()} m</strong>
        <span>Nearest access point</span><strong>${escapeHTML(p.nearest_gate || "Not available")}</strong>
        <span>Gate distance proxy</span><strong>${p.gate_distance_m ? `${Number(p.gate_distance_m).toLocaleString()} m` : "—"}</strong>
        <span>Inspection grade</span><strong>${escapeHTML(p.grade || "Not available")}</strong>
        <span>Inspection date</span><strong>${escapeHTML(inspectionDate)}</strong>
        <span>Data source</span><strong>${escapeHTML(sourceLabel)}</strong>
      </div>
      <p class="popup-note">Distances and corridor assignments are analytical proxies—not platform delivery estimates.</p>
    </article>
  `;
}

function setPresentationMode(active) {
  document.body.classList.toggle("presentation-mode", active);
  exitPresentationButton.hidden = !active;
  if (active && state.map) {
    state.map.flyTo({ ...CAMPUS_VIEW, duration: 1100 });
  }
}

function addInteractions(map) {
  map.on("mouseenter", "restaurants", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "restaurants", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", "restaurants", event => {
    const feature = event.features?.[0];
    if (!feature) return;
    new mapboxgl.Popup({ offset: 15, maxWidth: "340px" })
      .setLngLat(feature.geometry.coordinates.slice())
      .setHTML(buildPopupHTML(feature))
      .addTo(map);
  });

  document.getElementById("cuisine-filter").addEventListener("change", event => {
    state.selectedCuisine = event.target.value;
    updateFilters();
  });
  document.getElementById("radius-filter").addEventListener("change", event => {
    state.selectedRadius = event.target.value === "all" ? "all" : Number(event.target.value);
    updateFilters();
  });
  document.getElementById("grade-filter").addEventListener("change", event => {
    state.selectedGrade = event.target.value;
    updateFilters();
  });
  document.getElementById("corridor-filter").addEventListener("change", event => {
    state.selectedCorridor = event.target.value;
    updateFilters();
  });

  document.querySelectorAll(".mode-button").forEach(button => {
    button.addEventListener("click", () => setDisplayMode(button.dataset.mode));
  });

  document.getElementById("campus-view").addEventListener("click", () => map.flyTo(CAMPUS_VIEW));
  document.getElementById("district-view").addEventListener("click", () => map.flyTo(DISTRICT_VIEW));
  document.getElementById("presentation-mode").addEventListener("click", () => setPresentationMode(true));
  exitPresentationButton.addEventListener("click", () => setPresentationMode(false));

  document.getElementById("toggle-context").addEventListener("change", event => {
    const visibility = event.target.checked ? "visible" : "none";
    ["delivery-corridors", "access-gates", "campus-boundary"].forEach(layerId => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    });
  });

  document.getElementById("reset-map").addEventListener("click", () => {
    state.selectedCuisine = "all";
    state.selectedRadius = 800;
    state.selectedGrade = "all";
    state.selectedCorridor = "all";
    document.getElementById("cuisine-filter").value = "all";
    document.getElementById("radius-filter").value = "800";
    document.getElementById("grade-filter").value = "all";
    document.getElementById("corridor-filter").value = "all";
    document.getElementById("toggle-context").checked = true;
    ["delivery-corridors", "access-gates", "campus-boundary"].forEach(layerId => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
    });
    setDisplayMode("points");
    setPresentationMode(false);
    updateFilters();
    map.flyTo(CAMPUS_VIEW);
  });

  document.addEventListener("keydown", event => {
    if (event.key.toLowerCase() === "p" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      setPresentationMode(!document.body.classList.contains("presentation-mode"));
    }
    if (event.key === "Escape") setPresentationMode(false);
  });
}

async function loadRestaurantData() {
  try {
    setStatus("Loading a lightweight NYC restaurant query…");
    const liveData = await fetchJSON(RESTAURANT_API, 9000);
    const liveRestaurants = processRestaurantData(liveData, "live");
    if (liveRestaurants.length < 10) throw new Error("The live query returned too few usable restaurant locations.");
    setDataMode("live");
    state.dataWarning = "";
    return liveRestaurants;
  } catch (liveError) {
    console.warn("Live restaurant data unavailable; loading local fallback.", liveError);
    const fallbackData = await fetchJSON(FALLBACK_RESTAURANTS_PATH, 6000);
    const fallbackRestaurants = processRestaurantData(fallbackData, "fallback");
    if (!fallbackRestaurants.length) throw new Error("The live API and local fallback both returned no usable restaurants.");
    setDataMode("fallback");
    state.dataWarning = "Live NYC API unavailable; showing the local presentation fallback.";
    return fallbackRestaurants;
  }
}

async function initializeMap(token) {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: CAMPUS_VIEW.center,
    zoom: CAMPUS_VIEW.zoom,
    pitch: CAMPUS_VIEW.pitch,
    bearing: CAMPUS_VIEW.bearing,
    antialias: true,
    attributionControl: true
  });

  state.map = map;
  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new mapboxgl.FullscreenControl(), "bottom-right");
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 95, unit: "metric" }), "bottom-left");

  map.on("error", event => {
    if (event?.error) console.error("Mapbox error:", event.error);
  });

  map.on("load", async () => {
    try {
      setStatus("Loading the Columbia context GeoJSON…");
      state.contextData = await fetchJSON(CONTEXT_PATH, 7000);
      state.restaurants = await loadRestaurantData();
      addMapLayers(map, state.contextData, state.restaurants);
      addInteractions(map);
      setDisplayMode("points");
      updateFilters();
    } catch (error) {
      console.error(error);
      showFatalError(
        "The local GeoJSON files could not be loaded. Open the full project folder with VS Code Live Server or publish it through GitHub Pages. " +
        error.message
      );
    }
  });
}

function begin() {
  setDataMode("unknown");

  if (!validToken(MAPBOX_TOKEN)) {
    showFatalError("A valid public Mapbox token is required in mapBox_Sketch_03.js.");
    return;
  }

  initializeMap(MAPBOX_TOKEN);
}

begin();
