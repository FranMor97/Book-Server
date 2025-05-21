// models/book_user.js
const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    reviewId: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
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
    readingSession: {
        startDate: Date,
        endDate: Date
    },
    tags: [String]
});

const NoteSchema = new mongoose.Schema({
    page: {
        type: Number,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const BookUserSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bookId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },
    status: {
        type: String,
        enum: ['to-read', 'reading', 'completed', 'abandoned'],
        default: 'to-read'
    },
    currentPage: {
        type: Number,
        default: 0,
        min: 0
    },
    startDate: {
        type: Date
    },
    finishDate: {
        type: Date
    },
    personalRating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    reviews: [ReviewSchema],
    notes: [NoteSchema],
    readingGoal: {
        pagesPerDay: Number,
        targetFinishDate: Date
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    shareProgress: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Índices para búsquedas eficientes
BookUserSchema.index({ userId: 1, bookId: 1 }, { unique: true });
BookUserSchema.index({ userId: 1, status: 1 });
BookUserSchema.index({ bookId: 1, status: 1 });

// Middleware pre-save para actualizar la fecha
BookUserSchema.pre('save', function(next) {
    this.lastUpdated = new Date();
    next();
});

module.exports = mongoose.model('BookUser', BookUserSchema, 'book_users');