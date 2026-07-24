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
- `netlify/functions/transcribe-stories.js` — a scheduled function (runs
  every 5 minutes) that finds submissions without a transcript yet,
  transcribes them with Gemini (via Vertex AI), and saves the result as a
  `.docx` in a separate Drive folder. See **Automatic transcription** below.

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
**and Vertex AI** access (see **Automatic transcription** below), so treat
it accordingly (don't paste it into chat, tickets, etc.).
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

## Automatic transcription

`transcribe-stories.js` runs on its own every 5 minutes (via the
`schedule()` helper from `@netlify/functions` — no separate cron setup
needed, Netlify picks it up from the code itself). Each run:

1. Reads the submissions Sheet, skipping any row that already has a value in
   the **Transcribed** column.
2. Downloads up to 8 not-yet-transcribed recordings from Drive.
3. Sends each one to Gemini (`gemini-2.5-flash` by default, via Vertex AI)
   with a strict verbatim-transcription prompt (temperature 0 — instructed
   not to summarize, paraphrase, or clean up filler words).
4. Writes the transcript into a `.docx` and uploads it to the Transcripts
   Drive folder.
5. Marks the row **Transcribed** and records a link to the transcript.

The 8-per-run cap is deliberate: it keeps each run comfortably short, and a
sudden batch (e.g. 20+ submissions from one evening) just gets processed a
handful at a time across consecutive 5-minute runs rather than all at once
— nothing is lost, it just trickles through. A row that fails (e.g. Gemini
returns nothing usable) is logged and left unmarked, so it's retried
automatically on the next run; there's currently no give-up/error state for
a row that fails permanently, worth revisiting once this has run for a
while.

Transcription reuses the **same OAuth credentials as Drive/Sheets**
(`GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`) rather than a dedicated
service account — org policy blocks creating service account keys, so
instead it authenticates to Vertex AI as the same user
(`joe@storyhost.net`) via google-auth-library's `authorized_user`
credential type (the same mechanism `gcloud auth application-default
login` uses). That means the refresh token needs to carry the
`cloud-platform` scope in addition to Drive/Sheets, and that Google account
needs the `Vertex AI User` IAM role granted directly on the GCP project
(not a service account role).

### One-time setup

1. **Enable the Vertex AI API** on the GCP project — Cloud Console → APIs &
   Services → Library → "Vertex AI API" → Enable.
2. **Grant `joe@storyhost.net` the "Vertex AI User" IAM role** on the GCP
   project — Cloud Console → IAM & Admin → IAM → Grant Access → enter that
   account → select the `Vertex AI User` role.
3. **Regenerate the OAuth refresh token** — `scripts/get-refresh-token.js`
   now requests the `cloud-platform` scope alongside the existing Drive/
   Sheets scopes, so the token in production needs to be replaced with a
   freshly-generated one (the old one won't have Vertex AI access). Same
   command as before:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID="..." GOOGLE_OAUTH_CLIENT_SECRET="..." node scripts/get-refresh-token.js
   ```
   Update `GOOGLE_OAUTH_REFRESH_TOKEN` in Netlify with the new value — this
   is the **one required step that affects the already-live
   `submit-story.js`** too (it uses the same variable), though nothing
   about its behavior changes, just which token it holds.
4. **Create a "Transcripts" folder** in Drive and share it as **Editor**
   with that same account. Its ID becomes `GOOGLE_TRANSCRIPTS_FOLDER_ID`.
5. **Add two headers to the submissions Sheet**, by hand: `Transcribed` in
   `F1` and `Transcript Link` in `G1`. The function assumes row 1 is
   headers and starts reading data from row 2.

### Environment variables

Only these three are new — everything else transcription needs
(`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SHEET_ID`) is already set from the
Drive/Sheets setup above.

| Variable | Description |
|---|---|
| `GOOGLE_TRANSCRIPTS_FOLDER_ID` | Drive folder ID that finished `.docx` transcripts get uploaded to. |
| `GOOGLE_CLOUD_PROJECT_ID` | The GCP project ID (not the numeric project number) that has Vertex AI enabled. |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region. Defaults to `us-central1` if unset. |
| `GOOGLE_VERTEX_MODEL` | Which Gemini model to call. Defaults to `gemini-2.5-flash`. |

### Known rough edges

- Recordings from Firefox may arrive as `audio/ogg`, which isn't explicitly
  documented as a supported Gemini audio input (unlike `audio/webm`,
  `audio/mp4`, `audio/mpeg`, and `audio/wav`, which all are). Worth testing
  with a real Firefox submission before relying on this for a demo.
- No retry limit yet — a permanently broken file (corrupt audio, etc.) will
  keep being retried every run indefinitely rather than being flagged and
  skipped.

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values
npm run dev             # runs `netlify dev`, serving the page + function locally
```

`netlify dev` reads `.env` automatically and serves the function at
`/.netlify/functions/submit-story`, matching what `app.js` calls in
production.

## Embedding in Squarespace

This page talks to a Netlify Function, so it can't be pasted directly into a
Squarespace code block the way the original static mockup was — a code
block runs on the Squarespace domain, and relative calls to
`/.netlify/functions/submit-story` would hit Squarespace's own server
instead of Netlify.

Instead, embed it via an iframe pointing at the live Netlify site. Paste
this into a Squarespace **Code Block**:

```html
<iframe
  id="horizons-story-embed"
  src="https://horizons-care-stories.netlify.app/"
  style="width:100%; border:none; display:block;"
  height="900"
  title="Add your voice — Horizon's Project story submission"
></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'horizons-embed-resize') {
      var frame = document.getElementById('horizons-story-embed');
      if (frame) frame.style.height = e.data.height + 'px';
    }
  });
</script>
```

`app.js` posts its content height to the parent page whenever it changes
(recording started/stopped, form submitted, error shown, etc.), and the
script above resizes the iframe to match, so there's no dead space or inner
scrollbar once it's on the page.

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
