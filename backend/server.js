// WildShield backend - Phase 1 prototype (zero dependencies, Node 18+)
// Run:  node server.js     ->  http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const state = require("./src/store");
const { haversine, predictLinear } = require("./src/geo");
const { evaluate } = require("./src/alerts");
const passes = require("./src/passes");
const auth = require("./src/auth");

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

// Real auth: "Authorization: Bearer <token>" from /api/auth/login
function authUser(req, ...roles) {
  const header = req.headers["authorization"] || "";
  const payload = header.startsWith("Bearer ") ? auth.verifyToken(header.slice(7)) : null;
  if (!payload) throw fail(401, "Login required (missing or expired token)");
  const user = state.users[payload.sub];
  if (!user) throw fail(401, "Account no longer exists");
  if (user.blocked) throw fail(403, "Account blocked. Contact the administrator.");
  if (roles.length && !roles.includes(user.role)) throw fail(403, `Role '${user.role}' is not allowed here`);
  return user;
}
const publicUser = (u) => { const { password_hash, ...rest } = u; return rest; };
const logAudit = (actor, action, detail = "") =>
  state.audit.push({ time: new Date().toISOString(), actor, action, detail });
const MAX_FAILS = 5, LOCK_MIN = 5;
const findByLogin = (login) => Object.values(state.users).find((u) =>
  [u.official_id, u.email, u.phone].some((v) => v && v.toLowerCase() === String(login).toLowerCase()));
const validLatLon = (lat, lon) =>
  typeof lat === "number" && typeof lon === "number" && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

// ---------- route handlers ----------
const routes = [
  // ---- Authentication ----
  ["POST", /^\/api\/auth\/login$/, async (req) => {
    const { login, password } = await readBody(req);
    if (!login || !password) throw fail(400, "login and password are required");
    const key = String(login).toLowerCase();
    const f = state.loginFailures[key];
    if (f && f.until > Date.now()) throw fail(429, `Too many failed attempts. Try again in ${LOCK_MIN} minutes.`);
    const user = findByLogin(login);
    if (!user || !auth.verifyPassword(password, user.password_hash)) {
      const cur = state.loginFailures[key] || { count: 0, until: 0 };
      cur.count += 1;
      if (cur.count >= MAX_FAILS) { cur.until = Date.now() + LOCK_MIN * 60000; cur.count = 0; }
      state.loginFailures[key] = cur;
      logAudit(String(login), "LOGIN_FAILED");
      throw fail(401, "Invalid ID or password"); // same message for both cases on purpose
    }
    if (user.blocked) throw fail(403, "Account blocked. Contact the administrator.");
    delete state.loginFailures[key];
    logAudit(user.id, "LOGIN", user.role);
    return [200, { token: auth.signToken({ sub: user.id, role: user.role }), user: publicUser(user) }];
  }],
  ["POST", /^\/api\/auth\/register$/, async (req) => { // PUBLIC users only. Officials cannot self-register.
    const { name, phone, email, password, emergency_contact } = await readBody(req);
    if (!name || !password || (!phone && !email)) throw fail(400, "name, password and phone or email are required");
    if (String(password).length < 8) throw fail(422, "Password must be at least 8 characters");
    if ((phone && findByLogin(phone)) || (email && findByLogin(email))) throw fail(409, "Phone or email already registered");
    const id = "u" + state.nextUserId++;
    state.users[id] = { id, name, phone, email, emergency_contact, role: "user", blocked: false,
      created_at: new Date().toISOString(), password_hash: auth.hashPassword(password) };
    logAudit(id, "REGISTER", "public user");
    return [201, publicUser(state.users[id])];
  }],
  ["GET", /^\/api\/auth\/me$/, async (req) => [200, publicUser(authUser(req))]],
  ["POST", /^\/api\/auth\/change-password$/, async (req) => {
    const user = authUser(req);
    const { old_password, new_password } = await readBody(req);
    if (!auth.verifyPassword(old_password || "", user.password_hash)) throw fail(401, "Old password is wrong");
    if (String(new_password || "").length < 8) throw fail(422, "Password must be at least 8 characters");
    user.password_hash = auth.hashPassword(new_password);
    logAudit(user.id, "PASSWORD_CHANGED");
    return [200, { ok: true }];
  }],

  // ---- Admin: manage forest officials (officials cannot self-register) ----
  ["POST", /^\/api\/admin\/officials$/, async (req) => {
    const admin = authUser(req, "admin");
    const { name, official_id, password, area } = await readBody(req);
    if (!name || !official_id || !password) throw fail(400, "name, official_id and password are required");
    if (String(password).length < 8) throw fail(422, "Password must be at least 8 characters");
    if (findByLogin(official_id)) throw fail(409, "Official ID already exists");
    const id = "o" + state.nextUserId++;
    state.users[id] = { id, name, official_id, area, role: "official", blocked: false,
      created_at: new Date().toISOString(), password_hash: auth.hashPassword(password) };
    logAudit(admin.id, "OFFICIAL_CREATED", official_id);
    return [201, publicUser(state.users[id])];
  }],
  ["GET", /^\/api\/admin\/users$/, async (req) => {
    authUser(req, "admin");
    return [200, Object.values(state.users).map(publicUser)];
  }],
  ["POST", /^\/api\/admin\/users\/([\w-]+)\/(block|unblock)$/, async (req, m) => {
    const admin = authUser(req, "admin");
    const target = state.users[m[1]];
    if (!target) throw fail(404, "User not found");
    if (target.id === admin.id) throw fail(409, "You cannot block yourself");
    target.blocked = m[2] === "block";
    logAudit(admin.id, m[2].toUpperCase(), target.id);
    return [200, publicUser(target)];
  }],
  ["GET", /^\/api\/admin\/audit$/, async (req) => { authUser(req, "admin"); return [200, state.audit.slice(-200).reverse()]; }],

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
    logAudit(actor.id, "PASS_" + m[2].toUpperCase(), pass.id);
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
    state.lastAlert = {}; state.nextPassId = 1; state.audit = []; state.loginFailures = {};
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
