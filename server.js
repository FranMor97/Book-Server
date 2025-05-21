require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const mongoString = process.env.DATABASE_URL;
//const mongoStringLocal = process.env.DATABASE_URL_LOCAL

// IMPORTING ROUTES
const authRoutes = require('./routes/user_routes/auth.js');

// MONGO CONNECTION
mongoose
  .connect(mongoString)
  .then(() => console.log("🟢 Connected to MongoDB"))
  .catch((error) => console.error("🔴 Error connecting to MongoDB:", error));

const database = mongoose.connection;

database.on('error', (error) => {
  console.log(error)
});  

const app = express();

// MIDDLEWARE
// Allows us to handle requests and send responses in JSON format
app.use(bodyParser.json());

// This way we indicate that we will not receive requests sent directly from a form, but everything will be sent in JSON
app.use(bodyParser.urlencoded({extended: false}));
app.use(cors());

// ROUTES
//app.use("/api/bookings", routerBooking);
app.use('/api/auth', authRoutes);

// START SERVER
app.listen(PORT, () => {
  console.log(`Server Started at ${PORT}`)
});