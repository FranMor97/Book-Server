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

module.exports = mongoose.model('Friendship', FriendshipSchema, 'friendships');