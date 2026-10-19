const mongoose = require('mongoose');

const chatThreadSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  lastMessage: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  unreadAdminCount: { type: Number, default: 0 }, // Unread count for admin
  unreadUserCount: { type: Number, default: 0 },  // Unread count for user
  status: { type: String, enum: ['open', 'closed'], default: 'open' }
}, { timestamps: true });

module.exports = mongoose.model('ChatThread', chatThreadSchema);