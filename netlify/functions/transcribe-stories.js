const { schedule } = require('@netlify/functions');
const { google } = require('googleapis');
const { VertexAI } = require('@google-cloud/vertexai');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { connectLambda } = require('@netlify/blobs');
const { getActiveCredentials } = require('./lib/token-store');

// How many not-yet-transcribed rows to process in a single run. Kept small
// so one run finishes comfortably within the function's execution window --
// a burst of 20+ submissions just gets picked off a few at a time across
// consecutive 5-minute runs (see netlify.toml for the schedule) rather than
// all at once. Nothing is lost either way, it just trickles through.
const MAX_PER_RUN = 8;

// Sheet1 already has A-E in production use (timestamp, name, city, consent,
// drive link) from submit-story.js. These two are new, appended rather than
// inserted so the existing columns are untouched. The Sheet needs "Transcribed"
// and "Transcript Link" typed into F1/G1 once, by hand, before this runs.
const TRANSCRIBED_COL = 'F';
const TRANSCRIPT_LINK_COL = 'G';
const SHEET_READ_RANGE = 'Sheet1!A2:G'; // starts at row 2 -- row 1 is assumed to be headers

const TRANSCRIBE_PROMPT = `Transcribe this audio recording verbatim, word for word, exactly as spoken.
Do not summarize, paraphrase, correct grammar, or omit anything -- including filler words like "um" and "uh" if present.
Use standard punctuation and paragraph breaks for readability, but do not alter or add to the actual words spoken.
Output ONLY the transcript text, with no preamble, labels, or commentary.`;

// Checks for a token written by an /admin reconnect (see
// netlify/functions/lib/token-store.js) before falling back to the env var
// -- lets a reconnect take effect immediately, with no redeploy needed.
async function getDriveAuth() {
  const { clientId, clientSecret, refreshToken } = await getActiveCredentials('submission', 'GOOGLE_OAUTH_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN).');
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// Uses its OWN refresh token (GOOGLE_VERTEX_REFRESH_TOKEN), deliberately
// separate from getDriveAuth()'s. cloud-platform (Vertex AI) is a broad,
// sensitive scope subject to periodic reauth -- when that was bundled into
// the SAME token submit-story.js depends on, a reauth requirement took the
// whole token down, breaking real submissions along with transcription.
// This one can fail/need reauth on its own without affecting that at all --
// see scripts/get-vertex-refresh-token.js and README.md. Still authenticates
// as the same user (joe@storyhost.net) via google-auth-library's
// "authorized_user" credential type (not a service account -- org policy
// blocks creating those keys). Whether it's the same OAuth client_id/secret
// as getDriveAuth()'s depends on where the active token came from --
// getActiveCredentials() returns the matching pair either way (see
// netlify/functions/lib/token-store.js). That Google account needs the
// Vertex AI User IAM role granted on the GCP project (Cloud Console -> IAM).
async function getVertexModel() {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const modelName = process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash';
  const { clientId, clientSecret, refreshToken } = await getActiveCredentials('vertex', 'GOOGLE_VERTEX_REFRESH_TOKEN');
  if (!project || !clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Vertex AI configuration (GOOGLE_CLOUD_PROJECT_ID, GOOGLE_OAUTH_CLIENT_ID/SECRET, or GOOGLE_VERTEX_REFRESH_TOKEN).');
  }
  const vertexAI = new VertexAI({
    project,
    location,
    googleAuthOptions: {
      credentials: {
        type: 'authorized_user',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      },
    },
  });
  return vertexAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature: 0 },
  });
}

function extractDriveFileId(driveLink) {
  const match = (driveLink || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function transcribeAudio(model, audioBuffer, mimeType) {
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: TRANSCRIBE_PROMPT },
        { inlineData: { mimeType, data: audioBuffer.toString('base64') } },
      ],
    }],
  });
  const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error('Vertex AI returned an empty transcript.');
  }
  return text.trim();
}

