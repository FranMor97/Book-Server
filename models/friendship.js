// models/friendship.js
const mongoose = require('mongoose');

const FriendshipSchema = new mongoose.Schema({
    // Usuario que envía la solicitud
    requesterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Usuario que recibe la solicitud
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Estado de la amistad: 'pending', 'accepted', 'rejected', 'blocked'
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'blocked'],
        default: 'pending'
    },
    // Fechas para seguimiento
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
FriendshipSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
FriendshipSchema.index({ recipientId: 1, status: 1 });
FriendshipSchema.index({ requesterId: 1, status: 1 });

// Middleware pre-save para actualizar la fecha
FriendshipSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Método para obtener información completa de la amistad
FriendshipSchema.methods.getFullInfo = async function() {
    await this.populate('requesterId', 'firstName lastName1 lastName2 email avatar')
        .populate('recipientId', 'firstName lastName1 lastName2 email avatar')
        .execPopulate();

    return this;
};

// Método estático para encontrar todas las amistades de un usuario
FriendshipSchema.statics.findUserFriendships = async function(userId, status = 'accepted') {
    return this.find({
        $or: [
            { requesterId: userId, status },
            { recipientId: userId, status }
        ]
    }).populate('requesterId', 'firstName lastName1 lastName2 email avatar')
        .populate('recipientId', 'firstName lastName1 lastName2 email avatar');
};

// Método estático para encontrar una amistad específica entre dos usuarios
FriendshipSchema.statics.findBetweenUsers = async function(userId1, userId2) {
    return this.findOne({
        $or: [
            { requesterId: userId1, recipientId: userId2 },
            { requesterId: userId2, recipientId: userId1 }
        ]
    });
};

module.exports = mongoose.model('Friendship', FriendshipSchema, 'friendships');