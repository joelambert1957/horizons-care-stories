const { google } = require('googleapis');
const { connectLambda } = require('@netlify/blobs');
const { peekTicket } = require('./lib/token-store');
const { WHICH_CONFIG } = require('./lib/oauth-config');

function html(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body };
}

exports.handler = async (event) => {
  // Functions run in Lambda compatibility mode, which needs this call
  // before any getStore() (inside token-store.js) can auto-detect the
  // site/credentials -- without it, getStore() throws
  // MissingBlobsEnvironmentError even in production.
  connectLambda(event);

  const ticketId = (event.queryStringParameters || {}).ticket;
  const which = await peekTicket(ticketId);

  if (!which) {
    return html('<p>This reconnect link has expired or was already used. Go back to /admin and click Reconnect again.</p>');
  }

  // A separate "Web application" type client, not the Desktop one the local
  // scripts use -- Desktop clients only support the localhost loopback
  // redirect, not an arbitrary production HTTPS one. See README.md.
  const clientId = process.env.GOOGLE_ADMIN_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADMIN_OAUTH_CLIENT_SECRET;
  const redirectUri = `https://${event.headers.host}/.netlify/functions/admin-oauth-callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: WHICH_CONFIG[which].scopes,
    state: ticketId,
  });

  return { statusCode: 302, headers: { Location: authUrl }, body: '' };
};
