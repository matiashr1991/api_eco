// middleware/scopeDelegacion.js
module.exports = (req, _res, next) => {
  try {
    const raw = String(req.user?.role || '').toLowerCase();
    const roles = []
      .concat(req.user?.role || [])
      .concat(req.user?.roles || [])
      .concat(req.user?.authorities || [])
      .concat(req.user?.scopes || [])
      .concat(typeof req.user?.scope === 'string' ? req.user.scope.split(/[,\s]+/) : [])
      .map(x => String(x).toLowerCase().replace(/^role[_:-]?/, ''));

    const isDeleg = roles.some(r => r.includes('deleg'));
    const isAdmin  = roles.includes('admin');
    const isControl = roles.includes('control');
    const isAuditor = roles.includes('auditor');

    if (isDeleg && !isAdmin && !isControl && !isAuditor) {
      const claim = req.user?.delegacionId ?? req.user?.iddelegacion ?? null;
      req.delegacionId = Number.isFinite(Number(claim)) ? Number(claim) : null;
    } else {
      // admin / control / auditor → sin filtro por delegación
      req.delegacionId = null;
    }
    next();
  } catch (e) { next(e); }
};
