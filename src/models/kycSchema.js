// models/kycSchema.js
import mongoose, { Schema } from "mongoose";

const kycSchema = new Schema(
  {
    // Link to the User
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      unique: true, // Assuming one KYC record per user
      index: true
    },
    // KYC Information
    aadharNumber: {
      type: String,
      trim: true,
      sparse: true // Allows null values but enforces uniqueness for non-null values
    },
    aadharDocumentUrl: {
      type: String, // Stores the S3 URL
      trim: true
    },
    aadharDocumentKey: {
      type: String, // Stores the S3 key for potential deletion
      trim: true
    },
    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
      sparse: true
    },
    panDocumentUrl: {
      type: String,
      trim: true
    },
    panDocumentKey: {
      type: String,
      trim: true
    },
    additionalDocuments: [{
      url: String, // S3 URL
      key: String  // S3 Key
    }],
    // Verification Status
    verified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User" // Reference to admin user who verified
    },
    verifiedDate: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    // Status (derived from verified and rejectionReason)
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true
    }
  },
  { 
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'kycs' // Explicitly name the collection
  }
);

// Indexes for performance
kycSchema.index({ userId: 1, status: 1 });

// Middleware to update status based on other fields
kycSchema.pre('save', function(next) {
  if (this.isModified('verified')) {
    if (this.verified) {
      this.status = 'verified';
      this.verifiedDate = new Date();
      this.rejectionReason = null; // Clear reason if previously rejected
    } else if (this.rejectionReason) {
      this.status = 'rejected';
    } else {
      this.status = 'pending'; // If verified is false but no reason, it's pending
    }
  }
  next();
});

export const KYC = mongoose.model("KYC", kycSchema);