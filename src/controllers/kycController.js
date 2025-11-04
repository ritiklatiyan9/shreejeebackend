// controllers/kycController.js
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { KYC } from "../models/kycSchema.js";
import { User } from "../models/userSchema.js";
import { uploadToS3 } from "../utils/awsUtils.js";
import { extractKeyFromUrl } from "../utils/awsUtils.js"; // Needed for deletion
import { deleteFromS3 } from "../utils/awsUtils.js"; // Needed for deletion
import { upload } from '../middlewares/multer.js'; // Assumes memoryStorage
import multer from 'multer';

// --- Helper Functions ---

const validateDocumentType = (mimetype) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return allowedTypes.includes(mimetype);
};

const validateFileSize = (size) => {
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  return size <= maxSize;
};

const uploadDocumentToS3 = async (fileBuffer, originalName, folder) => {
  if (!validateDocumentType(fileBuffer.mimetype)) {
    throw new ApiError(400, `Invalid file type for ${originalName}. Only image files (jpeg, jpg, png, webp) are allowed.`);
  }
  if (!validateFileSize(fileBuffer.size)) {
    throw new ApiError(400, `File size for ${originalName} exceeds 5MB.`);
  }

  const uploadResult = await uploadToS3(
    fileBuffer.buffer,
    fileBuffer.originalname,
    fileBuffer.mimetype,
    folder
  );
  return { url: uploadResult.url, key: uploadResult.key };
};

// --- Controller Functions ---

/**
 * Submit or update KYC documents
 * Expects multipart/form-data with files and JSON data
 */
export const submitKYC = asyncHandler(async (req, res) => {
  // Use multer middleware to handle file uploads
  upload.fields([
    { name: 'aadharDocument', maxCount: 1 },
    { name: 'panDocument', maxCount: 1 },
    { name: 'additionalDocuments', maxCount: 5 } // Limit additional docs
  ])(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(new ApiResponse(400, null, "A file is too large. Maximum size is 5MB."));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json(new ApiResponse(400, null, "Unexpected field name in form data."));
      }
      console.error("Multer Error:", err);
      return res.status(400).json(new ApiResponse(400, null, `File upload error: ${err.message}`));
    } else if (err) {
      console.error("Multer Error:", err);
      return res.status(400).json(new ApiResponse(400, null, `File upload error: ${err.message}`));
    }

    const { aadharNumber, panNumber } = req.body;
    const { user } = req; // Assuming user is attached via auth middleware

    // Validate required text fields
    if (!aadharNumber || !panNumber) {
      throw new ApiError(400, "Aadhar Number and PAN Number are required.");
    }

    // Validate document files presence
    if (!req.files || !req.files.aadharDocument || !req.files.aadharDocument[0]) {
      throw new ApiError(400, "Aadhar Document is required.");
    }
    if (!req.files.panDocument || !req.files.panDocument[0]) {
      throw new ApiError(400, "PAN Document is required.");
    }

    // Upload documents to S3
    let aadharDocInfo, panDocInfo;
    const additionalDocInfos = [];

    try {
      aadharDocInfo = await uploadDocumentToS3(req.files.aadharDocument[0], 'aadhar', 'kyc-documents');
      panDocInfo = await uploadDocumentToS3(req.files.panDocument[0], 'pan', 'kyc-documents');

      if (req.files.additionalDocuments && req.files.additionalDocuments.length > 0) {
        for (const file of req.files.additionalDocuments) {
          const docInfo = await uploadDocumentToS3(file, 'additional', 'kyc-documents');
          additionalDocInfos.push(docInfo);
        }
      }
    } catch (uploadError) {
      console.error("S3 Upload Error:", uploadError);
      // Attempt to delete already uploaded files if one fails
      const uploadedKeys = [aadharDocInfo?.key, panDocInfo?.key, ...additionalDocInfos.map(d => d.key)].filter(k => k);
      for (const key of uploadedKeys) {
        try {
          await deleteFromS3(key);
        } catch (deleteErr) {
          console.error("Failed to delete uploaded file after error:", deleteErr);
        }
      }
      throw uploadError; // Re-throw the original error
    }

    // Find existing KYC or create new one
    let kyc = await KYC.findOne({ userId: user._id });

    if (kyc) {
      // Update existing KYC record
      // Delete old documents from S3 if they exist and are different
      const oldAadharKey = kyc.aadharDocumentKey;
      const oldPanKey = kyc.panDocumentKey;
      const oldAdditionalKeys = kyc.additionalDocuments.map(doc => doc.key);

      if (oldAadharKey && oldAadharKey !== aadharDocInfo.key) {
        try { await deleteFromS3(oldAadharKey); } catch (e) { console.error("Failed to delete old Aadhar doc:", e); }
      }
      if (oldPanKey && oldPanKey !== panDocInfo.key) {
        try { await deleteFromS3(oldPanKey); } catch (e) { console.error("Failed to delete old PAN doc:", e); }
      }
      for (const oldKey of oldAdditionalKeys) {
        if (oldKey && !additionalDocInfos.some(newDoc => newDoc.key === oldKey)) {
          try { await deleteFromS3(oldKey); } catch (e) { console.error("Failed to delete old additional doc:", e); }
        }
      }

      kyc.aadharNumber = aadharNumber;
      kyc.aadharDocumentUrl = aadharDocInfo.url;
      kyc.aadharDocumentKey = aadharDocInfo.key;
      kyc.panNumber = panNumber;
      kyc.panDocumentUrl = panDocInfo.url;
      kyc.panDocumentKey = panDocInfo.key;
      kyc.additionalDocuments = additionalDocInfos;
      kyc.verified = false; // Reset verification status
      kyc.rejectionReason = null; // Clear any previous rejection reason
      // Status will be updated by middleware based on verified flag
    } else {
      // Create new KYC record
      kyc = await KYC.create({
        userId: user._id,
        aadharNumber,
        aadharDocumentUrl: aadharDocInfo.url,
        aadharDocumentKey: aadharDocInfo.key,
        panNumber,
        panDocumentUrl: panDocInfo.url,
        panDocumentKey: panDocInfo.key,
        additionalDocuments: additionalDocInfos,
        verified: false,
        rejectionReason: null
      });
    }

    // Update user's KYC status reference (optional, for quick checks)
    await User.findByIdAndUpdate(user._id, {
      $set: { "kyc.verified": false } // Reset user's kyc.verified flag
    });

    const kycDetails = await KYC.findById(kyc._id).populate('userId', 'username email'); // Populate user info if needed

    return res.status(200).json(
      new ApiResponse(200, kycDetails, "KYC details submitted successfully")
    );
  });
});

