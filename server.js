// app.js o index.js (archivo principal del servidor)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const morgan = require('morgan');
const serializeResponseMiddleware = require('./utils/serialize_middleware');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(serializeResponseMiddleware);


// Rutas
const authRoutes = require('./routes/user_routes/auth');
const bookRoutes = require('./routes/book_routes/book_routes');
const bookUserRoutes = require('./routes/book_user_routes/book_user_routes'); // Nueva ruta

// Uso de rutas
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/book-users', bookUserRoutes); // Nueva ruta


// Conexión a MongoDB
mongoose.connect(process.env.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

module.exports = app;