// routes/matchingIncomeRoutes.js - Complete Routes Configuration
import express from 'express';
import { 
  getUserMatchingIncome,
  getPlotIncomeDetails,
  getIncomeSummary,
  getTeamMatchingIncome,
  getAllIncomeRecords,
  approveMatchingIncome,
  bulkApproveIncome,
  rejectMatchingIncome,
  updateIncomeStatus,
  getDashboardStats,
  getUserRewards
} from '../controllers/matchingIncomeController.js';
import { verifyJWT, isAdminLogin } from '../middlewares/auth.js';

const router = express.Router();

/* ============================================================================ */
/* 🔷 USER ROUTES - Individual Income Transactions                             */
/* ============================================================================ */

/**
 * Get individual matching income records for a user
 * GET /api/matching-income/user/:userId
 */
router.get("/user/:userId", verifyJWT, getUserMatchingIncome);

/**
 * Get income details for a specific plot
 * GET /api/matching-income/plot/:plotId
 */
router.get("/plot/:plotId", verifyJWT, getPlotIncomeDetails);

/**
 * Get income summary grouped by time period
 * GET /api/matching-income/summary/:userId
 */
router.get("/summary/:userId", verifyJWT, getIncomeSummary);

/**
 * Get team income records (all downline members)
 * GET /api/matching-income/team/:userId
 */
router.get("/team/:userId", verifyJWT, getTeamMatchingIncome);

/**
 * Get user rewards and current level
 * GET /api/matching-income/rewards/:userId
 */
router.get("/rewards/:userId", verifyJWT, getUserRewards);

/* ============================================================================ */
/* 🔶 ADMIN ROUTES - Income Management & Approval                              */
/* ============================================================================ */

/**
 * Get all income records with advanced filtering (Admin Only)
 * GET /api/matching-income/admin/all
 */
router.get("/admin/all", verifyJWT, isAdminLogin, getAllIncomeRecords);

/**
 * Get dashboard statistics (Admin Only)
 * GET /api/matching-income/admin/stats
 */
router.get("/admin/stats", verifyJWT, isAdminLogin, getDashboardStats);

/**
 * Approve a single income record (Admin Only)
 * PATCH /api/matching-income/admin/approve/:recordId
 */
router.patch("/admin/approve/:recordId", verifyJWT, isAdminLogin, approveMatchingIncome);

/**
 * Bulk approve multiple income records (Admin Only)
 * POST /api/matching-income/admin/bulk-approve
 */
router.post("/admin/bulk-approve", verifyJWT, isAdminLogin, bulkApproveIncome);

/**
 * Reject an income record (Admin Only)
 * PATCH /api/matching-income/admin/reject/:recordId
 */
router.patch("/admin/reject/:recordId", verifyJWT, isAdminLogin, rejectMatchingIncome);

/**
 * Update income status to credited/paid (Admin Only)
 * PATCH /api/matching-income/admin/status/:recordId
 */
router.patch("/admin/status/:recordId", verifyJWT, isAdminLogin, updateIncomeStatus);

export default router;