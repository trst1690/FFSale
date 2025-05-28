// backend/src/app.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

// Load environment variables
dotenv.config();

// Import database and models
const db = require('./models');

// Import routes - only include what exists
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const contestRoutes = require('./routes/contestRoutes');

// Import services
const contestService = require('./services/contestService');
const SocketHandler = require('./socketHandlers');

// Create Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO instance
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Store io instance on app for route access
app.set('io', io);

// Initialize Socket Handler
const socketHandler = new SocketHandler(io);
socketHandler.initialize();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    socketConnections: socketHandler.getOnlineUsersCount()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contests', contestRoutes);

// Placeholder routes for missing functionality
app.use('/api/market-mover', (req, res) => {
  res.json({ message: 'Market Mover routes not implemented yet' });
});

app.use('/api/tickets', (req, res) => {
  res.json({ message: 'Ticket routes not implemented yet' });
});

app.use('/api/drafts', (req, res) => {
  res.json({ message: 'Draft routes not implemented yet' });
});

app.use('/api/transactions', (req, res) => {
  res.json({ message: 'Transaction routes not implemented yet' });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Database connection and server startup
async function startServer() {
  try {
    // Test database connection
    await db.sequelize.authenticate();
    console.log('✅ Database connection established successfully');

    // Sync database models (use migrations in production)
    if (process.env.NODE_ENV !== 'production') {
      await db.sequelize.sync({ alter: true });
      console.log('✅ Database models synchronized');
    }

    // Ensure initial data exists - only if the utility exists
    try {
      const { ensureInitialData } = require('./utils/dataInitializer');
      await ensureInitialData();
      console.log('✅ Initial data verified');
    } catch (error) {
      console.log('⚠️  Data initializer not found, skipping...');
    }

    // Ensure at least one cash game is available
    try {
      await contestService.ensureCashGameAvailable();
      console.log('✅ Cash game availability verified');
    } catch (error) {
      console.log('⚠️  Could not ensure cash game availability:', error.message);
    }

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: ${process.env.DB_NAME || 'fantasy_draft_db'}`);
      console.log('✅ Active Services:');
      console.log('- Express Server: Running');
      console.log('- Socket.IO: Listening');
      console.log('- Database: Connected');
      console.log('- Contest Service: Initialized');
    });

    // Graceful shutdown handling
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown function
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Close server
    server.close(() => {
      console.log('✅ HTTP server closed');
    });

    // Close Socket.IO connections
    io.close(() => {
      console.log('✅ Socket.IO connections closed');
    });

    // Close database connection
    await db.sequelize.close();
    console.log('✅ Database connection closed');

    console.log('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
startServer();

module.exports = { app, server, io };