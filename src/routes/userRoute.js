// routes/user.routes.js
import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.js";
import {
  Register,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
  updateUserProfile,
  updateUserProfileWithMultipleImages,
  updateBankDetails,
  changeCurrentPassword,
  getReferralLink,
  getMyReferrals,
  getUserDashboard,
  uploadKYCDocuments,
  uploadPropertyImages,
  getUserPropertyImages,
  deletePropertyImages,
  getUserRank,
  deleteProfileImage,
  getKYCStatus,
  updateKYCDetails,
  verifyKYC,
  getPendingKYC,
  rejectKYC,
  getCompanyTree,
  getBinaryTree ,
  getLeftGenealogy,
  getRightGenealogy,
  getFullGenealogy,
  updateUserProfileWithImageUpload
} from "../controllers/userController.js";
import { upload } from '../middlewares/multer.js';
const router = Router();

// 🔐 Auth
router.post("/register", Register);
router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", verifyJWT, logoutUser);

// 👤 Profile
router.get("/me", verifyJWT, getCurrentUser);

router.put('/update', upload.single('profileImage'), verifyJWT, updateUserProfileWithImageUpload);
router.put("/update-multiple", verifyJWT, updateUserProfileWithMultipleImages);
router.delete("/delete-profile-image", verifyJWT, deleteProfileImage);

// 💳 Bank & Password
router.put("/bank", verifyJWT, updateBankDetails);
router.put("/change-password", verifyJWT, changeCurrentPassword);

// 👥 Referrals & Binary System
router.get("/referral-link", verifyJWT, getReferralLink);
router.get("/my-referrals", verifyJWT, getMyReferrals);
router.get("/binary-tree", verifyJWT, getBinaryTree); // NEW: Get binary tree structure

// 📊 Dashboard
router.get("/dashboard", verifyJWT, getUserDashboard);

// 🧾 KYC
router.post("/kyc", verifyJWT, uploadKYCDocuments);
router.get("/kyc/status", verifyJWT, getKYCStatus); // Check KYC status
router.put("/kyc/update", verifyJWT, updateKYCDetails); // Update KYC details
router.put("/kyc/verify/:userId", verifyJWT, verifyKYC); // Admin: Verify KYC
router.get("/kyc/pending", verifyJWT, getPendingKYC); // Admin: Get pending KYC
router.put("/kyc/reject/:userId", verifyJWT, rejectKYC); // Admin: Reject KYC

// 🏠 Property
router.post("/property-images", verifyJWT, uploadPropertyImages);
router.get("/property-images", verifyJWT, getUserPropertyImages);
router.delete("/property-images", verifyJWT, deletePropertyImages);
router.route("/company-tree").get(verifyJWT, getCompanyTree);


// Add these routes after the existing ones in the router file
router.get("/left-genealogy", verifyJWT, getLeftGenealogy);
router.get("/right-genealogy", verifyJWT, getRightGenealogy);
router.get("/full-genealogy", verifyJWT, getFullGenealogy);

// 🏅 Rank
router.get("/rank", verifyJWT, getUserRank);

export default router;