let io;

module.exports = {
    init: (socketIo) => {
        io = socketIo;
        return io;
    },
    getIO: () => {
        if (!io) {
            throw new Error('Socket.IO no inicializado');
        }
        return io;
    }
};