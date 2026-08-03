// TEMPORARY diagnostic: reveals which OAuth client_id is actually
// configured in Netlify, to resolve ambiguity between two client entries
// found in Google Cloud Console. client_id is not a secret (it's embedded
// in every auth URL already), so this is safe to expose briefly. Meant to
// be removed again shortly after use, not left running indefinitely.
exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null }),
  };
};