/**
 * Get the current user's KYC status and details
 */
export const getKYCStatus = asyncHandler(async (req, res) => {
  const { user } = req; // Assuming user is attached via auth middleware

  const kyc = await KYC.findOne({ userId: user._id }).populate('userId', 'username email');

  if (!kyc) {
    // If no KYC record exists, return a default pending status object
    return res.status(200).json(
      new ApiResponse(200, {
        status: "not_submitted",
        verified: false,
        rejectionReason: null,
        aadharNumber: null,
        panNumber: null,
        aadharDocumentUrl: null,
        panDocumentUrl: null,
        additionalDocuments: [],
        createdAt: null,
        updatedAt: null
      }, "KYC not submitted yet")
    );
  }

  return res.status(200).json(
    new ApiResponse(200, kyc, "KYC status fetched successfully")
  );
});

/**
 * Admin: Verify a user's KYC
 */
export const verifyKYC = asyncHandler(async (req, res) => {
  const { user } = req; // The admin user
  const { userId } = req.params;

  if (user.role !== "admin") {
    throw new ApiError(403, "Access denied. Admin privileges required.");
  }

  const kyc = await KYC.findOne({ userId: userId });
  if (!kyc) {
    throw new ApiError(404, "KYC request not found for this user.");
  }

  // Check if required documents are present
  if (!kyc.aadharDocumentUrl || !kyc.panDocumentUrl || !kyc.aadharNumber || !kyc.panNumber) {
    throw new ApiError(400, "Cannot verify KYC: Required documents or information are missing.");
  }

  kyc.verified = true;
  kyc.verifiedBy = user._id;
  // Status will be updated by middleware
  await kyc.save();

  // Update the user's main kyc.verified flag for quick reference
  await User.findByIdAndUpdate(userId, { $set: { "kyc.verified": true } });

  const updatedKyc = await KYC.findById(kyc._id).populate('userId', 'username email');
  return res.status(200).json(new ApiResponse(200, updatedKyc, "KYC verified successfully"));
});

/**
 * Admin: Reject a user's KYC
 */
export const rejectKYC = asyncHandler(async (req, res) => {
  const { user } = req; // The admin user
  const { userId } = req.params;
  const { rejectionReason } = req.body;

  if (user.role !== "admin") {
    throw new ApiError(403, "Access denied. Admin privileges required.");
  }

  if (!rejectionReason) {
    throw new ApiError(400, "Rejection reason is required.");
  }

  const kyc = await KYC.findOne({ userId: userId });
  if (!kyc) {
    throw new ApiError(404, "KYC request not found for this user.");
  }

  kyc.verified = false;
  kyc.verifiedBy = user._id;
  kyc.rejectionReason = rejectionReason;
  // Status will be updated by middleware
  await kyc.save();

  // Update the user's main kyc.verified flag
  await User.findByIdAndUpdate(userId, { $set: { "kyc.verified": false } });

  const updatedKyc = await KYC.findById(kyc._id).populate('userId', 'username email');
  return res.status(200).json(new ApiResponse(200, updatedKyc, "KYC rejected successfully"));
});

/**
 * Admin: Get all pending KYC requests
 */
export const getPendingKYC = asyncHandler(async (req, res) => {
  const { user } = req; // The admin user
  const { page = 1, limit = 10 } = req.query;

  if (user.role !== "admin") {
    throw new ApiError(403, "Access denied. Admin privileges required.");
  }

  const pendingKYCs = await KYC.find({ status: 'pending' })
    .populate('userId', 'username email personalInfo.firstName personalInfo.lastName')
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const totalPending = await KYC.countDocuments({ status: 'pending' });

  return res.status(200).json(
    new ApiResponse(200, {
      kycs: pendingKYCs,
      totalPending,
      page: parseInt(page),
      limit: parseInt(limit)
    }, "Pending KYC requests fetched successfully")
  );
});

/**
 * Get a specific user's KYC details (Admin only)
 */
export const getUserKYC = asyncHandler(async (req, res) => {
  const { user } = req; // The requesting user
  const { userId } = req.params;

  if (user.role !== "admin") {
    // A user can only view their own KYC
    if (user._id.toString() !== userId) {
      throw new ApiError(403, "Access denied. You can only view your own KYC details.");
    }
  }

  const kyc = await KYC.findOne({ userId: userId }).populate('userId', 'username email');

  if (!kyc) {
    throw new ApiError(404, "KYC details not found for this user.");
  }

  return res.status(200).json(new ApiResponse(200, kyc, "KYC details fetched successfully"));
});