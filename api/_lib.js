// Shared helpers for all API handlers — CORS, auth verification, team extraction

function getAllowedOrigin(requestOrigin) {
  var env = process.env.ALLOWED_ORIGINS;
  var allowed = env ? env.split(',').map(function(s) { return s.trim(); }) : [];

  if (allowed.length === 0) {
    if (!requestOrigin) return '';
    if (requestOrigin.startsWith('http://localhost')) return requestOrigin;
    if (requestOrigin.endsWith('.vercel.app')) return requestOrigin;
    return '';
  }

  if (allowed.indexOf('*') !== -1) return '*';
  if (allowed.indexOf(requestOrigin) !== -1) return requestOrigin;

  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i].startsWith('*.') && requestOrigin && requestOrigin.endsWith(allowed[i].slice(1))) {
      return requestOrigin;
    }
  }

  return allowed[0];
}

function setCors(req, res, methods) {
  var origin = getAllowedOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // caller must return
  }
  return false; // continue
}

function verifyToken(authHeader) {
  if (!authHeader) return false;
  try {
    var token = authHeader.replace('Bearer ', '');
    var decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    return decoded.user === 'admin' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function requireAuth(req, res) {
  if (!req.headers.authorization) {
    res.status(401).json({ error: 'Неавторизован: нет заголовка Authorization. Перезайдите в админку.' });
    return false;
  }
  if (!verifyToken(req.headers.authorization)) {
    res.status(401).json({ error: 'Неавторизован: токен истек или неверен. Выйдите и зайдите заново.' });
    return false;
  }
  return true;
}

// Extract team from query: ?team=women — defaults to 'men'
function getTeam(req) {
  return (req.query && (req.query.team === 'women' || req.query.team === 'men')) ? req.query.team : 'men';
}

// Extract entity ID from URL path (e.g. /api/players/5 → "5", /api/players → null)
function getPathId(req) {
  var parts = (req.url || '').split('?')[0].replace(/\/+$/, '').split('/');
  // parts: ['', 'api', 'players', '5'] or ['', 'api', 'players']
  var last = parts[parts.length - 1];
  if (last && last !== parts[2] && /^\d+$/.test(last)) {
    return parseInt(last, 10);
  }
  return null;
}

// Respond with JSON success
function ok(res, data) {
  res.status(200).json(data);
}

// Respond created
function created(res, data) {
  res.status(201).json(data);
}

// Respond with error
function fail(res, status, message) {
  res.status(status).json({ error: message });
}

export { setCors, requireAuth, getTeam, getPathId, ok, created, fail, verifyToken };
