// models/plotBookingCarryForward.js - COMPLETE VERSION with Carry-Forward Balance Logic
import mongoose from 'mongoose';
import { MatchingIncomeRecord } from './matchingIncomeSchema.js';
import { LegBalance } from './legBalanceSchema.js';

const { Schema } = mongoose;


const plotSchema = new Schema({
  /* -------------------------------------------------------------------------- */
  /* 🏠 BASIC DETAILS                                                           */
  /* -------------------------------------------------------------------------- */
  plotName: { type: String, required: true, trim: true },
  plotNumber: { type: String, required: true, unique: true, trim: true },

  /* -------------------------------------------------------------------------- */
  /* 📏 SIZE & DIMENSIONS                                                      */
  /* -------------------------------------------------------------------------- */
  size: {
    value: { type: Number, required: true, min: [0, 'Size must be > 0'] },
    unit: {
      type: String,
      enum: ['sqft', 'sqm', 'sqyd', 'acre', 'hectare', 'gaj', 'bigha'],
      default: 'sqft'
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    unit: { type: String, enum: ['ft', 'm', 'yd'], default: 'ft' }
  },

  /* -------------------------------------------------------------------------- */
  /* 📍 LOCATION DETAILS                                                       */
  /* -------------------------------------------------------------------------- */
  siteLocation: {
    siteName: { type: String, required: true },
    phase: String,
    sector: String,
    block: String,
    address: {
      street: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, match: [/^\d{6}$/, 'Invalid pincode'] },
      country: { type: String, default: 'India' }
    },
    coordinates: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 }
    },
    googleMapsLink: String
  },

  /* -------------------------------------------------------------------------- */
  /* 💸 PRICING                                                                */
  /* -------------------------------------------------------------------------- */
  pricing: {
    basePrice: { type: Number, required: true, min: [0, 'Price > 0'] },
    pricePerUnit: Number,
    registrationCharges: Number,
    developmentCharges: Number,
    totalPrice: { type: Number, required: true, min: [0, 'Price > 0'] },
    currency: { type: String, default: 'INR' }
  },

  /* -------------------------------------------------------------------------- */
  /* 👥 MLM FIELDS                                                             */
  /* -------------------------------------------------------------------------- */
  mlm: {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    commissionTier: { type: Number, default: 1, min: 1 },
    commissionStructure: [
      {
        level: Number,
        percentage: { type: Number, min: 0, max: 100 },
        userId: { type: Schema.Types.ObjectId, ref: 'User' }
      }
    ],
    totalCommissionPaid: { type: Number, default: 0, min: 0 }
  },

  /* -------------------------------------------------------------------------- */
  /* 📊 STATUS                                                                 */
  /* -------------------------------------------------------------------------- */
  status: {
    type: String,
    enum: ['available', 'pending', 'booked', 'sold', 'hold', 'blocked', 'under_development'],
    default: 'available'
  },

  /* -------------------------------------------------------------------------- */
  /* 💼 FEATURES                                                               */
  /* -------------------------------------------------------------------------- */
  features: {
    facing: {
      type: String,
      enum: ['north', 'south', 'east', 'west', 'north-east', 'north-west', 'south-east', 'south-west']
    },
    cornerPlot: { type: Boolean, default: false },
    roadWidth: Number,
    electricityConnection: { type: Boolean, default: false },
    waterConnection: { type: Boolean, default: false },
    boundaryWall: { type: Boolean, default: false },
    gatedCommunity: { type: Boolean, default: false }
  },

  /* -------------------------------------------------------------------------- */
  /* 🏫 AMENITIES                                                              */
  /* -------------------------------------------------------------------------- */
  nearbyAmenities: [
    {
      name: String,
      distance: Number,
      type: {
        type: String,
        enum: ['school', 'hospital', 'market', 'metro', 'bus_stop', 'park', 'mall', 'other']
      }
    }
  ],

  /* -------------------------------------------------------------------------- */
  /* ⚖️ LEGAL                                                                 */
  /* -------------------------------------------------------------------------- */
  legal: {
    registryStatus: { type: String, enum: ['clear', 'pending', 'disputed'], default: 'pending' },
    registryNumber: String,
    approvalStatus: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending' },
    rera_approved: { type: Boolean, default: false },
    rera_number: String,
    documents: [
      {
        name: String,
        url: String,
        type: { type: String, enum: ['sale_deed', 'registry', 'noc', 'approval', 'map', 'other'] },
        uploadedAt: { type: Date, default: Date.now }
      }
    ]
  },

  /* -------------------------------------------------------------------------- */
  /* 🖼️ MEDIA                                                                 */
  /* -------------------------------------------------------------------------- */
  media: {
    images: [{ url: String, caption: String, isPrimary: { type: Boolean, default: false } }],
    videos: [{ url: String, caption: String }],
    virtualTourLink: String,
    brochureUrl: String
  },

  /* -------------------------------------------------------------------------- */
  /* 📅 BOOKING DETAILS                                                        */
  /* -------------------------------------------------------------------------- */
  bookingDetails: {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
    bookingDate: Date,
    tokenAmount: { type: Number, min: [0, 'Token ≥ 0'] },
    paymentSchedule: [
      {
        installmentNumber: Number,
        amount: Number,
        dueDate: Date,
        paidDate: Date,
        status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
        receiptNo: String,
        paymentMode: { type: String, enum: ['cash', 'cheque', 'rtgs', 'neft', 'upi', 'dd'], default: 'cash' },
        transactionId: String,
        transactionDate: Date,
        notes: String
      }
    ],
    totalPaidAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date
  },

  /* -------------------------------------------------------------------------- */
  /* 📝 META INFO                                                              */
  /* -------------------------------------------------------------------------- */
  description: { type: String, maxlength: 2000 },
  highlights: [String],
  internalNotes: String,
  isActive: { type: Boolean, default: true },
  views: { type: Number, default: 0 },
  inquiries: { type: Number, default: 0 }

}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

