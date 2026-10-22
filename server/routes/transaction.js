// server/routes/transaction.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentSetting = require('../models/PaymentSetting');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { getEmailTemplate, getDepositEmailTemplate, getWithdrawalEmailTemplate } = require('../utils/emailTemplate')
const sendEmail = require('../utils/sendEmail')

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
    const user = req.user._id
    const { amount, paymentMethod } = req.body;
    const depositAmount = Number(amount);
    const status = transaction.status

    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid deposit amount' });
    }

    // Create deposit transaction with pending status
    const transaction = await Transaction.create({
      user: user,
      type: 'DEPOSIT',
      amount: depositAmount,
      status: 'PENDING',
      paymentMethod: paymentMethod || 'BANK TRANSFER',
    });
    
    if (user.emailAddress) {
      await sendEmail({
        to: user.emailAddress,
        subject: `${transaction.type} ${status}`,
        html: getDepositEmailTemplate(user, status, transaction)
      });
    }

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
    const { amount, paymentMethod, bankDetails, walletAddress, pin } = req.body;
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Enter a valid withdrawal amount' });
    }

    // Fetch the user from the database to check balance and PIN securely
    const user = await User.findById(req.user._id || req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Verify Withdrawal PIN
    if (!user.withdrawalPin) {
      return res.status(400).json({ error: 'No withdrawal PIN configured for this account. Please contact support.' });
    }

    if (user.withdrawalPin !== pin) {
      return res.status(400).json({ error: 'Invalid withdrawal PIN. Please check and try again.' });
    }

    // 2. Check Account Balance
    if (user.balance < withdrawAmount) {
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

    // Create the transaction with PENDING status awaiting admin approval
    const transaction = await Transaction.create({
      user: user._id,
      type: 'WITHDRAWAL',
      amount: withdrawAmount,
      status: 'PENDING',
      paymentMethod: paymentMethod || 'BANK_TRANSFER',
      bankDetails: paymentMethod === 'BANK_TRANSFER' ? bankDetails : undefined,
      walletAddress: paymentMethod === 'CRYPTO' ? walletAddress : undefined,
    });

    const status = transaction.status

    if (user.emailAddress) {
      await sendEmail({
        to: user.emailAddress,
        subject: `${transaction.type} ${status}`,
        html: getWithdrawalEmailTemplate(user, status, transaction)
      });
    }

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

    const user = await User.findById(transaction.user);
    if (!user) {
      return res.status(404).json({ error: 'User for this transaction not found' });
    }

    // Handle user balance update on approval
    if (status === 'APPROVED') {
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

    // --- Send Email Notification via Resend ---
    if (user.emailAddress) {

      await sendEmail({
        to: user.emailAddress,
        subject: `${transaction.type} ${status}`,
        html: getEmailTemplate(user, status, transaction),
      });
    }

    res.json({ message: `Transaction successfully ${status}`, transaction });
  } catch (err) {
    console.error('Error updating transaction status:', err);
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

// POST /api/transaction/:transactionId/validate-pin
router.post('/:transactionId/validate-pin', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { pin } = req.body;

    // Fetch user and transaction
    const user = await User.findById(req.user._id || req.user.id);
    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    if (transaction.user.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access.' });
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ error: 'This transaction is no longer pending.' });
    }

    // Check PIN
    if (!user.withdrawalPin) {
      return res.status(400).json({ error: 'No withdrawal PIN set for this account. Please contact admin.' });
    }

    if (user.withdrawalPin !== pin) {
      return res.status(400).json({ error: 'Invalid security PIN. Please try again.' });
    }

    // Mark as PIN verified (optional flag or simply acknowledge success)
    transaction.isPinVerified = true;
    await transaction.save();

    await sendEmail({
          to: user.emailAddress,
          subject: 'PIN Validated sucessfully!',
          html: `
          <div style="font-family: monospace; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #333;">PIN Validation Notice!</h2>
              <p>Hello ${user.userName},</p>
              <p>You have succesfully validated your PIN. Your transaction will be processed shortly</p>
              <p style="color: #666; font-size: 12px;">Not you? <a href="#" style="text-decoration: none; color: light-blue;">Click here to verify</a> </p>
            </div>
          `
        })

    res.json({
      message: 'Withdrawal PIN validated successfully! Request is pending final admin approval.',
      transaction
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;