async function buildTranscriptDocx({ transcript, name, city, submittedAt }) {
  const byline = [name || 'Anonymous', city].filter(Boolean).join(' — ');
  const paragraphs = transcript
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({ children: [new TextRun(p)], spacing: { after: 200 } }));

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Story Transcript', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: byline, bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: submittedAt, italics: true, color: '888888' })], spacing: { after: 300 } }),
        ...paragraphs,
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

async function handleRow({ drive, model, transcriptsFolderId, row, rowNumber, sheets, sheetId }) {
  const [timestamp, name, city, consent, driveLink] = row;

  if (!driveLink) { console.log(`Row ${rowNumber}: no driveLink, skipping.`); return; }
  if (consent !== 'yes') { console.log(`Row ${rowNumber}: consent was "${consent}", skipping.`); return; } // defensive -- submit-story.js already enforces this

  const fileId = extractDriveFileId(driveLink);
  if (!fileId) {
    console.error(`Row ${rowNumber}: could not parse a Drive file ID out of "${driveLink}", skipping.`);
    return;
  }

  const meta = await drive.files.get({ fileId, fields: 'id, name, mimeType' });
  const audioMimeType = meta.data.mimeType;
  const audioName = meta.data.name;

  const content = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  const audioBuffer = Buffer.from(content.data);

  const transcript = await transcribeAudio(model, audioBuffer, audioMimeType);
  const docxBuffer = await buildTranscriptDocx({ transcript, name, city, submittedAt: timestamp });

  const transcriptFileName = `${audioName.replace(/\.[^.]+$/, '')}.docx`;
  const upload = await drive.files.create({
    requestBody: { name: transcriptFileName, parents: [transcriptsFolderId] },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: require('stream').Readable.from(docxBuffer),
    },
    fields: 'id, webViewLink',
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Sheet1!${TRANSCRIBED_COL}${rowNumber}:${TRANSCRIPT_LINK_COL}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['yes', upload.data.webViewLink]] },
  });

  console.log(`Row ${rowNumber} (${audioName}): transcribed -> ${upload.data.webViewLink}`);
}

const runTranscription = async (event) => {
  connectLambda(event); // see admin-oauth-start.js -- required before any getStore() call

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const transcriptsFolderId = process.env.GOOGLE_TRANSCRIPTS_FOLDER_ID;
  if (!sheetId || !transcriptsFolderId) {
    console.error('Missing GOOGLE_SHEET_ID or GOOGLE_TRANSCRIPTS_FOLDER_ID env vars.');
    return { statusCode: 500 };
  }

  const driveAuth = await getDriveAuth();
  const drive = google.drive({ version: 'v3', auth: driveAuth });
  const sheets = google.sheets({ version: 'v4', auth: driveAuth });
  const model = await getVertexModel();

  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: SHEET_READ_RANGE });
  const rows = data.values || [];

  const pending = [];
  rows.forEach((row, i) => {
    const [, , , , driveLink, transcribed] = row;
    if (driveLink && !transcribed) {
      pending.push({ row, rowNumber: i + 2 }); // +2: 1-indexed sheet rows, plus the header row
    }
  });

  const batch = pending.slice(0, MAX_PER_RUN);
  console.log(`transcribe-stories: ${pending.length} pending, processing ${batch.length} this run.`);

  for (const { row, rowNumber } of batch) {
    try {
      await handleRow({ drive, model, transcriptsFolderId, row, rowNumber, sheets, sheetId });
    } catch (err) {
      // Deliberately don't mark the row or rethrow -- log and move on so one
      // bad file doesn't block the rest of the batch, and it'll just be
      // retried on the next run. A row that fails permanently will keep
      // retrying every run rather than being given up on; there's no
      // give-up/error-marking yet, worth adding once this has run for a bit.
      console.error(`Row ${rowNumber} failed:`, err.message || err);
    }
  }

  return { statusCode: 200 };
};

exports.handler = schedule('*/5 * * * *', runTranscription);
