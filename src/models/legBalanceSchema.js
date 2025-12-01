// models/legBalanceSchema.js - Track Remaining Balances for Matching
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * This model tracks the remaining/unmatched balance for each user's legs
 * When a sale happens and there's no opposite leg sale to match, or when
 * one leg has more than the other, the remaining amount is stored here
 * for future matching opportunities
 */
const legBalanceSchema = new Schema({
  /* -------------------------------------------------------------------------- */
  /* 👤 USER (Sponsor/Upline)                                                  */
  /* -------------------------------------------------------------------------- */
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  /* -------------------------------------------------------------------------- */
  /* 💰 LEFT LEG BALANCE                                                       */
  /* -------------------------------------------------------------------------- */
  leftLeg: {
    // Total sales in left leg
    totalSales: {
      type: Number,
      default: 0,
      min: 0
    },
    // Amount already matched/used
    matchedAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    // Remaining balance available for matching
    availableBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    // Track individual unmatched sales
    unmatchedSales: [
      {
        plotId: { type: Schema.Types.ObjectId, ref: 'Plot' },
        buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
        buyerName: String,
        totalAmount: Number,
        usedAmount: { type: Number, default: 0 },
        remainingAmount: Number,
        saleDate: Date,
        plotNumber: String
      }
    ]
  },

  /* -------------------------------------------------------------------------- */
  /* 💰 RIGHT LEG BALANCE                                                      */
  /* -------------------------------------------------------------------------- */
  rightLeg: {
    // Total sales in right leg
    totalSales: {
      type: Number,
      default: 0,
      min: 0
    },
    // Amount already matched/used
    matchedAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    // Remaining balance available for matching
    availableBalance: {
      type: Number,
      default: 0,
      min: 0
    },
    // Track individual unmatched sales
    unmatchedSales: [
      {
        plotId: { type: Schema.Types.ObjectId, ref: 'Plot' },
        buyerId: { type: Schema.Types.ObjectId, ref: 'User' },
        buyerName: String,
        totalAmount: Number,
        usedAmount: { type: Number, default: 0 },
        remainingAmount: Number,
        saleDate: Date,
        plotNumber: String
      }
    ]
  },

  /* -------------------------------------------------------------------------- */
  /* 📊 STATISTICS                                                             */
  /* -------------------------------------------------------------------------- */
  totalMatchedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalMatchingIncome: {
    type: Number,
    default: 0,
    min: 0
  },

  lastMatchedDate: Date,
  matchingCount: {
    type: Number,
    default: 0
  }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/* -------------------------------------------------------------------------- */
/* 🔍 INDEXES                                                                 */
/* -------------------------------------------------------------------------- */
legBalanceSchema.index({ userId: 1 }, { unique: true });

/* -------------------------------------------------------------------------- */
/* 🧮 VIRTUALS                                                                */
/* -------------------------------------------------------------------------- */

// Get the leg with lower balance (for carry-forward display)
legBalanceSchema.virtual('weakerLeg').get(function() {
  if (this.leftLeg.availableBalance < this.rightLeg.availableBalance) {
    return {
      leg: 'left',
      balance: this.leftLeg.availableBalance
    };
  } else {
    return {
      leg: 'right',
      balance: this.rightLeg.availableBalance
    };
  }
});

// Get the leg with higher balance (carry-forward candidate)
legBalanceSchema.virtual('strongerLeg').get(function() {
  if (this.leftLeg.availableBalance > this.rightLeg.availableBalance) {
    return {
      leg: 'left',
      balance: this.leftLeg.availableBalance,
      carryForward: this.leftLeg.availableBalance - this.rightLeg.availableBalance
    };
  } else {
    return {
      leg: 'right',
      balance: this.rightLeg.availableBalance,
      carryForward: this.rightLeg.availableBalance - this.leftLeg.availableBalance
    };
  }
});

/* -------------------------------------------------------------------------- */
/* 📝 METHODS                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Add a new sale to the appropriate leg
 */
legBalanceSchema.methods.addSale = function(leg, plotId, buyerId, buyerName, amount, saleDate, plotNumber) {
  const legData = leg === 'left' ? this.leftLeg : this.rightLeg;
  
  legData.totalSales += amount;
  legData.availableBalance += amount;
  legData.unmatchedSales.push({
    plotId,
    buyerId,
    buyerName,
    totalAmount: amount,
    usedAmount: 0,
    remainingAmount: amount,
    saleDate,
    plotNumber
  });
  
  return this.save();
};

/**
 * Process matching between legs and return matched amount
 */
legBalanceSchema.methods.processMatching = function() {
  const leftBalance = this.leftLeg.availableBalance;
  const rightBalance = this.rightLeg.availableBalance;
  
  if (leftBalance === 0 || rightBalance === 0) {
    return {
      matched: false,
      matchedAmount: 0,
      leftUsed: [],
      rightUsed: []
    };
  }
  
  const matchedAmount = Math.min(leftBalance, rightBalance);
  
  // Track which sales were used
  const leftUsed = this._consumeBalance('left', matchedAmount);
  const rightUsed = this._consumeBalance('right', matchedAmount);
  
  // Update matched amounts
  this.leftLeg.matchedAmount += leftUsed.totalUsed;
  this.rightLeg.matchedAmount += rightUsed.totalUsed;
  
  // Update available balances
  this.leftLeg.availableBalance -= leftUsed.totalUsed;
  this.rightLeg.availableBalance -= rightUsed.totalUsed;
  
  // Update statistics
  this.totalMatchedAmount += matchedAmount;
  this.lastMatchedDate = new Date();
  this.matchingCount += 1;
  
  return {
    matched: true,
    matchedAmount,
    leftUsed: leftUsed.sales,
    rightUsed: rightUsed.sales,
    remainingLeft: this.leftLeg.availableBalance,
    remainingRight: this.rightLeg.availableBalance
  };
};

/**
 * Internal method to consume balance from a leg
 * Returns array of sales used and how much was used from each
 */
legBalanceSchema.methods._consumeBalance = function(leg, amountNeeded) {
  const legData = leg === 'left' ? this.leftLeg : this.rightLeg;
  let remaining = amountNeeded;
  const usedSales = [];
  let totalUsed = 0;
  
  // Process unmatched sales in order (FIFO - First In First Out)
  for (const sale of legData.unmatchedSales) {
    if (remaining <= 0) break;
    if (sale.remainingAmount <= 0) continue;
    
    const amountToUse = Math.min(sale.remainingAmount, remaining);
    
    sale.usedAmount += amountToUse;
    sale.remainingAmount -= amountToUse;
    remaining -= amountToUse;
    totalUsed += amountToUse;
    
    usedSales.push({
      plotId: sale.plotId,
      plotNumber: sale.plotNumber,
      buyerId: sale.buyerId,
      buyerName: sale.buyerName,
      amountUsed: amountToUse,
      remainingAmount: sale.remainingAmount,
      saleDate: sale.saleDate
    });
  }
  
  // Clean up fully used sales (optional - keep for history)
  // legData.unmatchedSales = legData.unmatchedSales.filter(s => s.remainingAmount > 0);
  
  return {
    sales: usedSales,
    totalUsed
  };
};

/**
 * Get summary of leg balances
 */
legBalanceSchema.methods.getSummary = function() {
  return {
    userId: this.userId,
    leftLeg: {
      totalSales: this.leftLeg.totalSales,
      matchedAmount: this.leftLeg.matchedAmount,
      availableBalance: this.leftLeg.availableBalance,
      unmatchedSalesCount: this.leftLeg.unmatchedSales.filter(s => s.remainingAmount > 0).length
    },
    rightLeg: {
      totalSales: this.rightLeg.totalSales,
      matchedAmount: this.rightLeg.matchedAmount,
      availableBalance: this.rightLeg.availableBalance,
      unmatchedSalesCount: this.rightLeg.unmatchedSales.filter(s => s.remainingAmount > 0).length
    },
    totalMatchedAmount: this.totalMatchedAmount,
    totalMatchingIncome: this.totalMatchingIncome,
    matchingCount: this.matchingCount,
    carryForward: {
      leg: this.strongerLeg.leg,
      amount: this.strongerLeg.carryForward
    }
  };
};

/**
 * Static method to get or create balance record for a user
 */
legBalanceSchema.statics.getOrCreate = async function(userId) {
  let balance = await this.findOne({ userId });
  
  if (!balance) {
    balance = await this.create({
      userId,
      leftLeg: {
        totalSales: 0,
        matchedAmount: 0,
        availableBalance: 0,
        unmatchedSales: []
      },
      rightLeg: {
        totalSales: 0,
        matchedAmount: 0,
        availableBalance: 0,
        unmatchedSales: []
      },
      totalMatchedAmount: 0,
      totalMatchingIncome: 0,
      matchingCount: 0
    });
  }
  
  return balance;
};

const LegBalance = mongoose.model('LegBalance', legBalanceSchema);
export { LegBalance };