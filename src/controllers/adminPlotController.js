import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Plot } from "../models/plotBooking.js";
import { User } from "../models/userSchema.js";


/* -------------------------------------------------------------------------- */
/* ⏳ ADMIN: GET ALL PENDING BOOKINGS                                         */
/* -------------------------------------------------------------------------- */
const getPendingBookings = asyncHandler(async (req, res) => {
  const plots = await Plot.find({ status: "pending" })
    .populate(
      "bookingDetails.buyerId",
      "username email personalInfo.firstName personalInfo.lastName position"
    )
    .sort({ "bookingDetails.bookingDate": -1 });

  return res.status(200).json({
    success: true,
    message: "Pending bookings fetched successfully",
    data: { plots, total: plots.length },
  });
});

/* -------------------------------------------------------------------------- */
/* 🏗️ ADMIN: CREATE A SINGLE PLOT                                            */
/* -------------------------------------------------------------------------- */
const createPlot = asyncHandler(async (req, res) => {
  const {
    plotName,
    plotNumber,
    size,
    dimensions,
    siteLocation,
    pricing,
    features,
    nearbyAmenities,
    legal,
    media,
    description,
    highlights,
    internalNotes,
  } = req.body;

  if (!plotName || !plotNumber || !size || !siteLocation || !pricing) {
    throw new ApiError(400, "All required fields must be provided");
  }

  const existing = await Plot.findOne({ plotNumber });
  if (existing) throw new ApiError(400, "Plot number already exists");

  const plot = await Plot.create({
    plotName,
    plotNumber,
    size,
    dimensions,
    siteLocation,
    pricing,
    features,
    nearbyAmenities,
    legal,
    media,
    description,
    highlights,
    internalNotes,
    mlm: {
      owner: req.user._id,
      referredBy: req.user.sponsorId,
      commissionTier: 1,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Plot created successfully",
    data: plot,
  });
});

/* -------------------------------------------------------------------------- */
/* 📦 ADMIN: BULK CREATE MULTIPLE PLOTS                                       */
/* -------------------------------------------------------------------------- */
const bulkCreatePlots = asyncHandler(async (req, res) => {
  const {
    basePlotData,
    plotCount,
    startPlotNumber,
    numberPattern = "sequential", // sequential or custom
    pricingVariation = 0, // percentage ± variation
  } = req.body;

  if (!basePlotData || !plotCount || plotCount <= 0) {
    throw new ApiError(400, "Base plot data and plot count are required");
  }

  const plotsToCreate = [];

  for (let i = 0; i < plotCount; i++) {
    const plotNumber =
      numberPattern === "sequential"
        ? `${startPlotNumber}${i + 1}`
        : `${basePlotData.plotNumber}${i + 1}`;

    let adjustedPricing = { ...basePlotData.pricing };
    if (pricingVariation > 0) {
      const variation =
        1 + (Math.random() * pricingVariation * 2 - pricingVariation) / 100;
      adjustedPricing = {
        ...basePlotData.pricing,
        basePrice: Math.round(basePlotData.pricing.basePrice * variation),
        totalPrice: Math.round(basePlotData.pricing.totalPrice * variation),
      };
    }

    plotsToCreate.push({
      ...basePlotData,
      plotName: `${basePlotData.plotName} ${i + 1}`,
      plotNumber,
      pricing: adjustedPricing,
      mlm: {
        owner: req.user._id,
        referredBy: req.user.sponsorId,
        commissionTier: 1,
      },
    });
  }

  const created = await Plot.insertMany(plotsToCreate);

  return res.status(201).json({
    success: true,
    message: `${created.length} plots created successfully`,
    data: created,
  });
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: UPDATE PLOT DETAILS                                             */
/* -------------------------------------------------------------------------- */
const updatePlot = asyncHandler(async (req, res) => {
  const { plotId } = req.params;
  const updateData = req.body;

  const plot = await Plot.findByIdAndUpdate(plotId, updateData, {
    new: true,
    runValidators: true,
  });

  if (!plot) throw new ApiError(404, "Plot not found");

  return res.status(200).json({
    success: true,
    message: "Plot updated successfully",
    data: plot,
  });
});

/* -------------------------------------------------------------------------- */
/* 🗑️ ADMIN: DELETE (SOFT DELETE) PLOT                                       */
/* -------------------------------------------------------------------------- */
const deletePlot = asyncHandler(async (req, res) => {
  const { plotId } = req.params;

  const plot = await Plot.findByIdAndUpdate(
    plotId,
    { isActive: false },
    { new: true }
  );

  if (!plot) throw new ApiError(404, "Plot not found");

  return res.status(200).json({
    success: true,
    message: "Plot deleted successfully (soft delete)",
  });
});

/* -------------------------------------------------------------------------- */
/* 📊 ADMIN: GET ALL PLOTS (FILTERABLE + PAGINATED)                           */
/* -------------------------------------------------------------------------- */
const getAllPlots = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    city,
    siteName,
    minPrice,
    maxPrice,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const query = { isActive: true };

  if (status) query.status = status;
  if (city) query["siteLocation.address.city"] = new RegExp(city, "i");
  if (siteName) query["siteLocation.siteName"] = new RegExp(siteName, "i");
  if (minPrice || maxPrice) {
    query["pricing.totalPrice"] = {};
    if (minPrice) query["pricing.totalPrice"].$gte = Number(minPrice);
    if (maxPrice) query["pricing.totalPrice"].$lte = Number(maxPrice);
  }

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const plots = await Plot.find(query)
    .populate("mlm.owner", "username email personalInfo.firstName")
    .populate("bookingDetails.buyerId", "username email personalInfo.firstName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Plot.countDocuments(query);

  return res.status(200).json({
    success: true,
    data: {
      plots,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
});
const getAllBookings = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    buyerId,
    plotId,
    position,
    sortBy = "bookingDetails.bookingDate",
    sortOrder = "desc",
  } = req.query;

  const query = {
    "bookingDetails.buyerId": { $exists: true, $ne: null },
    isActive: true,
  };

  if (status) query["bookingDetails.status"] = status;
  if (buyerId) query["bookingDetails.buyerId"] = buyerId;
  if (plotId) query["_id"] = plotId;

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  let plots = await Plot.find(query)
    .populate({
      path: "bookingDetails.buyerId",
      select: "username email personalInfo position", // ✅ include position
    })
    .populate("mlm.owner", "username email personalInfo.firstName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(Number(limit));

  // ✅ FIXED: Filter using buyerId.position
  if (position) {
    plots = plots.filter(
      (plot) => plot.bookingDetails?.buyerId?.position === position
    );
  }

  const total = await Plot.countDocuments(query);

  return res.status(200).json({
    success: true,
    message: "Bookings fetched successfully",
    data: {
      bookings: plots,
      total: position ? plots.length : total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
});


const getTeamBookingsStats = asyncHandler(async (req, res) => {
  const query = {
    "bookingDetails.buyerId": { $exists: true, $ne: null },
    "bookingDetails.status": "approved", // Only count approved bookings
    isActive: true,
  };

  const allBookings = await Plot.find(query)
    .populate({
      path: "bookingDetails.buyerId",
      select: "personalInfo position", // ✅ Added 'position' to select
    })
    .select("bookingDetails pricing");

  // ✅ FIXED: position is at root level, not inside personalInfo
  const leftTeam = allBookings.filter(
    (plot) => plot.bookingDetails?.buyerId?.position === "left"
  );
  
  const rightTeam = allBookings.filter(
    (plot) => plot.bookingDetails?.buyerId?.position === "right"
  );

  // Calculate collections
  const calculateCollection = (bookings) =>
    bookings.reduce(
      (total, plot) => total + (plot.bookingDetails?.totalPaidAmount || 0),
      0
    );

  const leftCollection = calculateCollection(leftTeam);
  const rightCollection = calculateCollection(rightTeam);
  const totalCollection = calculateCollection(allBookings);

  return res.status(200).json({
    success: true,
    message: "Team bookings statistics fetched successfully",
    data: {
      total: {
        bookings: allBookings.length,
        collection: totalCollection,
      },
      left: {
        bookings: leftTeam.length,
        collection: leftCollection,
      },
      right: {
        bookings: rightTeam.length,
        collection: rightCollection,
      },
    },
  });
});

/* -------------------------------------------------------------------------- */
/* 🔍 ADMIN: GET PLOT BY ID                                                  */
/* -------------------------------------------------------------------------- */
const getPlotById = asyncHandler(async (req, res) => {
  const { plotId } = req.params;

  const plot = await Plot.findById(plotId)
    .populate("mlm.owner", "username email personalInfo.firstName")
    .populate("bookingDetails.buyerId", "username email personalInfo.firstName")
    .populate("mlm.commissionStructure.userId", "username email");

  if (!plot) throw new ApiError(404, "Plot not found");

  return res.status(200).json({
    success: true,
    data: plot,
  });
});

const approvePlotBooking = asyncHandler(async (req, res) => {
  const { plotId } = req.params;
  const plot = await Plot.findById(plotId);
  if (!plot) throw new ApiError(404, "Plot not found");
  if (plot.status !== "pending")
    throw new ApiError(400, "Plot booking is not in pending state");

  const {
    // New payment details from admin form
    paymentDetails = [], // Array of objects for each installment
    totalPaidAmount = 0,
    // Optionally, you can also let admin set the final status
    finalStatus = "booked"
  } = req.body;

  // ✅ Approve the booking
  plot.status = finalStatus; // Can be 'booked' or 'sold' etc.
  plot.bookingDetails.status = "approved";
  plot.bookingDetails.approvedBy = req.user._id;
  plot.bookingDetails.approvedAt = new Date();

  // 💰 Update payment details if provided
  if (Array.isArray(paymentDetails) && paymentDetails.length > 0) {
    plot.bookingDetails.paymentSchedule = paymentDetails.map(detail => ({
      installmentNumber: detail.installmentNumber || 1,
      amount: detail.amount || 0,
      dueDate: detail.dueDate ? new Date(detail.dueDate) : undefined,
      paidDate: detail.paidDate ? new Date(detail.paidDate) : new Date(),
      status: "paid",
      receiptNo: detail.receiptNo || "",
      paymentMode: detail.paymentMode || "cash",
      transactionId: detail.transactionId || "",
      transactionDate: detail.transactionDate ? new Date(detail.transactionDate) : new Date(),
      notes: detail.notes || ""
    }));
  } else {
    // If no payment details are provided, mark as fully paid with default values.
    plot.bookingDetails.paymentSchedule = [{
      installmentNumber: 1,
      amount: plot.pricing?.totalPrice || 0,
      dueDate: new Date(),
      paidDate: new Date(),
      status: "paid",
      receiptNo: "AUTO_APPROVED",
      paymentMode: "cash",
      transactionId: "N/A",
      transactionDate: new Date(),
      notes: "Approved without specific payment details."
    }];
  }

  // Set the total paid amount
  plot.bookingDetails.totalPaidAmount = totalPaidAmount || plot.pricing?.totalPrice || 0;

  await plot.save();

  return res.status(200).json({
    success: true,
    message: "Plot booking approved successfully with payment details.",
    data: plot,
  });
});


/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: UPDATE EXISTING PAYMENT DETAILS                                 */
/* -------------------------------------------------------------------------- */
const updatePaymentDetails = asyncHandler(async (req, res) => {
  const { plotId } = req.params;
  const { installmentNumber, paymentDetails } = req.body;

  const plot = await Plot.findById(plotId);
  if (!plot) throw new ApiError(404, "Plot not found");

  if (!plot.bookingDetails || !Array.isArray(plot.bookingDetails.paymentSchedule)) {
    throw new ApiError(400, "No payment schedule found for this plot.");
  }

  const installmentIndex = plot.bookingDetails.paymentSchedule.findIndex(
    (installment) => installment.installmentNumber === installmentNumber
  );

  if (installmentIndex === -1) {
    throw new ApiError(400, `Installment ${installmentNumber} not found.`);
  }

  // Update the specific installment
  plot.bookingDetails.paymentSchedule[installmentIndex] = {
    ...plot.bookingDetails.paymentSchedule[installmentIndex],
    ...paymentDetails,
    paidDate: paymentDetails.paidDate ? new Date(paymentDetails.paidDate) : new Date(),
    transactionDate: paymentDetails.transactionDate ? new Date(paymentDetails.transactionDate) : new Date(),
    status: "paid" // Ensure status is updated to paid
  };

  // Recalculate totalPaidAmount
  plot.bookingDetails.totalPaidAmount = plot.bookingDetails.paymentSchedule
    .filter(installment => installment.status === "paid")
    .reduce((sum, installment) => sum + installment.amount, 0);

  await plot.save();

  return res.status(200).json({
    success: true,
    message: `Payment details for installment ${installmentNumber} updated successfully.`,
    data: plot,
  });
});
const rejectPlotBooking = asyncHandler(async (req, res) => {
  const { plotId } = req.params;
  const plot = await Plot.findById(plotId);
  if (!plot) throw new ApiError(404, "Plot not found");
  if (plot.status !== "pending")
    throw new ApiError(400, "Plot booking is not in pending state");

  // ❌ Reset plot to available
  plot.status = "available";
  plot.bookingDetails.status = "rejected";
  plot.bookingDetails.rejectedBy = req.user._id;
  plot.bookingDetails.rejectedAt = new Date();
  plot.bookingDetails.totalPaidAmount = 0;
  plot.bookingDetails.tokenAmount = 0;
  plot.bookingDetails.paymentSchedule = []; // Clear any payment schedule on rejection
  await plot.save();

  return res.status(200).json({
    success: true,
    message: "Plot booking rejected and reset to available",
    data: plot,
  });
});

export {
  createPlot,
  bulkCreatePlots,
  updatePlot,
  deletePlot,
  getAllPlots,
  getPlotById,
  approvePlotBooking,
  rejectPlotBooking,
  getPendingBookings,
  getAllBookings,
  getTeamBookingsStats,
  updatePaymentDetails,
};
