// models/matchingIncomeSchema.js - Individual Transaction-Based Income Model
import mongoose from 'mongoose';
const { Schema } = mongoose;

const matchingIncomeRecordSchema = new Schema({
  /* -------------------------------------------------------------------------- */
  /* 👤 USER WHO EARNS THIS INCOME                                             */
  /* -------------------------------------------------------------------------- */
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  /* -------------------------------------------------------------------------- */
  /* 📝 INCOME TYPE                                                            */
  /* -------------------------------------------------------------------------- */
  incomeType: {
    type: String,
    enum: ['personal_sale', 'matching_bonus'],
    required: true,
    index: true
  },

  /* -------------------------------------------------------------------------- */
  /* 🏠 PLOT DETAILS (For Personal Sale)                                      */
  /* -------------------------------------------------------------------------- */
  plotId: {
    type: Schema.Types.ObjectId,
    ref: 'Plot',
    index: true
  },
  plotNumber: String,
  saleAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  /* -------------------------------------------------------------------------- */
  /* 👥 BUYER DETAILS                                                          */
  /* -------------------------------------------------------------------------- */
  buyerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  buyerName: String,

  /* -------------------------------------------------------------------------- */
  /* 🤝 MATCHING BONUS DETAILS                                                */
  /* -------------------------------------------------------------------------- */
  // Which plot triggered this matching income
  triggeredByPlotId: {
    type: Schema.Types.ObjectId,
    ref: 'Plot'
  },
  triggeredByBuyerId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

  // Which leg this income came from
  legType: {
    type: String,
    enum: ['personal', 'left', 'right'],
    index: true
  },

  // Pairing information (the other leg's sale that paired with this)
  pairedWith: {
    plotId: { type: Schema.Types.ObjectId, ref: 'Plot' },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
    buyerName: String,
    amount: { type: Number, default: 0 },
    legType: { type: String, enum: ['left', 'right'] },
    saleDate: Date
  },

  // The balanced/matched amount
  balancedAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  /* -------------------------------------------------------------------------- */
  /* 💰 INCOME CALCULATION                                                     */
  /* -------------------------------------------------------------------------- */
  commissionPercentage: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },

  incomeAmount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },

  /* -------------------------------------------------------------------------- */
  /* 📅 DATE TRACKING                                                          */
  /* -------------------------------------------------------------------------- */
  saleDate: {
    type: Date,
    required: true,
    index: true
  },

  // Date when this income becomes eligible for approval (saleDate + 3 months)
  eligibleForApprovalDate: {
    type: Date,
    required: true,
    index: true
  },

  /* -------------------------------------------------------------------------- */
  /* ⚡ STATUS & APPROVAL                                                      */
  /* -------------------------------------------------------------------------- */
  status: {
    type: String,
    enum: ['pending', 'eligible', 'approved', 'credited', 'paid', 'rejected'],
    default: 'pending',
    index: true
  },

  approvedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  approvedAt: Date,

  rejectedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  rejectedAt: Date,
  rejectionReason: String,

  /* -------------------------------------------------------------------------- */
  /* 💳 PAYMENT TRACKING                                                       */
  /* -------------------------------------------------------------------------- */
  paymentDetails: {
    paidAmount: { type: Number, default: 0 },
    paidDate: Date,
    transactionId: String,
    paymentMode: {
      type: String,
      enum: ['bank_transfer', 'wallet', 'cheque', 'cash', 'upi']
    }
  },

  /* -------------------------------------------------------------------------- */
  /* 📝 NOTES                                                                  */
  /* -------------------------------------------------------------------------- */
  notes: String,
  adminNotes: String

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* -------------------------------------------------------------------------- */
/* 🔍 INDEXES                                                                 */
/* -------------------------------------------------------------------------- */
matchingIncomeRecordSchema.index({ userId: 1, saleDate: -1 });
matchingIncomeRecordSchema.index({ userId: 1, status: 1 });
matchingIncomeRecordSchema.index({ status: 1, eligibleForApprovalDate: 1 });
matchingIncomeRecordSchema.index({ incomeType: 1, saleDate: -1 });
matchingIncomeRecordSchema.index({ plotId: 1 });
matchingIncomeRecordSchema.index({ buyerId: 1 });
matchingIncomeRecordSchema.index({ triggeredByPlotId: 1 });

/* -------------------------------------------------------------------------- */
/* 🧮 VIRTUALS & METHODS                                                      */
/* -------------------------------------------------------------------------- */

// Check if income is eligible for approval
matchingIncomeRecordSchema.virtual('isEligibleForApproval').get(function() {
  return new Date() >= new Date(this.eligibleForApprovalDate);
});

// Days remaining until eligible for approval
matchingIncomeRecordSchema.virtual('daysUntilEligible').get(function() {
  const now = new Date();
  const eligibleDate = new Date(this.eligibleForApprovalDate);
  const diffTime = eligibleDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Auto-update status to 'eligible' when date passes
matchingIncomeRecordSchema.pre('save', function(next) {
  if (this.status === 'pending' && new Date() >= new Date(this.eligibleForApprovalDate)) {
    this.status = 'eligible';
  }
  next();
});

// Static method to update all pending records to eligible
matchingIncomeRecordSchema.statics.updateEligibleRecords = async function() {
  const now = new Date();
  const result = await this.updateMany(
    {
      status: 'pending',
      eligibleForApprovalDate: { $lte: now }
    },
    {
      $set: { status: 'eligible' }
    }
  );
  return result;
};

const MatchingIncomeRecord = mongoose.model('MatchingIncomeRecord', matchingIncomeRecordSchema);
export { MatchingIncomeRecord };