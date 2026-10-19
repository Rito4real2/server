process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

console.log('Server script starting execution...');

const express = require('express');
console.log('Express imported');

const cors = require('cors');
console.log('cors imported');

const cookieParser = require('cookie-parser');
console.log('cookie parser imported');

const path = require('path');
console.log('path imported');

const http = require('http');
console.log('HTTP imported');

const { Server } = require('socket.io');
console.log('socket io imported');

const ChatThread = require('./models/ChatThread');
const ChatMessage = require('./models/ChatMessage');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const transactionRoute = require('./routes/transaction');
const { router: investmentRoute } = require('./routes/investment');
const investmentAdminRouter = require('./routes/investmentAdmin');
const chatRouter = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 10000;

// Create HTTP server and bind Express
const server = http.createServer(app);

// ENABLE EXPRESS CORS MIDDLEWARE
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      origin.endsWith(".vercel.app") ||
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Configure Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (
        origin.endsWith(".vercel.app") ||
        origin.includes("localhost")
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }
});

// Socket.io Connection & Event Handlers
io.on('connection', (socket) => {
  console.log('⚡ Socket connected:', socket.id);

  socket.on('join_room', (userId) => {
    const roomName = `room_${userId}`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined ${roomName}`);
  });

  socket.on('send_message', async ({ userId, senderId, senderRole, message }) => {
    try {
      let thread = await ChatThread.findOne({ user: userId });
      if (!thread) {
        thread = await ChatThread.create({ user: userId });
      }

      const newMsg = await ChatMessage.create({
        thread: thread._id,
        sender: senderId,
        senderRole,
        message
      });

      thread.lastMessage = message;
      thread.lastMessageAt = new Date();
      if (senderRole === 'user') {
        thread.unreadAdminCount += 1;
      } else {
        thread.unreadUserCount += 1;
      }
      await thread.save();

      io.to(`room_${userId}`).emit('receive_message', newMsg);
      io.emit('thread_updated', thread);

    } catch (err) {
      console.error('Socket message error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 1. HEALTH CHECK ROUTE
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Express backend with Socket.io is running!',
    environment: process.env.NODE_ENV || 'development',
    hasMongoUri: Boolean(process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI)
  });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoute);
app.use('/api/investment', investmentRoute);
app.use('/api/investments/admin', investmentAdminRouter);
app.use('/api/chat', chatRouter);

// Start server unconditionally so Render detects the port immediately
console.log(`Attempting to start server.listen on port ${PORT}...`);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Express & Socket.io server successfully running on port ${PORT}`);
});

// Connect to MongoDB in the background on startup
console.log('Attempting to connect to mongoDB...');
connectDB()
  .then(() => {
    console.log('✅ MongoDB connected successfully on startup.');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error on startup:', err.message);
  });

module.exports = app;