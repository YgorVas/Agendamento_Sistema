module.exports = function exigirGestao(req, res, next) {
    if (req.cargo !== 'ADMIN' && req.cargo !== 'GERENTE') {
        return res.status(403).json({ erro: 'Esta operação exige um cargo de gestão.' });
    }
    return next();
};
