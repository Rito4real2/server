// routes/investmentAdmin.js
const express = require('express');
const router = express.Router();
const InvestmentPlan = require('../models/InvestmentPlan');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth'); // Assumes you have an admin check middleware

// 1. GET /api/investments/admin/plans — Get all investment plans (Admin view)
router.get('/plans', requireAuth, requireAdmin, async (req, res) => {
  try {
    const plans = await InvestmentPlan.find().sort({ createdAt: -1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/investments/admin/plans — Create a new investment plan template
router.post('/plans', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, durationDays, profitPercentage, minInvestment, maxInvestment } = req.body;

    if (!name || !durationDays || profitPercentage === undefined || !minInvestment || !maxInvestment) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const newPlan = new InvestmentPlan({
      name,
      durationDays,
      profitPercentage,
      minInvestment,
      maxInvestment,
    });

    await newPlan.save();
    res.status(201).json({ message: 'Investment plan created successfully!', plan: newPlan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. PUT /api/investments/admin/plans/:id — Update an existing investment plan
router.put('/plans/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedPlan = await InvestmentPlan.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updatedPlan) {
      return res.status(404).json({ error: 'Investment plan not found.' });
    }

    res.json({ message: 'Investment plan updated successfully!', plan: updatedPlan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE /api/investments/admin/plans/:id — Delete an investment plan template
router.delete('/plans/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedPlan = await InvestmentPlan.findByIdAndDelete(id);
    if (!deletedPlan) {
      return res.status(404).json({ error: 'Investment plan not found.' });
    }

    res.json({ message: 'Investment plan deleted successfully!', planId: deletedPlan._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;