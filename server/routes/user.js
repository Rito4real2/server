const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const User = require('../models/User');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;

// Import the evaluation function from investment routes
const { evaluateUserInvestments } = require('./investment');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to handle buffer uploading via stream
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'avatars' }, // Optional folder name in your Cloudinary storage
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    uploadStream.end(buffer);
  });
};

// --- MULTER MEMORY STORAGE CONFIGURATION (Vercel Compatible) ---
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

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
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    const userResponse = newUser.toObject();
    delete userResponse.password;

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

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

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

module.exports = router;