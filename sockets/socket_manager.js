// sockets/socket_manager.js (MEJORADO)
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

// Función para verificar token (MEJORADA)
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
        console.error('Error verificando token:', error.message);
        return null;
    }
};

module.exports = (io) => {
    // Middleware para autenticación MEJORADO - Más permisivo
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        const user = verifyToken(token);

        if (!user) {
            console.log('Socket sin token válido - permitiendo conexión para re-autenticación');
            // NO rechazar inmediatamente, permitir conexión para re-autenticación
            socket.needsAuth = true;
            return next();
        }

        // Guardar ID del usuario en el socket para uso posterior
        socket.userId = user.id;
        socket.userRole = user.role;
        socket.needsAuth = false;
        console.log(`Token válido para usuario: ${user.id}`);
        next();
    });

    io.on('connection', async (socket) => {
        console.log(`Nueva conexión de socket: ${socket.id}`);

        // Si necesita autenticación, esperar evento de re-auth
        if (socket.needsAuth) {
            console.log('Socket esperando re-autenticación...');

            // Permitir re-autenticación después de registro/login
            socket.on('authenticate', async (data) => {
                try {
                    const { token } = data;
                    const user = verifyToken(token);

                    if (!user) {
                        socket.emit('auth-error', { message: 'Token inválido' });
                        return;
                    }

                    // Autenticación exitosa
                    socket.userId = user.id;
                    socket.userRole = user.role;
                    socket.needsAuth = false;

                    console.log(`Re-autenticación exitosa para usuario: ${user.id}`);

                    // Continuar con la inicialización normal
                    await initializeUserSocket(socket, user.id);

                } catch (error) {
                    console.error('Error en re-autenticación:', error);
                    socket.emit('auth-error', { message: 'Error de autenticación' });
                }
            });

            // Timeout para desconectar si no se autentica en 30 segundos
            setTimeout(() => {
                if (socket.needsAuth) {
                    console.log('Desconectando socket por falta de autenticación');
                    socket.disconnect();
                }
            }, 30000);

            return;
        }

        // Si ya tiene autenticación válida, inicializar inmediatamente
        await initializeUserSocket(socket, socket.userId);
    });

    // Función auxiliar para inicializar un socket autenticado
    async function initializeUserSocket(socket, userId) {
        try {
            console.log(`Inicializando socket para usuario: ${userId}`);

            // Registrar conexión
            connectedUsers.set(userId, socket.id);
            userSockets.set(socket.id, userId);

            // Unirse a salas personalizadas
            socket.join(`user:${userId}`);

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
                userId: userId,
                groups: userGroups.map(group => group._id),
                message: 'Socket inicializado correctamente'
            });

            // Configurar todos los event listeners
            setupSocketEventListeners(socket, userId);

        } catch (error) {
            console.error('Error inicializando socket:', error);
            socket.emit('error', { message: 'Error al inicializar conexión' });
        }
    }

    // Función para configurar todos los event listeners
    function setupSocketEventListeners(socket, userId) {
        // Re-autenticación en caliente
        socket.on('re-authenticate', async (data) => {
            try {
                const { token } = data;
                const user = verifyToken(token);

                if (!user || user.id !== userId) {
                    socket.emit('auth-error', { message: 'Token inválido para este usuario' });
                    return;
                }

                console.log(`Re-autenticación exitosa para usuario: ${userId}`);
                socket.emit('re-auth-success', { message: 'Token actualizado correctamente' });

            } catch (error) {
                console.error('Error en re-autenticación:', error);
                socket.emit('auth-error', { message: 'Error de re-autenticación' });
            }
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

        socket.on('leave:group', async (data) => {
            try {
                const { groupId } = data;
                socket.leave(`group:${groupId}`);
                console.log(`Usuario ${userId} salió de la sala del grupo ${groupId}`);
            } catch (error) {
                console.error('Error al salir del grupo:', error);
            }
        });

        socket.on('update:reading-progress', async (data) => {
            try {
                const { groupId, currentPage } = data;

                if (!groupId || currentPage === undefined || currentPage < 0) {
                    socket.emit('error', { message: 'Parámetros inválidos' });
                    return;
                }

                const group = await ReadingGroupModel.findById(groupId);

                if (!group) {
                    socket.emit('error', { message: 'Grupo no encontrado' });
                    return;
                }

                const memberIndex = group.members.findIndex(member =>
                    member.userId.toString() === userId
                );

                if (memberIndex === -1) {
                    socket.emit('error', { message: 'No eres miembro de este grupo' });
                    return;
                }

                const previousPage = group.members[memberIndex].currentPage;
                group.members[memberIndex].currentPage = currentPage;
                await group.save();

                const user = await UserModel.findById(userId, 'firstName lastName1 avatar');

                const progressMessage = new GroupMessageModel({
                    groupId,
                    userId,
                    text: `${user.firstName} ${user.lastName1} avanzó de la página ${previousPage} a la ${currentPage}`,
                    type: 'progress'
                });

                await progressMessage.save();

                const populatedMessage = await GroupMessageModel.findById(progressMessage._id)
                    .populate('userId', 'firstName lastName1 avatar');

                const progressData = {
                    message: serializeData(populatedMessage),
                    userId,
                    user: serializeData(user),
                    previousPage,
                    currentPage,
                    groupId
                };

                io.to(`group:${groupId}`).emit('reading-progress:updated', progressData);

            } catch (error) {
                console.error('Error al actualizar progreso:', error);
                socket.emit('error', { message: 'Error al actualizar progreso' });
            }
        });

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

        // Test de conectividad
        socket.on('ping', () => {
            socket.emit('pong', {
                userId: userId,
                timestamp: Date.now(),
                message: 'Socket funcionando correctamente'
            });
        });

        socket.on('disconnect', () => {
            console.log(`Usuario desconectado: ${userId}`);
            connectedUsers.delete(userId);
            userSockets.delete(socket.id);
        });
    }

    // Funciones de utilidad para emitir desde la API
    return {
        emitGroupMessage: async (groupId, message) => {
            try {
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
                console.log(`Evento ${event} emitido al usuario ${userId}`);
            } else {
                console.log(`Usuario ${userId} no conectado`);
            }
        },

        emitToGroup: (groupId, event, data) => {
            io.to(`group:${groupId}`).emit(event, data);
            console.log(`Evento ${event} emitido al grupo ${groupId}`);
        },

        // Nueva función para notificar a usuarios después del registro
        handleNewUserRegistration: async (userId) => {
            console.log(`Nuevo usuario registrado: ${userId}`);
            // Aquí puedes agregar lógica adicional si es necesaria
        }
    };
};