// userSchema.js
import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const UserSchema = new Schema(
  {
    // Authentication Fields
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6
    },
    username: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true
    },
    confirmPassword: {
      type: String
    },

    // Member Identification
    memberId: {
      type: String,
      unique: true,
      required: [true, "Member ID is required"],
      index: true
    },
    
    // Referral System - Updated for proper binary tree support
    sponsorId: {
      type: Schema.Types.ObjectId, // Changed from String to ObjectId for proper referencing
      ref: "User",
      default: null,
      index: true
    },
    referralCode: {
      type: String,
      unique: true,
      required: [true, "Referral code is required"],
    },
    referralLink: {
      type: String
    },
    position: { // For binary system (left or right)
      type: String,
      enum: ['left', 'right', null],
      default: null
    },

    // Personal Information
    personalInfo: {
      firstName: {
        type: String,
        trim: true
      },
      lastName: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        trim: true
      },
      dateOfBirth: {
        type: Date
      },
      address: String,
      profileImage: {
        type: String,
        default: null
      },
      propertyImages: [{
        type: String
      }]
    },

    // KYC Documents
    kyc: {
      aadharNumber: {
        type: String,
        sparse: true
      },
      aadharDocument: {
        type: String
      },
      panNumber: {
        type: String,
        uppercase: true,
        sparse: true
      },
      panDocument: {
        type: String
      },
      additionalDocuments: [{
        type: String
      }],
      verified: {
        type: Boolean,
        default: false
      },
      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
      },
      verifiedDate: {
        type: Date
      },
      rejectionReason: {
        type: String
      }
    },

    // Rank & Level System
    rank: {
      current: {
        type: String,
        enum: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crown Diamond"],
        default: "Bronze"
      },
      achievedDate: {
        type: Date,
        default: Date.now
      },
      history: [{
        rank: String,
        achievedDate: Date
      }]
    },

    // Financial Information
    wallet: {
      balance: {
        type: Number,
        default: 0,
        min: 0
      },
      totalEarnings: {
        type: Number,
        default: 0
      },
      totalWithdrawn: {
        type: Number,
        default: 0
      },
      pendingCommissions: {
        type: Number,
        default: 0
      }
    },

    bankDetails: {
      accountNumber: {
        type: String,
        trim: true
      },
      ifscCode: {
        type: String,
        uppercase: true,
        trim: true
      },
      accountHolderName: {
        type: String,
        trim: true
      },
      bankName: {
        type: String,
        trim: true
      },
      branch: {
        type: String,
        trim: true
      },
      upiId: {
        type: String,
        trim: true
      }
    },

    // Account Status
    status: {
      type: String,
      enum: ["pending", "active", "inactive", "suspended", "blocked"],
      default: "pending"
    },
    
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    
    emailVerificationToken: {
      type: String
    },
    
    emailVerificationExpiry: {
      type: Date
    },

    // Security
    role: {
      type: String,
      enum: ["user", "admin", "member"],
      default: "user"
    },
    
    refreshToken: {
      type: String
    },
    
    resetPasswordToken: {
      type: String
    },
    
    resetPasswordExpiry: {
      type: Date
    },

    // Admin Tracking
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    
    createdByAdmin: {
      type: Boolean,
      default: false
    },

    // Activity Tracking
    lastLogin: {
      type: Date
    },
    
    loginCount: {
      type: Number,
      default: 0
    },

    // Notifications
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: true
      }
    }
  },
  { 
    timestamps: true,
    collection: 'users'
  }
);

// Pre-validate middleware to generate memberId and referralCode if missing
UserSchema.pre("validate", function (next) {
  if (!this.memberId) {
    this.memberId = generateMemberId();
  }
  if (!this.referralCode) {
    this.referralCode = generateReferralCode();
  }
  if (!this.referralLink) {
    this.referralLink = `${process.env.FRONTEND_URL}/register?ref=${this.referralCode}`;
  }
  next();
});

// Pre-save middleware for password hashing
UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
    if (this.confirmPassword) {
      this.confirmPassword = await bcrypt.hash(this.confirmPassword, 10);
    }
  }
  next();
});

// Helper function for referral code (8 characters, alphanumeric)
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Helper function for member ID (unique identifier)
function generateMemberId() {
  return `MEM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// Methods
UserSchema.methods.isPasswordCorrect = async function (userPassword) {
  return await bcrypt.compare(userPassword, this.password);
};

UserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { 
      _id: this._id, 
      email: this.email,
      role: this.role,
      memberId: this.memberId
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

UserSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" }
  );
};

// Indexes for performance
UserSchema.index({ email: 1, memberId: 1 });
UserSchema.index({ sponsorId: 1, status: 1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ sponsorId: 1, position: 1 }); // Critical for binary tree operations

export const User = mongoose.model("User", UserSchema);