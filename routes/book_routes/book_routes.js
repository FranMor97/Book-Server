// routes/book_routes/books.js
const router = require('express').Router();
const Joi = require('joi');
const verifyToken = require('../../utils/validate_token.js');
const BookModel = require('../../models/book');

// Esquema de validación para libros
const bookSchema = Joi.object({
    // Información básica
    title: Joi.string().required(),
    authors: Joi.array().items(Joi.string()).min(1).required(),
    synopsis: Joi.string().allow('', null),

    // Información de la edición
    isbn: Joi.string().allow('', null),
    publisher: Joi.string().allow('', null),
    publicationDate: Joi.date().allow(null),
    edition: Joi.string().allow('', null),
    language: Joi.string().default('Español'),
    pageCount: Joi.number().integer().min(1).allow(null),

    // Categorización
    genres: Joi.array().items(Joi.string()),
    tags: Joi.array().items(Joi.string()),

    // Multimedia
    coverImage: Joi.string().allow('', null),
});

// GET todos los libros (con paginación)
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

// GET un libro por ID
router.get('/:id', async (req, res) => {
    try {
        const book = await BookModel.findById(req.params.id);
        if (!book) return res.status(404).json({ error: 'Libro no encontrado' });

        res.status(200).json(book);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST crear un nuevo libro (protegido)
router.post('/', verifyToken, async (req, res) => {
    // Validar datos del libro
    const { error } = bookSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Si hay ISBN, verificar que no exista ya
    if (req.body.isbn) {
        const existingBook = await BookModel.findOne({ isbn: req.body.isbn });
        if (existingBook) {
            return res.status(400).json({
                error: 'Ya existe un libro con este ISBN'
            });
        }
    }

    // Crear y guardar el nuevo libro
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

// PATCH actualizar un libro existente (protegido)
router.patch('/:id', verifyToken, async (req, res) => {
    try {
        // Verificar si el libro existe
        const book = await BookModel.findById(req.params.id);
        if (!book) return res.status(404).json({ error: 'Libro no encontrado' });

        // Si se está actualizando el ISBN, verificar que no exista ya
        if (req.body.isbn && req.body.isbn !== book.isbn) {
            const existingBook = await BookModel.findOne({ isbn: req.body.isbn });
            if (existingBook) {
                return res.status(400).json({
                    error: 'Ya existe un libro con este ISBN'
                });
            }
        }

        // Actualizar el libro
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

// DELETE eliminar un libro (protegido, solo admin)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        // TODO: Verificar si el usuario es admin

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