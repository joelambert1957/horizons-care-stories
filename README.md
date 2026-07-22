# Horizon's Project — Economies of Care: Story Submission

A single-page tool for recording a short (up to 2-minute) audio story of
economic care, with an optional name/city and a required legal release. On
submit, the recording and its metadata are sent to a Netlify Function that
uploads the audio to Google Drive and logs the submission in a Google Sheet.

## How it works

- `index.html` / `style.css` / `app.js` — the recorder page. Uses the
  browser's `MediaRecorder` API to capture audio (stops automatically at 2
  minutes), then on submit base64-encodes the recording and POSTs it as JSON
  to the Netlify Function.
- `netlify/functions/submit-story.js` — receives the POST, authenticates to
  Google as a service account, uploads the audio file into a specific Drive
  folder, and appends a row (timestamp, name, city, consent, Drive link) to a
  specific Google Sheet.

Recordings are capped client-side (and re-checked server-side) at 4MB raw
audio, which comfortably covers a 2-minute voice recording while staying
under Netlify's ~6MB synchronous function payload limit once base64-encoded.

## Required environment variables

Set these in **Netlify → Site configuration → Environment variables** (or via
`netlify env:set`). Never commit real values — `.env` is gitignored, and
`.env.example` only documents the shape.

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The service account's `client_email`, e.g. `story-uploader@your-project.iam.gserviceaccount.com`. |
| `GOOGLE_PRIVATE_KEY` | The service account's `private_key` from its JSON key file. Paste it with literal `\n` sequences for line breaks — the function converts them to real newlines at runtime. In the Netlify UI, paste the key as a single-line value with `\n` in place of line breaks. |
| `GOOGLE_DRIVE_FOLDER_ID` | The ID of the Drive folder recordings should be uploaded into (the long ID segment in the folder's URL). This folder must be shared with the service account's email as an **Editor**. |
| `GOOGLE_SHEET_ID` | The ID of the Google Sheet to log submissions to (the long ID segment in the sheet's URL). This sheet must also be shared with the service account's email as an **Editor**. Rows are appended to the `Sheet1` tab in columns A–E (timestamp, name, city, consent, Drive link) — make sure that tab exists. |

Setting up the Google Cloud project itself (creating the service account,
enabling the Drive and Sheets APIs, generating the key, sharing the folder
and sheet with the service account) is being handled separately.

### Setting variables in Netlify

Via the CLI, from the project root:

```bash
netlify env:set GOOGLE_SERVICE_ACCOUNT_EMAIL "story-uploader@your-project.iam.gserviceaccount.com"
netlify env:set GOOGLE_PRIVATE_KEY "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
netlify env:set GOOGLE_DRIVE_FOLDER_ID "1AbCdeFGhIJkLmNoPQRstuVWxyz"
netlify env:set GOOGLE_SHEET_ID "1AbCdeFGhIJkLmNoPQRstuVWxyz"
```

Or in the Netlify UI: **Site configuration → Environment variables → Add a
variable**, one per row above.

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev             # runs `netlify dev`, serving the page + function locally
```

`netlify dev` reads `.env` automatically and serves the function at
`/.netlify/functions/submit-story`, matching what `app.js` calls in
production.

## Notes on sharing / privacy

Uploaded recordings are **not** made public by this code — the Drive file's
access is whatever the destination folder's own sharing settings are. Anyone
who needs to review submissions should be given access to the Drive folder
directly, rather than relying on the link stored in the Sheet being public.

## Deploying

Connect this repo to a new Netlify site (or run `netlify deploy`). Netlify
will pick up `netlify.toml`, serve `index.html`/`style.css`/`app.js` as a
static site, and deploy `netlify/functions/submit-story.js` as a serverless
function automatically.
