// sockets/socket_manager.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const ReadingGroupModel = require('../models/reading_group');
const GroupMessageModel = require('../models/group_message');
const BookCommentModel = require('../models/book_comment');

// Función para serializar datos
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

// Almacenamiento de usuarios conectados
const connectedUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId

// Función para verificar token
const verifyToken = (token) => {
    if (!token) return null;

    try {
        // Eliminar "Bearer " si está presente
        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
        return decoded;
    } catch (error) {
        console.error('Error verificando token:', error);
        return null;
    }
};

module.exports = (io) => {
    // Middleware para autenticación
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        const user = verifyToken(token);

        if (!user) {
            return next(new Error('Acceso no autorizado'));
        }

        // Guardar ID del usuario en el socket para uso posterior
        socket.userId = user.id;
        next();
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`Usuario conectado: ${userId}`);

        try {
            // Registrar conexión
            connectedUsers.set(userId, socket.id);
            userSockets.set(socket.id, userId);

            // Unirse a salas personalizadas
            socket.join(`user:${userId}`); // Sala para notificaciones personales

            // Buscar y unirse a salas de grupos
            const userGroups = await ReadingGroupModel.find({
                'members.userId': userId
            });

            userGroups.forEach(group => {
                socket.join(`group:${group._id}`);
                console.log(`Usuario ${userId} unido automáticamente al grupo ${group._id}`);
            });

            socket.emit('connected', {
                status: 'connected',
                groups: userGroups.map(group => group._id)
            });

            socket.on('join:group', async (data) => {
                try {
                    const { groupId } = data;

                    // Verificar que el usuario sea miembro del grupo
                    const group = await ReadingGroupModel.findOne({
                        _id: groupId,
                        'members.userId': userId
                    });

                    if (!group) {
                        socket.emit('error', { message: 'No eres miembro de este grupo' });
                        return;
                    }

                    // Unir al socket a la sala del grupo
                    socket.join(`group:${groupId}`);
                    socket.emit('joined:group', { groupId });

                    console.log(`Usuario ${userId} se unió a la sala del grupo ${groupId}`);
                } catch (error) {
                    console.error('Error al unirse al grupo:', error);
                    socket.emit('error', { message: 'Error al unirse al grupo' });
                }
            });

            // Manejar salida de grupo
            socket.on('leave:group', async (data) => {
                try {
                    const { groupId } = data;
                    socket.leave(`group:${groupId}`);
                    console.log(`Usuario ${userId} salió de la sala del grupo ${groupId}`);
                } catch (error) {
                    console.error('Error al salir del grupo:', error);
                }
            });

            // Manejar actualización de progreso de lectura
            socket.on('update:reading-progress', async (data) => {
                try {
                    const { groupId, currentPage } = data;

                    // Verificar parámetros
                    if (!groupId || currentPage === undefined || currentPage < 0) {
                        socket.emit('error', { message: 'Parámetros inválidos' });
                        return;
                    }

                    // Buscar el grupo
                    const group = await ReadingGroupModel.findById(groupId);

                    if (!group) {
                        socket.emit('error', { message: 'Grupo no encontrado' });
                        return;
                    }

                    // Verificar si el usuario es miembro
                    const memberIndex = group.members.findIndex(member =>
                        member.userId.toString() === userId
                    );

                    if (memberIndex === -1) {
                        socket.emit('error', { message: 'No eres miembro de este grupo' });
                        return;
                    }

                    // Obtener página anterior para el mensaje
                    const previousPage = group.members[memberIndex].currentPage;

                    // Actualizar progreso
                    group.members[memberIndex].currentPage = currentPage;
                    await group.save();

                    // Buscar información del usuario
                    const user = await UserModel.findById(userId, 'firstName lastName1 avatar');

                    // Crear mensaje de progreso
                    const progressMessage = new GroupMessageModel({
                        groupId,
                        userId,
                        text: `${user.firstName} ${user.lastName1} avanzó de la página ${previousPage} a la ${currentPage}`,
                        type: 'progress'
                    });

                    await progressMessage.save();

                    // Obtener mensaje con datos de usuario
                    const populatedMessage = await GroupMessageModel.findById(progressMessage._id)
                        .populate('userId', 'firstName lastName1 avatar');

                    // Preparar datos para enviar
                    const progressData = {
                        message: serializeData(populatedMessage),
                        userId,
                        user: serializeData(user),
                        previousPage,
                        currentPage,
                        groupId
                    };

                    // Emitir actualización a todos los miembros del grupo
                    io.to(`group:${groupId}`).emit('reading-progress:updated', progressData);

                } catch (error) {
                    console.error('Error al actualizar progreso:', error);
                    socket.emit('error', { message: 'Error al actualizar progreso' });
                }
            });

            // IMPORTANTE: NO manejar 'send:group-message' aquí
            // Los mensajes se deben enviar solo a través de la API REST
            // para evitar duplicados. El servidor emitirá el evento después
            // de guardar el mensaje en la base de datos.

            /*
            // COMENTADO PARA EVITAR DUPLICADOS
            socket.on('send:group-message', async (data) => {
                // Este evento no se debe manejar aquí
                // Los mensajes deben enviarse vía API REST
            });
            */

            // Manejar suscripción a comentarios de un libro
            socket.on('subscribe:book-comments', (data) => {
                const { bookId } = data;
                if (!bookId) {
                    socket.emit('error', { message: 'ID de libro requerido' });
                    return;
                }

                socket.join(`book:${bookId}`);
                socket.emit('subscribed:book-comments', { bookId });
                console.log(`Usuario ${userId} suscrito a comentarios del libro ${bookId}`);
            });

            // Manejar desconexión
            socket.on('disconnect', () => {
                console.log(`Usuario desconectado: ${userId}`);

                // Limpiar registros
                connectedUsers.delete(userId);
                userSockets.delete(socket.id);
            });

        } catch (error) {
            console.error('Error en la conexión del socket:', error);
        }
    });

    // Exportar función para emitir mensajes desde la API
    return {
        emitGroupMessage: async (groupId, message) => {
            try {
                // Emitir mensaje a todos los miembros del grupo
                io.to(`group:${groupId}`).emit('group-message:new', serializeData(message));
                console.log(`Mensaje emitido al grupo ${groupId}`);
            } catch (error) {
                console.error('Error emitiendo mensaje:', error);
            }
        },

        emitToUser: (userId, event, data) => {
            const socketId = connectedUsers.get(userId);
            if (socketId) {
                io.to(socketId).emit(event, data);
            }
        },

        emitToGroup: (groupId, event, data) => {
            io.to(`group:${groupId}`).emit(event, data);
        }
    };
};