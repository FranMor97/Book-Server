// models/book_comment.js
const mongoose = require('mongoose');

const BookCommentSchema = new mongoose.Schema({
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    date: {
        type: Date,
        default: Date.now
    },
    title: {
        type: String
    },
    isPublic: {
        type: Boolean,
        default: true
    },
});

// Índices para búsquedas eficientes
BookCommentSchema.index({ bookId: 1, isPublic: 1 });
BookCommentSchema.index({ userId: 1 });

module.exports = mongoose.model('BookComment', BookCommentSchema, 'book_comments');