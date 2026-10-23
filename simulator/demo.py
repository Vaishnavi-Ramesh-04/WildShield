"""
WildShield demo / GPS simulator (Python standard library only).

Plays the whole story for the Phase 1 presentation:
  1. A trekker applies for an e-pass -> official approves -> gate activates it
  2. Trekker's phone starts sharing location (only possible with an ACTIVE pass)
  3. A simulated elephant collar walks toward the trekker, sending GPS fixes
     -> CAUTION (300 m) -> WARNING (100 m) -> DANGER (50 m) alerts appear
  4. Trekker exits -> pass CLOSED -> tracking and alerts are cut off (403)

Usage:  python3 demo.py [--delay 1.0] [--url http://localhost:3000]
"""
import argparse, json, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

p = argparse.ArgumentParser()
p.add_argument("--url", default="http://localhost:3000")
p.add_argument("--delay", type=float, default=1.0, help="seconds between GPS fixes")
args = p.parse_args()


def call(method, path, user=None, body=None, device=False):
    headers = {"Content-Type": "application/json"}
    if user: headers["x-user-id"] = user
    if device: headers["x-device-key"] = "demo-key"
    req = urllib.request.Request(args.url + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def step(title): print(f"\n=== {title} ===")


USER_POS = (10.2850, 76.5690)            # trekker on Tourist Trail B
START = (USER_POS[0] + 0.0038, USER_POS[1] - 0.0038)   # elephant ~600 m north-west
END = (USER_POS[0] + 0.00027, USER_POS[1])             # stops ~30 m north of the trekker
STEPS = 15

call("POST", "/api/reset")

step("1. E-pass flow")
_, pas = call("POST", "/api/passes", "u1", {"trail": "Trail B", "group_size": 2})
print("Anita requested pass:", pas["id"], pas["status"])
print("Anita tries to share location without an active pass ->", call("POST", "/api/users/location", "u1",
      {"lat": USER_POS[0], "lon": USER_POS[1]})[0], "(blocked)")
print("Approve (Ranger Anil):", call("POST", f"/api/passes/{pas['id']}/approve", "o1")[1]["status"])
print("Gate scan / activate :", call("POST", f"/api/passes/{pas['id']}/activate", "o1")[1]["status"])
print("Anita shares location ->", call("POST", "/api/users/location", "u1",
      {"lat": USER_POS[0], "lon": USER_POS[1]})[0], "(allowed)")
print("Rahul (no pass) shares location ->", call("POST", "/api/users/location", "u2",
      {"lat": USER_POS[0], "lon": USER_POS[1]})[0], "(blocked, he is ignored by the alert engine)")

step("2. Elephant E-12 collar sends GPS fixes")
t0 = datetime.now(timezone.utc)
for i in range(STEPS + 1):
    f = i / STEPS
    lat = START[0] + (END[0] - START[0]) * f
    lon = START[1] + (END[1] - START[1]) * f
    ts = (t0 + timedelta(minutes=i)).isoformat()      # 1 simulated minute per fix
    code, res = call("POST", "/api/animals/location",
                     body={"animal_id": "E-12", "lat": lat, "lon": lon, "timestamp": ts}, device=True)
    print(f"fix {i:2d}: ({lat:.5f}, {lon:.5f}) -> {code}")
    for a in res.get("alerts_raised", []):
        print(f"   >>> [{a['severity'].upper()}] {a['message']}")
    time.sleep(args.delay)

step("3. AI prediction (linear extrapolation, 30 min ahead)")
_, pr = call("GET", "/api/animals/E-12/prediction?minutes=30", "o1")
print(pr)

step("4. GPS glitch is rejected (data validation)")
bad_ts = (t0 + timedelta(minutes=STEPS + 1)).isoformat()
print(call("POST", "/api/animals/location", body={"animal_id": "E-12", "lat": 11.5, "lon": 77.5,
      "timestamp": bad_ts}, device=True))

step("5. Trekker exits the forest -> pass closed -> access cut off")
print("Close pass:", call("POST", f"/api/passes/{pas['id']}/close", "o1")[1]["status"])
print("Anita shares location ->", call("POST", "/api/users/location", "u1",
      {"lat": USER_POS[0], "lon": USER_POS[1]}))
print("Anita opens her alerts ->", call("GET", "/api/me/alerts", "u1"))
print("\nDone. Open http://localhost:3000 to see the dashboard.")
