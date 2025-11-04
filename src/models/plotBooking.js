import mongoose from 'mongoose';

const { Schema } = mongoose;

const plotSchema = new Schema({
  // Basic Plot Details
  plotName: {
    type: String,
    required: [true, 'Plot name is required'],
    trim: true
  },
  plotNumber: {
    type: String,
    required: [true, 'Plot number is required'],
    unique: true,
    trim: true
  },

  // Size and Dimensions
  size: {
    value: {
      type: Number,
      required: [true, 'Size value is required'],
      min: [0, 'Size must be greater than 0']
    },
    unit: {
      type: String,
      enum: ['sqft', 'sqm', 'sqyd', 'acre', 'hectare', 'gaj', 'bigha'],
      default: 'sqft'
    }
  },

  dimensions: {
    length: { type: Number, min: [0, 'Length must be greater than 0'] },
    width: { type: Number, min: [0, 'Width must be greater than 0'] },
    unit: { type: String, enum: ['ft', 'm', 'yd'], default: 'ft' }
  },

  // Location Details
  siteLocation: {
    siteName: { type: String, required: [true, 'Site name is required'] },
    phase: String,
    sector: String,
    block: String,
    address: {
      street: String,
      city: { type: String, required: [true, 'City is required'] },
      state: { type: String, required: [true, 'State is required'] },
      pincode: { type: String, match: [/^\d{6}$/, 'Invalid pincode format'] },
      country: { type: String, default: 'India' }
    },
    coordinates: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 }
    },
    googleMapsLink: String
  },

  // Pricing
  pricing: {
    basePrice: { type: Number, required: true, min: [0, 'Price must be > 0'] },
    pricePerUnit: Number,
    registrationCharges: Number,
    developmentCharges: Number,
    totalPrice: { type: Number, required: true, min: [0, 'Price must be > 0'] },
    currency: { type: String, default: 'INR' }
  },

  // MLM Fields
  mlm: {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    commissionTier: { type: Number, default: 1, min: [1, 'Must be ≥ 1'] },
    commissionStructure: [
      {
        level: Number,
        percentage: { type: Number, min: 0, max: 100 },
        userId: { type: Schema.Types.ObjectId, ref: 'User' }
      }
    ],
    totalCommissionPaid: { type: Number, default: 0, min: [0, '≥ 0'] }
  },

  // Plot Status
  status: {
    type: String,
    enum: ['available', 'pending', 'booked', 'sold', 'hold', 'blocked', 'under_development'],
    default: 'available'
  },

  // Features
  features: {
    facing: {
      type: String,
      enum: ['north', 'south', 'east', 'west', 'north-east', 'north-west', 'south-east', 'south-west']
    },
    cornerPlot: { type: Boolean, default: false },
    roadWidth: { type: Number, min: [0, '≥ 0'] },
    electricityConnection: { type: Boolean, default: false },
    waterConnection: { type: Boolean, default: false },
    boundaryWall: { type: Boolean, default: false },
    gatedCommunity: { type: Boolean, default: false }
  },

  // Nearby Amenities
  nearbyAmenities: [
    {
      name: { type: String, required: true },
      distance: { type: Number, required: true, min: [0, '≥ 0'] },
      type: {
        type: String,
        enum: ['school', 'hospital', 'market', 'metro', 'bus_stop', 'park', 'mall', 'other']
      }
    }
  ],

  // Legal
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

  // Media
  media: {
    images: [
      { url: String, caption: String, isPrimary: { type: Boolean, default: false } }
    ],
    videos: [{ url: String, caption: String }],
    virtualTourLink: String,
    brochureUrl: String
  },

  // Booking Details
  bookingDetails: {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
    bookingDate: Date,
    // Changed tokenAmount to allow 0 as the minimum value
    tokenAmount: { type: Number, min: [0, 'Token amount cannot be negative'] },
    paymentSchedule: [
      {
        installmentNumber: Number,
        amount: { type: Number, min: [0, '≥ 0'] },
        dueDate: Date,
        paidDate: Date,
        status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' }
      }
    ],
    totalPaidAmount: { type: Number, default: 0, min: [0, '≥ 0'] },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date
  },

  // Description & Notes
  description: { type: String, maxlength: 2000 },
  highlights: [String],
  internalNotes: String,

  // Metadata
  isActive: { type: Boolean, default: true },
  views: { type: Number, default: 0, min: [0, '≥ 0'] },
  inquiries: { type: Number, default: 0, min: [0, '≥ 0'] }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
plotSchema.index({ plotNumber: 1 });
plotSchema.index({ status: 1 });
plotSchema.index({ 'siteLocation.siteName': 1 });
plotSchema.index({ 'siteLocation.address.city': 1 });
plotSchema.index({ 'mlm.owner': 1 });
plotSchema.index({ 'pricing.totalPrice': 1 });
plotSchema.index({ createdAt: -1 });
plotSchema.index({ 'bookingDetails.buyerId': 1 });
plotSchema.index({ 'bookingDetails.status': 1 });

// Virtual for converting to sqft
plotSchema.virtual('sizeInSqft').get(function () {
  if (!this.size) return 0;
  const conversions = {
    sqft: 1,
    sqm: 10.764,
    sqyd: 9,
    acre: 43560,
    hectare: 107639,
    gaj: 9,
    bigha: 27225
  };
  return this.size.value * (conversions[this.size.unit] || 1);
});

// Method to calculate total commission
plotSchema.methods.calculateCommission = function () {
  if (!this.mlm?.commissionStructure) return 0;
  let total = 0;
  this.mlm.commissionStructure.forEach(tier => {
    if (tier.percentage && this.pricing?.totalPrice) {
      total += (this.pricing.totalPrice * tier.percentage) / 100;
    }
  });
  return total;
};

// Static finders
plotSchema.statics.findAvailablePlots = function (filters = {}) {
  return this.find({ status: 'available', isActive: true, ...filters });
};

plotSchema.statics.findByOwner = function (ownerId) {
  return this.find({ 'mlm.owner': ownerId, isActive: true });
};

plotSchema.statics.findByBuyer = function (buyerId) {
  return this.find({ 'bookingDetails.buyerId': buyerId, isActive: true });
};

plotSchema.statics.findBySite = function (siteName, city) {
  const query = { 'siteLocation.siteName': new RegExp(siteName, 'i') };
  if (city) query['siteLocation.address.city'] = new RegExp(city, 'i');
  return this.find(query);
};

// ✅ Pre-save middleware for validation & auto payment completion
plotSchema.pre('save', function (next) {
  // Validate pricing consistency
  if (this.pricing && this.pricing.totalPrice < this.pricing.basePrice) {
    this.invalidate('pricing.totalPrice', 'Total price cannot be less than base price');
  }

  // 🔹 Auto mark all payments as "paid" when plot status becomes "booked"
  if (this.isModified('status') && this.status === 'booked') {
    if (this.bookingDetails && Array.isArray(this.bookingDetails.paymentSchedule)) {
      this.bookingDetails.paymentSchedule = this.bookingDetails.paymentSchedule.map((installment) => ({
        ...installment,
        status: 'paid',
        paidDate: new Date(),
      }));
    }

    // Also update totalPaidAmount to full totalPrice
    if (this.pricing?.totalPrice) {
      this.bookingDetails.totalPaidAmount = this.pricing.totalPrice;
    }
  }

  next();
});

const Plot = mongoose.model('Plot', plotSchema);

export { Plot };