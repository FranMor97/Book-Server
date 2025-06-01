// models/reading_group.js
const mongoose = require('mongoose');

const ReadingGroupSchema = new mongoose.Schema({
    // Información básica del grupo
    name: {
        type: String,
        required: true,
        index: true
    },
    description: {
        type: String
    },

    // Libro asociado al grupo
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },

    // Creador del grupo
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Miembros del grupo
    members: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        role: {
            type: String,
            enum: ['admin', 'member'],
            default: 'member'
        },
        currentPage: {
            type: Number,
            default: 0
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Configuración del grupo
    isPrivate: {
        type: Boolean,
        default: false
    },

    // Metas de lectura del grupo
    readingGoal: {
        pagesPerDay: Number,
        targetFinishDate: Date
    },

    // Fechas
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Índices para búsquedas eficientes
ReadingGroupSchema.index({ 'members.userId': 1 });
ReadingGroupSchema.index({ bookId: 1 });

// Middleware pre-save para actualizar la fecha
ReadingGroupSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('ReadingGroup', ReadingGroupSchema, 'reading_groups');