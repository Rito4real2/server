const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io'); // Fixed: use { Server } (capital S)
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
const PORT = process.env.PORT || 5000;

// SAFE DATABASE CONNECTION MIDDLEWARE
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection failed during request:', error);
    res.status(500).json({ error: 'Database connection error', details: error.message });
  }
});

// Create HTTP server and bind Express
const server = http.createServer(app);

// ENABLE EXPRESS CORS MIDDLEWARE (Add this right here!)
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
  credentials: true, // Crucial for cookies / auth sessions
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

  // Join user's private support room
  socket.on('join_room', (userId) => {
    const roomName = `room_${userId}`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined ${roomName}`);
  });

  // Handle incoming support messages
  socket.on('send_message', async ({ userId, senderId, senderRole, message }) => {
    try {
      // Find or create user chat thread
      let thread = await ChatThread.findOne({ user: userId });
      if (!thread) {
        thread = await ChatThread.create({ user: userId });
      }

      // Save message to MongoDB
      const newMsg = await ChatMessage.create({
        thread: thread._id,
        sender: senderId,
        senderRole,
        message
      });

      // Update thread metadata
      thread.lastMessage = message;
      thread.lastMessageAt = new Date();
      if (senderRole === 'user') {
        thread.unreadAdminCount += 1;
      } else {
        thread.unreadUserCount += 1;
      }
      await thread.save();

      // Broadcast message to room and notify admin inbox list
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
app.use('/api/chat', chatRouter)

// Start server using `server.listen` instead of `app.listen` so Socket.io works!
if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`Express & Socket.io server running at http://localhost:${PORT}`);
  });
}

module.exports = app;