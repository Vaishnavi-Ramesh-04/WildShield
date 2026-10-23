# WildShield: AI-Based Wildlife Monitoring, Behaviour Prediction and Public Safety Alert System

SCMS School of Engineering and Technology, Dept. of CSE. Project Phase I (CSD 415), Group 7.

Team: Saniya Sara Biju, Sreehari K K, T R Sreelakshmi, Vaishnavi R. Guide: Ms. Anu S.

## What this prototype demonstrates
| Feature | Where |
|---|---|
| GPS data ingest with validation (device key, impossible-speed rejection) | `backend/server.js` |
| Haversine distance, 50 m / 100 m / 300 m severity levels | `backend/src/geo.js`, `alerts.js` |
| Geofencing with point-in-polygon (village, trail zones) | `backend/src/geo.js`, `data/zones.json` |
| Alert cooldown + escalation (caution, high, critical) | `backend/src/alerts.js` |
| E-pass lifecycle (REQUESTED, APPROVED, ACTIVE, CLOSED) and server-side access cut-off | `backend/src/passes.js` |
| Role-based access (user / official / admin) | `backend/server.js` |
| Movement prediction (linear extrapolation; LSTM planned for Phase 2) | `backend/src/geo.js` |
| Live forest authority dashboard (map, trails, alerts) | `backend/public/index.html` |
| GPS collar simulator + full demo scenario | `simulator/demo.py` |

## Run it
Requires Node.js 18+ and Python 3. **No `npm install` needed** (zero dependencies).

```bash
# Terminal 1: backend + dashboard
cd backend
node server.js            # http://localhost:3000

# Terminal 2: run the demo scenario
cd simulator
python3 demo.py           # use --delay 0.3 for a faster run
```
Open http://localhost:3000 while the demo runs to watch the elephant approach.
(The map tiles and Leaflet load from the internet.)

## Tests
```bash
cd backend && npm test
```

## API summary
| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/animals/location` | GPS device (header `x-device-key`) |
| POST | `/api/users/location` | user with ACTIVE pass |
| GET | `/api/me/alerts` | user with ACTIVE pass |
| POST | `/api/passes` | user (request) |
| POST | `/api/passes/:id/approve \| activate \| close` | official / admin |
| GET | `/api/live`, `/api/alerts`, `/api/passes` | official / admin |
| GET | `/api/animals/:id/prediction?minutes=30` | official / admin |

Demo users: `u1`, `u2` (public), `o1` (official), `a1` (admin), sent as header `x-user-id`.

## Roadmap
- Phase 2: Flutter mobile app, Firebase Cloud Messaging + SMS, MongoDB/PostgreSQL, JWT login
- AI: LSTM / Random Forest prediction, Isolation Forest abnormal behaviour, DBSCAN hotspots
- Admin zone editor, QR gate scanning, safe-route (A*) suggestion

## Limitations
Prototype uses an in-memory store and a simulated GPS collar. Real animal data (e.g. Movebank) will be used for model training.