/* -------------------------------------------------------------------------- */
/* 🔍 INDEXES                                                                 */
/* -------------------------------------------------------------------------- */
plotSchema.index({ plotNumber: 1 });
plotSchema.index({ status: 1 });
plotSchema.index({ 'siteLocation.siteName': 1 });
plotSchema.index({ 'siteLocation.address.city': 1 });
plotSchema.index({ 'mlm.owner': 1 });
plotSchema.index({ createdAt: -1 });
plotSchema.index({ 'bookingDetails.buyerId': 1 });
plotSchema.index({ 'bookingDetails.status': 1 });

/* -------------------------------------------------------------------------- */
/* 🧮 VIRTUALS & METHODS                                                      */
/* -------------------------------------------------------------------------- */
plotSchema.virtual('sizeInSqft').get(function () {
  const conversions = { sqft: 1, sqm: 10.764, sqyd: 9, acre: 43560, hectare: 107639, gaj: 9, bigha: 27225 };
  return this.size?.value * (conversions[this.size?.unit] || 1);
});

plotSchema.methods.calculateCommission = function () {
  if (!this.mlm?.commissionStructure) return 0;
  return this.mlm.commissionStructure.reduce((sum, t) => sum + (this.pricing.totalPrice * t.percentage) / 100, 0);
};

/* -------------------------------------------------------------------------- */
/* ⚙️ PRE-SAVE: Auto Paid Marking                                            */
/* -------------------------------------------------------------------------- */
plotSchema.pre('save', function (next) {
  if (this.pricing?.totalPrice < this.pricing?.basePrice) {
    this.invalidate('pricing.totalPrice', 'Total price cannot be less than base price');
  }

  if (this.isModified('status') && this.status === 'booked') {
    if (Array.isArray(this.bookingDetails?.paymentSchedule)) {
      this.bookingDetails.paymentSchedule = this.bookingDetails.paymentSchedule.map((i) => ({
        ...i, status: 'paid', paidDate: new Date()
      }));
    }
    if (this.pricing?.totalPrice) this.bookingDetails.totalPaidAmount = this.pricing.totalPrice;
  }
  next();
});

