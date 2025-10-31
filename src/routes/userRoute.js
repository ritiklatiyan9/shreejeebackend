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
} from "../controllers/userController.js";

const router = Router();

// 🔐 Auth
router.post("/register", Register);
router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", verifyJWT, logoutUser);

// 👤 Profile
router.get("/me", verifyJWT, getCurrentUser);
router.put("/update", verifyJWT, updateUserProfile);
router.put("/update-multiple", verifyJWT, updateUserProfileWithMultipleImages);
router.delete("/delete-profile-image", verifyJWT, deleteProfileImage);

// 💳 Bank & Password
router.put("/bank", verifyJWT, updateBankDetails);
router.put("/change-password", verifyJWT, changeCurrentPassword);

// 👥 Referrals
router.get("/referral-link", verifyJWT, getReferralLink);
router.get("/my-referrals", verifyJWT, getMyReferrals);

// 📊 Dashboard
router.get("/dashboard", verifyJWT, getUserDashboard);

// 🧾 KYC
router.post("/kyc", verifyJWT, uploadKYCDocuments);

// 🏠 Property
router.post("/property-images", verifyJWT, uploadPropertyImages);
router.get("/property-images", verifyJWT, getUserPropertyImages);
router.delete("/property-images", verifyJWT, deletePropertyImages);

// 🏅 Rank
router.get("/rank", verifyJWT, getUserRank);

export default router;
