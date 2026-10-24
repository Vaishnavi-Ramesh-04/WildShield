const test = require("node:test");
const assert = require("node:assert");
const server = require("../server");

let base;
test.before(async () => { await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());

const call = async (method, url, token, body, extra = {}) => {
  const res = await fetch(base + url, { method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const login = async (id, pw) => (await call("POST", "/api/auth/login", null, { login: id, password: pw })).body.token;
const DEV = { "x-device-key": "demo-key" };

test("login: officials and admin sign in with ID + password", async () => {
  const ok = await call("POST", "/api/auth/login", null, { login: "FO-1001", password: "Ranger@123" });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.user.role, "official");
  assert.ok(!("password_hash" in ok.body.user), "hash must never be returned");
  const bad = await call("POST", "/api/auth/login", null, { login: "FO-1001", password: "wrong" });
  assert.strictEqual(bad.status, 401);
});

test("requests without or with a forged token are rejected", async () => {
  assert.strictEqual((await call("GET", "/api/live")).status, 401);
  assert.strictEqual((await call("GET", "/api/live", "abc.def.ghi")).status, 401);
});

test("public users cannot open official/admin endpoints", async () => {
  const t = await login("9000000001", "Trekker@123");
  assert.strictEqual((await call("GET", "/api/live", t)).status, 403);
  assert.strictEqual((await call("POST", "/api/admin/officials", t, { name: "X", official_id: "FO-9", password: "Password@1" })).status, 403);
});

test("only admin can create officials; new official can log in", async () => {
  const off = await login("FO-1001", "Ranger@123");
  assert.strictEqual((await call("POST", "/api/admin/officials", off, { name: "Hack", official_id: "FO-7", password: "Password@1" })).status, 403);
  const adm = await login("ADMIN", "Admin@123");
  const id = "FO-" + Math.floor(Math.random() * 90000 + 2000);
  assert.strictEqual((await call("POST", "/api/admin/officials", adm, { name: "Ranger New", official_id: id, password: "Newpass@123", area: "North" })).status, 201);
  assert.ok(await login(id, "Newpass@123"));
});

test("public registration always creates role=user and enforces password length", async () => {
  const phone = "8" + Math.floor(Math.random() * 1e9).toString().padStart(9, "0");
  assert.strictEqual((await call("POST", "/api/auth/register", null, { name: "T", phone, password: "short" })).status, 422);
  const r = await call("POST", "/api/auth/register", null, { name: "Tourist", phone, password: "Longenough1", role: "admin" });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.role, "user"); // cannot self-assign admin
});

test("blocked official cannot use an existing token", async () => {
  const adm = await login("ADMIN", "Admin@123");
  const off = await login("FO-1002", "Ranger@123");
  assert.strictEqual((await call("GET", "/api/live", off)).status, 200);
  await call("POST", "/api/admin/users/o2/block", adm);
  assert.strictEqual((await call("GET", "/api/live", off)).status, 403);
  await call("POST", "/api/admin/users/o2/unblock", adm);
});

test("brute force: account locks after 5 wrong passwords", async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call("POST", "/api/auth/login", null, { login: "9000000002", password: "nope" });
  assert.strictEqual(last.status, 429);
  await call("POST", "/api/reset"); // clears lockouts for other tests
});

test("e-pass flow: no pass -> blocked; active pass -> alert; closed -> cut off", async () => {
  await call("POST", "/api/reset");
  const user = await login("9000000001", "Trekker@123");
  const off = await login("FO-1001", "Ranger@123");
  const U = { lat: 10.285, lon: 76.569 };

  assert.strictEqual((await call("POST", "/api/users/location", user, U)).status, 403);
  const p = (await call("POST", "/api/passes", user, { trail: "B", group_size: 2 })).body;
  assert.strictEqual((await call("POST", `/api/passes/${p.id}/approve`, user)).status, 403);
  await call("POST", `/api/passes/${p.id}/approve`, off);
  await call("POST", `/api/passes/${p.id}/activate`, off);
  assert.strictEqual((await call("POST", "/api/users/location", user, U)).status, 200);

  const r = await call("POST", "/api/animals/location", null,
    { animal_id: "E-12", lat: 10.285 + 0.00072, lon: 76.569, timestamp: "2026-01-01T10:00:00Z" }, DEV);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.alerts_raised[0].severity, "high");

  await call("POST", `/api/passes/${p.id}/close`, off);
  assert.strictEqual((await call("POST", "/api/users/location", user, U)).status, 403);
  assert.strictEqual((await call("GET", "/api/me/alerts", user)).status, 403);
});

test("device key and impossible-speed validation", async () => {
  await call("POST", "/api/reset");
  assert.strictEqual((await call("POST", "/api/animals/location", null, { animal_id: "E-12", lat: 10, lon: 76 })).status, 401);
  await call("POST", "/api/animals/location", null, { animal_id: "E-12", lat: 10.285, lon: 76.569, timestamp: "2026-01-01T10:00:00Z" }, DEV);
  const jump = await call("POST", "/api/animals/location", null, { animal_id: "E-12", lat: 10.385, lon: 76.569, timestamp: "2026-01-01T10:01:00Z" }, DEV);
  assert.strictEqual(jump.status, 422);
});
