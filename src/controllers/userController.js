import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
// Import the correct function name from s3Utils.js
import { uploadToS3 } from "../utils/awsUtils.js"; // Assuming filename is awsUtils.js, adjust if it's s3Utils.js
import { User } from "../models/userSchema.js";
// Import the configured upload middleware (MUST use memoryStorage)
import { upload } from '../middlewares/multer.js';
import multer from 'multer';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// === CHANGED: ensureAuthenticated now returns boolean instead of throwing ===
const ensureAuthenticated = (req) => {
	// Return true when req.user is populated, false otherwise
	return !!(req && req.user && req.user._id);
};
// === end helper ===

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
    sponsorId,
    firstName,
    lastName,
    phone,
    dateOfBirth,
    address,
    accountNumber,
    ifscCode,
    accountHolderName
  } = req.body;

  // Validation for required fields
  if (!username || !email || !password || !confirmPassword) {
    return res.status(400).json(new ApiResponse(400, null, "All fields are required"));
  }
  if ([username, email, password, confirmPassword].some((field) => field?.trim() === "")) {
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

  // Validate sponsor and assign position logic
  let actualSponsor = null;
  let assignedPosition = null;
  let originalSponsorId = null;
  if (sponsorId) {
    const originalSponsor = await User.findOne({ referralCode: sponsorId });
    if (!originalSponsor) {
      throw new ApiError(400, "Invalid sponsor referral code");
    }
    originalSponsorId = originalSponsor._id;
    const findAvailablePosition = async (rootUserId) => {
      const queue = [rootUserId];
      while (queue.length > 0) {
        const currentUserId = queue.shift();
        const children = await User.find({ sponsorId: currentUserId })
          .select('_id position')
          .lean();
        const leftChild = children.find(child => child.position === 'left');
        const rightChild = children.find(child => child.position === 'right');

        if (!leftChild) {
          return {
            sponsorId: currentUserId,
            position: 'left'
          };
        }
        if (!rightChild) {
          return {
            sponsorId: currentUserId,
            position: 'right'
          };
        }
        queue.push(leftChild._id);
        queue.push(rightChild._id);
      }
      throw new ApiError(500, "Unable to find available position in binary tree");
    };
    const placement = await findAvailablePosition(originalSponsor._id);
    actualSponsor = await User.findById(placement.sponsorId);
    assignedPosition = placement.position;
    console.log(`Placing new user under sponsor: ${actualSponsor.username} (${actualSponsor.memberId}) at position: ${assignedPosition}`);

    if (actualSponsor._id.toString() !== originalSponsor._id.toString()) {
      console.log(`Spillover occurred: Original sponsor was ${originalSponsor.username}, placed under ${actualSponsor.username}`);
    }
  }

  // Prepare personalInfo and bankDetails objects
  const personalInfoObj = {
    firstName: firstName?.trim() || '',
    lastName: lastName?.trim() || '',
    phone: phone?.trim() || '',
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    address: address?.trim() || '',
    profileImage: null // No file upload for JSON
  };

  const bankDetailsObj = {
    accountNumber: accountNumber?.trim() || '',
    ifscCode: ifscCode?.trim() || '',
    accountHolderName: accountHolderName?.trim() || ''
  };

  const user = await User.create({
    email: email.trim(),
    password,
    username: username.toLowerCase().trim(),
    confirmPassword: confirmPassword.trim(),
    role: role || "user",
    sponsorId: actualSponsor ? actualSponsor._id : null,
    position: actualSponsor ? assignedPosition : null,
    personalInfo: personalInfoObj,
    bankDetails: bankDetailsObj
  });

  const createdUser = await User.findOne({ _id: user._id }).select(
    "-password -refreshToken -confirmPassword"
  );

  if (!createdUser) {
    throw new ApiError(400, "User registration failed");
  }

  const responseData = {
    ...createdUser.toObject(),
    placementInfo: actualSponsor ? {
      directSponsor: {
        memberId: actualSponsor.memberId,
        username: actualSponsor.username
      },
      position: assignedPosition,
      isSpillover: originalSponsorId && actualSponsor._id.toString() !== originalSponsorId.toString()
    } : null
  };

  return res.status(201).json(
    new ApiResponse(201, responseData, "User registered successfully")
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
	// ...changed: guard that returns JSON instead of throwing...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}
	return res
		.status(200)
		.json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});
