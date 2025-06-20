    const router = require('express').Router();
    const mongoose = require('mongoose');
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
                userId: new mongoose.Types.ObjectId(req.params.userId),
                bookId: new mongoose.Types.ObjectId(req.params.bookId)
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
                userId: new mongoose.Types.ObjectId(req.body.userId),
                bookId: new mongoose.Types.ObjectId(req.body.bookId)
            });

            if (existing) {
                console.log('El libro ya está en la lista del usuario');
                return res.status(409).json({ error: 'El libro ya está en la lista del usuario' });
            }

            // Crear el objeto book-user con solo los campos permitidos
            const bookUserData = {
                userId: new mongoose.Types.ObjectId(req.body.userId),
                bookId: new mongoose.Types.ObjectId(req.body.bookId),
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

    // En book_user_routes.js
    router.get('/user/:userId/pages-by-period', verifyToken, async (req, res) => {
        try {
            const userId = req.params.userId;
            const period = req.query.period || 'week';

            const startDate = new Date();
            switch (period) {
                case 'week':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'month':
                    startDate.setMonth(startDate.getMonth() - 1);
                    break;
                case 'year':
                    startDate.setFullYear(startDate.getFullYear() - 1);
                    break;
            }

            const bookUsers = await BookUserModel.find({
                userId: new mongoose.Types.ObjectId(userId),
                $or: [
                    // Libros completados en el período
                    {
                        status: 'completed',
                        finishDate: { $gte: startDate }
                    },
                    // Libros en progreso con actualizaciones recientes
                    {
                        status: 'reading',
                        lastUpdated: { $gte: startDate }
                    }
                ]
            });

            let pagesRead = 0;
            let previousProgress = {};

            // Para libros completados en el período
            bookUsers.forEach(bookUser => {
                if (bookUser.status === 'completed' && bookUser.finishDate >= startDate) {
                    pagesRead += bookUser.currentPage;
                } else if (bookUser.status === 'reading') {
                    if (bookUser.startDate && bookUser.startDate >= startDate) {
                        // Si empezó en el período, contar todas las páginas leídas
                        pagesRead += bookUser.currentPage;
                    } else {
                        const daysInPeriod = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
                        const totalDays = bookUser.startDate
                            ? Math.floor((new Date() - bookUser.startDate) / (1000 * 60 * 60 * 24))
                            : daysInPeriod;

                        if (totalDays > 0) {
                            const estimatedPagesInPeriod = Math.floor(
                                (bookUser.currentPage * daysInPeriod) / totalDays
                            );
                            pagesRead += Math.min(estimatedPagesInPeriod, bookUser.currentPage);
                        }
                    }
                }
            });

            res.status(200).json({
                period: period,
                pagesRead: pagesRead,
                booksCount: bookUsers.length
            });
        } catch (error) {
            console.error('Error al obtener páginas por período:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // routes/book_user_routes/book_user_routes.js - Añadir este endpoint

    // GET géneros favoritos del usuario
    router.get('/user/:userId/favorite-genres', verifyToken, async (req, res) => {
        try {
            const userId = req.params.userId;
            const limit = parseInt(req.query.limit) || 3; // Por defecto, top 3

            // Buscar todos los libros completados por el usuario
            const bookUsers = await BookUserModel.find({
                userId: new mongoose.Types.ObjectId(userId),
                status: 'completed'
            }).populate('bookId');

            // Contador de géneros
            const genresCount = {};

            // Contar la frecuencia de cada género
            bookUsers.forEach(bookUser => {
                if (bookUser.bookId && bookUser.bookId.genres) {
                    bookUser.bookId.genres.forEach(genre => {
                        if (!genresCount[genre]) {
                            genresCount[genre] = 0;
                        }
                        genresCount[genre]++;
                    });
                }
            });

            // Convertir a array para ordenar
            const genresArray = Object.entries(genresCount).map(([genre, count]) => ({
                genre,
                count
            }));

            // Ordenar por frecuencia (de mayor a menor)
            genresArray.sort((a, b) => b.count - a.count);

            // Tomar los primeros 'limit' géneros
            const topGenres = genresArray.slice(0, limit);

            res.status(200).json({
                topGenres: topGenres
            });
        } catch (error) {
            console.error('Error al obtener géneros favoritos:', error);
            res.status(500).json({ error: error.message });
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
            const mongoose = require('mongoose');
            const stats = await BookUserModel.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(req.params.userId)
                    }
                },
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