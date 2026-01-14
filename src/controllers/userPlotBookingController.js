// Updated controllers/userPlotBookingController.js
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Plot } from "../models/plotBooking.js";
import { User } from "../models/userSchema.js";
import { MatchingIncomeRecord } from "../models/matchingIncomeSchema.js";
import { LegBalance } from "../models/legBalanceSchema.js";

/* -------------------------------------------------------------------------- */
/* 💰 HELPER: Process Income for Installment Payment                          */
/* -------------------------------------------------------------------------- */
async function processInstallmentIncome(plot, installmentIndex, paymentAmount) {
  try {
    const buyerId = plot.bookingDetails?.buyerId;
    if (!buyerId) return;

    const buyer = await User.findById(buyerId)
      .select('_id username sponsorId position personalInfo')
      .lean();
    
    if (!buyer) return;

    const installment = plot.bookingDetails.paymentSchedule[installmentIndex];
    const plotNumber = plot.plotNumber;
    const totalPrice = plot.pricing?.totalPrice || 0;
    const paymentDate = new Date();

    // Calculate proportional income based on payment percentage
    const paymentPercentage = paymentAmount / totalPrice;
    const personalIncomeAmount = (paymentAmount * 5) / 100; // 5% of payment

    // Check if income record already exists for this installment
    const existingRecord = await MatchingIncomeRecord.findOne({
      userId: buyerId,
      plotId: plot._id,
      incomeType: 'personal_sale',
      'paymentDetails.installmentNumber': installment.installmentNumber
    });

    if (!existingRecord) {
      // Create new income record for this installment payment
      await MatchingIncomeRecord.create({
        userId: buyerId,
        incomeType: 'personal_sale',
        plotId: plot._id,
        plotNumber,
        buyerId: buyerId,
        buyerName: buyer.username || `${buyer.personalInfo?.firstName || ''} ${buyer.personalInfo?.lastName || ''}`.trim(),
        saleAmount: paymentAmount,
        legType: 'personal',
        commissionPercentage: 5,
        incomeAmount: personalIncomeAmount,
        saleDate: paymentDate,
        eligibleForApprovalDate: paymentDate,
        status: 'eligible',
        notes: `Installment ${installment.installmentNumber} payment income - ₹${paymentAmount.toLocaleString('en-IN')}`,
        paymentDetails: {
          installmentNumber: installment.installmentNumber,
          paymentType: 'installment',
          installmentAmount: paymentAmount
        }
      });

      console.log(`✅ Created personal sale income for installment ${installment.installmentNumber}: ₹${personalIncomeAmount.toLocaleString('en-IN')}`);
    }

    // Process matching income for sponsor
    if (buyer.sponsorId) {
      await processInstallmentMatching(
        buyer.sponsorId,
        buyerId,
        buyer.username || buyer.personalInfo?.firstName,
        buyer.position,
        plot._id,
        plotNumber,
        paymentAmount,
        paymentDate,
        installment.installmentNumber
      );
    }

    // Update installment income processed flag
    plot.bookingDetails.paymentSchedule[installmentIndex].incomeProcessed = true;
    await plot.save();

  } catch (err) {
    console.error('❌ Error processing installment income:', err);
  }
}

