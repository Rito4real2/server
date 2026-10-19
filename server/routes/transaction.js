// server/routes/transaction.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentSetting = require('../models/PaymentSetting');
const { requireAdmin, requireAuth } = require('../middleware/auth');

// --- PAYMENT SETTINGS ROUTES (ADMIN & USER) ---

// GET Route to fetch settings by payment type
router.get('/payment-settings', requireAuth, async (req, res) => {
  try {
    const rawType = req.query.type || 'BANK_TRANSFER';
    // Standardize query to UPPERCASE to prevent case mismatch
    const type = rawType.trim().toUpperCase();

    // Perform case-insensitive search as a fallback
    const settings = await PaymentSetting.findOne({
      type: { $regex: new RegExp(`^${type}$`, 'i') }
    });

    return res.status(200).json({
      success: true,
      settings: settings || null,
    });
  } catch (err) {
    console.error('Error fetching payment settings:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Create or update admin payment details (Admin Only)
router.post('/payment-settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      type: rawType = 'BANK_TRANSFER',
      bankName,
      accountNumber,
      accountHolderName,
      walletAddress,
      network,
      isActive,
    } = req.body;

    // Standardize to uppercase for storage
    const type = rawType.trim().toUpperCase();

    // Upsert by matching standardized 'type'
    const settings = await PaymentSetting.findOneAndUpdate(
      { type },
      {
        type,
        bankName,
        accountNumber,
        accountHolderName,
        walletAddress,
        network,
        isActive: isActive !== undefined ? isActive : true,
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: `${type} payment settings updated successfully`,
      settings,
    });
  } catch (err) {
    console.error('Error updating payment settings:', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- USER TRANSACTION ROUTES ---

// 1. POST /api/transaction/deposit (FIX: Added missing deposit endpoint)
router.post('/deposit', requireAuth, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    const depositAmount = Number(amount);

    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid deposit amount' });
    }

    // Create deposit transaction with pending status
    const transaction = await Transaction.create({
      user: req.user._id,
      type: 'DEPOSIT',
      amount: depositAmount,
      status: 'PENDING',
      paymentMethod: paymentMethod || 'BANK TRANSFER',
    });

    res.status(201).json({
      message: 'Deposit request submitted and pending admin approval.',
      transaction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/transactions/withdraw
// POST /api/transactions/withdraw
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const { amount, paymentMethod, bankDetails, walletAddress } = req.body;
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid withdrawal amount' });
    }

    if (req.user.balance < withdrawAmount) {
      return res.status(400).json({ error: 'Insufficient account balance' });
    }

    // Validation for BANK_TRANSFER
    if (paymentMethod === 'BANK_TRANSFER') {
      if (!bankDetails?.bankName || !bankDetails?.accountNumber || !bankDetails?.accountHolderName) {
        return res.status(400).json({ error: 'Please provide complete bank details' });
      }
    }

    // Validation for CRYPTO
    if (paymentMethod === 'CRYPTO' && !walletAddress) {
      return res.status(400).json({ error: 'Please provide a crypto wallet address' });
    }

    const transaction = await Transaction.create({
      user: req.user._id,
      type: 'WITHDRAWAL',
      amount: withdrawAmount,
      status: 'PENDING',
      paymentMethod: paymentMethod || 'BANK_TRANSFER',
      bankDetails: paymentMethod === 'BANK_TRANSFER' ? bankDetails : undefined,
      walletAddress: paymentMethod === 'CRYPTO' ? walletAddress : undefined,
    });

    res.status(201).json({
      message: 'Withdrawal request submitted and pending approval.',
      transaction,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET USER'S TRANSACTION HISTORY
// GET /api/transactions/my-history
router.get('/my-history', requireAuth, async (req, res) => {
  try {
    const history = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN TRANSACTION ROUTES ---

// 4. GET /api/transactions/all (Admin gets all pending or all transactions)
router.get('/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('user', 'fullName userName emailAddress balance')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE /api/transaction/:id — Delete a transaction record (Admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTransaction = await Transaction.findByIdAndDelete(id);

    if (!deletedTransaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    res.json({
      message: 'Transaction successfully deleted.',
      transactionId: deletedTransaction._id,
    });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({ error: err.message || 'Server error while deleting transaction.' });
  }
});

// 6. PATCH /api/transactions/:id/status (Admin approve/reject transaction)
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'APPROVED' or 'REJECTED'
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ error: `Transaction already ${transaction.status}` });
    }

    // Handle user balance update on approval
    if (status === 'APPROVED') {
      const user = await User.findById(transaction.user);
      if (!user) return res.status(404).json({ error: 'User for this transaction not found' });

      if (transaction.type === 'DEPOSIT') {
        user.balance += transaction.amount;
      } else if (transaction.type === 'WITHDRAWAL') {
        if (user.balance < transaction.amount) {
          return res.status(400).json({ error: 'User has insufficient balance for withdrawal' });
        }
        user.balance -= transaction.amount;
      }
      await user.save();
    }

    transaction.status = status;
    await transaction.save();

    res.json({ message: `Transaction successfully ${status}`, transaction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Express Route: PATCH /api/transaction/:id/upload-proof
router.patch('/:id/upload-proof', async (req, res) => {
  try {
    const { proofOfPayment } = req.body;

    if (!proofOfPayment) {
      return res.status(400).json({ message: 'Proof of payment is required' });
    }

    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { proofOfPayment },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.status(200).json({
      message: 'Proof uploaded successfully',
      transaction,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;