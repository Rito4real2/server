// routes/investment.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const InvestmentPlan = require('../models/InvestmentPlan');
const UserInvestment = require('../models/UserInvestment');

// Safely import requireAuth (handles both named and default exports)
const authModule = require('../middleware/auth');
const requireAuth = authModule.requireAuth || authModule;

// routes/investment.js (Plan purchase handler)
router.post('/buy', requireAuth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user._id;

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid investment amount.' });
    }

    // 1. Fetch Plan & User
    const plan = await InvestmentPlan.findById(planId);
    if (!plan) return res.status(404).json({ error: 'Investment plan not found.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User account not found.' });

    // 2. Validate Bounds
    if (numericAmount < plan.minInvestment || numericAmount > plan.maxInvestment) {
      return res.status(400).json({ 
        error: `Amount must be between $${plan.minInvestment} and $${plan.maxInvestment}` 
      });
    }

    // 3. Verify Sufficient Balance
    if (user.balance < numericAmount) {
      return res.status(400).json({ 
        error: `Insufficient balance. Current available balance is $${user.balance.toFixed(2)}.` 
      });
    }

    // 4. Determine Target Profit
    let targetProfit = 0;
    if (plan.profitType === 'fixed') {
      targetProfit = plan.fixedProfitAmount;
    } else {
      targetProfit = numericAmount * (plan.profitPercentage / 100);
    }

    // 5. Calculate Plan Dates
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // 6. Deduct Balance & Save User First
    user.balance -= numericAmount;
    await user.save();

    // 7. Create User Investment
    const userInvestment = await UserInvestment.create({
      user: userId,
      planConfig: plan._id,
      investedAmount: numericAmount,
      currentProfit: 0,
      targetProfit: targetProfit,
      startDate,
      endDate,
      status: 'active'
    });

    res.status(201).json({ 
      message: 'Investment plan purchased successfully!', 
      userInvestment, 
      newBalance: user.balance 
    });
  } catch (err) {
    console.error('Error purchasing plan:', err);
    res.status(500).json({ error: err.message || 'Server error during plan purchase.' });
  }
});

// GET /api/investments/my-investments — Fetch logged-in user's active and completed investments
router.get('/my-investments', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Recalculate profit accruals and auto-complete matured plans first
    await evaluateUserInvestments(userId);

    // 2. Fetch user investments and populate the plan template configuration
    const investments = await UserInvestment.find({ user: userId })
      .populate('planConfig')
      .sort({ createdAt: -1 });

    console.log('INVESTMENTS FOUND IN DB:', investments);

    res.json(investments);
  } catch (err) {
    console.error('Error fetching user investments:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve user investments.' });
  }
});

// Helper to evaluate active investments for a user
async function evaluateUserInvestments(userId) {
  try {
    const activeInvestments = await UserInvestment.find({ user: userId, status: 'active' });
    const now = new Date();

    for (let inv of activeInvestments) {
      const totalDuration = inv.endDate.getTime() - inv.startDate.getTime();
      const elapsed = now.getTime() - inv.startDate.getTime();
      
      // Calculate progress ratio (capped at 1.0)
      const timeProgress = Math.min(elapsed / totalDuration, 1);
      
      // Calculate current accumulated profit based on time elapsed
      const calculatedProfit = inv.targetProfit * timeProgress;
      inv.currentProfit = Math.min(calculatedProfit, inv.targetProfit);

      // Check dual-exit conditions: Time expired OR Target profit reached
      if (now >= inv.endDate || inv.currentProfit >= inv.targetProfit) {
        inv.status = 'completed';
        
        // Return principal + profit back to user balance
        await User.findByIdAndUpdate(userId, {
          $inc: { balance: inv.investedAmount + inv.currentProfit }
        });
      }

      await inv.save();
    }
  } catch (err) {
    console.error('Error evaluating user investments:', err);
  }
}

module.exports = {
  router,
  evaluateUserInvestments,
};