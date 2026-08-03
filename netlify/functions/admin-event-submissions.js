const { google } = require('googleapis');
const { connectLambda } = require('@netlify/blobs');
const { getActiveCredentials } = require('./lib/token-store');

const SHEET_RANGE = 'Sheet1!A2:I';

function requireAdmin(event) {
  const password = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  return password && password === process.env.ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  connectLambda(event); // see admin-oauth-start.js -- required before any getStore() call

  if (!requireAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
  }

  const targetEvent = (event.queryStringParameters || {}).event;
  if (!targetEvent) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ?event= query param.' }) };
  }

  const { clientId, clientSecret, refreshToken } = await getActiveCredentials('submission', 'GOOGLE_OAUTH_REFRESH_TOKEN');
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: SHEET_RANGE });
  const rows = data.values || [];

  const normalize = (s) => (s || '').trim().toLowerCase();
  const matches = [];

  rows.forEach((row, i) => {
    const [, name, city, , driveLink, transcribed, transcriptLink, eventName, portraitLink] = row;
    if (normalize(eventName) === normalize(targetEvent)) {
      matches.push({
        rowNumber: i + 2,
        name: name || '',
        city: city || '',
        driveLink: driveLink || null,
        transcribed: transcribed || null,
        transcriptLink: transcriptLink || null,
        portraitLink: portraitLink || null,
      });
    }
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: matches.length, matches }),
  };
};
