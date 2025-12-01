// routes/legBalanceRoutes.js - Leg Balance & Carry-Forward Routes
import express from 'express';
import { 
  getUserLegBalance,
  getUserLegBalanceSummary,
  getAllLegBalances,
  getUnmatchedSales
} from '../controllers/legBalanceController.js';
import { verifyJWT, isAdminLogin } from '../middlewares/auth.js';

const router = express.Router();

/* ============================================================================ */
/* 🔷 USER ROUTES - View Own Leg Balances                                     */
/* ============================================================================ */

/**
 * Get user's leg balance summary (lightweight)
 * GET /api/v1/leg-balance/:userId/summary
 */
router.get("/:userId/summary", verifyJWT, getUserLegBalanceSummary);

/**
 * Get detailed unmatched sales for a user
 * GET /api/v1/leg-balance/:userId/unmatched
 */
router.get("/:userId/unmatched", verifyJWT, getUnmatchedSales);

/**
 * Get user's leg balance with detailed unmatched sales
 * GET /api/v1/leg-balance/:userId
 */
router.get("/:userId", verifyJWT, getUserLegBalance);

/* ============================================================================ */
/* 🔶 ADMIN ROUTES - View All Leg Balances                                    */
/* ============================================================================ */

/**
 * Get all leg balances (Admin Only)
 * GET /api/v1/leg-balance/admin/all
 */
router.get("/admin/all", verifyJWT, isAdminLogin, getAllLegBalances);

export default router;