/* -------------------------------------------------------------------------- */
/* 💰 POST-SAVE: Income Creation with Carry-Forward Logic                    */
/* -------------------------------------------------------------------------- */
plotSchema.post('save', async function (doc, next) {
  try {
    // Only trigger when booking is approved
    if (doc.bookingDetails?.status === 'approved' && doc.bookingDetails?.buyerId) {
      console.log(`\n🎯 Booking approved for plot ${doc.plotNumber}, creating income with carry-forward logic...`);

      const User = mongoose.model('User');
      const buyer = await User.findById(doc.bookingDetails.buyerId)
        .select('_id username sponsorId position personalInfo')
        .lean();

      if (!buyer) {
        console.log('⚠️ Buyer not found');
        return next();
      }

      const saleAmount = doc.pricing?.totalPrice || 0;
      const saleDate = new Date(doc.bookingDetails.bookingDate || doc.bookingDetails.approvedAt || new Date());

      // 1️⃣ Create PERSONAL SALE income record for the buyer
      await createPersonalSaleIncomeRecord(
        buyer._id,
        doc._id,
        doc.plotNumber,
        saleAmount,
        saleDate,
        buyer.username || buyer.personalInfo?.firstName
      );

      // 2️⃣ Process MATCHING BONUS with Carry-Forward for upline chain
      if (buyer.sponsorId) {
        await processCarryForwardMatching(
          buyer.sponsorId,
          buyer._id,
          buyer.username || buyer.personalInfo?.firstName,
          buyer.position,
          doc._id,
          doc.plotNumber,
          saleAmount,
          saleDate
        );
      }

      console.log(`✅ Income records created with carry-forward tracking for plot ${doc.plotNumber}`);
    }
  } catch (err) {
    console.error('❌ Error creating income records:', err);
  }
  next();
});

/* -------------------------------------------------------------------------- */
/* 🔧 HELPER FUNCTIONS - Carry-Forward Matching Logic                        */
/* -------------------------------------------------------------------------- */

/**
 * Create a personal sale income record (5% of sale)
 */
async function createPersonalSaleIncomeRecord(userId, plotId, plotNumber, saleAmount, saleDate, buyerName) {
  try {
    const incomeAmount = (saleAmount * 5) / 100;
    const eligibleDate = new Date(saleDate);
    eligibleDate.setMonth(eligibleDate.getMonth() + 3); // 3 months from sale date

    // Check if record already exists (prevent duplicates)
    const existing = await MatchingIncomeRecord.findOne({
      userId,
      plotId,
      incomeType: 'personal_sale'
    });

    if (existing) {
      console.log(`⚠️ Personal sale income already exists for plot ${plotNumber}`);
      return;
    }

    await MatchingIncomeRecord.create({
      userId,
      incomeType: 'personal_sale',
      plotId,
      plotNumber,
      buyerId: userId,
      buyerName,
      saleAmount,
      legType: 'personal',
      commissionPercentage: 5,
      incomeAmount,
      saleDate,
      eligibleForApprovalDate: eligibleDate,
      status: 'pending',
      notes: `Personal sale income from plot ${plotNumber}`
    });

    console.log(`✅ Personal sale record created: ₹${incomeAmount.toLocaleString('en-IN')} for ${buyerName}`);
  } catch (err) {
    console.error('❌ Error creating personal sale record:', err);
  }
}

/**
 * Process carry-forward matching for upline chain
 * This is the core logic that handles balance tracking and matching
 */
