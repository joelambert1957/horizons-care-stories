const { google } = require('googleapis');
const { Readable } = require('stream');
const { getOverrideToken } = require('./lib/token-store');

// Keep in sync with the client-side cap in app.js (MAX_AUDIO_BYTES). This is
// a server-side backstop, not the primary guard — the browser should never
// send more than this in normal operation.
const MAX_AUDIO_BYTES = 4.3 * 1024 * 1024; // 4.3MB raw

// Portraits are compressed client-side to a small thumbnail before they
// ever reach this function (see PORTRAIT_* constants in app.js), so this is
// a generous backstop, not the primary size guard.
const MAX_PORTRAIT_BYTES = 500 * 1024; // 500KB raw

const EXTENSION_BY_MIME = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
  'audio/x-wav': 'wav',
  'audio/3gpp': '3gp'
};

const EXTENSION_BY_IMAGE_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

// Checks for a token written by an /admin reconnect (see
// netlify/functions/lib/token-store.js) before falling back to the env var
// -- lets a reconnect take effect immediately, with no redeploy needed.
async function getAuth() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = (await getOverrideToken('submission')) || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
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

  const {
    audioBase64, mimeType, name, city, eventName, consent, timestamp,
    portraitBase64, portraitMimeType
  } = payload;

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
    auth = await getAuth();
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

  // A portrait is a bonus, not the core submission -- if anything about it
  // fails (missing folder config, bad data, upload error), the story itself
  // should still save. Log and continue rather than fail the whole request.
  let portraitLink = '';
  let photoWarning = null;
  if (portraitBase64) {
    try {
      const portraitBuffer = Buffer.from(portraitBase64, 'base64');
      if (portraitBuffer.length === 0) {
        throw new Error('the photo was empty');
      }
      if (portraitBuffer.length > MAX_PORTRAIT_BYTES) {
        throw new Error('the photo was too large');
      }
      const portraitsFolderId = process.env.GOOGLE_PORTRAITS_FOLDER_ID;
      if (!portraitsFolderId) {
        throw new Error('GOOGLE_PORTRAITS_FOLDER_ID is not configured');
      }
      const portraitExt = EXTENSION_BY_IMAGE_MIME[portraitMimeType] || 'jpg';
      const portraitUpload = await drive.files.create({
        requestBody: {
          name: `${fileName.replace(/\.[^.]+$/, '')}.${portraitExt}`,
          parents: [portraitsFolderId]
        },
        media: {
          mimeType: portraitMimeType || 'image/jpeg',
          body: Readable.from(portraitBuffer)
        },
        fields: 'id, webViewLink'
      });
      portraitLink = portraitUpload.data.webViewLink;
    } catch (err) {
      console.error('Portrait upload failed, continuing without it:', err.message || err);
      photoWarning = 'Your story was saved, but the photo could not be uploaded.';
    }
  }

  try {
    // values.append relies on Sheets' own "find the table, write after its
    // last row, in its columns" heuristic -- that heuristic misread a sparse
    // early row once already and wrote a real submission's data starting in
    // column D instead of A. Computing the target row explicitly and writing
    // to an exact A{n}:E{n} range with values.update sidesteps that
    // detection entirely, so placement can't drift regardless of what else
    // is in the sheet.
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:A'
    });
    const nextRow = (existing.data.values ? existing.data.values.length : 0) + 1;

    // Columns F/G (Transcribed, Transcript Link) are owned by
    // transcribe-stories.js and always blank on a brand-new row, so writing
    // '' there is safe -- nothing to clobber. Event Name/Portrait Link are
    // appended at H/I rather than inserted earlier, so this never shifts
    // the columns transcribe-stories.js already reads by fixed position.
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `Sheet1!A${nextRow}:I${nextRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          submittedAt, name || '', city || '', consent ? 'yes' : 'no', driveLink,
          '', '', eventName || '', portraitLink
        ]]
      }
    });
  } catch (err) {
    console.error('Sheet append failed:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'The recording uploaded but logging it failed. Please try again.' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, photoWarning }) };
};
