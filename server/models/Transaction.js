const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['DEPOSIT', 'WITHDRAWAL'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  // Payment method specified by the user
  paymentMethod: {
    type: String,
    enum: ['BANK_TRANSFER', 'CRYPTO', 'CREDIT_DEBIT_CARD', 'BTC', 'ETH', 'USDT', 'USDC'],
    default: 'BANK_TRANSFER'
  },
  // Optional embedded schema for bank transfers
  bankDetails: {
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountHolderName: { type: String, trim: true }
  },
  // Optional field for crypto withdrawals
  walletAddress: {
    type: String,
    trim: true
  },

  proofOfPayment: { type: String },
  
  description: { 
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);