async function processCarryForwardMatching(sponsorId, buyerId, buyerName, buyerPosition, plotId, plotNumber, saleAmount, saleDate, depth = 1) {
  try {
    if (depth > 10) return; // Limit depth

    const User = mongoose.model('User');
    const sponsor = await User.findById(sponsorId)
      .select('_id username sponsorId position personalInfo')
      .lean();

    if (!sponsor) return;

    // Get or create leg balance record for this sponsor
    const legBalance = await LegBalance.getOrCreate(sponsorId);

    // Determine which leg this sale belongs to
    const buyerLeg = buyerPosition || 'left';

    console.log(`\n📊 Processing for ${sponsor.username}:`);
    console.log(`   Before: Left: ₹${legBalance.leftLeg.availableBalance.toLocaleString('en-IN')}, Right: ₹${legBalance.rightLeg.availableBalance.toLocaleString('en-IN')}`);

    // Add this new sale to the appropriate leg
    await legBalance.addSale(
      buyerLeg,
      plotId,
      buyerId,
      buyerName,
      saleAmount,
      saleDate,
      plotNumber
    );

    console.log(`   Added ₹${saleAmount.toLocaleString('en-IN')} to ${buyerLeg} leg`);
    console.log(`   After: Left: ₹${legBalance.leftLeg.availableBalance.toLocaleString('en-IN')}, Right: ₹${legBalance.rightLeg.availableBalance.toLocaleString('en-IN')}`);

    // Try to process matching
    const matchingResult = legBalance.processMatching();

    if (matchingResult.matched) {
      const incomeAmount = (matchingResult.matchedAmount * 5) / 100;
      
      // Update statistics
      legBalance.totalMatchingIncome += incomeAmount;
      await legBalance.save();

      const eligibleDate = new Date(saleDate);
      eligibleDate.setMonth(eligibleDate.getMonth() + 3);

      // Create matching income record with detailed pairing info
      const leftSaleInfo = matchingResult.leftUsed[0] || {};
      const rightSaleInfo = matchingResult.rightUsed[0] || {};

      await MatchingIncomeRecord.create({
        userId: sponsorId,
        incomeType: 'matching_bonus',
        triggeredByPlotId: plotId,
        plotNumber,
        triggeredByBuyerId: buyerId,
        buyerName,
        legType: buyerLeg,
        saleAmount,
        pairedWith: {
          plotId: buyerLeg === 'left' ? rightSaleInfo.plotId : leftSaleInfo.plotId,
          buyerId: buyerLeg === 'left' ? rightSaleInfo.buyerId : leftSaleInfo.buyerId,
          buyerName: buyerLeg === 'left' ? rightSaleInfo.buyerName : leftSaleInfo.buyerName,
          amount: buyerLeg === 'left' ? rightSaleInfo.amountUsed : leftSaleInfo.amountUsed,
          legType: buyerLeg === 'left' ? 'right' : 'left',
          saleDate: buyerLeg === 'left' ? rightSaleInfo.saleDate : leftSaleInfo.saleDate
        },
        balancedAmount: matchingResult.matchedAmount,
        commissionPercentage: 5,
        incomeAmount,
        saleDate,
        eligibleForApprovalDate: eligibleDate,
        status: 'pending',
        notes: `Matching bonus: ₹${matchingResult.matchedAmount.toLocaleString('en-IN')} balanced between legs. Remaining: Left ₹${matchingResult.remainingLeft.toLocaleString('en-IN')}, Right ₹${matchingResult.remainingRight.toLocaleString('en-IN')}`
      });

      console.log(`   ✅ MATCHED! Income: ₹${incomeAmount.toLocaleString('en-IN')} from ₹${matchingResult.matchedAmount.toLocaleString('en-IN')} balanced`);
      console.log(`   📦 Carry-Forward: Left: ₹${matchingResult.remainingLeft.toLocaleString('en-IN')}, Right: ₹${matchingResult.remainingRight.toLocaleString('en-IN')}`);
    } else {
      console.log(`   ⏳ No matching possible yet. Waiting for opposite leg sale.`);
    }

    // Continue up the chain
    if (sponsor.sponsorId) {
      await processCarryForwardMatching(
        sponsor.sponsorId,
        buyerId,
        buyerName,
        buyerPosition,
        plotId,
        plotNumber,
        saleAmount,
        saleDate,
        depth + 1
      );
    }
  } catch (err) {
    console.error('❌ Error in carry-forward matching:', err);
  }
}

/**
 * Get all downline members recursively
 */
async function getAllDownlineMembers(userId, position = null) {
  const User = mongoose.model('User');
  const members = [];
  const visited = new Set();

  const traverse = async (id, pos) => {
    if (visited.has(id.toString())) return;
    visited.add(id.toString());
    
    const query = { sponsorId: id };
    if (pos) query.position = pos;
    
    const children = await User.find(query).select('_id username position').lean();
    
    for (const child of children) {
      members.push(child);
      await traverse(child._id, null); // Get all descendants
    }
  };

  await traverse(userId, position);
  return members;
}

const Plot = mongoose.model('Plot', plotSchema);
export { Plot };