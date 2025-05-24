function serializeResponseMiddleware(req, res, next) {
    const originalJson = res.json;

    res.json = function(data) {
        console.log('Serializando respuesta automáticamente');
        const serializedData = JSON.parse(JSON.stringify(data));
        return originalJson.call(this, serializedData);
    };

    next();
}

module.exports = serializeResponseMiddleware;