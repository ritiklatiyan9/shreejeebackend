// Updated controllers/userPlotBookingController.js
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Plot } from "../models/plotBooking.js";
import { User } from "../models/userSchema.js";

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
  const { plotId } = req.body;
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

  // 🚫 Set tokenAmount = 0 until admin approval
  const calculatedTokenAmount = 0;

  // 🕒 Set status to pending instead of booked
  plot.status = "pending";
  plot.bookingDetails = {
    buyerId,
    bookingDate: new Date(),
    tokenAmount: calculatedTokenAmount,
    paymentSchedule: [],
    totalPaidAmount: 0, // initially nothing is paid
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
  const { plotId, installmentNumber, amount } = req.body;

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
  if (plot.bookingDetails.paymentSchedule[installmentIndex].status === "paid")
    throw new ApiError(400, "Installment already paid");

  plot.bookingDetails.paymentSchedule[installmentIndex].paidDate = new Date();
  plot.bookingDetails.paymentSchedule[installmentIndex].status = "paid";
  plot.bookingDetails.totalPaidAmount += amount;

  await plot.save();

  return res.status(200).json({
    success: true,
    message: "Payment made successfully",
    data: plot
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
  makePlotPayment
};