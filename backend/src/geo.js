// Core geo algorithms used by WildShield (no external libraries)

const R = 6371000; // Earth radius in metres
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** Haversine: distance in metres between two GPS points */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bearing in degrees (0 = North) from point 1 to point 2 */
function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function compass(deg) {
  const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return dirs[Math.round(deg / 45) % 8];
}

/** Point-in-polygon (ray casting). polygon = [[lat, lon], ...] */
function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Linear extrapolation: predict position after `minutes` using the last two fixes */
function predictLinear(prev, last, minutes) {
  const dt = (new Date(last.timestamp) - new Date(prev.timestamp)) / 60000; // minutes
  if (!(dt > 0)) return { lat: last.lat, lon: last.lon, speed_kmh: 0 };
  const dLat = (last.lat - prev.lat) / dt;
  const dLon = (last.lon - prev.lon) / dt;
  const speed_kmh = (haversine(prev.lat, prev.lon, last.lat, last.lon) / dt) * 0.06;
  return { lat: last.lat + dLat * minutes, lon: last.lon + dLon * minutes, speed_kmh };
}

module.exports = { haversine, bearing, compass, pointInPolygon, predictLinear };
