const router = require('express').Router();
const Joi = require('joi');
const verifyToken = require('../../utils/validate_token.js');
const BookModel = require('../../models/book');
const mongoose = require('mongoose');

// Función para serializar los datos de MongoDB
const serializeData = (data) => {
    return JSON.parse(JSON.stringify(data));
};

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

const BookUserModel = require('../../models/book_user');
const UserModel = require('../../models/user');

// GET comentarios de un libro
router.get('/:bookId/comments', async (req, res) => {
    try {
        const bookId = req.params.bookId;

        // Asegurarse de que bookId sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ error: 'ID de libro inválido' });
        }

        // Buscar todas las relaciones libro-usuario donde el libro coincida
        // y la reseña sea pública
        const bookUsers = await BookUserModel.find({
            bookId: new mongoose.Types.ObjectId(bookId),
            'reviews.isPublic': true
        }).populate('userId', 'firstName lastName1 avatar');

        // Extraer y formatear las reseñas
        const reviews = [];
        bookUsers.forEach(bookUser => {
            if (bookUser.reviews && bookUser.reviews.length > 0) {
                bookUser.reviews.forEach(review => {
                    if (review.isPublic) {
                        // Verificar que el userId exista y tenga las propiedades necesarias
                        if (bookUser.userId) {
                            reviews.push({
                                id: review.reviewId || review._id,
                                text: review.text,
                                rating: review.rating || 0,
                                date: review.date,
                                title: review.title,
                                user: {
                                    id: bookUser.userId._id,
                                    firstName: bookUser.userId.firstName || '',
                                    lastName1: bookUser.userId.lastName1 || '',
                                    avatar: bookUser.userId.avatar || null
                                }
                            });
                        }
                    }
                });
            }
        });

        // Ordenar por fecha (más recientes primero)
        reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Serializar los datos antes de enviarlos
        const serializedReviews = serializeData(reviews);

        res.status(200).json({
            data: serializedReviews,
            meta: {
                total: serializedReviews.length
            }
        });
    } catch (error) {
        console.error('Error al obtener comentarios:', error);
        res.status(500).json({ error: error.message });
    }
});
// routes/book_routes/book_routes.js - Añadir este endpoint
router.post('/:bookId/comments', verifyToken, async (req, res) => {
    try {
        const bookId = req.params.bookId;
        const userId = req.user.id; // Obtenido del token en verifyToken

        if (!mongoose.Types.ObjectId.isValid(bookId)) {
            return res.status(400).json({ error: 'ID de libro inválido' });
        }

        // Verificar que el usuario tenga una relación con el libro
        let bookUser = await BookUserModel.findOne({
            userId: new mongoose.Types.ObjectId(userId),
            bookId: new mongoose.Types.ObjectId(bookId)
        });

        if (!bookUser) {
            // Si no existe la relación, crear una nueva
            bookUser = new BookUserModel({
                userId: new mongoose.Types.ObjectId(userId),
                bookId: new mongoose.Types.ObjectId(bookId),
                status: 'completed', // Asumimos que si añade una valoración, ha leído el libro
                currentPage: 0,
                personalRating: req.body.rating || 0
            });
        }

        // Crear la reseña
        const newReview = {
            reviewId: new mongoose.Types.ObjectId(),
            text: req.body.text,
            rating: req.body.rating || 0,
            date: new Date(),
            title: req.body.title,
            isPublic: req.body.isPublic !== false // Por defecto es pública
        };

        // Añadir la reseña al array de reseñas
        bookUser.reviews.push(newReview);

        // Actualizar estado si no estaba completado
        if (bookUser.status !== 'completed') {
            bookUser.status = 'completed';
        }

        // Guardar los cambios
        await bookUser.save();

        // Actualizar el rating promedio del libro
        await updateBookRating(bookId);

        // Obtener usuario para incluir en la respuesta
        const user = await UserModel.findById(userId, 'firstName lastName1 avatar');

        // Formatear la respuesta
        const commentResponse = {
            id: newReview.reviewId,
            text: newReview.text,
            rating: newReview.rating,
            date: newReview.date,
            title: newReview.title,
            user: {
                id: userId,
                firstName: user.firstName,
                lastName1: user.lastName1,
                avatar: user.avatar
            }
        };

        res.status(201).json({
            message: 'Valoración añadida correctamente',
            data: serializeData(commentResponse)
        });
    } catch (error) {
        console.error('Error al añadir valoración:', error);
        res.status(500).json({ error: error.message });
    }
});

