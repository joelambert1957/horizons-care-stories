const { google } = require('googleapis');
const { peekTicket } = require('./lib/token-store');
const { WHICH_CONFIG } = require('./lib/oauth-config');

function html(body) {
  return { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body };
}

exports.handler = async (event) => {
  const ticketId = (event.queryStringParameters || {}).ticket;
  const which = await peekTicket(ticketId);

  if (!which) {
    return html('<p>This reconnect link has expired or was already used. Go back to /admin and click Reconnect again.</p>');
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
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