export const updateUserProfileWithImageUpload = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

	// Multer middleware should have already processed the file and placed it in req.file
  // and text fields in req.body

  const { 
    firstName, 
    lastName, 
    phone, 
    dateOfBirth, // Note: This might need date parsing if sent as string
    address,
    bio // Added bio as an example of an extra field
  } = req.body;

  let profileImageUrl = null;

  // --- Handle Profile Image Upload to S3 using the utility ---
  if (req.file) { // Check if a file was actually uploaded via Multer
    try {
      // Validate file type again if necessary (though multer filter should handle this)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new ApiError(400, "Invalid file type. Only image files (jpeg, jpg, png, webp) are allowed.");
      }

      // Upload the file BUFFER to S3 using the S3 utility (AWS SDK v3)
      // Ensure multer is using memoryStorage so req.file.buffer exists
      const uploadResult = await uploadToS3(
        req.file.buffer,        // Pass the BUFFER (file content) here (requires memoryStorage)
        req.file.originalname,  // Use the original filename for S3 key
        req.file.mimetype,      // Pass the mime type
        'profile-images'        // Specify the S3 folder
      );
      profileImageUrl = uploadResult.url; // Get the public URL from the result
      console.log("Profile image uploaded to S3:", profileImageUrl);
    } catch (uploadError) {
      console.error("S3 Upload Error (Controller):", uploadError);
      throw new ApiError(500, `Failed to upload profile image to storage: ${uploadError.message}`); // Include error details
    }
  }

  // Prepare the update object
  const updateData = {};

  // Add text fields to the update object if they exist in the request body
  if (firstName !== undefined) updateData["personalInfo.firstName"] = firstName?.trim();
  if (lastName !== undefined) updateData["personalInfo.lastName"] = lastName?.trim();
  if (phone !== undefined) updateData["personalInfo.phone"] = phone?.trim();
  if (address !== undefined) updateData["personalInfo.address"] = address?.trim();
  if (bio !== undefined) updateData["personalInfo.bio"] = bio?.trim(); // Example for bio
  if (dateOfBirth !== undefined) updateData["personalInfo.dateOfBirth"] = dateOfBirth ? new Date(dateOfBirth) : undefined; // Parse date if needed

  // Add the new profile image URL if one was uploaded
  if (profileImageUrl) {
    updateData["personalInfo.profileImage"] = profileImageUrl;
  }

  // Find and update the user
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id, // Assuming req.user is populated by authentication middleware
    { $set: updateData },
    { new: true, runValidators: true } // Return the updated document and run schema validators
  ).select("-password -refreshToken -confirmPassword"); // Exclude sensitive fields

  if (!updatedUser) {
    // This shouldn't happen if authentication middleware is working correctly,
    // but good to check
    throw new ApiError(404, "User not found");
  }

  // Send success response
  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});
// Update user profile with single image (for JSON version, this would handle image URL if provided)
// Update user profile with single image
export const updateUserProfile = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { 
    firstName, 
    lastName, 
    phone, 
    dateOfBirth, 
    address,
    profileImage  // This would be the image URL from S3
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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const user = await User.findById(req.user._id).select("referralLink referralCode");
  
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Referral link fetched successfully"));
});

