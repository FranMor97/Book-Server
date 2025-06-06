// server.js (modificado para incluir Socket.IO)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const serializeResponseMiddleware = require('./utils/serialize_middleware');
const ioInstance = require('./sockets/io_instance');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(serializeResponseMiddleware);

// Crear servidor HTTP usando la app de Express
const server = http.createServer(app);

// Inicializar Socket.IO con el servidor
const io = socketIo(server, {
  cors: {
    origin: "*", // En producción, limita esto a tus dominios permitidos
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization"],
    credentials: true
  }
});

ioInstance.init(io);

// Rutas
const authRoutes = require('./routes/user_routes/auth');
const bookRoutes = require('./routes/book_routes/book_routes');
const bookUserRoutes = require('./routes/book_user_routes/book_user_routes');
const friendshipRoutes = require('./routes/friendship_routes/friendship_routes');
const readingGroupRoutes = require('./routes/reading_group_routes/reading_group_routes');

// Uso de rutas
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/book-users', bookUserRoutes);
app.use('/api/friendships', friendshipRoutes);
app.use('/api/reading-groups', readingGroupRoutes);

// Configurar Socket.IO (importamos el módulo de configuración)
require('./sockets/socket_manager')(io);

// Conexión a MongoDB
mongoose.connect(process.env.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// Iniciar servidor (ahora usando server en lugar de app)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

module.exports = server; // Exportamos server en lugar de app