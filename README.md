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
| Login: hashed passwords (scrypt), signed JWT tokens, lockout after 5 failed attempts | `backend/src/auth.js`, `server.js` |
| Role-based access (user / official / admin); officials are created by admin only | `backend/server.js` |
| Admin: create officials, block/unblock users, audit log | `backend/server.js` |
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
| POST | `/api/auth/login` | anyone |
| POST | `/api/auth/register` | public users (role is always `user`) |
| POST | `/api/auth/change-password` | logged-in user |
| POST | `/api/admin/officials` | admin only (creates official accounts) |
| GET | `/api/admin/users`, `/api/admin/audit` | admin only |
| POST | `/api/admin/users/:id/block \| unblock` | admin only |
| POST | `/api/passes` | user (request) |
| POST | `/api/passes/:id/approve \| activate \| close` | official / admin |
| GET | `/api/live`, `/api/alerts`, `/api/passes` | official / admin |
| GET | `/api/animals/:id/prediction?minutes=30` | official / admin |

## Demo accounts (change before real use)
| Role | Login | Password |
|---|---|---|
| Admin | `ADMIN` | `Admin@123` |
| Forest official | `FO-1001` / `FO-1002` | `Ranger@123` |
| Public user | `9000000001` / `9000000002` | `Trekker@123` |

Send the token from `POST /api/auth/login` as `Authorization: Bearer <token>`.
Dashboard (http://localhost:3000) accepts officials and admin only.
Set `JWT_SECRET` as an environment variable before any real deployment.

## Roadmap
- Phase 2: Flutter mobile app, Firebase Cloud Messaging + SMS, MongoDB/PostgreSQL, JWT login
- AI: LSTM / Random Forest prediction, Isolation Forest abnormal behaviour, DBSCAN hotspots
- Admin zone editor, QR gate scanning, safe-route (A*) suggestion

## Limitations
Prototype uses an in-memory store and a simulated GPS collar. Real animal data (e.g. Movebank) will be used for model training.
