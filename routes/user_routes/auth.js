const router = require('express').Router()
// validation
const Joi = require('joi')
//contraseña
const bcrypt = require('bcryptjs')

const jwt = require('jsonwebtoken')
const userModel = require('../../models/user')

const verifyToken = require('../../utils/validate_token.js')
const mongoose = require("mongoose");

// Función para serializar los datos de MongoDB
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

const registerSchema = Joi.object({
    appName: Joi.string().required(),
    firstName: Joi.string().min(2).max(50).required(),
    email: Joi.string().min(6).max(255).required().email(),
    password: Joi.string().min(6).max(1024).required(),
    lastName1: Joi.string().min(2).max(50).required(),
    lastName2: Joi.string().min(2).max(50),
    idNumber: Joi.string().min(3).max(30).required(),
    mobilePhone: Joi.string().min(6).max(20).required(), // Simple string validation
    birthDate: Joi.date().required(),
    role: Joi.string().valid('client', 'admin').default('client'),
    avatar: Joi.string().regex(/^data:image\/\w+;base64,/).allow(null, '')
});


const loginSchema = Joi.object({
    email: Joi.string().min(6).max(255).required().email(),
    password: Joi.string().min(6).max(1024).required(),
    role: Joi.string().valid('client', 'admin').default('client')
})



router.get('/getAll', async (req, res) => {
    try {
        const users = await userModel.find();

        // Convertir a objetos planos y eliminar passwords
        const usersWithoutPasswords = users.map(user => {
            const userObj = user.toObject();
            delete userObj.password;
            return userObj;
        });

        // Serializar los datos antes de enviarlos
        const serializedData = serializeData(usersWithoutPasswords);

        res.status(200).json(serializedData);
    }
    catch(error) {
        res.status(500).json({message: error.message});
    }
});

