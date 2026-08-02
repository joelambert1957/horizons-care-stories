const { getStore } = require('@netlify/blobs');

// Lets a reconnect (via /admin) take effect immediately, with no redeploy:
// auth code checks here first and falls back to the env var refresh token
// if nothing's been written here. Netlify Blobs gets scoped credentials
// injected automatically at runtime, unlike the Netlify API, which would
// need an account-wide Personal Access Token stored as its own secret.
const OVERRIDES_STORE = 'oauth-overrides';
const TICKETS_STORE = 'oauth-tickets';
const TICKET_TTL_MS = 10 * 60 * 1000;

function overridesStore() {
  return getStore(OVERRIDES_STORE);
}

function ticketsStore() {
  return getStore(TICKETS_STORE);
}

async function getOverrideToken(which) {
  const value = await overridesStore().get(`refresh-token-${which}`);
  return value || null;
}

async function setOverrideToken(which, refreshToken) {
  await overridesStore().set(`refresh-token-${which}`, refreshToken);
}

function randomTicketId() {
  return require('crypto').randomBytes(24).toString('hex');
}

async function createTicket(which) {
  const id = randomTicketId();
  await ticketsStore().setJSON(id, { which, createdAt: Date.now() });
  return id;
}

// Read-only lookup used by admin-oauth-start -- it needs to know the ticket
// is valid (and which scopes to request) without spending its single use,
// since the real redemption happens in admin-oauth-callback.
async function peekTicket(id) {
  if (!id) return null;
  const ticket = await ticketsStore().get(id, { type: 'json' });
  if (!ticket) return null;
  if (Date.now() - ticket.createdAt > TICKET_TTL_MS) return null;
  return ticket.which;
}

async function consumeTicket(id) {
  if (!id) return null;
  const store = ticketsStore();
  const ticket = await store.get(id, { type: 'json' });
  if (!ticket) return null;
  await store.delete(id);
  if (Date.now() - ticket.createdAt > TICKET_TTL_MS) return null;
  return ticket.which;
}

module.exports = { getOverrideToken, setOverrideToken, createTicket, peekTicket, consumeTicket };
