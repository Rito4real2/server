const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');

// POST /api/auth/admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const { userName, emailAddress, password } = req.body;

    // 1. Find user by username OR email address (without raw password query)
    const user = await User.findOne({
      $or: [
        { userName: userName || '' },
        { emailAddress: emailAddress || '' }
      ]
    });

    console.log('Searching for:', { userName, emailAddress });
    console.log('User found in DB:', user);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username, email address, or password' });
    }

    // 2. Check if user has admin role
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: User is not an admin' });
    }

    // 3. Verify hashed password securely
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
        console.log('Password match result:', isMatch);
      return res.status(401).json({ error: 'Invalid username, email address, or password' });
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 5. Send HTTP-Only Cookie & JSON Response
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    return res.json({
      message: 'Admin login successful',
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/admin-dashboard (Protected Route Example)
router.get('/admin-dashboard', requireAdmin, (req, res) => {
  res.json({
    message: 'Welcome to the protected admin dashboard!',
    admin: req.user,
  });
});

// GET /api/auth/admin-dashboard-data (Protected)
router.get('/admin-dashboard-data', requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalBalanceObj = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const adminCount = await User.countDocuments({ role: 'admin' });
    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      stats: {
        totalUsers,
        totalSystemBalance: totalBalanceObj[0]?.total || 0,
        adminCount,
      },
      recentUsers,
      currentAdmin: {
        _id: req.user._id,
        fullName: req.user.fullName,
        emailAddress: req.user.emailAddress,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;