router.post('/register', async (req, res) => {
    // Validate user data
    const { error } = registerSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    // Check if email already exists
    const isEmailExist = await userModel.findOne({ email: req.body.email });
    if (isEmailExist) {
        return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if ID number already exists
    const isIdExist = await userModel.findOne({ idNumber: req.body.idNumber });
    if (isIdExist) {
        return res.status(400).json({ error: 'ID number already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // Create new user
    const user = new userModel({
        appName: req.body.appName,
        firstName: req.body.firstName,
        email: req.body.email,
        password: hashedPassword,
        lastName1: req.body.lastName1,
        lastName2: req.body.lastName2,
        idNumber: req.body.idNumber,
        mobilePhone: req.body.mobilePhone,
        birthDate: req.body.birthDate,
        role: req.body.role,
        avatar: req.body.avatar
    });

    try {
        const savedUser = await user.save();

        const userResponse = savedUser.toObject();
        delete userResponse.password;

        const serializedUserResponse = serializeData(userResponse);

        res.status(201).json({
            error: null,
            data: serializedUserResponse
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});



router.get('/profile', verifyToken, async (req, res) => {
    try {
        const token = req.header('auth-token');
        const decoded = jwt.verify(token, process.env.TOKEN_SECRET);

        const user = await userModel.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userResponse = user.toObject();
        delete userResponse.password;

        // Serializar los datos antes de enviarlos
        const serializedUserResponse = serializeData(userResponse);

        res.status(200).json(serializedUserResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.get('/profile:userId', verifyToken, async (req, res) => {
    const {id} = req.params.userId;
    if(!id) {
        return res.status(400).json({ error: 'ID de usuario no proporcionado' });
    }
    if(!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }
    try {
        const user = await userModel.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userResponse = user.toObject();
        delete userResponse.password;

        // Serializar los datos antes de enviarlos
        const serializedUserResponse = serializeData(userResponse);

        res.status(200).json(serializedUserResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Update user profile endpoint
router.patch('/profile', verifyToken, async (req, res) => {
    try {
        // Exclude sensitive fields from updates
        const { password, role, email, idNumber, ...updateData } = req.body;

        // Find user by ID (from token)
        const user = await userModel.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Update user fields
        for (const [key, value] of Object.entries(updateData)) {
            if (value !== undefined) {
                user[key] = value;
            }
        }

        // Save updated user
        const updatedUser = await user.save();

        // Don't return the password in the response
        const userResponse = updatedUser.toObject();
        delete userResponse.password;

        // Serializar los datos antes de enviarlos
        const serializedUserResponse = serializeData(userResponse);

        res.status(200).json({
            message: 'Perfil actualizado correctamente',
            data: serializedUserResponse
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.delete('/user/:userId', verifyToken, async (req, res) => {
    const { userId } = req.params;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // Validar que userId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'ID de usuario inválido' });
        }

        // Buscar el usuario por ID
        const user = await userModel.findById(userId).session(session);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Eliminar registros relacionados
        await BookUserModel.deleteMany({ userId }).session(session);
        await BookCommentModel.deleteMany({ userId }).session(session);

        // Eliminar amistades donde el usuario es solicitante o receptor
        await FriendshipModel.deleteMany({
            $or: [{ requesterId: userId }, { recipientId: userId }]
        }).session(session);

        // Eliminar mensajes enviados por el usuario
        await GroupMessageModel.deleteMany({ userId }).session(session);

        // Manejar grupos de lectura
        const userGroups = await ReadingGroupModel.find({
            'members.userId': userId
        }).session(session);

        for (const group of userGroups) {
            // Si el usuario es el creador y único miembro, eliminar el grupo
            if (group.creatorId.toString() === userId && group.members.length === 1) {
                await ReadingGroupModel.findByIdAndDelete(group._id).session(session);
                await GroupMessageModel.deleteMany({ groupId: group._id }).session(session);
            } else {
                // Si el usuario es el creador pero hay más miembros, transferir propiedad
                if (group.creatorId.toString() === userId) {
                    // Encontrar otro miembro (preferiblemente admin)
                    const newCreatorIndex = group.members.findIndex(member =>
                        member.userId.toString() !== userId && member.role === 'admin'
                    ) || group.members.findIndex(member =>
                        member.userId.toString() !== userId
                    );

                    if (newCreatorIndex !== -1) {
                        group.creatorId = group.members[newCreatorIndex].userId;
                        group.members[newCreatorIndex].role = 'admin';
                    }
                }

                // Eliminar al usuario de los miembros
                group.members = group.members.filter(member =>
                    member.userId.toString() !== userId
                );

                await group.save({ session });

                // Crear mensaje de sistema para notificar salida
                const systemMessage = new GroupMessageModel({
                    groupId: group._id,
                    userId: group.creatorId, // Usar creadorId actual como emisor
                    text: `Un usuario ha sido eliminado del sistema`,
                    type: 'system'
                });

                await systemMessage.save({ session });
            }
        }

        // Finalmente, eliminar el usuario
        await userModel.findByIdAndDelete(userId).session(session);

        await session.commitTransaction();

        res.status(200).json({
            message: 'Usuario y todos sus datos relacionados eliminados correctamente',
            data: { userId }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error al eliminar usuario y datos relacionados:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await session.endSession();
    }
});



router.get('/user/:userId', verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Validar que userId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'ID de usuario inválido' });
        }

        // Buscar el usuario por ID, excluyendo la contraseña
        const user = await userModel.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userResponse = user.toObject();
        delete userResponse.password; // No enviar la contraseña en la respuesta
        // Serializar los datos antes de enviarlos
        const serializedUser = serializeData(userResponse);

        res.status(200).json({
            error: null,
            data: serializedUser
        });
    } catch (error) {
        console.error('Error al obtener usuario por ID:', error);
        res.status(500).json({ error: error.message });
    }
});


router.post('/login', async (req, res) => {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const user = await userModel.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign(
        {
            email: user.email,
            role: user.role,
            id: user._id
        },
        process.env.TOKEN_SECRET,
        { expiresIn: process.env.JWT_EXPIRES }
    );

    // Preparar datos del usuario sin la contraseña
    const userResponse = user.toObject();
    delete userResponse.password;

    // Serializar los datos del usuario
    const serializedUser = serializeData(userResponse);

    // Devolver token y datos del usuario
    res.header('auth-token', token).json({
        error: null,
        data: {
            token,
            user: serializedUser
        }
    });
});


module.exports = router