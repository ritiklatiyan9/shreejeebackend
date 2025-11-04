// routes/plotRoutes.js
import express from "express";
import {
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
  getTeamBookingsStats
} from "../controllers/adminPlotController.js";

import {
  getAvailablePlotsForUser,
  bookPlot,
  getMyBookedPlots,
  getLeftTeamBookings,
  getRightTeamBookings,
  getAllTeamBookings,
  cancelPlotBooking,
  makePlotPayment
} from "../controllers/userPlotBookingController.js";

import { verifyJWT, isAdminLogin } from "../middlewares/auth.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* 🧩 ADMIN ROUTES                                                            */
/* -------------------------------------------------------------------------- */
router.route("/admin/plots")
  .post(verifyJWT, isAdminLogin, createPlot)
  .get(verifyJWT, isAdminLogin, getAllPlots);

router.route("/admin/plots/bulk")
  .post(verifyJWT, isAdminLogin, bulkCreatePlots);

// --- CRITICAL ORDERING: Specific routes BEFORE dynamic routes ---

// Routes for specific booking actions (pending, all bookings, stats)
router.route("/admin/plots/pending")
  .get(verifyJWT, isAdminLogin, getPendingBookings);

router.route("/admin/plots/bookings/stats")
  .get(verifyJWT, isAdminLogin, getTeamBookingsStats);

router.route("/admin/plots/bookings")
  .get(verifyJWT, isAdminLogin, getAllBookings);

router.route("/admin/plots/:plotId")
  .get(verifyJWT, isAdminLogin, getPlotById)
  .put(verifyJWT, isAdminLogin, updatePlot)
  .delete(verifyJWT, isAdminLogin, deletePlot);

router.route("/admin/plots/:plotId/approve")
  .post(verifyJWT, isAdminLogin, approvePlotBooking);

router.route("/admin/plots/:plotId/reject")
  .post(verifyJWT, isAdminLogin, rejectPlotBooking);

/* -------------------------------------------------------------------------- */
/* 👤 USER ROUTES                                                             */
/* -------------------------------------------------------------------------- */
router.route("/user/plots/my-bookings")
  .get(verifyJWT, getMyBookedPlots);

router.route("/user/plots/available")
  .get(verifyJWT, getAvailablePlotsForUser);

router.route("/user/plots/:plotId")
  .get(verifyJWT, getPlotById);

router.route("/user/plots/book")
  .post(verifyJWT, bookPlot);

router.route("/user/plots/team/left")
  .get(verifyJWT, getLeftTeamBookings);

router.route("/user/plots/team/right")
  .get(verifyJWT, getRightTeamBookings);

router.route("/user/plots/team/all")
  .get(verifyJWT, getAllTeamBookings);

router.route("/user/plots/:plotId/cancel")
  .post(verifyJWT, cancelPlotBooking);

router.route("/user/plots/payment")
  .post(verifyJWT, makePlotPayment);

export default router;