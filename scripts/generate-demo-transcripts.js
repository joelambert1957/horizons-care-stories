// One-off local utility: transcribes the demo event's individual voice
// clips (voices/*.mp3) using the same Vertex AI approach as
// netlify/functions/transcribe-stories.js, so the demo event can show real
// "Transcript" links instead of leaving that capability empty. Not part of
// the deployed site itself -- run manually, output feeds events-data.js by
// hand like everything else here.
//
// Needs the same env vars as transcribe-stories.js. Run via:
//   netlify dev:exec node scripts/generate-demo-transcripts.js
// so those come from the linked Netlify site rather than needing a local
// .env with real credentials in it.
const fs = require('fs');
const path = require('path');
const { VertexAI } = require('@google-cloud/vertexai');

const TRANSCRIBE_PROMPT = `Transcribe this audio recording verbatim, word for word, exactly as spoken.
Do not summarize, paraphrase, correct grammar, or omit anything -- including filler words like "um" and "uh" if present.
Use standard punctuation and paragraph breaks for readability, but do not alter or add to the actual words spoken.
Output ONLY the transcript text, with no preamble, labels, or commentary.`;

const VOICES = [
  ['darla-roach.mp3', 'Darla Roach'],
  ['judith.mp3', 'Judith'],
  ['jenn.mp3', 'Jenn'],
  ['dorothy.mp3', 'Dorothy'],
  ['sean.mp3', 'Sean'],
  ['anonymous.mp3', 'Anonymous'],
  ['carroll.mp3', 'Carroll'],
  ['malcom-davis.mp3', 'Malcom Davis'],
  ['karen-rizollo.mp3', 'Karen Rizollo'],
  ['letti.mp3', 'Letti'],
];

function getVertexModel() {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const modelName = process.env.GOOGLE_VERTEX_MODEL || 'gemini-2.5-flash';
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_VERTEX_REFRESH_TOKEN;
  if (!project || !clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Vertex AI configuration in environment (needs GOOGLE_VERTEX_REFRESH_TOKEN specifically) -- run via `netlify dev:exec`.');
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
  return vertexAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0 } });
}

async function transcribeFile(model, filePath) {
  const buffer = fs.readFileSync(filePath);
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { text: TRANSCRIBE_PROMPT },
        { inlineData: { mimeType: 'audio/mpeg', data: buffer.toString('base64') } },
      ],
    }],
  });
  const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) throw new Error('Vertex AI returned an empty transcript.');
  return text.trim();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeTranscriptHtml(outPath, name, transcript) {
  const paragraphs = transcript.split(/\n+/).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');
  const html = `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(name)} — transcript</title>
<body style="font-family: Georgia, serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; color: #222;">
<h1 style="font-size: 1.3rem; margin-bottom: 0.25rem;">${escapeHtml(name)}</h1>
<p style="color:#888; font-size: 0.85rem; margin-top: 0;">Demo transcript of a short excerpt (~15-20s), not a full submission.</p>
${paragraphs}
</body>`;
  fs.writeFileSync(outPath, html);
}

async function main() {
  const model = getVertexModel();
  const voicesDir = path.join(__dirname, '..', 'voices');
  const outDir = path.join(__dirname, '..', 'transcripts');
  fs.mkdirSync(outDir, { recursive: true });

  for (const [file, name] of VOICES) {
    process.stdout.write(`Transcribing ${name}... `);
    try {
      const transcript = await transcribeFile(model, path.join(voicesDir, file));
      const outFile = file.replace(/\.mp3$/, '.html');
      writeTranscriptHtml(path.join(outDir, outFile), name, transcript);
      console.log(`OK -> transcripts/${outFile}`);
    } catch (err) {
      console.log(`FAILED: ${err.message || err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
