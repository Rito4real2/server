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
      .populate('user', 'userName emailAddress balance')
      .sort({ lastMessageAt: -1 });
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/threads/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    // const { userId } = req.params;

    // // 1. Fetch the specific user details
    // const user = await User.findById(userId).select('name email balance');

    // if (!user) {
    //   return res.status(404).json({ message: 'User not found' });
    // }

    // 2. Fetch all chat threads for the admin inbox
    const threads = await ChatThread.find()
      .populate('user', 'name email balance')
      .sort({ lastMessageAt: -1 });

    res.json({ threads, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;