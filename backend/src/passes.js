// E-Pass lifecycle: REQUESTED -> APPROVED -> ACTIVE -> CLOSED
const state = require("./store");

const NEXT = {
  approve: ["REQUESTED", "APPROVED"],
  activate: ["APPROVED", "ACTIVE"],
  close: ["ACTIVE", "CLOSED"],
};

function requestPass(userId, { trail, group_size = 1, valid_from, valid_to }) {
  const id = "P" + state.nextPassId++;
  const pass = {
    id, user_id: userId, trail, group_size,
    valid_from: valid_from || new Date().toISOString(),
    valid_to: valid_to || new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    status: "REQUESTED", qr_code: null, entry_time: null, exit_time: null, approved_by: null,
  };
  state.passes[id] = pass;
  return pass;
}

function transition(passId, action, actorId) {
  const pass = state.passes[passId];
  if (!pass) throw Object.assign(new Error("Pass not found"), { status: 404 });
  const [from, to] = NEXT[action];
  if (pass.status !== from)
    throw Object.assign(new Error(`Cannot ${action} a pass that is ${pass.status}`), { status: 409 });
  pass.status = to;
  if (action === "approve") { pass.approved_by = actorId; pass.qr_code = `WS-${pass.id}-${Date.now().toString(36)}`; }
  if (action === "activate") pass.entry_time = new Date().toISOString();
  if (action === "close") pass.exit_time = new Date().toISOString();
  return pass;
}

/** The access-control check: does this user hold an ACTIVE pass right now? */
function activePassFor(userId) {
  const now = Date.now();
  return Object.values(state.passes).find(
    (p) => p.user_id === userId && p.status === "ACTIVE" && now <= new Date(p.valid_to).getTime() + 3600 * 1000
  );
}

module.exports = { requestPass, transition, activePassFor };
