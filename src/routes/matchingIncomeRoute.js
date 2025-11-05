// routes/matchingIncomeRoutes.js
import express from 'express';
import { 
  calculateMatchingIncomeForCycle, 
  getUserMatchingIncome,
  getTeamMatchingIncome, 
  getMatchingIncomeForCycle,
  approveMatchingIncome,
  deleteMatchingIncomeForCycle,
  recalculateMatchingIncome
} from '../controllers/matchingIncomeController.js';
import { verifyJWT, isAdminLogin } from '../middlewares/auth.js';

const router = express.Router();

// ============= ADMIN ROUTES =============

// ⚠️ DEPRECATED: Use automatic calculation via booking approval instead
// Calculate matching income for current cycle (Admin/Cron) - Protected against duplicates
// POST /api/matching-income/calculate
router.post("/calculate", verifyJWT, isAdminLogin, calculateMatchingIncomeForCycle);

// ✅ NEW: Recalculate matching income (Delete existing + Recalculate)
// POST /api/matching-income/recalculate
router.post("/recalculate", verifyJWT, isAdminLogin, recalculateMatchingIncome);

// ✅ NEW: Delete matching income records for a cycle (cleanup)
// DELETE /api/matching-income/cycle?cycleStartDate=2025-11-01&cycleEndDate=2025-11-30
router.delete("/cycle", verifyJWT, isAdminLogin, deleteMatchingIncomeForCycle);

// Get all matching income records for a cycle (Admin Dashboard)
// GET /api/matching-income/cycle?cycleStartDate=2025-01-01&cycleEndDate=2025-01-31&status=calculated&page=1&limit=50
router.get("/cycle", verifyJWT, isAdminLogin, getMatchingIncomeForCycle);

// Approve a matching income record
// PATCH /api/matching-income/approve/:recordId
router.patch("/approve/:recordId", verifyJWT, isAdminLogin, approveMatchingIncome);

// ============= USER ROUTES =============

// Get individual matching income for a user (Personal Dashboard)
// GET /api/matching-income/user/:userId?cycleStartDate=2025-01-01&status=calculated&page=1&limit=10
router.get("/user/:userId", verifyJWT, getUserMatchingIncome);

// Get team matching income (User's entire downline)
// GET /api/matching-income/team/:userId?cycleStartDate=2025-01-01&status=calculated
router.get("/team/:userId", verifyJWT, getTeamMatchingIncome);

export default router;