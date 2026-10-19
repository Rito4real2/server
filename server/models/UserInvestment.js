// models/UserInvestment.js (Active User Subscriptions)
const mongoose = require('mongoose');

const UserInvestmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planConfig: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentPlan', required: true },
  investedAmount: { type: Number, required: true },
  targetProfit: { type: Number, required: true }, // Max profit cap before auto-completion
  currentProfit: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('UserInvestment', UserInvestmentSchema);