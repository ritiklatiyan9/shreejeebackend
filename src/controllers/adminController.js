// controllers/adminController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadToS3 } from "../utils/awsUtils.js";
import { User } from "../models/userSchema.js";
import { KYC } from "../models/kycSchema.js";
import mongoose from "mongoose";

// Get all users with pagination and filters
export const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    role,
    rank,
    kycVerified,
    search,
    sortBy = "createdAt",
    sortOrder = "desc"
  } = req.query;

  const query = {};

  // Apply filters
  if (status) query.status = status;
  if (role) query.role = role;
  if (rank) query["rank.current"] = rank;
  if (kycVerified !== undefined) {
    if (kycVerified === "true") {
      query.kycStatus = "verified";
    } else {
      query.kycStatus = { $ne: "verified" };
    }
  }

  // Search by email, username, memberId, or name
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
      { memberId: { $regex: search, $options: "i" } },
      { "personalInfo.firstName": { $regex: search, $options: "i" } },
      { "personalInfo.lastName": { $regex: search, $options: "i" } }
    ];
  }

  // Build aggregation pipeline to include KYC status and documents
  const pipeline = [
    {
      $lookup: {
        from: "kycs",
        localField: "_id",
        foreignField: "userId",
        as: "kycData"
      }
    },
    {
      $addFields: {
        kycStatus: {
          $cond: {
            if: { $eq: [{ $arrayElemAt: ["$kycData.status", 0] }, "verified"] },
            then: "verified",
            else: {
              $cond: {
                if: { $eq: [{ $arrayElemAt: ["$kycData.status", 0] }, "rejected"] },
                then: "rejected",
                else: "pending"
              }
            }
          }
        },
        kycDocuments: {
          $cond: {
            if: { $gt: [{ $size: "$kycData" }, 0] },
            then: {
              aadharNumber: { $arrayElemAt: ["$kycData.aadharNumber", 0] },
              aadharDocumentUrl: { $arrayElemAt: ["$kycData.aadharDocumentUrl", 0] },
              panNumber: { $arrayElemAt: ["$kycData.panNumber", 0] },
              panDocumentUrl: { $arrayElemAt: ["$kycData.panDocumentUrl", 0] },
              additionalDocuments: { $arrayElemAt: ["$kycData.additionalDocuments", 0] },
              verified: { $arrayElemAt: ["$kycData.verified", 0] },
              verifiedDate: { $arrayElemAt: ["$kycData.verifiedDate", 0] },
              rejectionReason: { $arrayElemAt: ["$kycData.rejectionReason", 0] },
              status: { $arrayElemAt: ["$kycData.status", 0] }
            },
            else: null
          }
        }
      }
    },
    { $match: query },
    {
      $project: {
        password: 0,
        refreshToken: 0,
        confirmPassword: 0,
        resetPasswordToken: 0,
        emailVerificationToken: 0,
        kyc: 0, // Exclude embedded kyc from User schema
        kycData: 0 // Exclude the raw lookup data
      }
    },
    { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } },
    { $skip: (parseInt(page) - 1) * parseInt(limit) },
    { $limit: parseInt(limit) }
  ];

  const users = await User.aggregate(pipeline);

  // Count total users with similar aggregation
  const countPipeline = [
    {
      $lookup: {
        from: "kycs",
        localField: "_id",
        foreignField: "userId",
        as: "kycData"
      }
    },
    {
      $addFields: {
        kycStatus: {
          $cond: {
            if: { $eq: [{ $arrayElemAt: ["$kycData.status", 0] }, "verified"] },
            then: "verified",
            else: {
              $cond: {
                if: { $eq: [{ $arrayElemAt: ["$kycData.status", 0] }, "rejected"] },
                then: "rejected",
                else: "pending"
              }
            }
          }
        }
      }
    },
    { $match: query },
    { $count: "total" }
  ];
  const countResult = await User.aggregate(countPipeline);
  const totalUsers = countResult[0]?.total || 0;

  return res.status(200).json(
    new ApiResponse(200, {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / parseInt(limit)),
        totalUsers,
        limit: parseInt(limit)
      }
    }, "Users fetched successfully")
  );
});

