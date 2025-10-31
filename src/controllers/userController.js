// controllers/userController.js (JSON version)
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadOnS3, uploadMultipleOnS3 } from "../utils/awsUtils.js";
import { User } from "../models/userSchema.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    console.log("Generating tokens for user ID:", userId);
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    console.log("User found:", user);

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    console.log("Access Token:", accessToken);
    console.log("Refresh Token:", refreshToken);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    console.log("User tokens updated and saved");

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("Error generating tokens:", error);
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

export const Register = asyncHandler(async (req, res) => {
  const { 
    email, 
    password, 
    username, 
    confirmPassword, 
    role,
    sponsorId, // Optional sponsor ID for MLM
    personalInfo,
    bankDetails
  } = req.body;

  // Check for required fields first
  if (!username || !email || !password || !confirmPassword) {
    return res.status(400).json(new ApiResponse(400, null, "All fields are required"));
  }

  if (
    [username, email, password, confirmPassword].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "Password and confirm password do not match");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(400, "User already exists");
  }

  // Validate sponsor if provided
  let sponsor = null;
  if (sponsorId) {
    sponsor = await User.findById(sponsorId);
    if (!sponsor) {
      throw new ApiError(400, "Invalid sponsor ID");
    }
  }

  const user = await User.create({
    email: email.trim(),
    password,
    username: username.toLowerCase().trim(),
    confirmPassword: confirmPassword.trim(),
    role: role || "user",
    sponsorId: sponsorId || null,
    personalInfo: personalInfo || {},
    bankDetails: bankDetails || {}
  });

  const createdUser = await User.findOne({ _id: user._id }).select(
    "-password -refreshToken -confirmPassword"
  );
  if (!createdUser) {
    throw new ApiError(400, "User registration failed");
  }

  return res.status(201).json(
    new ApiResponse(201, createdUser, "User registered successfully")
  );
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  
  if (!username && !email) {
    throw new ApiError(400, "Username or email is required");
  }
  
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }
  
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }
  
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken -confirmPassword"
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: 'strict'
  };

  // Update last login
  await User.findByIdAndUpdate(user._id, {
    $inc: { loginCount: 1 },
    lastLogin: new Date()
  });

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { 
          user: loggedInUser, 
          accessToken, 
          refreshToken 
        },
        "User logged in successfully"
      )
    );
});

export const logoutUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
  }

  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: "" },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: 'strict'
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
  
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized Request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken, 
      process.env.REFRESH_TOKEN_SECRET
    );
    
    if (!decodedToken) { 
      throw new ApiError(401, "Invalid Refresh Token");
    }
    
    const user = await User.findById(decodedToken?._id);
    
    if (!user) {
      throw new ApiError(401, "Invalid Refresh Token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: 'strict',
    };
    
    const { accessToken, refreshToken: newRefreshToken } = 
      await generateAccessAndRefreshTokens(user._id);
    
    user.refreshToken = newRefreshToken;
    await user.save();

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { 
            accessToken, 
            refreshToken: newRefreshToken 
          },
          "Access Token Refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

// Get current user profile
export const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

// Update user profile with single image (for JSON version, this would handle image URL if provided)
export const updateUserProfile = asyncHandler(async (req, res) => {
  const { 
    firstName, 
    lastName, 
    phone, 
    dateOfBirth, 
    address,
    profileImage
  } = req.body;

  const updateData = {
    "personalInfo.firstName": firstName,
    "personalInfo.lastName": lastName,
    "personalInfo.phone": phone,
    "personalInfo.dateOfBirth": dateOfBirth,
    "personalInfo.address": address
  };

  if (profileImage) {
    updateData["personalInfo.profileImage"] = profileImage;
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true }
  ).select("-password -refreshToken -confirmPassword");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

// Update user profile with multiple images (for JSON version)
export const updateUserProfileWithMultipleImages = asyncHandler(async (req, res) => {
  const { 
    firstName, 
    lastName, 
    phone, 
    dateOfBirth, 
    address,
    profileImages
  } = req.body;

  const updateData = {
    "personalInfo.firstName": firstName,
    "personalInfo.lastName": lastName,
    "personalInfo.phone": phone,
    "personalInfo.dateOfBirth": dateOfBirth,
    "personalInfo.address": address
  };

  if (profileImages && Array.isArray(profileImages) && profileImages.length > 0) {
    updateData["personalInfo.profileImages"] = profileImages;
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true }
  ).select("-password -refreshToken -confirmPassword");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});

// Update bank details
export const updateBankDetails = asyncHandler(async (req, res) => {
  const { 
    accountNumber, 
    ifscCode, 
    accountHolderName, 
    bankName, 
    branch,
    upiId
  } = req.body;

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        "bankDetails.accountNumber": accountNumber,
        "bankDetails.ifscCode": ifscCode,
        "bankDetails.accountHolderName": accountHolderName,
        "bankDetails.bankName": bankName,
        "bankDetails.branch": branch,
        "bankDetails.upiId": upiId
      }
    },
    { new: true }
  ).select("-password -refreshToken -confirmPassword");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Bank details updated successfully"));
});

