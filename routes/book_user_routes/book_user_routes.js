const router = require('express').Router();
const Joi = require('joi');
const verifyToken = require('../../utils/validate_token.js');
const BookUserModel = require('../../models/book_user.js');

// Función para serializar los datos de MongoDB
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

// Esquema de validación para BookUser con propiedades explícitas
const bookUserSchema = Joi.object({
    userId: Joi.string().required(),
    bookId: Joi.string().required(),
    status: Joi.string().valid('to-read', 'reading', 'completed', 'abandoned').default('to-read'),
    currentPage: Joi.number().integer().min(0).default(0),
    startDate: Joi.date().allow(null),
    finishDate: Joi.date().allow(null),
    personalRating: Joi.number().min(0).max(5).default(0),
    readingGoal: Joi.object({
        pagesPerDay: Joi.number().integer().min(1),
        targetFinishDate: Joi.date()
    }).allow(null),
    isPrivate: Joi.boolean().default(false),
    shareProgress: Joi.boolean().default(true)
    // Nota: reviews y notes se gestionan a través de endpoints separados
}).unknown(false); // Rechazar explícitamente propiedades desconocidas

// GET libros de un usuario
router.get('/', verifyToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.userId) filter.userId = req.query.userId;
        if (req.query.status) filter.status = req.query.status;

        const bookUsers = await BookUserModel.find(filter)
            .populate('bookId')
            .skip(skip)
            .limit(limit)
            .sort({ lastUpdated: -1 });

        const total = await BookUserModel.countDocuments(filter);

        // Serializar los datos antes de enviarlos
        const serializedBookUsers = serializeData(bookUsers);

        res.status(200).json({
            data: serializedBookUsers,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error al obtener libros del usuario:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET relación específica usuario-libro
router.get('/user/:userId/book/:bookId', verifyToken, async (req, res) => {
    try {
        const bookUser = await BookUserModel.findOne({
            userId: req.params.userId,
            bookId: req.params.bookId
        }).populate('bookId');

        if (!bookUser) return res.status(404).json({ error: 'Relación no encontrada' });

        // Serializar los datos antes de enviarlos
        const serializedBookUser = serializeData(bookUser);

        res.status(200).json(serializedBookUser);
    } catch (error) {
        console.error('Error al obtener libro del usuario:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST agregar libro a usuario
router.post('/', verifyToken, async (req, res) => {
    console.log('Petición recibida para agregar libro a usuario:', req.body);

    // Validar con Joi
    const { error } = bookUserSchema.validate(req.body);
    if (error) {
        console.error('Error de validación:', error.details[0].message);
        return res.status(400).json({ error: error.details[0].message });
    }

    try {
        // Verificar si ya existe la relación
        const existing = await BookUserModel.findOne({
            userId: req.body.userId,
            bookId: req.body.bookId
        });

        if (existing) {
            console.log('El libro ya está en la lista del usuario');
            return res.status(409).json({ error: 'El libro ya está en la lista del usuario' });
        }

        // Crear el objeto book-user con solo los campos permitidos
        const bookUserData = {
            userId: req.body.userId,
            bookId: req.body.bookId,
            status: req.body.status || 'to-read',
            currentPage: req.body.currentPage || 0,
            startDate: req.body.startDate || null,
        };

        const bookUser = new BookUserModel(bookUserData);
        const savedBookUser = await bookUser.save();
        console.log('Libro guardado exitosamente con id:', savedBookUser._id);

        const populatedBookUser = await BookUserModel.findById(savedBookUser._id)
            .populate('bookId');

        // Serializar los datos antes de enviarlos
        const serializedBookUser = serializeData(populatedBookUser);
        console.log('BookUser serializado:', JSON.stringify(serializedBookUser).substring(0, 100) + '...');

        // Respuesta completa
        const response = {
            message: 'Libro agregado correctamente',
            data: serializedBookUser
        };

        res.status(201).json(response);
    } catch (error) {
        console.error('Error al guardar libro:', error);
        res.status(400).json({ error: error.message });
    }
});

// PATCH actualizar progreso
router.patch('/:id', verifyToken, async (req, res) => {
    console.log('Petición recibida para actualizar progreso:', req.body);
    try {
        const bookUser = await BookUserModel.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).populate('bookId');

        if (!bookUser) return res.status(404).json({ error: 'Relación no encontrada' });

        // Serializar los datos antes de enviarlos
        const serializedBookUser = serializeData(bookUser);

        res.status(200).json({
            message: 'Progreso actualizado correctamente',
            data: serializedBookUser
        });
    } catch (error) {
        console.error('Error al actualizar progreso:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST agregar reseña
router.post('/:id/reviews', verifyToken, async (req, res) => {
    console.log('Petición recibida para agregar reseña:', req.body);
    try {
        const bookUser = await BookUserModel.findById(req.params.id);
        if (!bookUser) return res.status(404).json({ error: 'Relación no encontrada' });

        bookUser.reviews.push(req.body);
        await bookUser.save();

        const updatedBookUser = await BookUserModel.findById(req.params.id)
            .populate('bookId');

        // Serializar los datos antes de enviarlos
        const serializedBookUser = serializeData(updatedBookUser);

        res.status(200).json({
            message: 'Reseña agregada correctamente',
            data: serializedBookUser
        });
    } catch (error) {
        console.error('Error al agregar reseña:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST agregar nota
router.post('/:id/notes', verifyToken, async (req, res) => {
    console.log('Petición recibida para agregar nota:', req.body);
    try {
        const bookUser = await BookUserModel.findById(req.params.id);
        if (!bookUser) return res.status(404).json({ error: 'Relación no encontrada' });

        bookUser.notes.push(req.body);
        await bookUser.save();

        const updatedBookUser = await BookUserModel.findById(req.params.id)
            .populate('bookId');

        // Serializar los datos antes de enviarlos
        const serializedBookUser = serializeData(updatedBookUser);

        res.status(200).json({
            message: 'Nota agregada correctamente',
            data: serializedBookUser
        });
    } catch (error) {
        console.error('Error al agregar nota:', error);
        res.status(400).json({ error: error.message });
    }
});

// GET estadísticas del usuario
router.get('/user/:userId/stats', verifyToken, async (req, res) => {
    try {
        const stats = await BookUserModel.aggregate([
            { $match: { userId: req.params.userId } },
            {
                $group: {
                    _id: null,
                    totalBooks: { $sum: 1 },
                    booksRead: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    booksReading: { $sum: { $cond: [{ $eq: ['$status', 'reading'] }, 1, 0] } },
                    booksToRead: { $sum: { $cond: [{ $eq: ['$status', 'to-read'] }, 1, 0] } },
                    totalReviews: { $sum: { $size: '$reviews' } },
                    averageRating: { $avg: '$personalRating' }
                }
            }
        ]);

        const result = stats[0] || {
            totalBooks: 0,
            booksRead: 0,
            booksReading: 0,
            booksToRead: 0,
            totalReviews: 0,
            averageRating: 0
        };

        // Serializar los datos antes de enviarlos
        const serializedResult = serializeData(result);

        res.status(200).json(serializedResult);
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE eliminar relación
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const bookUser = await BookUserModel.findByIdAndDelete(req.params.id);
        if (!bookUser) return res.status(404).json({ error: 'Relación no encontrada' });

        res.status(200).json({ message: 'Libro eliminado de la lista correctamente' });
    } catch (error) {
        console.error('Error al eliminar libro:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;