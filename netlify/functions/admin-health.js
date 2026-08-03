const { google } = require('googleapis');
const { connectLambda } = require('@netlify/blobs');
const { getActiveCredentials } = require('./lib/token-store');
const { WHICH_CONFIG } = require('./lib/oauth-config');

function requireAdmin(event) {
  const password = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  return password && password === process.env.ADMIN_PASSWORD;
}

async function checkToken(which) {
  const config = WHICH_CONFIG[which];
  const { clientId, clientSecret, refreshToken, source } = await getActiveCredentials(which, config.envVar);

  if (!refreshToken) {
    return { ok: false, source, error: 'No refresh token set.' };
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    // Refreshing (without calling any real Drive/Vertex endpoint) is exactly
    // the step that throws when a token has died -- same failure this
    // reproduces as the real GoogleAuthError seen in production.
    const { token: accessToken } = await oauth2Client.getAccessToken();
    const info = await oauth2Client.getTokenInfo(accessToken);
    const missingScopes = config.scopes.filter((s) => !info.scopes.includes(s));
    if (missingScopes.length) {
      return {
        ok: false,
        source,
        scopes: info.scopes,
        error: `Token is missing required scope(s): ${missingScopes.join(', ')}`,
      };
    }
    return { ok: true, source, scopes: info.scopes };
  } catch (err) {
    return { ok: false, source, error: err.message || String(err) };
  }
}

exports.handler = async (event) => {
  connectLambda(event); // see admin-oauth-start.js -- required before any getStore() call

  if (!requireAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
  }

  const [submission, vertex] = await Promise.all([
    checkToken('submission'),
    checkToken('vertex'),
  ]);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submission, vertex }),
  };
};
