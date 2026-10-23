const test = require("node:test");
const assert = require("node:assert");
process.env.COOLDOWN_SEC = "120";
const server = require("../server");

let base;
test.before(async () => { await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
test.after(() => server.close());

const call = async (method, url, user, body, extra = {}) => {
  const res = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(user ? { "x-user-id": user } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const DEV = { "x-device-key": "demo-key" };

test("e-pass flow: no pass -> location blocked; active pass -> alert; closed -> cut off", async () => {
  await call("POST", "/api/reset");
  const U = { lat: 10.285, lon: 76.569 };

  assert.strictEqual((await call("POST", "/api/users/location", "u1", U)).status, 403); // no pass yet

  const p = (await call("POST", "/api/passes", "u1", { trail: "B", group_size: 2 })).body;
  assert.strictEqual((await call("POST", `/api/passes/${p.id}/approve`, "u1")).status, 403); // user cannot approve
  await call("POST", `/api/passes/${p.id}/approve`, "o1");
  await call("POST", `/api/passes/${p.id}/activate`, "o1");
  assert.strictEqual((await call("POST", "/api/users/location", "u1", U)).status, 200);

  // animal 80 m north of user -> HIGH alert
  const r = await call("POST", "/api/animals/location", null,
    { animal_id: "E-12", lat: 10.285 + 0.00072, lon: 76.569, timestamp: "2026-01-01T10:00:00Z" }, DEV);
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.alerts_raised[0].severity, "high");

  // closing the pass cuts off access
  await call("POST", `/api/passes/${p.id}/close`, "o1");
  assert.strictEqual((await call("POST", "/api/users/location", "u1", U)).status, 403);
  assert.strictEqual((await call("GET", "/api/me/alerts", "u1")).status, 403);
});

test("device key and impossible-speed validation", async () => {
  await call("POST", "/api/reset");
  assert.strictEqual((await call("POST", "/api/animals/location", null, { animal_id: "E-12", lat: 10, lon: 76 })).status, 401);
  await call("POST", "/api/animals/location", null, { animal_id: "E-12", lat: 10.285, lon: 76.569, timestamp: "2026-01-01T10:00:00Z" }, DEV);
  const jump = await call("POST", "/api/animals/location", null, { animal_id: "E-12", lat: 10.385, lon: 76.569, timestamp: "2026-01-01T10:01:00Z" }, DEV);
  assert.strictEqual(jump.status, 422);
});
