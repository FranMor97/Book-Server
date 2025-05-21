// models/book.js
const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
    // Información básica del libro
    title: {
        type: String,
        required: true,
        index: true
    },
    authors: [{
        type: String,
        required: true
    }],
    synopsis: {
        type: String
    },

    // Información de la edición/versión específica
    isbn: {
        type: String,
        unique: true,
        sparse: true  // Permite múltiples valores nulos (algunos libros viejos no tienen ISBN)
    },
    publisher: {
        type: String
    },
    publicationDate: {
        type: Date
    },
    edition: {
        type: String
    },
    language: {
        type: String,
        default: 'Español'
    },
    pageCount: {
        type: Number,
        min: 1
    },

    // Información de categorización
    genres: [{
        type: String
    }],
    tags: [{
        type: String
    }],

    // Información multimedia
    coverImage: {
        type: String  // URL o path a la imagen de portada
    },

    // Metadatos y estadísticas
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalRatings: {
        type: Number,
        default: 0
    },
    totalReviews: {
        type: Number,
        default: 0
    },

    // Campos para tracking y administración
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Índices compuestos para búsquedas eficientes
BookSchema.index({ title: 1, authors: 1, publisher: 1, edition: 1 });
BookSchema.index({ genres: 1 });

// Middleware pre-save para actualizar la fecha de modificación
BookSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Book', BookSchema, 'books');