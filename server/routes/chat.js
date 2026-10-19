const express = require('express');
const router = express.Router();
const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Get message history for a user chat
router.get('/messages/:userId', requireAuth, async (req, res) => {
  try {
    const thread = await ChatThread.findOne({ user: req.params.userId });
    if (!thread) return res.json([]);

    const messages = await ChatMessage.find({ thread: thread._id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Route: Get all active support chat threads
router.get('/admin/threads', requireAuth, requireAdmin, async (req, res) => {
  try {
    const threads = await ChatThread.find()
      .populate('user', 'name email balance')
      .sort({ lastMessageAt: -1 });
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;