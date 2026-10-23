const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
const upload = require('../middleware/upload');
const sendEmail = require('../utils/sendEmail');

const { getEmailVerificationTemplate } = require('../utils/emailTemplate');

// Import the evaluation function from investment routes
const { evaluateUserInvestments } = require('./investment');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to handle buffer uploading via stream
const uploadToCloudinary = (buffer, folderName = 'avatars') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folderName, resource_type: 'auto' }, // Optional folder name in your Cloudinary storage
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    uploadStream.end(buffer);
  });
};

// POST /api/users/register
router.post('/register', async (req, res) => {
  try {
    const { fullName, userName, emailAddress, password, gender, balance, role, avatarUrl } = req.body;

    if (!fullName || !userName || !emailAddress || !password) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    const newUser = await User.create({
      fullName,
      userName,
      emailAddress,
      password,
      gender,
      balance: balance ?? 0,
      role: role || 'user',
      avatarUrl: avatarUrl || '',
    });

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    const userResponse = newUser.toObject();
    delete userResponse.password;

    await sendEmail({
      to: newUser.emailAddress,
      subject: 'Registration sucessful!',
      html: `
      <div style="font-family: monospace; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Account Registration Notification</h2>
          <p>Hello ${newUser.userName},</p>
          <p>You have succesfully registered to (Your company name). Sit tight you will be redirected to your dashboard shortly</p>
          <p style="color: #666; font-size: 12px;">Start your trading journey by purchasing one of our many trading plan and make the most out of the markets.</p>
        </div>
      `
    })

    return res.status(201).json({
      message: 'Account created and logged in successfully',
      user: userResponse,
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(400).json({ error: `An account with that ${field} already exists.` });
    }
    return res.status(400).json({ error: err.message || 'Failed to create user account' });
  }
});

// USER LOGIN
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide email/username and password' });
    }

    const user = await User.findOne({
      $or: [
        { emailAddress: identifier.toLowerCase().trim() },
        { userName: identifier.trim() }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await sendEmail({
      to: user.emailAddress,
      subject: 'Logged in sucessfully!',
      html: `
      <div style="font-family: monospace; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Account Login Notification!</h2>
          <p>Hello ${user.userName},</p>
          <p>You have succesfully Logged into your account.</p>
          <p style="color: #666; font-size: 12px;">Not you? <a href="#" style="text-decoration: none; color: light-blue;">Click here to verify</a> </p>
        </div>
      `
    })

    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        fullName: user.fullName,
        userName: user.userName,
        emailAddress: user.emailAddress,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change Password (api/user/password)
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request Email Verification Link
router.post('/verify-email/request', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = token;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // 1. Point the email link to your Frontend page (e.g., /users/settings)
    const frontEndUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const verificationUrl = `${frontEndUrl}/users/settings?token=${token}`;

    await sendEmail({
      to: user.emailAddress,
      subject: 'Verify Your Email Address',
      html: getEmailVerificationTemplate(user, verificationUrl),
    });

    res.json({ message: 'Verification email sent successfully!' });
  } catch (err) {
    console.error('Email Verification Request Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Confirm Email Verification (This matches your frontend fetch: /api/users/verify-email/:token)
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully!' });
  } catch (err) {
    console.error('Email Verification Confirm Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// KYC Upload Route
router.post('/kyc', requireAuth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a valid KYC document' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      // Clean up local file if user not found
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'User not found' });
    }

    // Upload to Cloudinary using the local file path with an expanded 120-second timeout
    const cloudinaryResponse = await cloudinary.uploader.upload(req.file.path, {
      folder: 'kyc-documents',
      resource_type: 'auto',
      timeout: 120000, // 2 minutes timeout to prevent 499 errors
    });

    // Delete the temporary local file after a successful upload
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    user.kycStatus = 'PENDING';
    user.kycDocumentUrl = cloudinaryResponse.secure_url;
    await user.save();

    res.json({ 
      message: 'KYC document submitted successfully. Awaiting admin review.',
      kycDocumentUrl: user.kycDocumentUrl 
    });
  } catch (err) {
    // Ensure temporary file is cleaned up even if the upload fails
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('KYC Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- CURRENT USER ROUTES ---

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// GET /api/users/profile — Fetch authenticated user profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Recalculate profit accruals and auto-complete matured plans before loading profile
    await evaluateUserInvestments(userId);

    // 2. Fetch updated user details (reflecting any credited principal or profit)
    const user = await User.findById(userId).select('-password -withdrawalPin');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Debug log to confirm what MongoDB is actually sending back
    console.log('Fetched Profile KYC Status:', user.kycStatus);

    res.json(user);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to retrieve profile information.' });
  }
});

// POST /api/users/profile/avatar — Upload or update profile picture via Cloudinary
router.post('/profile/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an image file.' });
    }

    // Upload memory buffer to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer);
    const avatarUrl = cloudinaryResult.secure_url; // Gets the secure HTTPS URL

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatarUrl },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Avatar uploaded successfully',
      avatarUrl: updatedUser.avatarUrl,
      user: updatedUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { fullName, userName, gender, avatarUrl } = req.body;

    const updateFields = { fullName, userName, gender };
    if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/users/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// --- ADMIN-ONLY ROUTES ---

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { fullName, userName, emailAddress, balance, role, avatarUrl } = req.body;

    const updateFields = {};
    if (fullName !== undefined) updateFields.fullName = fullName;
    if (userName !== undefined) updateFields.userName = userName;
    if (emailAddress !== undefined) updateFields.emailAddress = emailAddress;
    if (balance !== undefined) updateFields.balance = Number(balance);
    if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;
    if (role !== undefined && ['user', 'admin'].includes(role)) {
      updateFields.role = role;
    }

    delete updateFields.password;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        error: `A user with that ${duplicateField} already exists`,
      });
    }
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.deleteOne();

    res.json({ message: 'User deleted successfully', id: req.params.id });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/users/:userId/generate-pin
router.post('/:userId/generate-pin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Generate a random 6-digit PIN (e.g., "482910")
    const randomPin = Math.floor(100000 + Math.random() * 900000).toString();

    const user = await User.findByIdAndUpdate(
      userId,
      { withdrawalPin: randomPin },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await sendEmail({
      to: user.emailAddress,
      subject: 'your Withdrawal Security PIN',
      html: `
      <div style="font-family: monospace; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Security PIN Notification</h2>
          <p>Hello ${user.userName},</p>
          <p>An admin has generated a secure withdrawal PIN for your account.</p>
          <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">
            ${randomPin}
          </div>
          <p style="color: #666; font-size: 12px;">Use this 6-digit PIN to authorize pending withdrawals in your receipt modal. Do not share this code with anyone.</p>
        </div>
      `
    })

    res.json({
      message: 'Withdrawal PIN generated successfully!',
      withdrawalPin: randomPin,
      user: {
        id: user._id,
        name: user.userName,
        email: user.emailAddress,
        withdrawalPin: user.withdrawalPin
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;