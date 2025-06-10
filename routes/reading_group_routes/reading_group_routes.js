// routes/reading_group_routes/reading_group_routes.js
const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../../utils/validate_token.js');
const ReadingGroupModel = require('../../models/reading_group');
const GroupMessageModel = require('../../models/group_message');
const BookModel = require('../../models/book');
const UserModel = require('../../models/user');
const ioInstance = require('../../sockets/io_instance');

// Función para serializar los datos de MongoDB (mantenida para compatibilidad con sockets)
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

// IMPORTANTE: Las rutas más específicas deben ir ANTES que las rutas con parámetros

// GET buscar grupos públicos (DEBE IR ANTES QUE /:groupId)
router.get('/public', verifyToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const query = req.query.q || '';

        // Construir consulta de búsqueda
        const searchQuery = {
            isPrivate: false
        };

        // Añadir filtro de búsqueda si se proporciona
        if (query) {
            searchQuery.$or = [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ];
        }

        // Buscar grupos públicos CON DATOS POBLADOS
        const groups = await ReadingGroupModel.findWithPopulatedData(searchQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Contar total para paginación
        const total = await ReadingGroupModel.countDocuments(searchQuery);

        // Convertir a formato Flutter
        const flutterGroups = ReadingGroupModel.toFlutterJSONArray(groups);

        res.status(200).json({
            data: flutterGroups,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error al buscar grupos públicos:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET obtener grupos de lectura del usuario
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Buscar grupos donde el usuario es miembro CON DATOS POBLADOS
        const groups = await ReadingGroupModel.findWithPopulatedData({
            'members.userId': userId
        });

        // Convertir a formato Flutter
        const flutterGroups = ReadingGroupModel.toFlutterJSONArray(groups);

        res.status(200).json({
            data: flutterGroups,
            meta: {
                total: flutterGroups.length
            }
        });
    } catch (error) {
        console.error('Error al obtener grupos de lectura:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET obtener un grupo específico (DEBE IR DESPUÉS DE LAS RUTAS ESPECÍFICAS)
router.get('/:groupId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
        }

        // Buscar el grupo CON DATOS POBLADOS
        const group = await ReadingGroupModel.findByIdWithPopulatedData(groupId);

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

        // Convertir a formato Flutter
        const flutterGroup = group.toFlutterJSON();

        res.status(200).json(flutterGroup);
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

        // Obtener el grupo recién creado CON DATOS POBLADOS
        const populatedGroup = await ReadingGroupModel.findByIdWithPopulatedData(newGroup._id);

        // Convertir a formato Flutter
        const flutterGroup = populatedGroup.toFlutterJSON();

        res.status(201).json({
            message: 'Grupo de lectura creado correctamente',
            data: flutterGroup
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

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
        }

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

        // Obtener el grupo actualizado CON DATOS POBLADOS
        const updatedGroup = await ReadingGroupModel.findByIdWithPopulatedData(groupId);

        // Convertir a formato Flutter
        const flutterGroup = updatedGroup.toFlutterJSON();

        res.status(200).json({
            message: 'Te has unido al grupo correctamente',
            data: flutterGroup
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

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
        }

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

        // Obtener el grupo actualizado CON DATOS POBLADOS
        const updatedGroup = await ReadingGroupModel.findByIdWithPopulatedData(groupId);

        // Convertir a formato Flutter
        const flutterGroup = updatedGroup.toFlutterJSON();

        res.status(200).json({
            message: 'Progreso actualizado correctamente',
            data: flutterGroup
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

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
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

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
        }

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

// PATCH actualizar configuración del grupo
router.patch('/:groupId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;
        const { name, description, isPrivate, readingGoal } = req.body;

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
        }

        // Buscar el grupo
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar que el usuario sea administrador
        const member = group.members.find(m => m.userId.toString() === userId);

        if (!member || member.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos para editar este grupo' });
        }

        // Actualizar campos permitidos
        if (name) group.name = name;
        if (description !== undefined) group.description = description;
        if (isPrivate !== undefined) group.isPrivate = isPrivate;
        if (readingGoal) group.readingGoal = readingGoal;

        // Guardar cambios
        group.updatedAt = new Date();
        await group.save();

        // Obtener el grupo actualizado CON DATOS POBLADOS
        const updatedGroup = await ReadingGroupModel.findByIdWithPopulatedData(groupId);

        // Convertir a formato Flutter
        const flutterGroup = updatedGroup.toFlutterJSON();

        res.status(200).json({
            message: 'Grupo actualizado correctamente',
            data: flutterGroup
        });
    } catch (error) {
        console.error('Error al actualizar grupo:', error);
        res.status(500).json({ error: error.message });
    }
});

// PATCH gestionar miembros (promover/degradar/expulsar)
router.patch('/:groupId/members/:memberId', verifyToken, async (req, res) => {
    try {
        const adminId = req.user.id;
        const { groupId, memberId } = req.params;
        const { action } = req.body; // 'promote', 'demote', 'kick'

        // Validar que groupId y memberId sean ObjectId válidos
        if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        if (!['promote', 'demote', 'kick'].includes(action)) {
            return res.status(400).json({ error: 'Acción no válida' });
        }

        // Buscar el grupo
        const group = await ReadingGroupModel.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        // Verificar que el usuario que hace la solicitud sea administrador
        const adminMember = group.members.find(m => m.userId.toString() === adminId);
        if (!adminMember || adminMember.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permisos de administrador' });
        }

        // Buscar al miembro objetivo
        const targetMemberIndex = group.members.findIndex(m => m.userId.toString() === memberId);
        if (targetMemberIndex === -1) {
            return res.status(404).json({ error: 'Miembro no encontrado' });
        }

        // No permitir acciones sobre uno mismo
        if (memberId === adminId) {
            return res.status(400).json({ error: 'No puedes realizar esta acción sobre ti mismo' });
        }

        // Ejecutar acción
        switch (action) {
            case 'promote':
                group.members[targetMemberIndex].role = 'admin';
                break;
            case 'demote':
                // Solo permitir degradar si hay al menos otro administrador
                const adminCount = group.members.filter(m => m.role === 'admin').length;
                if (adminCount <= 1) {
                    return res.status(400).json({ error: 'Debe haber al menos un administrador' });
                }
                group.members[targetMemberIndex].role = 'member';
                break;
            case 'kick':
                // Expulsar al miembro
                group.members.splice(targetMemberIndex, 1);
                break;
        }

        // Guardar cambios
        await group.save();

        // Crear mensaje de sistema para notificar el cambio
        const admin = await UserModel.findById(adminId, 'firstName lastName1');
        const targetUser = await UserModel.findById(memberId, 'firstName lastName1');

        let messageText = '';
        if (action === 'promote') {
            messageText = `${admin.firstName} ${admin.lastName1} ha promovido a ${targetUser.firstName} ${targetUser.lastName1} a administrador`;
        } else if (action === 'demote') {
            messageText = `${admin.firstName} ${admin.lastName1} ha quitado los permisos de administrador a ${targetUser.firstName} ${targetUser.lastName1}`;
        } else if (action === 'kick') {
            messageText = `${admin.firstName} ${admin.lastName1} ha expulsado a ${targetUser.firstName} ${targetUser.lastName1} del grupo`;
        }

        const systemMessage = new GroupMessageModel({
            groupId,
            userId: adminId,
            text: messageText,
            type: 'system'
        });

        await systemMessage.save();

        // Si se expulsó a un usuario, notificar por socket
        if (action === 'kick') {
            try {
                const io = ioInstance.getIO();
                io.to(`user:${memberId}`).emit('group:kicked', { groupId });
            } catch (socketError) {
                console.error('Error al emitir evento de socket:', socketError);
            }
        }

        // Obtener el grupo actualizado CON DATOS POBLADOS
        const updatedGroup = await ReadingGroupModel.findByIdWithPopulatedData(groupId);

        // Convertir a formato Flutter
        const flutterGroup = updatedGroup.toFlutterJSON();

        res.status(200).json({
            message: 'Acción realizada correctamente',
            data: flutterGroup
        });
    } catch (error) {
        console.error('Error al gestionar miembros:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE abandonar grupo
router.delete('/:groupId/leave', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { groupId } = req.params;

        // Validar que groupId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ error: 'ID de grupo inválido' });
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