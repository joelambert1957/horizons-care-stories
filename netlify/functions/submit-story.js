const { google } = require('googleapis');
const { Readable } = require('stream');

// Keep in sync with the client-side cap in app.js (MAX_AUDIO_BYTES). This is
// a server-side backstop, not the primary guard — the browser should never
// send more than this in normal operation.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB raw

const EXTENSION_BY_MIME = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav'
};

function getAuth() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials.');
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function sanitizeForFilename(value) {
  return (value || '').trim().replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const { audioBase64, mimeType, name, city, consent, timestamp } = payload;

  if (!audioBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No recording was included.' }) };
  }
  if (consent !== true) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Release consent is required.' }) };
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audioBase64, 'base64');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'The recording could not be read.' }) };
  }
  if (audioBuffer.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'The recording was empty.' }) };
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return { statusCode: 400, body: JSON.stringify({ error: 'That recording is too large to upload.' }) };
  }

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!folderId || !sheetId) {
    console.error('Missing GOOGLE_DRIVE_FOLDER_ID or GOOGLE_SHEET_ID env vars.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is not configured correctly.' }) };
  }

  const submittedAt = timestamp || new Date().toISOString();
  const extension = EXTENSION_BY_MIME[mimeType] || 'webm';
  const safeName = sanitizeForFilename(name) || 'anonymous';
  const fileName = `${submittedAt.replace(/[:.]/g, '-')}_${safeName}.${extension}`;

  let auth;
  try {
    auth = getAuth();
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server is not configured correctly.' }) };
  }

  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  let driveLink;
  try {
    const upload = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: mimeType || 'audio/webm',
        body: Readable.from(audioBuffer)
      },
      fields: 'id, webViewLink'
    });
    driveLink = upload.data.webViewLink;
  } catch (err) {
    console.error('Drive upload failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not upload the recording. Please try again.' }) };
  }

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[submittedAt, name || '', city || '', consent ? 'yes' : 'no', driveLink]]
      }
    });
  } catch (err) {
    console.error('Sheet append failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'The recording uploaded but logging it failed. Please try again.' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
