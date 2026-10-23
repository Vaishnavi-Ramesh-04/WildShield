// WildShield backend - Phase 1 prototype (zero dependencies, Node 18+)
// Run:  node server.js     ->  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const state = require("./src/store");
const { haversine, predictLinear } = require("./src/geo");
const { evaluate } = require("./src/alerts");
const passes = require("./src/passes");

const PORT = process.env.PORT || 3000;
const DEVICE_KEY = process.env.DEVICE_KEY || "demo-key"; // the GPS device must send this key
const MAX_SPEED_KMH = 60; // faster than this between two fixes = GPS glitch, rejected
const zones = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "zones.json"), "utf8"));

// ---------- helpers ----------
const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
  res.end(JSON.stringify(body));
};
const fail = (code, msg) => Object.assign(new Error(msg), { status: code });
const readBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(fail(400, "Invalid JSON")); } });
});

// Demo auth: caller identifies with header x-user-id. Phase 2: replace with JWT login.
function authUser(req, ...roles) {
  const user = state.users[req.headers["x-user-id"]];
  if (!user) throw fail(401, "Unknown user (send header x-user-id)");
  if (roles.length && !roles.includes(user.role)) throw fail(403, `Role '${user.role}' is not allowed here`);
  return user;
}
const validLatLon = (lat, lon) =>
  typeof lat === "number" && typeof lon === "number" && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

// ---------- route handlers ----------
const routes = [
  // ---- GPS device -> server (System component 1 -> 2) ----
  ["POST", /^\/api\/animals\/location$/, async (req) => {
    if (req.headers["x-device-key"] !== DEVICE_KEY) throw fail(401, "Invalid device key");
    const { animal_id, lat, lon, timestamp = new Date().toISOString() } = await readBody(req);
    if (!state.animals[animal_id]) throw fail(404, "Unknown animal");
    if (!validLatLon(lat, lon)) throw fail(422, "Invalid coordinates");

    const trail = (state.animalTrail[animal_id] ||= []);
    const prev = trail[trail.length - 1];
    if (prev) { // data validation: reject impossible jumps
      const hours = (new Date(timestamp) - new Date(prev.timestamp)) / 3600000;
      if (hours <= 0) throw fail(422, "Timestamp must be newer than the last fix");
      const kmh = haversine(prev.lat, prev.lon, lat, lon) / 1000 / hours;
      if (kmh > MAX_SPEED_KMH) throw fail(422, `Rejected: impossible speed ${Math.round(kmh)} km/h (GPS glitch)`);
    }
    const fix = { lat, lon, timestamp };
    trail.push(fix);
    const alerts = evaluate(animal_id, fix, zones); // distance + geofence checks
    return [201, { stored: true, alerts_raised: alerts }];
  }],

  // ---- User phone -> server (only with an ACTIVE e-pass) ----
  ["POST", /^\/api\/users\/location$/, async (req) => {
    const user = authUser(req, "user");
    const pass = passes.activePassFor(user.id);
    if (!pass) throw fail(403, "No active e-pass. Tracking and alerts are disabled.");
    const { lat, lon } = await readBody(req);
    if (!validLatLon(lat, lon)) throw fail(422, "Invalid coordinates");
    state.userLocation[user.id] = { lat, lon, timestamp: new Date().toISOString() };
    return [200, { ok: true, pass_id: pass.id }];
  }],

  // ---- User's own alerts (blocked once pass is closed = "access cut off") ----
  ["GET", /^\/api\/me\/alerts$/, async (req) => {
    const user = authUser(req, "user");
    if (!passes.activePassFor(user.id)) throw fail(403, "No active e-pass. Access cut off.");
    return [200, state.alerts.filter((a) => a.user_id === user.id)];
  }],

  // ---- E-pass ----
  ["POST", /^\/api\/passes$/, async (req) => {
    const user = authUser(req, "user");
    return [201, passes.requestPass(user.id, await readBody(req))];
  }],
  ["GET", /^\/api\/passes$/, async (req) => {
    authUser(req, "official", "admin");
    return [200, Object.values(state.passes)];
  }],
  ["POST", /^\/api\/passes\/(P\d+)\/(approve|activate|close)$/, async (req, m) => {
    const actor = authUser(req, "official", "admin"); // gate staff / admin
    const pass = passes.transition(m[1], m[2], actor.id);
    if (pass.status === "CLOSED") delete state.userLocation[pass.user_id]; // stop tracking on exit
    return [200, pass];
  }],

  // ---- Dashboard data (officials/admin) ----
  ["GET", /^\/api\/live$/, async (req) => {
    authUser(req, "official", "admin");
    const animals = Object.values(state.animals).map((a) => {
      const trail = state.animalTrail[a.id] || [];
      const last = trail[trail.length - 1];
      const prev = trail[trail.length - 2];
      const predicted = last && prev ? predictLinear(prev, last, 30) : null; // 30 min ahead
      return { ...a, last, trail: trail.slice(-30), predicted_30min: predicted };
    });
    const users = Object.entries(state.userLocation).map(([id, loc]) => ({
      id, name: state.users[id].name, ...loc, pass_id: passes.activePassFor(id)?.id }));
    return [200, { animals, users, zones, alerts: state.alerts.slice(-20).reverse() }];
  }],
  ["GET", /^\/api\/alerts$/, async (req) => { authUser(req, "official", "admin"); return [200, state.alerts]; }],

  // ---- AI prediction (Phase 1: linear extrapolation; Phase 2: LSTM) ----
  ["GET", /^\/api\/animals\/([\w-]+)\/prediction$/, async (req, m) => {
    authUser(req, "official", "admin");
    const trail = state.animalTrail[m[1]] || [];
    if (trail.length < 2) throw fail(409, "Need at least 2 location fixes");
    const url = new URL(req.url, "http://x");
    const minutes = Number(url.searchParams.get("minutes") || 30);
    return [200, { animal_id: m[1], minutes, method: "linear_extrapolation",
      ...predictLinear(trail[trail.length - 2], trail[trail.length - 1], minutes) }];
  }],

  // ---- Demo helper ----
  ["POST", /^\/api\/reset$/, async () => {
    state.animalTrail = {}; state.userLocation = {}; state.passes = {}; state.alerts = [];
    state.lastAlert = {}; state.nextPassId = 1;
    return [200, { reset: true }];
  }],
];

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const pathname = req.url.split("?")[0];

  if (req.method === "GET" && !pathname.startsWith("/api/")) { // serve dashboard
    const file = pathname === "/" ? "index.html" : pathname.slice(1);
    const full = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      res.writeHead(200, { "Content-Type": full.endsWith(".html") ? "text/html" : "text/plain" });
      return res.end(fs.readFileSync(full));
    }
    return send(res, 404, { error: "Not found" });
  }

  for (const [method, pattern, handler] of routes) {
    const m = pathname.match(pattern);
    if (req.method === method && m) {
      try {
        const [code, body] = await handler(req, m);
        return send(res, code, body);
      } catch (e) {
        return send(res, e.status || 500, { error: e.message });
      }
    }
  }
  send(res, 404, { error: "Route not found" });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`WildShield backend running on http://localhost:${PORT}`));
}
module.exports = server;
