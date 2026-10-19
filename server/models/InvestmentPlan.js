// models/InvestmentPlan.js (Admin Plan Templates)
const mongoose = require('mongoose');

const InvestmentPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  durationDays: { type: Number, required: true }, // e.g., 7 days (1 week) to 365 days (1 year)
  minInvestment: { type: Number, required: true },
  maxInvestment: { type: Number, required: true },
  profitType: { 
    type: String, 
    enum: ['percentage', 'fixed'], 
    default: 'percentage' 
  },
  profitPercentage: { type: Number, required: true, default: 0 }, // e.g., 20% total return target
  fixedProfitAmount: { type: Number, default: 0 }, // e.g., $50 flat return
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('InvestmentPlan', InvestmentPlanSchema);