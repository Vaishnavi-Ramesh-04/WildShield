// In-memory database for the prototype.
// Phase 2: replace with MongoDB / PostgreSQL (same shapes).
const { hashPassword } = require("./auth");

const seedUser = (u, password) => ({ blocked: false, created_at: new Date().toISOString(), ...u, password_hash: hashPassword(password) });

const state = {
  animals: {
    "E-12": { id: "E-12", species: "Asian Elephant", status: "active", device_id: "DEV-001", battery: 87 },
  },
  // Demo accounts (change/remove before real use):
  //   ADMIN    / Admin@123     (admin)
  //   FO-1001  / Ranger@123    (forest official)
  //   FO-1002  / Ranger@123    (forest official)
  //   9000000001 / Trekker@123 (public user)
  users: {
    a1: seedUser({ id: "a1", name: "Forest Admin", role: "admin", official_id: "ADMIN", area: "All ranges" }, "Admin@123"),
    o1: seedUser({ id: "o1", name: "Ranger Anil", role: "official", official_id: "FO-1001", area: "Athirappilly range" }, "Ranger@123"),
    o2: seedUser({ id: "o2", name: "Ranger Biju", role: "official", official_id: "FO-1002", area: "Vazhachal range" }, "Ranger@123"),
    u1: seedUser({ id: "u1", name: "Anita (trekker)", role: "user", phone: "9000000001", email: "anita@example.com" }, "Trekker@123"),
    u2: seedUser({ id: "u2", name: "Rahul (trekker)", role: "user", phone: "9000000002", email: "rahul@example.com" }, "Trekker@123"),
  },
  animalTrail: {}, // animal_id -> [{lat, lon, timestamp}]
  userLocation: {}, // user_id -> {lat, lon, timestamp}
  passes: {}, // pass_id -> pass
  alerts: [], // all alerts raised
  lastAlert: {}, // "animal:user" -> {severity, at}
  loginFailures: {}, // login -> {count, until}
  audit: [], // who did what
  nextPassId: 1,
  nextUserId: 3,
};

module.exports = state;
