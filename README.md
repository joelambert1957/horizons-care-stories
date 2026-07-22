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
  Google as a real user via OAuth2 (using a stored refresh token), uploads
  the audio file into a specific Drive folder, and appends a row (timestamp,
  name, city, consent, Drive link) to a specific Google Sheet.

Recordings are capped client-side (and re-checked server-side) at 4MB raw
audio, which comfortably covers a 2-minute voice recording while staying
under Netlify's ~6MB synchronous function payload limit once base64-encoded.

## Required environment variables

Set these in **Netlify → Site configuration → Environment variables** (or via
`netlify env:set`). Never commit real values — `.env` is gitignored, and
`.env.example` only documents the shape.

| Variable | Description |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | The OAuth client's ID, from Google Cloud Console → APIs & Services → Credentials. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The OAuth client's secret, from the same credential. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | A refresh token for the Google account that should own the uploads (e.g. `joe@storyhost.net`), generated once via `scripts/get-refresh-token.js` (see below). |
| `GOOGLE_DRIVE_FOLDER_ID` | The ID of the Drive folder recordings should be uploaded into (the long ID segment in the folder's URL). Must belong to (or be shared as **Editor** with) the account the refresh token was issued for. |
| `GOOGLE_SHEET_ID` | The ID of the Google Sheet to log submissions to (the long ID segment in the sheet's URL). Must also be accessible to that same account. Rows are appended to the `Sheet1` tab in columns A–E (timestamp, name, city, consent, Drive link) — make sure that tab exists. |

Setting up the Google Cloud project itself (creating the OAuth client,
enabling the Drive and Sheets APIs) is being handled separately.

### Generating the refresh token

`GOOGLE_OAUTH_REFRESH_TOKEN` is produced once, locally, by running:

```bash
GOOGLE_OAUTH_CLIENT_ID="..." GOOGLE_OAUTH_CLIENT_SECRET="..." node scripts/get-refresh-token.js
```

This starts a local server, prints a Google consent URL to open in your
browser, and once you approve access it prints the refresh token to your
terminal. Copy it straight from there into Netlify — it's a long-lived
credential, equivalent to a password for that Google account's Drive/Sheets
access, so treat it accordingly (don't paste it into chat, tickets, etc.).
The OAuth client's **Authorized redirect URIs** (in Cloud Console) must
include `http://localhost:3000/oauth2callback` for this to work.

### Setting variables in Netlify

Via the CLI, from the project root:

```bash
netlify env:set GOOGLE_OAUTH_CLIENT_ID "..."
netlify env:set GOOGLE_OAUTH_CLIENT_SECRET "..."
netlify env:set GOOGLE_OAUTH_REFRESH_TOKEN "..."
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
