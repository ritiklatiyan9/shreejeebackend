// models/plotBooking.js
import mongoose from 'mongoose';
import { MatchingIncomeRecord } from './matchingIncomeSchema.js';

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
/* 💰 POST-SAVE: Matching Income Logic                                       */
/* -------------------------------------------------------------------------- */
plotSchema.post('save', async function (doc, next) {
  try {
    if (doc.bookingDetails?.status === 'approved' && doc.bookingDetails?.buyerId) {
      console.log(`\n🎯 Booking approved for plot ${doc.plotNumber}, triggering matching income...`);

      const buyer = await mongoose.model('User').findById(doc.bookingDetails.buyerId)
        .select('_id username sponsorId position')
        .lean();

      if (!buyer) return console.log('⚠️ Buyer not found');

      const bookingDate = new Date(doc.bookingDetails.bookingDate || doc.bookingDetails.approvedAt || new Date());
      const cycleStartDate = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), 1);
      const cycleEndDate = new Date(bookingDate.getFullYear(), bookingDate.getMonth() + 1, 0);
      cycleEndDate.setHours(23, 59, 59, 999);

      // Personal sale income for buyer
      await calculatePersonalSaleIncome(buyer._id, doc.pricing.totalPrice, cycleStartDate, cycleEndDate, doc._id, bookingDate);

      // Matching income for upline
      if (buyer.sponsorId) await calculateMatchingIncomeForUpline(buyer.sponsorId, cycleStartDate, cycleEndDate);
    }
  } catch (err) {
    console.error('❌ Error in auto-matching income:', err);
  }
  next();
});

/* -------------------------------------------------------------------------- */
/* 🔧 HELPER FUNCTIONS                                                       */
/* -------------------------------------------------------------------------- */

// Personal sale: 5%
async function calculatePersonalSaleIncome(userId, saleAmount, cycleStartDate, cycleEndDate, plotId, bookingDate) {
  const personalIncome = (saleAmount * 5) / 100;
// ✅ replace in calculatePersonalSaleIncome(...)
const existing = await MatchingIncomeRecord.findOne({
  userId,
  incomeType: 'personal_sale',
  cycleStartDate,          // exact
  cycleEndDate             // exact
});


  if (existing) {
    existing.personalSales.totalSales += saleAmount;
    existing.personalSales.totalBookings++;
    existing.personalSales.bookingDetails.push({ plotId, amount: saleAmount, bookingDate });
    existing.incomeAmount += personalIncome;
    await existing.save();
  } else {
    await MatchingIncomeRecord.create({
      userId, incomeType: 'personal_sale',
      cycleStartDate, cycleEndDate,
      personalSales: { totalSales: saleAmount, totalBookings: 1, bookingDetails: [{ plotId, amount: saleAmount, bookingDate }] },
      incomeAmount: personalIncome, commissionPercentage: 5.0, status: 'calculated'
    });
  }
}

// Recursive matching income
// Recursive Matching Income with Carry Forward (5% balanced, up to full upline chain)
// ✅ replace the whole body of calculateMatchingIncomeForUpline with this improved version
async function calculateMatchingIncomeForUpline(sponsorId, cycleStartDate, cycleEndDate, depth = 1) {
  try {
    const User = mongoose.model('User');
    const Plot = mongoose.model('Plot');
    if (depth > 10) return;

    const sponsor = await User.findById(sponsorId)
      .select('_id username sponsorId position')
      .lean();
    if (!sponsor) return;

    // All approved bookings within the cycle (inclusive)
    const bookings = await Plot.find({
      'bookingDetails.bookingDate': { $gte: cycleStartDate, $lte: cycleEndDate },
      'bookingDetails.status': 'approved'
    })
      .populate('bookingDetails.buyerId', '_id sponsorId position username')
      .select('bookingDetails pricing.totalPrice')
      .lean();

    // Build downlines
    const leftMembers = await getAllDownlineMembers(sponsorId, 'left');
    const rightMembers = await getAllDownlineMembers(sponsorId, 'right');
    const leftIds = new Set(leftMembers.map(m => m._id.toString()));
    const rightIds = new Set(rightMembers.map(m => m._id.toString()));

    // Tally sales + (optional) booking details
    let leftSales = 0, rightSales = 0, leftCount = 0, rightCount = 0;
    const leftBookingDetails = [];
    const rightBookingDetails = [];

    for (const plot of bookings) {
      const buyer = plot.bookingDetails?.buyerId;
      const buyerId = buyer?._id?.toString();
      if (!buyerId) continue;

      const amt = Number(plot.pricing?.totalPrice || 0);
      const bDate = plot.bookingDetails?.bookingDate || plot.bookingDetails?.approvedAt;

      if (leftIds.has(buyerId)) {
        leftSales += amt;
        leftCount += 1;
        leftBookingDetails.push({
          plotId: plot._id,
          buyerId: buyer._id,
          buyerName: buyer.username || '',
          amount: amt,
          bookingDate: bDate
        });
      } else if (rightIds.has(buyerId)) {
        rightSales += amt;
        rightCount += 1;
        rightBookingDetails.push({
          plotId: plot._id,
          buyerId: buyer._id,
          buyerName: buyer.username || '',
          amount: amt,
          bookingDate: bDate
        });
      }
    }

    const balanced = Math.min(leftSales, rightSales);
    const carryForward = {
      left: Math.max(leftSales - balanced, 0),
      right: Math.max(rightSales - balanced, 0)
    };
    const income = (balanced * 5) / 100;

    // ✅ exact-cycle filter; ✅ ALWAYS set left/right totals and cycle dates
    await MatchingIncomeRecord.findOneAndUpdate(
      {
        userId: sponsorId,
        incomeType: 'matching_bonus',
        cycleStartDate,
        cycleEndDate
      },
      {
        $set: {
          cycleStartDate,
          cycleEndDate,
          leftLeg: {
            totalSales: leftSales,
            totalBookings: leftCount,
            // keep previous details if you prefer; here we overwrite each cycle calc
            directMembers: [], // optionally compute per-direct-member sales if needed
            bookingDetails: leftBookingDetails
          },
          rightLeg: {
            totalSales: rightSales,
            totalBookings: rightCount,
            directMembers: [],
            bookingDetails: rightBookingDetails
          },
          balancedAmount: balanced,
          carryForward,
          incomeAmount: income,
          commissionPercentage: 5,
          status: 'calculated',
          weakerLeg:
            leftSales < rightSales ? 'left' :
            rightSales < leftSales ? 'right' : 'equal',
          notes: `Balanced ₹${balanced.toLocaleString('en-IN')} | Left ₹${leftSales.toLocaleString('en-IN')} | Right ₹${rightSales.toLocaleString('en-IN')}`
        }
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Matching income for ${sponsor.username} (L: ₹${leftSales}, R: ₹${rightSales}, Balanced: ₹${balanced}, Income: ₹${income})`);

    if (sponsor.sponsorId) {
      await calculateMatchingIncomeForUpline(sponsor.sponsorId, cycleStartDate, cycleEndDate, depth + 1);
    }
  } catch (err) {
    console.error('❌ Error in calculateMatchingIncomeForUpline:', err);
  }
}



// Downline traversal
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
      await traverse(child._id, null);
    }
  };

  await traverse(userId, position);
  return members;
}

const Plot = mongoose.model('Plot', plotSchema);
export { Plot };