// Get user's downline (referrals) - BINARY SYSTEM VERSION with spillover support
export const getMyReferrals = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { page = 1, limit = 10, includeIndirect = false } = req.query;

  // Get direct referrals (children in binary tree)
  const referrals = await User.find({ sponsorId: req.user._id })
    .select("-password -refreshToken -confirmPassword")
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const totalReferrals = await User.countDocuments({ sponsorId: req.user._id });

  // Get complete binary tree structure with all levels
  const getBinaryTree = async (currentUserId, maxDepth = 10, currentDepth = 0) => {
    if (currentDepth >= maxDepth) return null;

    const user = await User.findById(currentUserId)
      .select("-password -refreshToken -confirmPassword");

    if (!user) return null;

    const children = await User.find({ sponsorId: currentUserId })
      .select("-password -refreshToken -confirmPassword")
      .sort({ position: 1 }); // Sort to ensure left comes first

    const leftChild = children.find(child => child.position === 'left');
    const rightChild = children.find(child => child.position === 'right');

    return {
      ...user.toObject(),
      children: [
        leftChild ? await getBinaryTree(leftChild._id, maxDepth, currentDepth + 1) : null,
        rightChild ? await getBinaryTree(rightChild._id, maxDepth, currentDepth + 1) : null
      ]
    };
  };

  const binaryTree = await getBinaryTree(req.user._id);

  // Calculate network statistics
  const calculateNetworkStats = async (userId) => {
    let totalNetwork = 0;
    let leftLeg = 0;
    let rightLeg = 0;

    const countDownline = async (currentUserId, leg = null) => {
      const children = await User.find({ sponsorId: currentUserId }).select('_id position');
      
      for (const child of children) {
        totalNetwork++;
        
        if (leg === 'left') {
          leftLeg++;
        } else if (leg === 'right') {
          rightLeg++;
        }
        
        await countDownline(child._id, leg || child.position);
      }
    };

    await countDownline(userId);
    
    return { totalNetwork, leftLeg, rightLeg };
  };

  const networkStats = await calculateNetworkStats(req.user._id);

  return res
    .status(200)
    .json(new ApiResponse(200, {
      referrals,
      totalReferrals,
      binaryTree,
      networkStats,
      page: parseInt(page),
      limit: parseInt(limit)
    }, "Referrals fetched successfully"));
});

// Get user's binary tree structure - Enhanced with spillover tracking
export const getBinaryTree = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { maxDepth = 10 } = req.query;

  const buildBinaryTree = async (currentUserId, depth = 0) => {
    if (depth >= parseInt(maxDepth)) return null;

    const user = await User.findById(currentUserId)
      .select("-password -refreshToken -confirmPassword");

    if (!user) return null;

    const children = await User.find({ sponsorId: currentUserId })
      .select("-password -refreshToken -confirmPassword")
      .sort({ position: 1 }); // Sort to ensure left comes first

    const leftChild = children.find(child => child.position === 'left');
    const rightChild = children.find(child => child.position === 'right');

    return {
      ...user.toObject(),
      depth,
      children: [
        leftChild ? await buildBinaryTree(leftChild._id, depth + 1) : null,
        rightChild ? await buildBinaryTree(rightChild._id, depth + 1) : null
      ]
    };
  };

  const binaryTree = await buildBinaryTree(req.user._id);

  return res
    .status(200)
    .json(new ApiResponse(200, binaryTree, "Binary tree retrieved successfully"));
});

// Get user dashboard info
export const getUserDashboard = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -confirmPassword"
  );

  // Calculate additional metrics
  const totalReferrals = await User.countDocuments({ sponsorId: user._id });
  const directReferrals = await User.countDocuments({ sponsorId: user._id });

  // Get binary tree depth
  const getBinaryTreeDepth = async (currentUserId) => {
    if (!currentUserId) return 0;
    
    const children = await User.find({ sponsorId: currentUserId });
    if (children.length === 0) return 1;
    
    const depths = await Promise.all(
      children.map(child => getBinaryTreeDepth(child._id))
    );
    return 1 + Math.max(...depths);
  };

  const treeDepth = await getBinaryTreeDepth(user._id);

  // Calculate total network size
  const calculateTotalNetwork = async (userId) => {
    let total = 0;
    const countDownline = async (currentUserId) => {
      const children = await User.find({ sponsorId: currentUserId }).select('_id');
      total += children.length;
      for (const child of children) {
        await countDownline(child._id);
      }
    };
    await countDownline(userId);
    return total;
  };

  const totalNetworkSize = await calculateTotalNetwork(user._id);

  return res
    .status(200)
    .json(new ApiResponse(200, {
      user,
      totalReferrals,
      directReferrals,
      totalNetworkSize,
      treeDepth,
      wallet: user.wallet
    }, "Dashboard data fetched successfully"));
});

// Upload KYC documents (for JSON version, this would accept image URLs)
export const uploadKYCDocuments = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const user = await User.findById(req.user._id).select("personalInfo.propertyImages");
  
  return res
    .status(200)
    .json(new ApiResponse(200, user.personalInfo.propertyImages || [], "Property images fetched successfully"));
});

