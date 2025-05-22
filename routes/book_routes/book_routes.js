const router = require('express').Router();
const Joi = require('joi');
const verifyToken = require('../../utils/validate_token.js');
const BookModel = require('../../models/book');

// Esquema de validación para libros (ya existente)
const bookSchema = Joi.object({
    title: Joi.string().required(),
    authors: Joi.array().items(Joi.string()).min(1).required(),
    synopsis: Joi.string().allow('', null),
    isbn: Joi.string().allow('', null),
    publisher: Joi.string().allow('', null),
    publicationDate: Joi.date().allow(null),
    edition: Joi.string().allow('', null),
    language: Joi.string().default('Español'),
    pageCount: Joi.number().integer().min(1).allow(null),
    genres: Joi.array().items(Joi.string()),
    tags: Joi.array().items(Joi.string()),
    coverImage: Joi.string().allow('', null),
});

// GET todos los libros (ya existe, mejorado)
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Opciones de filtrado
        const filter = {};
        if (req.query.title) filter.title = { $regex: req.query.title, $options: 'i' };
        if (req.query.author) filter.authors = { $regex: req.query.author, $options: 'i' };
        if (req.query.genre) filter.genres = req.query.genre;

        // Ejecutar consulta con filtros y paginación
        const books = await BookModel.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ title: 1 });

        // Contar total para meta información de paginación
        const total = await BookModel.countDocuments(filter);

        res.status(200).json({
            data: books,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET búsqueda de libros (NUEVO)
router.get('/search', async (req, res) => {
    try {
        const { q: query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Parámetro de búsqueda requerido' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Búsqueda en múltiples campos
        const searchFilter = {
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { authors: { $regex: query, $options: 'i' } },
                { synopsis: { $regex: query, $options: 'i' } },
                { genres: { $regex: query, $options: 'i' } },
                { tags: { $regex: query, $options: 'i' } }
            ]
        };

        const books = await BookModel.find(searchFilter)
            .skip(skip)
            .limit(limit)
            .sort({ averageRating: -1 });

        const total = await BookModel.countDocuments(searchFilter);

        res.status(200).json({
            data: books,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET libros populares (NUEVO)
router.get('/popular', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Ordenar por número total de ratings (popularidad)
        const books = await BookModel.find()
            .sort({ totalRatings: -1, averageRating: -1 })
            .skip(skip)
            .limit(limit);

        const total = await BookModel.countDocuments();

        res.status(200).json({
            data: books,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET libros mejor valorados (NUEVO)
router.get('/top-rated', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Ordenar por rating promedio, pero solo libros con al menos 5 ratings
        const books = await BookModel.find({ totalRatings: { $gte: 5 } })
            .sort({ averageRating: -1, totalRatings: -1 })
            .skip(skip)
            .limit(limit);

        const total = await BookModel.countDocuments({ totalRatings: { $gte: 5 } });

        res.status(200).json({
            data: books,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET géneros disponibles (NUEVO)
router.get('/genres', async (req, res) => {
    try {
        // Usar agregación para obtener géneros únicos
        const genresAggregation = await BookModel.aggregate([
            { $unwind: '$genres' },
            { $group: { _id: '$genres', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const genres = genresAggregation.map(item => item._id);

        res.status(200).json({
            genres: genres,
            genresWithCount: genresAggregation
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET autores disponibles (NUEVO)
router.get('/authors', async (req, res) => {
    try {
        // Usar agregación para obtener autores únicos
        const authorsAggregation = await BookModel.aggregate([
            { $unwind: '$authors' },
            { $group: { _id: '$authors', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const authors = authorsAggregation.map(item => item._id);

        res.status(200).json({
            authors: authors,
            authorsWithCount: authorsAggregation
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET un libro por ID (ya existe)
router.get('/:id', async (req, res) => {
    try {
        const book = await BookModel.findById(req.params.id);
        if (!book) return res.status(404).json({ error: 'Libro no encontrado' });

        res.status(200).json(book);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST crear un nuevo libro (ya existe)
router.post('/', verifyToken, async (req, res) => {
    const { error } = bookSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    if (req.body.isbn) {
        const existingBook = await BookModel.findOne({ isbn: req.body.isbn });
        if (existingBook) {
            return res.status(400).json({
                error: 'Ya existe un libro con este ISBN'
            });
        }
    }

    try {
        const book = new BookModel(req.body);
        const savedBook = await book.save();

        res.status(201).json({
            message: 'Libro creado correctamente',
            data: savedBook
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// PATCH actualizar un libro existente (ya existe)
router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const book = await BookModel.findById(req.params.id);
        if (!book) return res.status(404).json({ error: 'Libro no encontrado' });

        if (req.body.isbn && req.body.isbn !== book.isbn) {
            const existingBook = await BookModel.findOne({ isbn: req.body.isbn });
            if (existingBook) {
                return res.status(400).json({
                    error: 'Ya existe un libro con este ISBN'
                });
            }
        }

        const updatedBook = await BookModel.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            message: 'Libro actualizado correctamente',
            data: updatedBook
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// DELETE eliminar un libro (ya existe)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const book = await BookModel.findByIdAndDelete(req.params.id);
        if (!book) return res.status(404).json({ error: 'Libro no encontrado' });

        res.status(200).json({
            message: 'Libro eliminado correctamente'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;