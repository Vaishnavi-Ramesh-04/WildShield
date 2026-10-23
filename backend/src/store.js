// In-memory database for the prototype.
// Phase 2: replace with MongoDB / PostgreSQL (same shapes).

const state = {
  animals: {
    "E-12": { id: "E-12", species: "Asian Elephant", status: "active", device_id: "DEV-001", battery: 87 },
  },
  users: {
    u1: { id: "u1", name: "Anita (trekker)", role: "user" },
    u2: { id: "u2", name: "Rahul (trekker)", role: "user" },
    o1: { id: "o1", name: "Ranger Anil", role: "official" },
    a1: { id: "a1", name: "Admin", role: "admin" },
  },
  animalTrail: {}, // animal_id -> [{lat, lon, timestamp}]
  userLocation: {}, // user_id -> {lat, lon, timestamp}
  passes: {}, // pass_id -> pass
  alerts: [], // all alerts raised
  lastAlert: {}, // "animal:user" -> {severity, at}
  nextPassId: 1,
};

module.exports = state;
