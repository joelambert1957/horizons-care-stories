const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

// Read from the environment rather than hardcoding here — this file is
// tracked in a public repo, and the client secret must never end up in it.
// Run as:
//   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/get-refresh-token.js
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing GOOGLE_OAUTH_CLIENT_ID and/or GOOGLE_OAUTH_CLIENT_SECRET.\n' +
    'Run this script as:\n' +
    '  GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/get-refresh-token.js'
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',   // required to get a refresh token back
  prompt: 'consent',        // forces Google to actually issue a refresh token, even if you've authorized before
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
    console.log('\n=== SAVE THIS REFRESH TOKEN ===\n');
    console.log(tokens.refresh_token);
    console.log('\n===============================\n');

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
