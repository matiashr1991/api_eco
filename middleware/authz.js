// src/middleware/authz.js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Token inválido/expirado' });
    }
}

function requireRoles(roles = []) {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role || (roles.length && !roles.includes(role))) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRoles };
