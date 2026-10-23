// Conflict detection + alert control (severity, cooldown, escalation)
const state = require("./store");
const { haversine, bearing, compass, pointInPolygon } = require("./geo");
const { activePassFor } = require("./passes");

const COOLDOWN_SEC = Number(process.env.COOLDOWN_SEC || 120);
const SEVERITY_RANK = { caution: 1, high: 2, critical: 3 };

// Alert radius rules (metres). Admin-configurable in Phase 2.
const RADIUS = { critical: 50, high: 100, caution: 300 };

function severityFor(distance) {
  if (distance <= RADIUS.critical) return "critical";
  if (distance <= RADIUS.high) return "high";
  if (distance <= RADIUS.caution) return "caution";
  return null;
}

/** Cooldown: skip repeats within COOLDOWN_SEC, but ALWAYS allow escalation (caution -> high -> critical) */
function shouldSend(key, severity) {
  const last = state.lastAlert[key];
  if (!last) return true;
  if (SEVERITY_RANK[severity] > SEVERITY_RANK[last.severity]) return true;
  return (Date.now() - last.at) / 1000 >= COOLDOWN_SEC;
}

function makeMessage(animal, severity, distance, dir) {
  const d = Math.round(distance);
  if (severity === "critical") return `DANGER: ${animal.species} ${d} m away to the ${dir}. Move away NOW and stay calm.`;
  if (severity === "high") return `WARNING: ${animal.species} ${d} m away to the ${dir}. Move away from the animal.`;
  return `Caution: ${animal.species} activity ${d} m to the ${dir}.`;
}

/** Run after every new animal location. Returns the list of new alerts. */
function evaluate(animalId, fix, zones) {
  const animal = state.animals[animalId];
  const raised = [];

  // 1. Distance to every user that holds an ACTIVE e-pass (users without a pass are ignored)
  for (const [userId, loc] of Object.entries(state.userLocation)) {
    if (!activePassFor(userId)) continue;
    const distance = haversine(fix.lat, fix.lon, loc.lat, loc.lon);
    const severity = severityFor(distance);
    if (!severity) continue;
    const key = `${animalId}:${userId}`;
    if (!shouldSend(key, severity)) continue;
    const dir = compass(bearing(loc.lat, loc.lon, fix.lat, fix.lon)); // direction from user to animal
    const alert = {
      id: state.alerts.length + 1, type: "proximity", severity, animal_id: animalId, user_id: userId,
      distance_m: Math.round(distance), message: makeMessage(animal, severity, distance, dir),
      notify: [userId, "officials"], time: new Date().toISOString(), status: "OPEN",
    };
    state.lastAlert[key] = { severity, at: Date.now() };
    state.alerts.push(alert);
    raised.push(alert);
  }

  // 2. Geofence: is the animal inside a sensitive zone (village / road / trail)?
  for (const zone of zones) {
    if (zone.type === "boundary") continue;
    if (!pointInPolygon(fix.lat, fix.lon, zone.polygon)) continue;
    const key = `${animalId}:zone:${zone.id}`;
    if (!shouldSend(key, "high")) continue;
    const alert = {
      id: state.alerts.length + 1, type: "geofence", severity: "high", animal_id: animalId, zone_id: zone.id,
      message: `${animal.species} ${animalId} entered ${zone.name} (${zone.type}).`,
      notify: ["officials"], time: new Date().toISOString(), status: "OPEN",
    };
    state.lastAlert[key] = { severity: "high", at: Date.now() };
    state.alerts.push(alert);
    raised.push(alert);
  }
  return raised;
}

module.exports = { evaluate, severityFor, RADIUS };
