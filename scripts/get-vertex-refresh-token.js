const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

// Generates a refresh token scoped ONLY to cloud-platform (Vertex AI),
// completely separate from the drive.file/spreadsheets token
// get-refresh-token.js produces. Kept isolated deliberately: cloud-platform
// is a broad/sensitive scope whose periodic reauth requirement was
// previously taking down the shared token entirely -- including real
// story submissions, which have nothing to do with transcription. With
// this split, that reauth cycle only pauses transcribe-stories.js (rows
// just wait, nothing is lost) instead of breaking submit-story.js too.
//
// Uses the same OAuth client as get-refresh-token.js (no new client
// needed) -- just a separate authorization grant, so it's an independent,
// separately-revocable token even though the client_id is shared.
//
// Run as:
//   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/get-vertex-refresh-token.js
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing GOOGLE_OAUTH_CLIENT_ID and/or GOOGLE_OAUTH_CLIENT_SECRET.\n' +
    'Run this script as:\n' +
    '  GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/get-vertex-refresh-token.js'
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\nOpen this URL in your browser and log in as joe@storyhost.net:\n');
console.log(authUrl);
console.log('\nWaiting for you to approve access...\n');

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/oauth2callback')) {
    const qs = new URL(req.url, REDIRECT_URI).searchParams;
    const code = qs.get('code');

    res.end('Success! You can close this tab and return to the terminal.');
    server.close();

    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n=== SAVE THIS AS GOOGLE_VERTEX_REFRESH_TOKEN ===\n');
    console.log(tokens.refresh_token);
    console.log('\n==================================================\n');

    if (!tokens.refresh_token) {
      console.log(
        'No refresh token came back — this usually means you already authorized this app before.\n' +
        'Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again.'
      );
    }
  }
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000 for the redirect...');
});