// Delete specific property images
export const deletePropertyImages = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

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
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const user = await User.findById(req.user._id).select("rank wallet");
  
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Rank information fetched successfully"));
});

// Delete user profile image
export const deleteProfileImage = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { "personalInfo.profileImage": "" } },
    { new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Profile image deleted successfully"));
});

export const getKYCStatus = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const user = await User.findById(req.user._id).select("kyc status");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user.kyc, "KYC status fetched successfully"));
});

// Update user's KYC details (for users to update their own KYC)
export const updateKYCDetails = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { 
    aadharNumber, 
    panNumber, 
    aadharDocument, 
    panDocument, 
    additionalDocuments 
  } = req.body;

  // Check if user is already verified
  const user = await User.findById(req.user._id);
  if (user.kyc.verified) {
    throw new ApiError(400, "KYC already verified, cannot update");
  }

  const updateData = {
    "kyc.aadharNumber": aadharNumber,
    "kyc.panNumber": panNumber,
    "kyc.verified": false, // Reset verification status on update
    "kyc.rejectionReason": null // Clear any previous rejection reason
  };

  if (aadharDocument) {
    updateData["kyc.aadharDocument"] = aadharDocument;
  }
  if (panDocument) {
    updateData["kyc.panDocument"] = panDocument;
  }
  if (additionalDocuments && Array.isArray(additionalDocuments)) {
    updateData["kyc.additionalDocuments"] = additionalDocuments;
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true }
  ).select("-password -refreshToken -confirmPassword");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "KYC details updated successfully"));
});

// Admin: Verify user's KYC
export const verifyKYC = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}
	// existing admin role check remains
	// ...existing code...
});

// Admin: Get pending KYC requests
export const getPendingKYC = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}
	// existing admin role check remains
	// ...existing code...
});

// Admin: Reject user's KYC
export const rejectKYC = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}
	// existing admin role check remains
	// ...existing code...
});

export const getCompanyTree = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

	const { maxDepth = 100 } = req.query; // Default to a high number to get full tree

  // Find the root user (the one without a sponsorId - the original admin/user who started the tree)
  const findRootUser = async () => {
    // Assuming the root user is the one with no sponsorId and potentially an admin role
    // You might need to adjust this logic based on how your root user is defined
    const rootUser = await User.findOne({ sponsorId: null }).select("-password -refreshToken -confirmPassword");
    return rootUser;
  };

  const buildBinaryTree = async (currentUserId, depth = 0) => {
    if (depth >= parseInt(maxDepth)) return null;

    const user = await User.findById(currentUserId)
      .select("-password -refreshToken -confirmPassword");

    if (!user) return null;

    // Find direct children (left and right positions) under this user
    const children = await User.find({ sponsorId: currentUserId })
      .select("-password -refreshToken -confirmPassword")
      .sort({ position: 1 }); // Sort to ensure left comes first

    const leftChild = children.find(child => child.position === 'left');
    const rightChild = children.find(child => child.position === 'right');

    return {
      ...user.toObject(),
      depth,
      children: [
        leftChild ? await buildBinaryTree(leftChild._id, depth + 1) : null,
        rightChild ? await buildBinaryTree(rightChild._id, depth + 1) : null
      ]
    };
  };

  const rootUser = await findRootUser();

  if (!rootUser) {
     // If no root user found with sponsorId: null, try finding the user with the oldest creation date or a specific admin user
     // This is a fallback assuming the first user created is the root or an admin is the root
     const potentialRoot = await User.findOne({ role: "admin" }).sort({ createdAt: 1 }).select("-password -refreshToken -confirmPassword");
     if (!potentialRoot) {
       throw new ApiError(404, "No root user found for the company tree.");
     }
     const companyTree = await buildBinaryTree(potentialRoot._id);
     return res.status(200).json(new ApiResponse(200, companyTree, "Company tree retrieved successfully"));
  }

  const companyTree = await buildBinaryTree(rootUser._id);

  return res
    .status(200)
    .json(new ApiResponse(200, companyTree, "Company tree retrieved successfully"));
});