// Función para actualizar el rating promedio de un libro
async function updateBookRating(bookId) {
    try {
        // Obtener todas las reseñas públicas de este libro
        const bookUsers = await BookUserModel.find({
            bookId: new mongoose.Types.ObjectId(bookId),
            'reviews.isPublic': true
        });

        let totalRating = 0;
        let totalReviews = 0;

        // Calcular el rating promedio
        bookUsers.forEach(bookUser => {
            bookUser.reviews.forEach(review => {
                if (review.isPublic && review.rating > 0) {
                    totalRating += review.rating;
                    totalReviews++;
                }
            });
        });

        const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

        // Actualizar el libro
        await BookModel.findByIdAndUpdate(bookId, {
            $set: {
                averageRating: averageRating,
                totalRatings: totalReviews,
                totalReviews: totalReviews
            }
        });
    } catch (error) {
        console.error('Error al actualizar rating del libro:', error);
    }
}


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

        // Serializar los datos antes de enviarlos
        const serializedBooks = serializeData(books);

        res.status(200).json({
            data: serializedBooks,
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

        // Serializar los datos antes de enviarlos
        const serializedBooks = serializeData(books);

        res.status(200).json({
            data: serializedBooks,
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

        // Serializar los datos antes de enviarlos
        const serializedBooks = serializeData(books);

        res.status(200).json({
            data: serializedBooks,
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

        // Serializar los datos antes de enviarlos
        const serializedBooks = serializeData(books);

        res.status(200).json({
            data: serializedBooks,
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

        // Serializar los datos antes de enviarlos
        const serializedGenres = serializeData(genresAggregation);
        const genres = serializedGenres.map(item => item._id);

        res.status(200).json({
            genres: genres,
            genresWithCount: serializedGenres
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

        // Serializar los datos antes de enviarlos
        const serializedAuthors = serializeData(authorsAggregation);
        const authors = serializedAuthors.map(item => item._id);

        res.status(200).json({
            authors: authors,
            authorsWithCount: serializedAuthors
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

        // Serializar los datos antes de enviarlos
        const serializedBook = serializeData(book);

        res.status(200).json(serializedBook);
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

        // Serializar los datos antes de enviarlos
        const serializedBook = serializeData(savedBook);

        res.status(201).json({
            message: 'Libro creado correctamente',
            data: serializedBook
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

        // Serializar los datos antes de enviarlos
        const serializedBook = serializeData(updatedBook);

        res.status(200).json({
            message: 'Libro actualizado correctamente',
            data: serializedBook
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/books/:bookId/reviews', async (req, res) => {
    try {
        const bookId = req.params.bookId;

        // Buscar todas las relaciones libro-usuario donde el libro coincida
        // y la reseña sea pública
        const bookUsers = await BookUserModel.find({
            bookId: bookId,
            'reviews.isPublic': true
        }).populate('userId', 'firstName lastName1 avatar');

        // Extraer y formatear las reseñas
        const reviews = [];
        bookUsers.forEach(bookUser => {
            bookUser.reviews.forEach(review => {
                if (review.isPublic) {
                    reviews.push({
                        id: review.reviewId,
                        text: review.text,
                        rating: review.rating,
                        date: review.date,
                        title: review.title,
                        user: bookUser.userId
                    });
                }
            });
        });

        // Ordenar por fecha (más recientes primero)
        reviews.sort((a, b) => b.date - a.date);

        res.status(200).json({
            data: reviews,
            meta: {
                total: reviews.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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