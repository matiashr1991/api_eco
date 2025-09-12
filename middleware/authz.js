// middleware/authz.js
const jwt = require('jsonwebtoken');

function normRole(r) {
  return String(r || '')
    .trim()
    .toLowerCase()
    .replace(/^role[_:-]?/, '')      // ROLE_ADMIN -> admin
    .replace('delegación', 'delegacion');
}

function extractRoles(u = {}) {
  const bag = [];
  if (u.role) bag.push(u.role);
  if (Array.isArray(u.roles)) bag.push(...u.roles);

  if (u.authorities) {
    if (Array.isArray(u.authorities)) bag.push(...u.authorities);
    else bag.push(u.authorities);
  }

  if (u.scopes) {
    if (Array.isArray(u.scopes)) bag.push(...u.scopes);
    else bag.push(u.scopes);
  }

  if (typeof u.scope === 'string') {
    bag.push(...u.scope.split(/[,\s]+/));
  }

  return bag.map(normRole).filter(Boolean);
}

function isAdmin(user) {
  return extractRoles(user).includes('admin');
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido/expirado' });
  }
}

function requireRoles(roles = []) {
  const need = roles.map(normRole);
  return (req, res, next) => {
    const have = extractRoles(req.user);

    // bypass total para admin
    if (have.includes('admin')) return next();

    if (!need.length) return next();
    if (need.some(r => have.includes(r))) return next();

    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = { requireAuth, requireRoles, isAdmin, extractRoles };
