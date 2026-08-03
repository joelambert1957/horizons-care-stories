const { google } = require('googleapis');
const { connectLambda } = require('@netlify/blobs');
const { consumeTicket, setOverrideToken } = require('./lib/token-store');
const { WHICH_CONFIG } = require('./lib/oauth-config');

function html(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'text/html' }, body };
}

exports.handler = async (event) => {
  connectLambda(event); // see admin-oauth-start.js -- required before any getStore() call

  const { code, state, error } = event.queryStringParameters || {};

  if (error) {
    return html(400, `<p>Google reported an error: ${error}</p>`);
  }

  const which = await consumeTicket(state);
  if (!which) {
    return html(400, '<p>This reconnect link has expired or was already used. Go back to /admin and click Reconnect again.</p>');
  }

  const clientId = process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADMIN_OAUTH_CLIENT_SECRET;
  const redirectUri = `https://${event.headers.host}/.netlify/functions/admin-oauth-callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let tokens;
  try {
    ({ tokens } = await oauth2Client.getToken(code));
  } catch (err) {
    console.error('admin-oauth-callback: token exchange failed', err);
    return html(502, `<p>Token exchange with Google failed: ${err.message || err}</p>`);
  }

  if (!tokens.refresh_token) {
    return html(200, `
      <p>Google didn't return a refresh token -- this usually means this
      account already authorized this app before. Go to
      <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>,
      remove access for "Story Intake Admin", then go back to /admin and try
      Reconnect again.</p>
    `);
  }

  await setOverrideToken(which, tokens.refresh_token);

  return html(200, `
    <p>Reconnected ${WHICH_CONFIG[which].label}. You can close this tab and
    return to /admin -- status should update within a few seconds.</p>
  `);
};
