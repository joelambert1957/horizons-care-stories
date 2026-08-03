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

// A reconnected token was issued by a DIFFERENT OAuth client than the one
// the env-var tokens use -- Google's "Desktop app" client type (used by
// scripts/get-refresh-token.js and friends) only supports the localhost
// loopback redirect, not an arbitrary production HTTPS one, so the /admin
// reconnect flow needs its own "Web application" type client
// (GOOGLE_ADMIN_OAUTH_CLIENT_ID/SECRET) with that redirect URI registered.
// A refresh token only ever refreshes against the client that issued it, so
// which client_id/secret to use depends on where the active token came
// from, not just which env var it's stored in.
async function getActiveCredentials(which, envVarName) {
  const override = await getOverrideToken(which);
  if (override) {
    return {
      refreshToken: override,
      clientId: process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_ADMIN_OAUTH_CLIENT_SECRET,
      source: 'reconnected',
    };
  }
  return {
    refreshToken: process.env[envVarName],
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    source: 'env var',
  };
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

module.exports = { getOverrideToken, setOverrideToken, getActiveCredentials, createTicket, peekTicket, consumeTicket };
