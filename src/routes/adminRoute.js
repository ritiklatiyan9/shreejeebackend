// routes/adminRoutes.js
import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  getPendingKYC,
  approveKYC,
  rejectKYC,
  updateUserStatus,
  updateUserRank,
  getUserTeam,
  getDashboardStats,
  updateWalletBalance,
  deleteUser,
  getVerifiedKYC,
  getRejectedKYC,
  searchUsers
} from "../controllers/adminController.js";
import { verifyJWT, isAdminLogin } from "../middlewares/auth.js";

const router = Router();

// Apply authentication middleware to all admin routes
router.use(verifyJWT);
router.use(isAdminLogin);

// Dashboard & Statistics
router.route("/dashboard/stats").get(getDashboardStats);

// User Management Routes
router.route("/users").get(getAllUsers);
router.route("/users/search").get(searchUsers);
router.route("/users/:userId").get(getUserById);
router.route("/users/:userId/status").patch(updateUserStatus);
router.route("/users/:userId/rank").patch(updateUserRank);
router.route("/users/:userId/team").get(getUserTeam);
router.route("/users/:userId").delete(deleteUser);

// KYC Management Routes
router.route("/kyc/pending").get(getPendingKYC);
router.route("/kyc/verified").get(getVerifiedKYC);
router.route("/kyc/rejected").get(getRejectedKYC);
router.route("/kyc/:userId/approve").patch(approveKYC);
router.route("/kyc/:userId/reject").patch(rejectKYC);

// Wallet Management Routes
router.route("/wallet/:userId/update").patch(updateWalletBalance);

export default router;