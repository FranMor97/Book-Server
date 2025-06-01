// models/group_message.js
const mongoose = require('mongoose');

const GroupMessageSchema = new mongoose.Schema({
    // Grupo al que pertenece el mensaje
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ReadingGroup',
        required: true
    },

    // Usuario que envía el mensaje
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Contenido del mensaje
    text: {
        type: String,
        required: true
    },

    // Para mensajes especiales (ej. usuario se unió al grupo)
    type: {
        type: String,
        enum: ['text', 'system', 'progress'],
        default: 'text'
    },

    // Fechas
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índices para búsquedas eficientes
GroupMessageSchema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model('GroupMessage', GroupMessageSchema, 'group_messages');