const router = require('express').Router()
// validation
const Joi = require('joi')
//contraseña
const bcrypt = require('bcryptjs')

const jwt = require('jsonwebtoken')
const userModel = require('../../models/user')

const verifyToken = require('../../utils/validate_token.js')

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
    try{
        const data = await userModel.find();

        // Serializar los datos antes de enviarlos
        const serializedData = serializeData(data);

        res.status(200).json(serializedData);
    }
    catch(error){
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
        // Save user to database
        const savedUser = await user.save();

        // Don't return the password in the response
        const userResponse = savedUser.toObject();
        delete userResponse.password;

        // Serializar los datos antes de enviarlos
        const serializedUserResponse = serializeData(userResponse);

        res.status(201).json({
            error: null,
            data: serializedUserResponse
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/login', async (req, res) => {
    // Validate login data
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Check if user exists
    const user = await userModel.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    // Validate password
    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    // Create JWT token
    const token = jwt.sign(
        {
            email: user.email,
            role: user.role,
            id: user._id
        },
        process.env.TOKEN_SECRET, // Changed TOKEN_SECRETO to TOKEN_SECRET
        { expiresIn: process.env.JWT_EXPIRES }
    );

    // Return token in response
    res.header('auth-token', token).json({
        error: null,
        data: { token }
    });
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




module.exports = router