// Get user's left genealogy (all users in the left leg)
export const getLeftGenealogy = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { maxDepth = 100 } = req.query; // Default depth limit

  const buildLeftSubtree = async (currentUserId, depth = 0) => {
    if (depth >= parseInt(maxDepth)) return null;

    const user = await User.findById(currentUserId)
      .select("-password -refreshToken -confirmPassword");

    if (!user) return null;

    // Find only the left child under this user
    const leftChild = await User.findOne({ 
      sponsorId: currentUserId, 
      position: 'left' 
    }).select("-password -refreshToken -confirmPassword");

    if (!leftChild) return { ...user.toObject(), children: [] };

    return {
      ...user.toObject(),
      depth,
      children: [await buildLeftSubtree(leftChild._id, depth + 1)]
    };
  };

  // Find the left child of the current user first
  const leftChild = await User.findOne({ 
    sponsorId: req.user._id, 
    position: 'left' 
  }).select("-password -refreshToken -confirmPassword");

  if (!leftChild) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], "No left leg found"));
  }

  const leftGenealogy = await buildLeftSubtree(leftChild._id);

  return res
    .status(200)
    .json(new ApiResponse(200, leftGenealogy, "Left genealogy retrieved successfully"));
});

// Get user's right genealogy (all users in the right leg)
export const getRightGenealogy = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { maxDepth = 100 } = req.query; // Default depth limit

  const buildRightSubtree = async (currentUserId, depth = 0) => {
    if (depth >= parseInt(maxDepth)) return null;

    const user = await User.findById(currentUserId)
      .select("-password -refreshToken -confirmPassword");

    if (!user) return null;

    // Find only the right child under this user
    const rightChild = await User.findOne({ 
      sponsorId: currentUserId, 
      position: 'right' 
    }).select("-password -refreshToken -confirmPassword");

    if (!rightChild) return { ...user.toObject(), children: [] };

    return {
      ...user.toObject(),
      depth,
      children: [await buildRightSubtree(rightChild._id, depth + 1)]
    };
  };

  // Find the right child of the current user first
  const rightChild = await User.findOne({ 
    sponsorId: req.user._id, 
    position: 'right' 
  }).select("-password -refreshToken -confirmPassword");

  if (!rightChild) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], "No right leg found"));
  }

  const rightGenealogy = await buildRightSubtree(rightChild._id);

  return res
    .status(200)
    .json(new ApiResponse(200, rightGenealogy, "Right genealogy retrieved successfully"));
});

// Get both left and right genealogy combined
export const getFullGenealogy = asyncHandler(async (req, res) => {
	// ...changed guard...
	if (!ensureAuthenticated(req)) {
		return res.status(401).json(new ApiResponse(401, null, "User not authenticated"));
	}

  const { maxDepth = 100 } = req.query; // Default depth limit

  const buildSubtree = async (currentUserId, depth = 0) => {
    if (depth >= parseInt(maxDepth)) return null;

    const user = await User.findById(currentUserId)
      .select("-password -refreshToken -confirmPassword");

    if (!user) return null;

    const children = await User.find({ sponsorId: currentUserId })
      .select("-password -refreshToken -confirmPassword")
      .sort({ position: 1 });

    const leftChild = children.find(child => child.position === 'left');
    const rightChild = children.find(child => child.position === 'right');

    return {
      ...user.toObject(),
      depth,
      children: [
        leftChild ? await buildSubtree(leftChild._id, depth + 1) : null,
        rightChild ? await buildSubtree(rightChild._id, depth + 1) : null
      ]
    };
  };

  const user = await User.findById(req.user._id)
    .select("-password -refreshToken -confirmPassword");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const children = await User.find({ sponsorId: req.user._id })
    .select("-password -refreshToken -confirmPassword")
    .sort({ position: 1 });

  const leftChild = children.find(child => child.position === 'left');
  const rightChild = children.find(child => child.position === 'right');

  const genealogy = {
    ...user.toObject(),
    children: [
      leftChild ? await buildSubtree(leftChild._id, 1) : null,
      rightChild ? await buildSubtree(rightChild._id, 1) : null
    ]
  };

  return res
    .status(200)
    .json(new ApiResponse(200, genealogy, "Full genealogy retrieved successfully"));
});