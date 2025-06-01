// sockets/socket_manager.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');
const ReadingGroupModel = require('../models/reading_group');
const GroupMessageModel = require('../models/group_message');
const BookCommentModel = require('../models/book_comment'); // Asumiendo que existe este modelo

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
            });

            // Notificar al usuario que está conectado
            socket.emit('connected', {
                status: 'connected',
                groups: userGroups.map(group => group._id)
            });

            // Manejar unión a grupo de lectura
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

            // Manejar envío de mensajes al grupo
            socket.on('send:group-message', async (data) => {
                try {
                    const { groupId, text } = data;

                    // Validar datos
                    if (!groupId || !text || text.trim() === '') {
                        socket.emit('error', { message: 'Parámetros inválidos' });
                        return;
                    }

                    // Verificar que el grupo exista
                    const group = await ReadingGroupModel.findById(groupId);

                    if (!group) {
                        socket.emit('error', { message: 'Grupo no encontrado' });
                        return;
                    }

                    // Verificar si el usuario es miembro
                    const isMember = group.members.some(member =>
                        member.userId.toString() === userId
                    );

                    if (!isMember) {
                        socket.emit('error', { message: 'No eres miembro de este grupo' });
                        return;
                    }

                    // Crear y guardar el mensaje
                    const newMessage = new GroupMessageModel({
                        groupId,
                        userId,
                        text,
                        type: 'text'
                    });

                    await newMessage.save();

                    // Obtener mensaje con datos de usuario
                    const populatedMessage = await GroupMessageModel.findById(newMessage._id)
                        .populate('userId', 'firstName lastName1 avatar');

                    // Serializar para enviar
                    const serializedMessage = serializeData(populatedMessage);

                    // Emitir mensaje a todos los miembros del grupo
                    io.to(`group:${groupId}`).emit('group-message:new', serializedMessage);

                } catch (error) {
                    console.error('Error al enviar mensaje:', error);
                    socket.emit('error', { message: 'Error al enviar mensaje' });
                }
            });

            // Manejar comentarios de libros
            socket.on('send:book-comment', async (data) => {
                try {
                    const { bookId, text, rating, title, isPublic } = data;

                    // Validar datos
                    if (!bookId || !text || text.trim() === '' || rating === undefined) {
                        socket.emit('error', { message: 'Parámetros inválidos' });
                        return;
                    }

                    // Buscar usuario para obtener sus datos
                    const user = await UserModel.findById(userId, 'firstName lastName1 avatar');

                    if (!user) {
                        socket.emit('error', { message: 'Usuario no encontrado' });
                        return;
                    }

                    // Crear comentario usando el modelo que ya tenías
                    // (Adaptado según tu modelo BookComment existente)
                    // Este es un ejemplo ficticio basado en tu estructura actual:
                    const comment = {
                        bookId,
                        userId,
                        text,
                        rating: rating || 0,
                        title,
                        isPublic: isPublic !== false, // Por defecto es público
                        date: new Date()
                    };

                    // Guardar comentario (usando tu lógica existente)
                    // Por ejemplo:
                    // const savedComment = await BookCommentModel.create(comment);
                    // O bien usando tu ruta existente con una petición HTTP

                    // Este es un objeto simulado para el ejemplo
                    const savedComment = {
                        ...comment,
                        id: 'temp-id-' + Date.now(),
                        user: {
                            id: userId,
                            firstName: user.firstName,
                            lastName1: user.lastName1,
                            avatar: user.avatar
                        }
                    };

                    // Emitir notificación de nuevo comentario a todos los interesados en el libro
                    io.emit(`book:${bookId}:new-comment`, serializeData(savedComment));

                } catch (error) {
                    console.error('Error al enviar comentario:', error);
                    socket.emit('error', { message: 'Error al enviar comentario' });
                }
            });

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
};