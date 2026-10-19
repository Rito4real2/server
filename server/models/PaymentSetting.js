const mongoose = require( 'mongoose');

const paymentSettingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['bank_transfer', 'crypto', 'BANK_TRANSFER', 'CRYPTO', 'BTC', 'USDT', 'ETH', 'TRX'],
      required: true,
      unique: true,
    },
    // Bank details
    bankName: { type: String, trim: true },
    accountHolderName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },

    // Crypto details
    walletAddress: { type: String, trim: true },
    network: { type: String, trim: true, default: 'TRC20' }, // e.g. TRC20, ERC20, BTC

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentSetting', paymentSettingSchema);