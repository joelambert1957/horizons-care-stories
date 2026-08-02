// TEMPORARY admin utility: lists Sheet rows matching a given Event Name, so
// a batch of real submissions can be pulled together for montage-building.
// Not linked from anywhere in the UI. No auth check, same posture as
// transcribe-stories.js (URL obscurity only) -- meant to be removed again
// shortly after use, not left running indefinitely.
//
// Call as: /.netlify/functions/admin-list-event?event=Story%20Beta%20Test
const { google } = require('googleapis');

const SHEET_RANGE = 'Sheet1!A2:I';

function getAuth() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

exports.handler = async (event) => {
  const targetEvent = (event.queryStringParameters || {}).event;
  if (!targetEvent) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ?event= query param.' }) };
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: SHEET_RANGE });
  const rows = data.values || [];

  const normalize = (s) => (s || '').trim().toLowerCase();
  const matches = [];

  rows.forEach((row, i) => {
    const [timestamp, name, city, consent, driveLink, transcribed, transcriptLink, eventName, portraitLink] = row;
    if (normalize(eventName) === normalize(targetEvent)) {
      matches.push({
        rowNumber: i + 2,
        timestamp, name, city, consent,
        driveLink: driveLink || null,
        transcribed: transcribed || null,
        transcriptLink: transcriptLink || null,
        eventName,
        portraitLink: portraitLink || null,
      });
    }
  });

  return { statusCode: 200, body: JSON.stringify({ count: matches.length, matches }) };
};
