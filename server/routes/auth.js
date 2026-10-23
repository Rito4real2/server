const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');

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
      secure: true,
      sameSite: 'none',
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

// 1. Get All Pending KYC Submissions
router.get('/kyc/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ kycStatus: 'PENDING' }).select('-password -withdrawalPin');
    res.json({ users: pendingUsers });
  } catch (err) {
    console.error('Fetch Pending KYC Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Update KYC Status (Approve / Reject)
router.put('/kyc/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, rejectionReason } = req.body; // status: 'VERIFIED' or 'REJECTED'

    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid KYC status update' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.kycStatus = status;
    user.kycRejectionReason = status === 'REJECTED' ? (rejectionReason || 'Document did not meet requirements.') : undefined;
    await user.save();

    // Send email notification via Resend
    const emailSubject = status === 'VERIFIED' ? 'KYC Verification Approved!' : 'KYC Verification Update Required';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
        <h2 style="color: #1f2937;">KYC Status Update</h2>
        <p>Hello <strong>${user.fullName || user.userName}</strong>,</p>
        <p>Your KYC document verification status has been updated to: <strong style="text-transform: uppercase; color: ${status === 'VERIFIED' ? '#10B981' : '#EF4444'};">${status}</strong></p>
        ${status === 'REJECTED' && user.kycRejectionReason ? `<p style="color: #4b5563;"><strong>Reason:</strong> ${user.kycRejectionReason}</p>` : ''}
        <p style="color: #4b5563; font-size: 14px;">If you have any questions, please contact support.</p>
      </div>
    `;

    await sendEmail({
      to: user.emailAddress,
      subject: emailSubject,
      html: emailHtml,
    });

    res.json({ message: `KYC successfully marked as ${status}` });
  } catch (err) {
    console.error('Update KYC Status Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  try {
    // Clear cookie with explicit matching security flags
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Same as set during login
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Matches cross-site config
      path: '/', // Ensure root path scope
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout Error:', err);
    res.status(500).json({ error: 'Failed to log out' });
  }
});

module.exports = router;