// Get single user details by ID
export const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  // Check if the provided ID is a KYC ID or User ID
  let user;
  let kycRecord = await KYC.findById(userId).populate('verifiedBy', 'email username');
  
  if (kycRecord) {
    // If userId matches a KYC record, get the user via the userId field in KYC
    user = await User.findById(kycRecord.userId)
      .select("-password -refreshToken -confirmPassword -resetPasswordToken -emailVerificationToken -kyc")
      .populate("createdBy", "email username memberId")
      .lean();
    
    if (user) {
      // Attach the KYC record with all document URLs from KYC schema
      user.kycDocuments = {
        aadharNumber: kycRecord.aadharNumber,
        aadharDocumentUrl: kycRecord.aadharDocumentUrl,
        aadharDocumentKey: kycRecord.aadharDocumentKey,
        panNumber: kycRecord.panNumber,
        panDocumentUrl: kycRecord.panDocumentUrl,
        panDocumentKey: kycRecord.panDocumentKey,
        additionalDocuments: kycRecord.additionalDocuments,
        verified: kycRecord.verified,
        verifiedBy: kycRecord.verifiedBy,
        verifiedDate: kycRecord.verifiedDate,
        rejectionReason: kycRecord.rejectionReason,
        status: kycRecord.status,
        createdAt: kycRecord.createdAt,
        updatedAt: kycRecord.updatedAt
      };
    }
  } else {
    // If userId is not a KYC ID, treat it as a User ID
    user = await User.findById(userId)
      .select("-password -refreshToken -confirmPassword -resetPasswordToken -emailVerificationToken -kyc")
      .populate("createdBy", "email username memberId")
      .lean();

    if (user) {
      // Fetch KYC record from KYC schema
      kycRecord = await KYC.findOne({ userId: user._id }).populate('verifiedBy', 'email username');
      
      if (kycRecord) {
        user.kycDocuments = {
          aadharNumber: kycRecord.aadharNumber,
          aadharDocumentUrl: kycRecord.aadharDocumentUrl,
          aadharDocumentKey: kycRecord.aadharDocumentKey,
          panNumber: kycRecord.panNumber,
          panDocumentUrl: kycRecord.panDocumentUrl,
          panDocumentKey: kycRecord.panDocumentKey,
          additionalDocuments: kycRecord.additionalDocuments,
          verified: kycRecord.verified,
          verifiedBy: kycRecord.verifiedBy,
          verifiedDate: kycRecord.verifiedDate,
          rejectionReason: kycRecord.rejectionReason,
          status: kycRecord.status,
          createdAt: kycRecord.createdAt,
          updatedAt: kycRecord.updatedAt
        };
      } else {
        user.kycDocuments = null;
      }
    }
  }

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, user, "User details fetched successfully")
  );
});

// Get users pending KYC verification
export const getPendingKYC = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Find KYC records in pending status with full document URLs
  const kycPipeline = [
    { $match: { status: "pending" } },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $unwind: "$user"
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        email: "$user.email",
        username: "$user.username",
        memberId: "$user.memberId",
        personalInfo: "$user.personalInfo",
        kycDocuments: {
          aadharNumber: "$aadharNumber",
          aadharDocumentUrl: "$aadharDocumentUrl",
          aadharDocumentKey: "$aadharDocumentKey",
          panNumber: "$panNumber",
          panDocumentUrl: "$panDocumentUrl",
          panDocumentKey: "$panDocumentKey",
          additionalDocuments: "$additionalDocuments",
          status: "$status",
          verified: "$verified",
          createdAt: "$createdAt",
          updatedAt: "$updatedAt"
        },
        createdAt: "$user.createdAt"
      }
    },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  ];

  const users = await KYC.aggregate(kycPipeline);

  const totalPending = await KYC.countDocuments({ status: "pending" });

  return res.status(200).json(
    new ApiResponse(200, {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPending / parseInt(limit)),
        totalPending,
        limit: parseInt(limit)
      }
    }, "Pending KYC users fetched successfully")
  );
});

// Approve KYC
export const approveKYC = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Find the KYC record from KYC schema
  const kyc = await KYC.findOne({ userId: user._id });
  if (!kyc) {
    throw new ApiError(404, "KYC record not found");
  }

  if (kyc.status === "verified") {
    throw new ApiError(400, "KYC already verified");
  }

  // Check if documents exist in KYC schema before approval
  if (!kyc.aadharDocumentUrl && !kyc.panDocumentUrl) {
    throw new ApiError(400, "No KYC documents found for verification");
  }

  // Update KYC status in KYC schema
  kyc.verified = true;
  kyc.status = "verified";
  kyc.verifiedBy = req.user._id;
  kyc.verifiedDate = new Date();
  kyc.rejectionReason = undefined;
  await kyc.save();

  // Update user status to active if pending
  if (user.status === "pending") {
    user.status = "active";
    await user.save();
  }

  return res.status(200).json(
    new ApiResponse(200, {
      userId: user._id,
      memberId: user.memberId,
      kycVerified: kyc.verified,
      kycStatus: kyc.status
    }, "KYC approved successfully")
  );
});