/* -------------------------------------------------------------------------- */
/* 🤝 HELPER: Process Matching Income for Installment                         */
/* -------------------------------------------------------------------------- */
async function processInstallmentMatching(sponsorId, buyerId, buyerName, buyerPosition, plotId, plotNumber, paymentAmount, paymentDate, installmentNumber, depth = 1) {
  try {
    if (depth > 10) return;

    const sponsor = await User.findById(sponsorId)
      .select('_id username sponsorId position personalInfo')
      .lean();

    if (!sponsor) return;

    // Get or create leg balance record
    const legBalance = await LegBalance.getOrCreate(sponsorId);
    const buyerLeg = buyerPosition || 'left';

    // Add this installment payment to the appropriate leg
    await legBalance.addSale(
      buyerLeg,
      plotId,
      buyerId,
      buyerName,
      paymentAmount,
      paymentDate,
      `${plotNumber}-INST-${installmentNumber}`
    );

    // Try to process matching
    const matchingResult = legBalance.processMatching();

    if (matchingResult.matched) {
      const incomeAmount = (matchingResult.matchedAmount * 5) / 100;
      
      legBalance.totalMatchingIncome += incomeAmount;
      await legBalance.save();

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
        saleAmount: paymentAmount,
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
        saleDate: paymentDate,
        eligibleForApprovalDate: paymentDate,
        status: 'eligible',
        notes: `Matching bonus from installment ${installmentNumber} payment - ₹${matchingResult.matchedAmount.toLocaleString('en-IN')} balanced`,
        paymentDetails: {
          installmentNumber,
          paymentType: 'installment'
        }
      });

      console.log(`✅ Matching income created for ${sponsor.username}: ₹${incomeAmount.toLocaleString('en-IN')}`);
    }

    // Continue up the chain
    if (sponsor.sponsorId) {
      await processInstallmentMatching(
        sponsor.sponsorId,
        buyerId,
        buyerName,
        buyerPosition,
        plotId,
        plotNumber,
        paymentAmount,
        paymentDate,
        installmentNumber,
        depth + 1
      );
    }
  } catch (err) {
    console.error('❌ Error in installment matching:', err);
  }
}