// Update password
export const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "New password and confirm password do not match");
  }

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// Get user's referral link
export const getReferralLink = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("referralLink");
  
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Referral link fetched successfully"));
});

// Get user's downline (referrals)
export const getMyReferrals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  
  const referrals = await User.find({ sponsorId: req.user.memberId })
    .select("-password -refreshToken -confirmPassword")
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const totalReferrals = await User.countDocuments({ sponsorId: req.user.memberId });

  return res
    .status(200)
    .json(new ApiResponse(200, {
      referrals,
      totalReferrals,
      page: parseInt(page),
      limit: parseInt(limit)
    }, "Referrals fetched successfully"));
});

// Get user dashboard info
export const getUserDashboard = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -confirmPassword"
  );

  // Calculate additional metrics
  const totalReferrals = await User.countDocuments({ sponsorId: user.memberId });
  const directReferrals = await User.countDocuments({ sponsorId: user.memberId });

  return res
    .status(200)
    .json(new ApiResponse(200, {
      user,
      totalReferrals,
      directReferrals,
      wallet: user.wallet
    }, "Dashboard data fetched successfully"));
});

// Upload KYC documents (for JSON version, this would accept image URLs)
export const uploadKYCDocuments = asyncHandler(async (req, res) => {
  const { 
    aadharNumber, 
    panNumber, 
    aadharDocument, 
    panDocument, 
    additionalDocuments 
  } = req.body;

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        "kyc.aadharNumber": aadharNumber,
        "kyc.panNumber": panNumber,
        ...(aadharDocument && { "kyc.aadharDocument": aadharDocument }),
        ...(panDocument && { "kyc.panDocument": panDocument }),
        ...(additionalDocuments && Array.isArray(additionalDocuments) && { "kyc.additionalDocuments": additionalDocuments })
      }
    },
    { new: true }
  ).select("-password -refreshToken -confirmPassword");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "KYC documents updated successfully"));
});

// Upload property images (for JSON version, this would accept image URLs)
export const uploadPropertyImages = asyncHandler(async (req, res) => {
  const { propertyImages } = req.body;
  
  if (!propertyImages || !Array.isArray(propertyImages) || propertyImages.length === 0) {
    throw new ApiError(400, "Property images array is required");
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $push: {
        "personalInfo.propertyImages": { $each: propertyImages }
      }
    },
    { new: true }
  ).select("-password -refreshToken -confirmPassword");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Property images uploaded successfully"));
});

// Get user's property images
export const getUserPropertyImages = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("personalInfo.propertyImages");
  
  return res
    .status(200)
    .json(new ApiResponse(200, user.personalInfo.propertyImages || [], "Property images fetched successfully"));
});

// Delete specific property images
export const deletePropertyImages = asyncHandler(async (req, res) => {
  const { imageUrls } = req.body; // Array of image URLs to delete
  
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new ApiError(400, "Image URLs array is required");
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $pull: {
          "personalInfo.propertyImages": { $in: imageUrls }
        }
      },
      { new: true }
    ).select("-password -refreshToken -confirmPassword");

    return res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "Property images deleted successfully"));
  } catch (error) {
    throw new ApiError(500, "Error deleting property images");
  }
});

// Get user's rank information
export const getUserRank = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("rank wallet");
  
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Rank information fetched successfully"));
});

// Delete user profile image
export const deleteProfileImage = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { "personalInfo.profileImage": "" } },
    { new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Profile image deleted successfully"));
});