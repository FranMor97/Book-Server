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

// Método estático para obtener grupos con datos poblados (para Flutter)
ReadingGroupSchema.statics.findWithPopulatedData = function(query = {}) {
    return this.find(query)
        .populate('bookId', 'title authors coverImage description pages isbn publishedDate') // Datos del libro
        .populate('creatorId', 'firstName lastName1 lastName2 email avatar') // Datos del creador
        .populate('members.userId', 'firstName lastName1 lastName2 email avatar'); // Datos de los miembros
};

// Método estático para obtener un grupo específico con datos poblados
ReadingGroupSchema.statics.findByIdWithPopulatedData = function(id) {
    return this.findById(id)
        .populate('bookId', 'title authors coverImage description pages isbn publishedDate')
        .populate('creatorId', 'firstName lastName1 lastName2 email avatar')
        .populate('members.userId', 'firstName lastName1 lastName2 email avatar');
};

ReadingGroupSchema.methods.toFlutterJSON = function() {
    const obj = this.toObject();

    // Preparar el objeto de respuesta
    const result = {
        id: obj._id.toString(),
        name: obj.name,
        description: obj.description,
        isPrivate: obj.isPrivate,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,

        // Manejar readingGoal
        readingGoal: obj.readingGoal ? {
            pagesPerDay: obj.readingGoal.pagesPerDay,
            targetFinishDate: obj.readingGoal.targetFinishDate
        } : null,

        // Campos para compatibilidad con versiones anteriores
        _id: obj._id.toString(),
        bookId: obj.bookId && obj.bookId._id ? obj.bookId._id.toString() : obj.bookId.toString(),
        creatorId: obj.creatorId && obj.creatorId._id ? obj.creatorId._id.toString() : obj.creatorId.toString(),

        // Objetos relacionados completos
        book: obj.bookId && obj.bookId._id ? {
            id: obj.bookId._id.toString(),
            _id: obj.bookId._id.toString(), // Para compatibilidad
            title: obj.bookId.title,
            authors: obj.bookId.authors,
            coverImage: obj.bookId.coverImage,
            description: obj.bookId.description,
            pages: obj.bookId.pages,
            isbn: obj.bookId.isbn,
            publishedDate: obj.bookId.publishedDate
            // Añadir otros campos del libro según necesidad
        } : null,

        creator: obj.creatorId && obj.creatorId._id ? {
            id: obj.creatorId._id.toString(),
            _id: obj.creatorId._id.toString(), // Para compatibilidad
            firstName: obj.creatorId.firstName,
            lastName1: obj.creatorId.lastName1,
            lastName2: obj.creatorId.lastName2,
            email: obj.creatorId.email,
            avatar: obj.creatorId.avatar
            // Añadir otros campos del usuario según necesidad
        } : null,

        // Transformar miembros
        members: obj.members.map(member => ({
            userId: member.userId && member.userId._id ? member.userId._id.toString() : member.userId.toString(),
            role: member.role,
            currentPage: member.currentPage,
            joinedAt: member.joinedAt,
            user: member.userId && member.userId._id ? {
                id: member.userId._id.toString(),
                _id: member.userId._id.toString(), // Para compatibilidad
                firstName: member.userId.firstName,
                lastName1: member.userId.lastName1,
                lastName2: member.userId.lastName2,
                email: member.userId.email,
                avatar: member.userId.avatar
                // Añadir otros campos del usuario según necesidad
            } : null
        }))
    };

    return result;
};

// Método estático para obtener grupos con datos poblados
ReadingGroupSchema.statics.findWithPopulatedData = function(query = {}) {
    return this.find(query)
        .populate('bookId')       // Devuelve todos los campos del libro
        .populate('creatorId')    // Devuelve todos los campos del creador
        .populate('members.userId'); // Devuelve todos los campos de los miembros
};

// Método estático para obtener un grupo específico con datos poblados
ReadingGroupSchema.statics.findByIdWithPopulatedData = function(id) {
    return this.findById(id)
        .populate('bookId')
        .populate('creatorId')
        .populate('members.userId');
};

// Método estático para transformar múltiples documentos
ReadingGroupSchema.statics.toFlutterJSONArray = function(groups) {
    return groups.map(group => group.toFlutterJSON());
};

// Middleware post para transformaciones automáticas en find
ReadingGroupSchema.post('find', function(docs) {
    // Automáticamente aplicar transformación si está poblado
    if (docs && docs.length > 0) {
        docs.forEach(doc => {
            if (doc.bookId && doc.bookId._id && doc.creatorId && doc.creatorId._id) {
                // Ya está poblado, mantener como está
            }
        });
    }
});

module.exports = mongoose.model('ReadingGroup', ReadingGroupSchema, 'reading_groups');