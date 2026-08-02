const { createTicket } = require('./lib/token-store');
const { WHICH_CONFIG } = require('./lib/oauth-config');

function requireAdmin(event) {
  const password = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  return password && password === process.env.ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }
  if (!requireAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized.' }) };
  }

  let which;
  try {
    which = JSON.parse(event.body || '{}').which;
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }
  if (!WHICH_CONFIG[which]) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown token.' }) };
  }

  const ticket = await createTicket(which);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  };
};
