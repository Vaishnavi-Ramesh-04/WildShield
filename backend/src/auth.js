// Authentication helpers using only Node's built-in crypto (no libraries).
// Passwords: scrypt + random salt.  Tokens: HS256 JWT signed with JWT_SECRET.
const crypto = require("crypto");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
if (!process.env.JWT_SECRET) console.warn("[auth] JWT_SECRET not set - using insecure dev secret. Set it before deploying.");

const b64 = (x) => Buffer.from(x).toString("base64url");

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const test = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return crypto.timingSafeEqual(test, Buffer.from(hashHex, "hex"));
}

function signToken(payload, ttlSec = 8 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const data = b64(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." +
    b64(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token) {
  try {
    const [h, p, s] = token.split(".");
    const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
    if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
