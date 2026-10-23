const test = require("node:test");
const assert = require("node:assert");
const { haversine, pointInPolygon, predictLinear, compass, bearing } = require("../src/geo");
const { severityFor } = require("../src/alerts");

test("haversine: ~111 m per 0.001 degree latitude", () => {
  const d = haversine(10.0, 76.0, 10.001, 76.0);
  assert.ok(Math.abs(d - 111.2) < 1, `got ${d}`);
});

test("haversine: same point is 0", () => {
  assert.strictEqual(haversine(10, 76, 10, 76), 0);
});

test("point in polygon", () => {
  const square = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.strictEqual(pointInPolygon(5, 5, square), true);
  assert.strictEqual(pointInPolygon(15, 5, square), false);
});

test("severity levels by distance", () => {
  assert.strictEqual(severityFor(30), "critical");
  assert.strictEqual(severityFor(80), "high");
  assert.strictEqual(severityFor(250), "caution");
  assert.strictEqual(severityFor(500), null);
});

test("compass direction: animal north of user", () => {
  assert.strictEqual(compass(bearing(10.0, 76.0, 10.001, 76.0)), "north");
});

test("linear prediction continues the movement", () => {
  const p = predictLinear(
    { lat: 10.0, lon: 76.0, timestamp: "2026-01-01T10:00:00Z" },
    { lat: 10.001, lon: 76.0, timestamp: "2026-01-01T10:01:00Z" }, 10);
  assert.ok(Math.abs(p.lat - 10.011) < 1e-6);
});
