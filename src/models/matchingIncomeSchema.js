// models/matchingIncomeSchema.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const matchingIncomeRecordSchema = new Schema({
  // The user earning the matching income (sponsor/head)
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Cycle period for which this income is calculated
  cycleStartDate: {
    type: Date,
    required: true,
    immutable: true
  },
  cycleEndDate: {
    type: Date,
    required: true
  },

  // Left leg details
  leftLeg: {
    totalSales: { type: Number, default: 0, min: 0 },
    totalBookings: { type: Number, default: 0 },
    directMembers: [{
      memberId: { type: Schema.Types.ObjectId, ref: 'User' },
      memberName: String,
      sales: { type: Number, default: 0 }
    }],
    bookingDetails: [{
      plotId: { type: Schema.Types.ObjectId, ref: 'Plot' },
      buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
      buyerName: String,
      amount: { type: Number, default: 0 },
      bookingDate: Date
    }]
  },

  // Right leg details
  rightLeg: {
    totalSales: { type: Number, default: 0, min: 0 },
    totalBookings: { type: Number, default: 0 },
    directMembers: [{
      memberId: { type: Schema.Types.ObjectId, ref: 'User' },
      memberName: String,
      sales: { type: Number, default: 0 }
    }],
    bookingDetails: [{
      plotId: { type: Schema.Types.ObjectId, ref: 'Plot' },
      buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
      buyerName: String,
      amount: { type: Number, default: 0 },
      bookingDate: Date
    }]
  },

  // Balanced amount (can be zero if no pairing)
  balancedAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  // The weaker leg (left or right)
  weakerLeg: {
    type: String,
    enum: ['left', 'right', 'equal'],
    default: 'equal'
  },

  // Commission details
  commissionPercentage: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },

  // Matching income amount (auto-calculated)
  incomeAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  // Carry forward for next cycle
  carryForward: {
    left: { type: Number, default: 0 },
    right: { type: Number, default: 0 }
  },

  // Optional: Personal sale tracking
  personalSales: {
    totalSales: { type: Number, default: 0 },
    totalBookings: { type: Number, default: 0 },
    bookingDetails: [{
      plotId: { type: Schema.Types.ObjectId, ref: 'Plot' },
      amount: { type: Number, default: 0 },
      bookingDate: Date
    }]
  },

  // Record type
  incomeType: {
    type: String,
    enum: ['personal_sale', 'matching_bonus'],
    default: 'matching_bonus'
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'calculated', 'approved', 'credited', 'paid', 'archived'],
    default: 'calculated'
  },

  // Payment tracking
  paymentDetails: {
    paidAmount: { type: Number, default: 0 },
    paidDate: Date,
    transactionId: String,
    paymentMode: {
      type: String,
      enum: ['bank_transfer', 'wallet', 'cheque', 'cash', 'upi']
    }
  },

  // Admin approval
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,

  // Notes
  notes: String,
  adminNotes: String

}, { timestamps: true });

/* -------------------------------------------------------------------------- */
/* 🔍 INDEXES                                                                 */
/* -------------------------------------------------------------------------- */
matchingIncomeRecordSchema.index({ userId: 1, cycleStartDate: -1 });
matchingIncomeRecordSchema.index({ status: 1, cycleEndDate: -1 });
matchingIncomeRecordSchema.index({ userId: 1, status: 1 });
matchingIncomeRecordSchema.index({ cycleStartDate: 1, cycleEndDate: 1 });

/* -------------------------------------------------------------------------- */
/* 🧮 VIRTUALS & METHODS                                                      */
/* -------------------------------------------------------------------------- */
matchingIncomeRecordSchema.virtual('legBalanceRatio').get(function() {
  const left = this.leftLeg?.totalSales || 0;
  const right = this.rightLeg?.totalSales || 0;
  if (left === 0 && right === 0) return 0;
  const max = Math.max(left, right);
  const min = Math.min(left, right);
  return ((min / max) * 100).toFixed(2);
});

matchingIncomeRecordSchema.methods.hasPersonalSponsor = async function() {
  const User = mongoose.model('User');
  const user = await User.findById(this.userId).select('sponsorId');
  return !!user?.sponsorId;
};

const MatchingIncomeRecord = mongoose.model('MatchingIncomeRecord', matchingIncomeRecordSchema);
export { MatchingIncomeRecord };