/* -------------------------------------------------------------------------- */
/* 🏡 USER: Get All Available Plots for Booking                               */
/* -------------------------------------------------------------------------- */
const getAvailablePlotsForUser = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    city,
    siteName,
    minPrice,
    maxPrice,
    facing,
    sortBy = "createdAt",
    sortOrder = "desc"
  } = req.query;

  const query = { isActive: true };

  if (city) query["siteLocation.address.city"] = new RegExp(city, "i");
  if (siteName) query["siteLocation.siteName"] = new RegExp(siteName, "i");
  if (facing) query["features.facing"] = facing.toLowerCase();

  if (minPrice || maxPrice) {
    query["pricing.totalPrice"] = {};
    if (minPrice) query["pricing.totalPrice"].$gte = Number(minPrice);
    if (maxPrice) query["pricing.totalPrice"].$lte = Number(maxPrice);
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const projection = {
    internalNotes: 0,
    mlm: 0,
    bookingDetails: 0,
    __v: 0
  };

  const plots = await Plot.find(query, projection)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Plot.countDocuments(query);

  return res.status(200).json({
    success: true,
    message: "Available plots fetched successfully",
    data: {
      plots,
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 🎯 USER: Book Plot (Pending Status)                                        */
/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */
/* 🎯 USER: Book Plot (Pending Status, Token = 0)                             */
/* -------------------------------------------------------------------------- */
const bookPlot = asyncHandler(async (req, res) => {
  const { plotId, paymentType = 'full', selectedPlanName = null } = req.body;
  if (!plotId) throw new ApiError(400, "Plot ID is required");

  const currentUser = await User.findById(req.user._id).select(
    "position sponsorId personalInfo.firstName personalInfo.lastName"
  );
  if (!currentUser) throw new ApiError(404, "User not found");

  const plot = await Plot.findById(plotId);
  if (!plot) throw new ApiError(404, "Plot not found");
  if (plot.status !== "available")
    throw new ApiError(400, "Plot is not available for booking");

  const buyerId = currentUser._id;
  const bookingType = currentUser.position
    ? `${currentUser.position}_team`
    : "self";

  // Validate payment type
  if (!['full', 'installment'].includes(paymentType)) {
    throw new ApiError(400, "Invalid payment type. Must be 'full' or 'installment'");
  }

  // For installment, validate selected plan
  let selectedPlan = null;
  let paymentSchedule = [];
  const totalPrice = plot.pricing?.totalPrice || 0;

  if (paymentType === 'installment') {
    if (!plot.installmentPlan?.enabled) {
      throw new ApiError(400, "Installment payment is not available for this plot");
    }

    // Find selected plan or use default
    if (selectedPlanName && plot.installmentPlan?.plans?.length > 0) {
      selectedPlan = plot.installmentPlan.plans.find(
        p => p.planName === selectedPlanName && p.isActive
      );
    }

    if (!selectedPlan && plot.installmentPlan?.plans?.length > 0) {
      selectedPlan = plot.installmentPlan.plans.find(p => p.isActive);
    }

    // If no predefined plan, create default based on settings
    if (!selectedPlan) {
      const downPaymentPercent = plot.installmentPlan?.minDownPaymentPercent || 20;
      const maxInstallments = plot.installmentPlan?.maxInstallments || 12;
      const interestRate = plot.installmentPlan?.installmentInterestRate || 0;
      
      const downPaymentAmount = (totalPrice * downPaymentPercent) / 100;
      const remainingAmount = totalPrice - downPaymentAmount;
      const totalWithInterest = remainingAmount * (1 + (interestRate / 100));
      const emiAmount = Math.ceil(totalWithInterest / maxInstallments);

      selectedPlan = {
        planName: 'Default Plan',
        numberOfInstallments: maxInstallments,
        downPaymentPercent,
        interestRate,
        emiAmount,
        totalPayableAmount: downPaymentAmount + (emiAmount * maxInstallments)
      };
    } else {
      const downPaymentAmount = (totalPrice * selectedPlan.downPaymentPercent) / 100;
      const remainingAmount = totalPrice - downPaymentAmount;
      const totalWithInterest = remainingAmount * (1 + ((selectedPlan.interestRate || 0) / 100));
      const emiAmount = selectedPlan.emiAmount || Math.ceil(totalWithInterest / selectedPlan.numberOfInstallments);

      selectedPlan = {
        ...selectedPlan,
        totalPayableAmount: downPaymentAmount + (emiAmount * selectedPlan.numberOfInstallments)
      };
    }

    // Generate payment schedule (will be finalized by admin)
    const downPaymentAmount = (totalPrice * selectedPlan.downPaymentPercent) / 100;
    const bookingDate = new Date();
    
    // First installment is down payment
    paymentSchedule.push({
      installmentNumber: 0,
      amount: downPaymentAmount,
      dueDate: bookingDate,
      status: 'pending',
      paidAmount: 0,
      notes: 'Down Payment'
    });

    // Remaining EMI installments
    for (let i = 1; i <= selectedPlan.numberOfInstallments; i++) {
      const dueDate = new Date(bookingDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      paymentSchedule.push({
        installmentNumber: i,
        amount: selectedPlan.emiAmount,
        dueDate,
        status: 'pending',
        paidAmount: 0,
        notes: `EMI ${i} of ${selectedPlan.numberOfInstallments}`
      });
    }
  } else {
    // Full payment - single installment
    paymentSchedule.push({
      installmentNumber: 1,
      amount: totalPrice,
      dueDate: new Date(),
      status: 'pending',
      paidAmount: 0,
      notes: 'Full Payment'
    });
  }

  // 🚫 Set tokenAmount = 0 until admin approval
  const calculatedTokenAmount = 0;

  // 🕒 Set status to pending instead of booked
  plot.status = "pending";
  plot.bookingDetails = {
    buyerId,
    bookingDate: new Date(),
    tokenAmount: calculatedTokenAmount,
    paymentType,
    selectedPlan: paymentType === 'installment' ? selectedPlan : null,
    paymentSchedule,
    totalPaidAmount: 0,
    remainingAmount: paymentType === 'installment' 
      ? (selectedPlan?.totalPayableAmount || totalPrice) 
      : totalPrice,
    paymentProgress: 0,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
  };

  await plot.save();

  return res.status(200).json({
    success: true,
    message: `Plot booking request submitted successfully for ${bookingType}`,
    data: {
      plot,
      bookingType,
      paymentType,
      selectedPlan: paymentType === 'installment' ? selectedPlan : null,
      paymentSchedule,
      buyerInfo: {
        id: buyerId,
        name: `${currentUser.personalInfo?.firstName || ""} ${currentUser.personalInfo?.lastName || ""}`.trim(),
        position: currentUser.position || "independent",
      },
    },
  });
});


/* -------------------------------------------------------------------------- */
/* 📊 USER: Get My Booked Plots (Self Bookings)                              */
/* -------------------------------------------------------------------------- */
const getMyBookedPlots = asyncHandler(async (req, res) => {
  const plots = await Plot.find({
    "bookingDetails.buyerId": req.user._id
  })
    .populate("bookingDetails.buyerId", "username email personalInfo.firstName personalInfo.lastName position")
    .sort({ "bookingDetails.bookingDate": -1 });

  return res.status(200).json({
    success: true,
    message: "Your booked plots fetched successfully",
    data: { plots, total: plots.length }
  });
});

/* -------------------------------------------------------------------------- */
/* 🡐 COMPANY-WIDE: Get ALL Left Team Plot Bookings                          */
/* -------------------------------------------------------------------------- */
const getLeftTeamBookings = asyncHandler(async (req, res) => {
  // ✅ Fetch all users across company with position = "left"
  const leftTeamUsers = await User.find({ position: "left" }).select("_id");

  if (leftTeamUsers.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No left team users found in company",
      data: { plots: [], total: 0 }
    });
  }

  const leftTeamUserIds = leftTeamUsers.map(user => user._id);

  // ✅ Fetch plots booked by any left team member
  const plots = await Plot.find({
    "bookingDetails.buyerId": { $in: leftTeamUserIds }
  })
    .populate("bookingDetails.buyerId", "username email personalInfo.firstName personalInfo.lastName memberId position")
    .sort({ "bookingDetails.bookingDate": -1 });

  return res.status(200).json({
    success: true,
    message: "Company-wide left team plot bookings fetched successfully",
    data: {
      plots,
      total: plots.length,
      teamMembers: leftTeamUserIds.length
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 🡒 COMPANY-WIDE: Get ALL Right Team Plot Bookings                         */
/* -------------------------------------------------------------------------- */
const getRightTeamBookings = asyncHandler(async (req, res) => {
  // ✅ Fetch all users across company with position = "right"
  const rightTeamUsers = await User.find({ position: "right" }).select("_id");

  if (rightTeamUsers.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No right team users found in company",
      data: { plots: [], total: 0 }
    });
  }

  const rightTeamUserIds = rightTeamUsers.map(user => user._id);

  // ✅ Fetch plots booked by any right team member
  const plots = await Plot.find({
    "bookingDetails.buyerId": { $in: rightTeamUserIds }
  })
    .populate("bookingDetails.buyerId", "username email personalInfo.firstName personalInfo.lastName memberId position")
    .sort({ "bookingDetails.bookingDate": -1 });

  return res.status(200).json({
    success: true,
    message: "Company-wide right team plot bookings fetched successfully",
    data: {
      plots,
      total: plots.length,
      teamMembers: rightTeamUserIds.length
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 🏢 COMPANY-WIDE: Combined Left + Right Plot Bookings                      */
/* -------------------------------------------------------------------------- */
const getAllTeamBookings = asyncHandler(async (req, res) => {
  const leftTeamUsers = await User.find({ position: "left" }).select("_id");
  const rightTeamUsers = await User.find({ position: "right" }).select("_id");

  const leftIds = leftTeamUsers.map(u => u._id);
  const rightIds = rightTeamUsers.map(u => u._id);
  const allTeamIds = [...leftIds, ...rightIds];

  if (allTeamIds.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No team members found in company",
      data: { plots: [], total: 0 }
    });
  }

  const plots = await Plot.find({
    "bookingDetails.buyerId": { $in: allTeamIds }
  })
    .populate("bookingDetails.buyerId", "username email personalInfo.firstName personalInfo.lastName memberId position")
    .sort({ "bookingDetails.bookingDate": -1 });

  const leftTeamPlots = plots.filter(p => p.bookingDetails?.buyerId?.position === "left");
  const rightTeamPlots = plots.filter(p => p.bookingDetails?.buyerId?.position === "right");

  return res.status(200).json({
    success: true,
    message: "Company-wide team plot bookings fetched successfully",
    data: {
      allPlots: plots,
      leftTeamPlots,
      rightTeamPlots,
      summary: {
        totalPlots: plots.length,
        leftTeamPlots: leftTeamPlots.length,
        rightTeamPlots: rightTeamPlots.length,
        leftTeamMembers: leftIds.length,
        rightTeamMembers: rightIds.length
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* ❌ USER: Cancel Plot Booking                                               */
/* -------------------------------------------------------------------------- */
const cancelPlotBooking = asyncHandler(async (req, res) => {
  const { plotId } = req.params;

  const plot = await Plot.findOne({
    _id: plotId,
    "bookingDetails.buyerId": req.user._id
  });

  if (!plot)
    throw new ApiError(404, "Plot booking not found or you don't have permission");
  if (plot.status !== "pending" && plot.status !== "booked")
    throw new ApiError(400, "Only pending or booked plots can be cancelled");

  // If pending, revert to available
  if (plot.status === "pending") {
    plot.status = "available";
    plot.bookingDetails = {};
  } else if (plot.status === "booked") {
    plot.status = "available";
    plot.bookingDetails = {};
  }

  await plot.save();

  return res.status(200).json({
    success: true,
    message: "Plot booking cancelled successfully",
    data: plot
  });
});

/* -------------------------------------------------------------------------- */
/* 💳 USER: Make Payment for Booked Plot                                      */
/* -------------------------------------------------------------------------- */
const makePlotPayment = asyncHandler(async (req, res) => {
  const { 
    plotId, 
    installmentNumber, 
    amount,
    paymentMode = 'cash',
    transactionId = '',
    notes = ''
  } = req.body;

  const plot = await Plot.findOne({
    _id: plotId,
    "bookingDetails.buyerId": req.user._id
  });

  if (!plot) throw new ApiError(404, "Plot booking not found");

  // Only allow payments if booking is approved
  if (plot.bookingDetails.status !== "approved") {
    throw new ApiError(400, "Cannot make payment for unapproved booking");
  }

  const installmentIndex = plot.bookingDetails.paymentSchedule.findIndex(
    (installment) => installment.installmentNumber === installmentNumber
  );

  if (installmentIndex === -1) throw new ApiError(400, "Installment not found");
  
  const installment = plot.bookingDetails.paymentSchedule[installmentIndex];
  
  if (installment.status === "paid")
    throw new ApiError(400, "Installment already paid");

  const paymentAmount = parseFloat(amount) || installment.amount;
  const previousPaid = installment.paidAmount || 0;
  const newPaidAmount = previousPaid + paymentAmount;
  const isPaid = newPaidAmount >= installment.amount;

  // Update installment
  plot.bookingDetails.paymentSchedule[installmentIndex] = {
    ...installment,
    paidDate: new Date(),
    paidAmount: newPaidAmount,
    status: isPaid ? "paid" : "partial",
    paymentMode,
    transactionId,
    transactionDate: new Date(),
    notes: notes || installment.notes
  };

  // Update total paid amount
  plot.bookingDetails.totalPaidAmount = (plot.bookingDetails.totalPaidAmount || 0) + paymentAmount;
  plot.bookingDetails.lastPaymentDate = new Date();
  
  // Calculate remaining amount
  const totalPayable = plot.bookingDetails.paymentType === 'installment'
    ? (plot.bookingDetails.selectedPlan?.totalPayableAmount || plot.pricing?.totalPrice)
    : plot.pricing?.totalPrice;
  
  plot.bookingDetails.remainingAmount = Math.max(0, totalPayable - plot.bookingDetails.totalPaidAmount);
  
  // Calculate payment progress
  plot.bookingDetails.paymentProgress = Math.min(100, 
    Math.round((plot.bookingDetails.totalPaidAmount / totalPayable) * 100)
  );

  // Find next due date
  const pendingInstallments = plot.bookingDetails.paymentSchedule
    .filter(i => i.status !== 'paid')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  
  if (pendingInstallments.length > 0) {
    plot.bookingDetails.nextDueDate = pendingInstallments[0].dueDate;
  } else {
    plot.bookingDetails.nextDueDate = null;
    // All payments complete - mark plot as sold
    plot.status = 'sold';
  }

  await plot.save();

  // 💰 Process income for this installment payment (for installment-based income)
  if (isPaid && !installment.incomeProcessed) {
    // Process income asynchronously to not block the response
    processInstallmentIncome(plot, installmentIndex, paymentAmount).catch(err => {
      console.error('Error processing installment income:', err);
    });
  }

  return res.status(200).json({
    success: true,
    message: isPaid ? "Payment completed successfully" : "Partial payment recorded",
    data: {
      plot,
      paymentSummary: {
        installmentNumber,
        amountPaid: paymentAmount,
        installmentStatus: isPaid ? 'paid' : 'partial',
        totalPaid: plot.bookingDetails.totalPaidAmount,
        remainingAmount: plot.bookingDetails.remainingAmount,
        paymentProgress: plot.bookingDetails.paymentProgress,
        nextDueDate: plot.bookingDetails.nextDueDate
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 📊 USER: Get Payment History for a Plot                                    */
/* -------------------------------------------------------------------------- */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const { plotId } = req.params;

  const plot = await Plot.findOne({
    _id: plotId,
    "bookingDetails.buyerId": req.user._id
  }).select('plotName plotNumber pricing bookingDetails');

  if (!plot) throw new ApiError(404, "Plot booking not found");

  const paymentSchedule = plot.bookingDetails?.paymentSchedule || [];
  const paidInstallments = paymentSchedule.filter(i => i.status === 'paid');
  const pendingInstallments = paymentSchedule.filter(i => i.status === 'pending' || i.status === 'partial');
  const overdueInstallments = paymentSchedule.filter(i => {
    if (i.status === 'paid') return false;
    return new Date(i.dueDate) < new Date();
  });

  return res.status(200).json({
    success: true,
    message: "Payment history fetched successfully",
    data: {
      plotInfo: {
        plotId: plot._id,
        plotName: plot.plotName,
        plotNumber: plot.plotNumber,
        totalPrice: plot.pricing?.totalPrice
      },
      paymentType: plot.bookingDetails?.paymentType || 'full',
      selectedPlan: plot.bookingDetails?.selectedPlan,
      paymentSchedule,
      summary: {
        totalInstallments: paymentSchedule.length,
        paidInstallments: paidInstallments.length,
        pendingInstallments: pendingInstallments.length,
        overdueInstallments: overdueInstallments.length,
        totalPaid: plot.bookingDetails?.totalPaidAmount || 0,
        remainingAmount: plot.bookingDetails?.remainingAmount || 0,
        paymentProgress: plot.bookingDetails?.paymentProgress || 0,
        nextDueDate: plot.bookingDetails?.nextDueDate
      }
    }
  });
});

export {
  getAvailablePlotsForUser,
  bookPlot,
  getMyBookedPlots,
  getLeftTeamBookings, // ✅ company-wide
  getRightTeamBookings, // ✅ company-wide
  getAllTeamBookings,   // ✅ company-wide
  cancelPlotBooking,
  makePlotPayment,
  getPaymentHistory
};