// Reject KYC
export const rejectKYC = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    throw new ApiError(400, "Rejection reason is required");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Find KYC record from KYC schema
  const kyc = await KYC.findOne({ userId: user._id });
  if (!kyc) {
    throw new ApiError(404, "KYC record not found");
  }

  if (kyc.status === "verified") {
    throw new ApiError(400, "Cannot reject already verified KYC");
  }

  // Update KYC status in KYC schema
  kyc.verified = false;
  kyc.status = "rejected";
  kyc.rejectionReason = reason.trim();
  kyc.verifiedBy = req.user._id;
  kyc.verifiedDate = new Date();
  await kyc.save();

  return res.status(200).json(
    new ApiResponse(200, {
      userId: user._id,
      memberId: user.memberId,
      kycStatus: kyc.status,
      rejectionReason: kyc.rejectionReason
    }, "KYC rejected successfully")
  );
});

// Update user status
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  const validStatuses = ["pending", "active", "inactive", "suspended", "blocked"];

  if (!status || !validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${validStatuses.join(", ")}`);
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { status },
    { new: true, select: "-password -refreshToken -confirmPassword -kyc" }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(200, {
      userId: user._id,
      memberId: user.memberId,
      status: user.status
    }, `User status updated to ${status}`)
  );
});

// Update user rank
export const updateUserRank = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { rank } = req.body;

  const validRanks = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crown Diamond"];

  if (!rank || !validRanks.includes(rank)) {
    throw new ApiError(400, `Invalid rank. Must be one of: ${validRanks.join(", ")}`);
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Add current rank to history before updating
  if (user.rank.current !== rank) {
    user.rank.history.push({
      rank: user.rank.current,
      achievedDate: user.rank.achievedDate
    });

    user.rank.current = rank;
    user.rank.achievedDate = new Date();

    await user.save();
  }

  return res.status(200).json(
    new ApiResponse(200, {
      userId: user._id,
      memberId: user.memberId,
      rank: user.rank
    }, "User rank updated successfully")
  );
});

// Get user's team/downline
export const getUserTeam = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { level = 1, position } = req.query;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const user = await User.findById(userId).select("memberId");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const query = { sponsorId: user.memberId };
  if (position && ["left", "right"].includes(position)) {
    query.position = position;
  }

  const teamMembers = await User.find(query)
    .select("email username memberId personalInfo rank status position createdAt -kyc")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, {
      sponsor: user.memberId,
      level: parseInt(level),
      totalMembers: teamMembers.length,
      teamMembers
    }, "Team members fetched successfully")
  );
});

// Get dashboard statistics
export const getDashboardStats = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ status: "active" });
  const pendingUsers = await User.countDocuments({ status: "pending" });
  const blockedUsers = await User.countDocuments({ status: "blocked" });
  const suspendedUsers = await User.countDocuments({ status: "suspended" });

  // Get KYC stats from KYC schema
  const kycVerified = await KYC.countDocuments({ status: "verified" });
  const kycPending = await KYC.countDocuments({ status: "pending" });
  const kycRejected = await KYC.countDocuments({ status: "rejected" });

  // Get total wallet balance across all users
  const walletStats = await User.aggregate([
    {
      $group: {
        _id: null,
        totalBalance: { $sum: "$wallet.balance" },
        totalEarnings: { $sum: "$wallet.totalEarnings" },
        totalWithdrawn: { $sum: "$wallet.totalWithdrawn" }
      }
    }
  ]);

  // Rank distribution
  const rankDistribution = await User.aggregate([
    {
      $group: {
        _id: "$rank.current",
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  // Recent registrations (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentRegistrations = await User.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });

  return res.status(200).json(
    new ApiResponse(200, {
      users: {
        total: totalUsers,
        active: activeUsers,
        pending: pendingUsers,
        blocked: blockedUsers,
        suspended: suspendedUsers,
        recentRegistrations
      },
      kyc: {
        verified: kycVerified,
        pending: kycPending,
        rejected: kycRejected
      },
      wallet: walletStats[0] || {
        totalBalance: 0,
        totalEarnings: 0,
        totalWithdrawn: 0
      },
      ranks: rankDistribution
    }, "Dashboard statistics fetched successfully")
  );
});

// Update user wallet balance (admin only - manual adjustment)
export const updateWalletBalance = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { amount, type, description } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!amount || typeof amount !== "number") {
    throw new ApiError(400, "Valid amount is required");
  }

  if (!type || !["credit", "debit"].includes(type)) {
    throw new ApiError(400, "Type must be either 'credit' or 'debit'");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (type === "credit") {
    user.wallet.balance += amount;
    user.wallet.totalEarnings += amount;
  } else {
    if (user.wallet.balance < amount) {
      throw new ApiError(400, "Insufficient balance for debit");
    }
    user.wallet.balance -= amount;
  }

  await user.save();

  return res.status(200).json(
    new ApiResponse(200, {
      userId: user._id,
      memberId: user.memberId,
      wallet: user.wallet,
      transaction: {
        type,
        amount,
        description: description || `Manual ${type} by admin`
      }
    }, `Wallet ${type}ed successfully`)
  );
});

// Delete user (soft delete - change status to blocked)
export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { permanentDelete = false } = req.query;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (permanentDelete === "true") {
    // Permanent delete - also delete associated KYC records from KYC schema
    await KYC.deleteMany({ userId: userId });
    const user = await User.findByIdAndDelete(userId);
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
      new ApiResponse(200, { userId }, "User and associated KYC records permanently deleted")
    );
  } else {
    // Soft delete - block user
    const user = await User.findByIdAndUpdate(
      userId,
      { status: "blocked" },
      { new: true, select: "-password -refreshToken -confirmPassword -kyc" }
    );

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
      new ApiResponse(200, {
        userId: user._id,
        memberId: user.memberId,
        status: user.status
      }, "User blocked successfully")
    );
  }
});

// Get verified KYC users
export const getVerifiedKYC = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Fetch verified KYC records with document URLs from KYC schema
  const kycPipeline = [
    { $match: { status: "verified" } },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $unwind: "$user"
    },
    {
      $lookup: {
        from: "users",
        localField: "verifiedBy",
        foreignField: "_id",
        as: "verifiedByDetails"
      }
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        email: "$user.email",
        username: "$user.username",
        memberId: "$user.memberId",
        personalInfo: "$user.personalInfo",
        kycDocuments: {
          aadharNumber: "$aadharNumber",
          aadharDocumentUrl: "$aadharDocumentUrl",
          aadharDocumentKey: "$aadharDocumentKey",
          panNumber: "$panNumber",
          panDocumentUrl: "$panDocumentUrl",
          panDocumentKey: "$panDocumentKey",
          additionalDocuments: "$additionalDocuments",
          verified: "$verified",
          verifiedDate: "$verifiedDate",
          status: "$status"
        },
        verifiedBy: {
          $arrayElemAt: ["$verifiedByDetails.email", 0]
        },
        createdAt: "$user.createdAt"
      }
    },
    { $sort: { "kycDocuments.verifiedDate": -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  ];

  const users = await KYC.aggregate(kycPipeline);

  const totalVerified = await KYC.countDocuments({ status: "verified" });

  return res.status(200).json(
    new ApiResponse(200, {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalVerified / parseInt(limit)),
        totalVerified,
        limit: parseInt(limit)
      }
    }, "Verified KYC users fetched successfully")
  );
});

// Get rejected KYC users
export const getRejectedKYC = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Fetch rejected KYC records with document URLs from KYC schema
  const kycPipeline = [
    { $match: { status: "rejected" } },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $unwind: "$user"
    },
    {
      $lookup: {
        from: "users",
        localField: "verifiedBy",
        foreignField: "_id",
        as: "verifiedByDetails"
      }
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        email: "$user.email",
        username: "$user.username",
        memberId: "$user.memberId",
        personalInfo: "$user.personalInfo",
        kycDocuments: {
          aadharNumber: "$aadharNumber",
          aadharDocumentUrl: "$aadharDocumentUrl",
          aadharDocumentKey: "$aadharDocumentKey",
          panNumber: "$panNumber",
          panDocumentUrl: "$panDocumentUrl",
          panDocumentKey: "$panDocumentKey",
          additionalDocuments: "$additionalDocuments",
          verified: "$verified",
          verifiedDate: "$verifiedDate",
          rejectionReason: "$rejectionReason",
          status: "$status"
        },
        verifiedBy: {
          $arrayElemAt: ["$verifiedByDetails.email", 0]
        },
        createdAt: "$user.createdAt"
      }
    },
    { $sort: { "kycDocuments.verifiedDate": -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) }
  ];

  const users = await KYC.aggregate(kycPipeline);

  const totalRejected = await KYC.countDocuments({ status: "rejected" });

  return res.status(200).json(
    new ApiResponse(200, {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRejected / parseInt(limit)),
        totalRejected,
        limit: parseInt(limit)
      }
    }, "Rejected KYC users fetched successfully")
  );
});

// Search users by multiple criteria
export const searchUsers = asyncHandler(async (req, res) => {
  const {
    query,
    searchBy = "all", // all, email, username, memberId, phone
    page = 1,
    limit = 10
  } = req.query;

  if (!query || query.trim().length === 0) {
    throw new ApiError(400, "Search query is required");
  }

  const searchQuery = {};
  const searchTerm = query.trim();

  switch (searchBy) {
    case "email":
      searchQuery.email = { $regex: searchTerm, $options: "i" };
      break;
    case "username":
      searchQuery.username = { $regex: searchTerm, $options: "i" };
      break;
    case "memberId":
      searchQuery.memberId = { $regex: searchTerm, $options: "i" };
      break;
    case "phone":
      searchQuery["personalInfo.phone"] = { $regex: searchTerm, $options: "i" };
      break;
    default:
      searchQuery.$or = [
        { email: { $regex: searchTerm, $options: "i" } },
        { username: { $regex: searchTerm, $options: "i" } },
        { memberId: { $regex: searchTerm, $options: "i" } },
        { "personalInfo.firstName": { $regex: searchTerm, $options: "i" } },
        { "personalInfo.lastName": { $regex: searchTerm, $options: "i" } },
        { "personalInfo.phone": { $regex: searchTerm, $options: "i" } }
      ];
  }

  // Build aggregation pipeline for search with KYC documents from KYC schema
  const pipeline = [
    { $match: searchQuery },
    {
      $lookup: {
        from: "kycs",
        localField: "_id",
        foreignField: "userId",
        as: "kycData"
      }
    },
    {
      $addFields: {
        kycStatus: {
          $cond: {
            if: { $eq: [{ $arrayElemAt: ["$kycData.status", 0] }, "verified"] },
            then: "verified",
            else: {
              $cond: {
                if: { $eq: [{ $arrayElemAt: ["$kycData.status", 0] }, "rejected"] },
                then: "rejected",
                else: "pending"
              }
            }
          }
        },
        kycDocuments: {
          $cond: {
            if: { $gt: [{ $size: "$kycData" }, 0] },
            then: {
              aadharNumber: { $arrayElemAt: ["$kycData.aadharNumber", 0] },
              aadharDocumentUrl: { $arrayElemAt: ["$kycData.aadharDocumentUrl", 0] },
              aadharDocumentKey: { $arrayElemAt: ["$kycData.aadharDocumentKey", 0] },
              panNumber: { $arrayElemAt: ["$kycData.panNumber", 0] },
              panDocumentUrl: { $arrayElemAt: ["$kycData.panDocumentUrl", 0] },
              panDocumentKey: { $arrayElemAt: ["$kycData.panDocumentKey", 0] },
              additionalDocuments: { $arrayElemAt: ["$kycData.additionalDocuments", 0] },
              verified: { $arrayElemAt: ["$kycData.verified", 0] },
              verifiedDate: { $arrayElemAt: ["$kycData.verifiedDate", 0] },
              rejectionReason: { $arrayElemAt: ["$kycData.rejectionReason", 0] },
              status: { $arrayElemAt: ["$kycData.status", 0] }
            },
            else: null
          }
        }
      }
    },
    {
      $project: {
        password: 0,
        refreshToken: 0,
        confirmPassword: 0,
        resetPasswordToken: 0,
        emailVerificationToken: 0,
        kyc: 0, // Exclude embedded kyc from User schema
        kycData: 0 // Exclude the raw lookup data
      }
    },
    { $sort: { createdAt: -1 } },
    { $skip: (parseInt(page) - 1) * parseInt(limit) },
    { $limit: parseInt(limit) }
  ];

  const users = await User.aggregate(pipeline);

  // Count total results
  const countPipeline = [
    { $match: searchQuery },
    { $count: "total" }
  ];
  const countResult = await User.aggregate(countPipeline);
  const totalResults = countResult[0]?.total || 0;

  return res.status(200).json(
    new ApiResponse(200, {
      users,
      searchQuery: query,
      searchBy,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalResults / parseInt(limit)),
        totalResults,
        limit: parseInt(limit)
      }
    }, "Search completed successfully")
  );
});