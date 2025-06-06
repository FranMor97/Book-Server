// routes/friendship_routes/friendship_routes.js
const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../../utils/validate_token.js');
const FriendshipModel = require('../../models/friendship');
const UserModel = require('../../models/user');

// Función para serializar los datos de MongoDB
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

// Función para normalizar datos de usuario para respuestas consistentes
const normalizeUser = (user) => {
    const normalizedUser = user.toObject ? user.toObject() : user;

    // Asegurar que campos requeridos tengan valores por defecto
    return {
        ...normalizedUser,
        id: normalizedUser._id || normalizedUser.id,
        firstName: normalizedUser.firstName || '',
        lastName1: normalizedUser.lastName1 || '',
        lastName2: normalizedUser.lastName2 || '',
        email: normalizedUser.email || '',
        avatar: normalizedUser.avatar || '',
    };
};

// GET obtener amigos del usuario actual
router.get('/friends', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Buscar amistades aceptadas donde el usuario es el solicitante o el receptor
        const friendships = await FriendshipModel.find({
            $or: [
                { requesterId: userId, status: 'accepted' },
                { recipientId: userId, status: 'accepted' }
            ]
        });

        // Extraer los IDs de los amigos
        const friendIds = friendships.map(friendship =>
            friendship.requesterId.toString() === userId
                ? friendship.recipientId
                : friendship.requesterId
        );

        // Obtener detalles de los amigos
        const friends = await UserModel.find({
            _id: { $in: friendIds }
        }, 'firstName lastName1 lastName2 email avatar');

        // Serializar y normalizar los datos
        const normalizedFriends = friends.map(normalizeUser);

        res.status(200).json({
            data: normalizedFriends,
            meta: {
                total: normalizedFriends.length
            }
        });
    } catch (error) {
        console.error('Error al obtener amigos:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET obtener solicitudes de amistad pendientes
router.get('/requests', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Buscar solicitudes pendientes donde el usuario es el receptor
        const pendingRequests = await FriendshipModel.find({
            recipientId: userId,
            status: 'pending'
        }).populate('requesterId', 'firstName lastName1 lastName2 email avatar');

        // Serializar y normalizar los datos
        const normalizedRequests = pendingRequests.map(request => {
            const serializedRequest = request.toObject();
            if (serializedRequest.requesterId) {
                serializedRequest.requester = normalizeUser(serializedRequest.requesterId);
            }
            return serializedRequest;
        });

        res.status(200).json({
            data: serializeData(normalizedRequests),
            meta: {
                total: normalizedRequests.length
            }
        });
    } catch (error) {
        console.error('Error al obtener solicitudes de amistad:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST enviar solicitud de amistad
router.post('/request', verifyToken, async (req, res) => {
    try {
        const requesterId = req.user.id;
        const { recipientId } = req.body;

        // Validar que el receptor exista
        const recipientExists = await UserModel.findById(recipientId);
        if (!recipientExists) {
            return res.status(404).json({ error: 'Usuario destinatario no encontrado' });
        }

        // Verificar que no sea uno mismo
        if (requesterId === recipientId) {
            return res.status(400).json({ error: 'No puedes enviarte una solicitud a ti mismo' });
        }

        // Verificar si ya existe una relación
        const existingFriendship = await FriendshipModel.findOne({
            $or: [
                { requesterId, recipientId },
                { requesterId: recipientId, recipientId: requesterId }
            ]
        });

        if (existingFriendship) {
            return res.status(400).json({
                error: 'Ya existe una relación con este usuario',
                status: existingFriendship.status
            });
        }

        // Crear nueva solicitud
        const newFriendship = new FriendshipModel({
            requesterId,
            recipientId,
            status: 'pending'
        });

        await newFriendship.save();

        // Serializar los datos
        const serializedFriendship = serializeData(newFriendship);

        res.status(201).json({
            message: 'Solicitud de amistad enviada correctamente',
            data: serializedFriendship
        });
    } catch (error) {
        console.error('Error al enviar solicitud de amistad:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH responder a solicitud de amistad
router.patch('/respond/:friendshipId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendshipId } = req.params;
        const { status } = req.body; // 'accepted' o 'rejected'

        if (!['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Estado no válido' });
        }

        // Buscar la solicitud
        const friendship = await FriendshipModel.findById(friendshipId);

        if (!friendship) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }

        // Verificar que el usuario sea el receptor
        if (friendship.recipientId.toString() !== userId) {
            return res.status(403).json({ error: 'No tienes permiso para responder a esta solicitud' });
        }

        // Verificar que la solicitud esté pendiente
        if (friendship.status !== 'pending') {
            return res.status(400).json({ error: 'Esta solicitud ya ha sido procesada' });
        }

        // Actualizar estado
        friendship.status = status;
        await friendship.save();

        // Serializar los datos
        const serializedFriendship = serializeData(friendship);

        res.status(200).json({
            message: `Solicitud de amistad ${status === 'accepted' ? 'aceptada' : 'rechazada'} correctamente`,
            data: serializedFriendship
        });
    } catch (error) {
        console.error('Error al responder a solicitud de amistad:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE eliminar amistad
router.delete('/:friendshipId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendshipId } = req.params;

        // Buscar la amistad
        const friendship = await FriendshipModel.findById(friendshipId);

        if (!friendship) {
            return res.status(404).json({ error: 'Amistad no encontrada' });
        }

        // Verificar que el usuario sea parte de la amistad
        if (friendship.requesterId.toString() !== userId &&
            friendship.recipientId.toString() !== userId) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta amistad' });
        }

        // Eliminar la amistad
        await FriendshipModel.findByIdAndDelete(friendshipId);

        res.status(200).json({
            message: 'Amistad eliminada correctamente'
        });
    } catch (error) {
        console.error('Error al eliminar amistad:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET buscar usuarios
router.get('/search-users', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const query = req.query.q || '';

        if (query.length < 3) {
            return res.status(400).json({ error: 'La búsqueda debe tener al menos 3 caracteres' });
        }

        // Buscar usuarios que coincidan con la consulta (excepto uno mismo)
        const users = await UserModel.find({
            _id: { $ne: userId },
            $or: [
                { firstName: { $regex: query, $options: 'i' } },
                { lastName1: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        }, 'firstName lastName1 lastName2 email avatar');

        // Límite de resultados para evitar devolver demasiados
        const limitedUsers = users.slice(0, 10);

        // Buscar relaciones de amistad existentes para estos usuarios
        const friendships = await FriendshipModel.find({
            $or: [
                { requesterId: userId, recipientId: { $in: limitedUsers.map(u => u._id) } },
                { recipientId: userId, requesterId: { $in: limitedUsers.map(u => u._id) } }
            ]
        });

        // Preparar los resultados con estado de amistad
        const usersWithStatus = limitedUsers.map(user => {
            const normalizedUser = normalizeUser(user);

            // Buscar si existe una relación con este usuario
            const friendship = friendships.find(f =>
                (f.requesterId.toString() === userId && f.recipientId.toString() === user._id.toString()) ||
                (f.recipientId.toString() === userId && f.requesterId.toString() === user._id.toString())
            );

            // Añadir información de estado de amistad
            return {
                ...normalizedUser,
                friendshipStatus: friendship ? friendship.status : null,
                friendshipId: friendship ? friendship._id : null,
                isRequester: friendship ? friendship.requesterId.toString() === userId : false
            };
        });

        // Serializar los datos
        const serializedResults = serializeData(usersWithStatus);

        res.status(200).json({
            data: serializedResults,
            meta: {
                total: serializedResults.length
            }
        });
    } catch (error) {
        console.error('Error al buscar usuarios:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;