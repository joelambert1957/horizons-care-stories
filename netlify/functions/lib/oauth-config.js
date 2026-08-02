// Single source of truth for the two independently-reauthorized tokens.
// Scopes here must match scripts/get-refresh-token.js and
// scripts/get-vertex-refresh-token.js -- those remain the documented
// fallback if /admin itself is ever unreachable.
const WHICH_CONFIG = {
  submission: {
    label: 'Submission (Drive/Sheets)',
    envVar: 'GOOGLE_OAUTH_REFRESH_TOKEN',
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  },
  vertex: {
    label: 'Transcription (Vertex AI)',
    envVar: 'GOOGLE_VERTEX_REFRESH_TOKEN',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  },
};

module.exports = { WHICH_CONFIG };
