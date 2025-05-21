const jwt = require('jsonwebtoken')
const blacklistUtil = require('./blacklistUtils');


// middleware to validate token (rutas protegidas)
const verifyToken = async (req, res, next) => {
// Obtenemos el token del header del request
const token = req.header('auth-token')
//console.log("token: " + token)
if (blacklistUtil.isTokenRevoked(token)) {
console.log("Token revoked")
return res.status(401).json({ error: 'Token revoked' });
}

// Validamos si no hay token
if (!token) return res.status(401).json({ error: 'Acceso denegado' })
try {
    // Verificamos el token usando la dependencia de jwt y el método .verify
    const verified = jwt.verify(token, process.env.TOKEN_SECRETO)
    next() // continuamos
} catch (error) {
    if (error.name === 'TokenExpiredError') {
    // El token ha expirado
    return res.status(401).json({ error: 'Token expirado, acceso denegado' });
    } else {
    // Otro tipo de error al verificar el token
    return res.status(400).json({ error: 'Token no válido, acceso denegado' });
    }
}
}
module.exports = verifyToken;