// routes/reading_group_routes/reading_group_routes.js
const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../../utils/validate_token.js');
const ReadingGroupModel = require('../../models/reading_group');
const GroupMessageModel = require('../../models/group_message');
const BookModel = require('../../models/book');
const UserModel = require('../../models/user');
const ioInstance = require('../../sockets/io_instance');

// Función para serializar los datos de MongoDB
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

// GET obtener grupos de lectura del usuario
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Buscar grupos donde el usuario es miembro
        const groups = await ReadingGroupModel.find({
            'members.userId': userId
        }).populate('bookId', 'title authors coverImage')
            .populate('creatorId', 'firstName lastName1');

        // Serializar los datos antes de enviarlos
        const serializedGroups = serializeData(groups);

        res.status(200).json({
            data: serializedGroups,
            meta: {
                total: serializedGroups.length
            }
        });
    } catch (error) {
        console.error('Error al obtener grupos de lectura:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET obtener un grupo específico
router.get('/:groupId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;

        // Buscar el grupo
        const group = await ReadingGroupModel.findById(groupId)
            .populate('bookId')
            .populate('members.userId', 'firstName lastName1 avatar')
            .populate('creatorId', 'firstName lastName1');

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar que el usuario sea miembro
        const isMember = group.members.some(member =>
            member.userId._id.toString() === userId
        );

        if (!isMember && group.isPrivate) {
            return res.status(403).json({ error: 'No tienes acceso a este grupo' });
        }

        // Serializar los datos antes de enviarlos
        const serializedGroup = serializeData(group);

        res.status(200).json(serializedGroup);
    } catch (error) {
        console.error('Error al obtener grupo:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST crear un nuevo grupo
router.post('/', verifyToken, async (req, res) => {
    try {
        const creatorId = req.user.id;
        const { name, description, bookId, isPrivate, readingGoal } = req.body;

        // Verificar que el libro exista
        const bookExists = await BookModel.findById(bookId);
        if (!bookExists) {
            return res.status(404).json({ error: 'Libro no encontrado' });
        }

        // Crear nuevo grupo
        const newGroup = new ReadingGroupModel({
            name,
            description,
            bookId,
            creatorId,
            isPrivate: isPrivate || false,
            readingGoal,
            members: [{
                userId: creatorId,
                role: 'admin',
                currentPage: 0
            }]
        });

        await newGroup.save();

        // Crear mensaje de sistema para notificar creación
        const systemMessage = new GroupMessageModel({
            groupId: newGroup._id,
            userId: creatorId,
            text: 'Grupo creado',
            type: 'system'
        });

        await systemMessage.save();

        // Serializar los datos antes de enviarlos
        const serializedGroup = serializeData(newGroup);

        res.status(201).json({
            message: 'Grupo de lectura creado correctamente',
            data: serializedGroup
        });
    } catch (error) {
        console.error('Error al crear grupo de lectura:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST unirse a un grupo
router.post('/:groupId/join', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;

        // Buscar el grupo
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar si el usuario ya es miembro
        const isMember = group.members.some(member =>
            member.userId.toString() === userId
        );

        if (isMember) {
            return res.status(400).json({ error: 'Ya eres miembro de este grupo' });
        }

        // Añadir al usuario como miembro
        group.members.push({
            userId,
            role: 'member',
            currentPage: 0
        });

        await group.save();

        // Crear mensaje de sistema para notificar unión
        const user = await UserModel.findById(userId, 'firstName lastName1');
        const systemMessage = new GroupMessageModel({
            groupId,
            userId,
            text: `${user.firstName} ${user.lastName1} se ha unido al grupo`,
            type: 'system'
        });

        await systemMessage.save();

        // Serializar los datos antes de enviarlos
        const serializedGroup = serializeData(group);

        res.status(200).json({
            message: 'Te has unido al grupo correctamente',
            data: serializedGroup
        });
    } catch (error) {
        console.error('Error al unirse al grupo:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH actualizar progreso de lectura
router.patch('/:groupId/progress', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;
        const { currentPage } = req.body;

        // Validar datos
        if (currentPage === undefined || currentPage < 0) {
            return res.status(400).json({ error: 'Página actual inválida' });
        }

        // Buscar el grupo
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar si el usuario es miembro
        const memberIndex = group.members.findIndex(member =>
            member.userId.toString() === userId
        );

        if (memberIndex === -1) {
            return res.status(403).json({ error: 'No eres miembro de este grupo' });
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

        // Obtener mensaje con datos de usuario para incluir en respuesta
        const populatedMessage = await GroupMessageModel.findById(progressMessage._id)
            .populate('userId', 'firstName lastName1 avatar');

        // Preparar datos para enviar por socket
        const progressData = {
            message: serializeData(populatedMessage),
            userId,
            user: serializeData(user),
            previousPage,
            currentPage,
            groupId
        };

        // Emitir evento de socket a todos los miembros del grupo
        try {
            const io = ioInstance.getIO();
            io.to(`group:${groupId}`).emit('reading-progress:updated', progressData);
        } catch (socketError) {
            console.error('Error al emitir evento de socket:', socketError);
            // No interrumpimos la respuesta HTTP si hay error en el socket
        }

        // Serializar los datos antes de enviarlos en la respuesta HTTP
        const serializedGroup = serializeData(group);

        res.status(200).json({
            message: 'Progreso actualizado correctamente',
            data: serializedGroup
        });
    } catch (error) {
        console.error('Error al actualizar progreso:', error);
        res.status(500).json({ error: error.message });
    }
});


// GET mensajes del chat de un grupo
router.get('/:groupId/messages', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Verificar que el grupo exista
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar si el usuario es miembro
        const isMember = group.members.some(member =>
            member.userId.toString() === userId
        );

        if (!isMember) {
            return res.status(403).json({ error: 'No eres miembro de este grupo' });
        }

        // Obtener mensajes con paginación (más recientes primero)
        const messages = await GroupMessageModel.find({ groupId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'firstName lastName1 avatar');

        // Contar total de mensajes
        const total = await GroupMessageModel.countDocuments({ groupId });

        // Serializar los datos antes de enviarlos
        const serializedMessages = serializeData(messages);

        res.status(200).json({
            data: serializedMessages,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error al obtener mensajes:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST enviar mensaje al chat
router.post('/:groupId/messages', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;
        const { text } = req.body;

        // Validar datos
        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
        }

        // Verificar que el grupo exista
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar si el usuario es miembro
        const isMember = group.members.some(member =>
            member.userId.toString() === userId
        );

        if (!isMember) {
            return res.status(403).json({ error: 'No eres miembro de este grupo' });
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

        // Serializar los datos antes de enviarlos
        const serializedMessage = serializeData(populatedMessage);

        // Emitir evento de socket a todos los miembros del grupo
        try {
            const io = ioInstance.getIO();
            io.to(`group:${groupId}`).emit('group-message:new', serializedMessage);
        } catch (socketError) {
            console.error('Error al emitir evento de socket:', socketError);
            // No interrumpimos la respuesta HTTP si hay error en el socket
        }

        res.status(201).json({
            message: 'Mensaje enviado correctamente',
            data: serializedMessage
        });
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE abandonar grupo
router.delete('/:groupId/leave', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;

        // Buscar el grupo
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar si el usuario es miembro
        const memberIndex = group.members.findIndex(member =>
            member.userId.toString() === userId
        );

        if (memberIndex === -1) {
            return res.status(400).json({ error: 'No eres miembro de este grupo' });
        }

        // Verificar si es el único administrador
        const isAdmin = group.members[memberIndex].role === 'admin';
        const adminCount = group.members.filter(member => member.role === 'admin').length;

        if (isAdmin && adminCount === 1 && group.members.length > 1) {
            return res.status(400).json({
                error: 'Eres el único administrador. Asigna otro administrador antes de abandonar el grupo'
            });
        }

        // Si es el creador y hay otros miembros, transferir propiedad
        if (group.creatorId.toString() === userId && group.members.length > 1) {
            // Encontrar otro miembro (preferiblemente admin)
            const newCreatorIndex = group.members.findIndex(member =>
                member.userId.toString() !== userId && member.role === 'admin'
            ) || group.members.findIndex(member =>
                member.userId.toString() !== userId
            );

            if (newCreatorIndex !== -1) {
                group.creatorId = group.members[newCreatorIndex].userId;
                // Hacer administrador al nuevo creador si no lo es
                group.members[newCreatorIndex].role = 'admin';
            }
        }

        // Si es el único miembro, eliminar el grupo
        if (group.members.length === 1) {
            await ReadingGroupModel.findByIdAndDelete(groupId);
            // Opcionalmente, eliminar todos los mensajes del grupo
            await GroupMessageModel.deleteMany({ groupId });

            return res.status(200).json({
                message: 'Grupo eliminado ya que eras el único miembro'
            });
        }

        // Eliminar al usuario de los miembros
        group.members.splice(memberIndex, 1);
        await group.save();

        // Crear mensaje de sistema para notificar salida
        const user = await UserModel.findById(userId, 'firstName lastName1');
        const systemMessage = new GroupMessageModel({
            groupId,
            userId,
            text: `${user.firstName} ${user.lastName1} ha abandonado el grupo`,
            type: 'system'
        });

        await systemMessage.save();

        res.status(200).json({
            message: 'Has abandonado el grupo correctamente'
        });
    } catch (error) {
        console.error('Error al abandonar grupo:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;