const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  appName: { type: String, required: true },
  firstName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lastName1: { type: String, required: true },
  lastName2: { type: String },
  idNumber: { type: String, required: true, unique: true },
  mobilePhone: { type: String, required: true },
  birthDate: { type: Date, required: true },
  registrationDate: { type: Date, default: Date.now },
  role: {
    type: String,
    enum: ['client', 'admin'],
    default: 'client'
  },
  avatar: { type: String }
});

module.exports = mongoose.model('User', UserSchema, 'users');