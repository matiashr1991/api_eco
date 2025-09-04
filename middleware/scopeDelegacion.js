// middleware/scopeDelegacion.js
module.exports = function scopeDelegacion(req, res, next) {
  const deleg = req.user?.deleg;
  if (!deleg) return res.status(403).json({ ok:false, error:'Delegación no asignada' });
  req.delegacionId = Number(deleg);
  next();
};
