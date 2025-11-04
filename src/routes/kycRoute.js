// routes/kyc.routes.js
import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.js";
import {
  submitKYC,
  getKYCStatus,
  verifyKYC,
  rejectKYC,
  getPendingKYC,
  getUserKYC // Optional: for admin to get specific user's KYC
} from "../controllers/kycController.js";

const router = Router();

// Public route for submitting KYC (requires login)
router.post("/", verifyJWT, submitKYC);

// Get current user's KYC status (requires login)
router.get("/status", verifyJWT, getKYCStatus);

// Admin routes
router.put("/verify/:userId", verifyJWT, verifyKYC); // Admin verify
router.put("/reject/:userId", verifyJWT, rejectKYC); // Admin reject
router.get("/pending", verifyJWT, getPendingKYC); // Admin get pending
router.get("/:userId", verifyJWT, getUserKYC); // Admin get specific user's KYC

export default router;