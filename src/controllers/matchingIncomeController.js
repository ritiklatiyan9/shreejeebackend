// controllers/matchingIncomeController.js - COMPLETE FIXED VERSION
import { User } from '../models/userSchema.js';
import { Plot } from '../models/plotBooking.js';
import { MatchingIncomeRecord } from '../models/matchingIncomeSchema.js';
import mongoose from 'mongoose';

// ==================== HELPER FUNCTIONS ====================

// Helper: Get all downline members recursively
const getAllDownlineMembers = async (userId, position = null) => {
  const members = [];
  const visited = new Set();
  
  const traverse = async (currentUserId, targetPosition) => {
    if (visited.has(currentUserId.toString())) return;
    visited.add(currentUserId.toString());
    
    let query = { sponsorId: currentUserId };
    if (targetPosition) {
      query.position = targetPosition;
    }
    
    const children = await User.find(query).select('_id username position').lean();
    
    for (const child of children) {
      members.push(child);
      await traverse(child._id, null); // Get all descendants
    }
  };
  
  await traverse(userId, position);
  return members;
};

// ==================== MAIN CALCULATION FUNCTION ====================

// Calculate matching income for current cycle (Manual/Cron - Deprecated, use auto-calculation)
const calculateMatchingIncomeForCycle = async (req, res) => {
  try {
    const now = new Date();
    const cycleStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const cycleEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    cycleEndDate.setHours(23, 59, 59, 999);

    console.log(`\n🔄 Calculating Matching Income for cycle: ${cycleStartDate.toISOString()} to ${cycleEndDate.toISOString()}`);

    // Check if cycle already calculated
    if (!req.skipDuplicateCheck) {
      const existingRecords = await MatchingIncomeRecord.countDocuments({
        cycleStartDate: { $gte: cycleStartDate },
        cycleEndDate: { $lte: cycleEndDate }
      });

      if (existingRecords > 0) {
        console.log(`⚠️ Cycle already calculated! Found ${existingRecords} existing records.`);
        return res.status(400).json({
          success: false,
          message: `Matching income for this cycle has already been calculated. Found ${existingRecords} existing records.`,
          existingRecords,
          cycle: { 
            start: cycleStartDate.toISOString(), 
            end: cycleEndDate.toISOString() 
          },
          hint: 'Use the recalculate endpoint if you need to refresh the data.'
        });
      }
    }

    // Find all approved bookings
    const bookings = await Plot.find({
      'bookingDetails.bookingDate': { 
        $gte: cycleStartDate, 
        $lte: cycleEndDate 
      },
      'bookingDetails.status': 'approved'
    })
    .populate('bookingDetails.buyerId', '_id sponsorId position username personalInfo')
    .select('_id plotNumber bookingDetails.buyerId bookingDetails.bookingDate pricing.totalPrice')
    .lean();

    if (bookings.length === 0) {
      return res.status(200).json({ 
        success: true,
        message: 'No approved bookings found for this cycle.', 
        recordsProcessed: 0 
      });
    }

    console.log(`📊 Found ${bookings.length} approved bookings in this cycle`);

    // Get all potential sponsors
    const potentialSponsors = await User.find({ 
      _id: { 
        $in: await User.distinct('sponsorId', { sponsorId: { $ne: null } }) 
      }
    }).select('_id username sponsorId role').lean();

    console.log(`👥 Found ${potentialSponsors.length} potential sponsors with downlines`);

    const sponsorLegSalesMap = new Map();

    // Build sponsor leg sales map
    for (const sponsor of potentialSponsors) {
      const isRootUser = !sponsor.sponsorId;
      const isAdmin = sponsor.role === 'admin';
      
      if (isRootUser && !isAdmin) {
        console.log(`⚠️ Sponsor ${sponsor.username} has no personal sponsor and is not admin, skipping`);
        continue;
      }
      
      if (isRootUser && isAdmin) {
        console.log(`👑 Processing ROOT/ADMIN user: ${sponsor.username}`);
      }

      const sponsorId = sponsor._id.toString();
      const leftLegMembers = await getAllDownlineMembers(sponsor._id, 'left');
      const rightLegMembers = await getAllDownlineMembers(sponsor._id, 'right');
      
      console.log(`\n📍 Sponsor: ${sponsor.username} (${sponsorId})`);
      console.log(`   Left Leg: ${leftLegMembers.length} members`);
      console.log(`   Right Leg: ${rightLegMembers.length} members`);

      const leftMemberIds = leftLegMembers.map(m => m._id.toString());
      const rightMemberIds = rightLegMembers.map(m => m._id.toString());

      sponsorLegSalesMap.set(sponsorId, { 
        username: sponsor.username,
        leftLeg: {
          totalSales: 0,
          totalBookings: 0,
          directMembers: new Map(),
          bookingDetails: []
        },
        rightLeg: {
          totalSales: 0,
          totalBookings: 0,
          directMembers: new Map(),
          bookingDetails: []
        }
      });

      const sponsorData = sponsorLegSalesMap.get(sponsorId);

      // Assign bookings to legs
      for (const plot of bookings) {
        const buyer = plot.bookingDetails.buyerId;
        if (!buyer) continue;

        const buyerId = buyer._id.toString();
        const saleAmount = plot.pricing.totalPrice || 0;
        const buyerName = buyer.username || 
          `${buyer.personalInfo?.firstName || ''} ${buyer.personalInfo?.lastName || ''}`.trim() || 
          'Unknown';

        const bookingDetail = {
          plotId: plot._id,
          buyerId: buyer._id,
          buyerName: buyerName,
          amount: saleAmount,
          bookingDate: plot.bookingDetails.bookingDate
        };

        if (leftMemberIds.includes(buyerId)) {
          sponsorData.leftLeg.totalSales += saleAmount;
          sponsorData.leftLeg.totalBookings += 1;
          sponsorData.leftLeg.bookingDetails.push(bookingDetail);
          
          if (!sponsorData.leftLeg.directMembers.has(buyerId)) {
            sponsorData.leftLeg.directMembers.set(buyerId, {
              memberId: buyer._id,
              memberName: buyerName,
              sales: 0
            });
          }
          sponsorData.leftLeg.directMembers.get(buyerId).sales += saleAmount;
        } else if (rightMemberIds.includes(buyerId)) {
          sponsorData.rightLeg.totalSales += saleAmount;
          sponsorData.rightLeg.totalBookings += 1;
          sponsorData.rightLeg.bookingDetails.push(bookingDetail);
          
          if (!sponsorData.rightLeg.directMembers.has(buyerId)) {
            sponsorData.rightLeg.directMembers.set(buyerId, {
              memberId: buyer._id,
              memberName: buyerName,
              sales: 0
            });
          }
          sponsorData.rightLeg.directMembers.get(buyerId).sales += saleAmount;
        }
      }

      console.log(`   Left Sales: ₹${sponsorData.leftLeg.totalSales.toFixed(2)}`);
      console.log(`   Right Sales: ₹${sponsorData.rightLeg.totalSales.toFixed(2)}`);
    }

    // Calculate matching income
    const recordsToInsert = [];

    for (const [sponsorId, sponsorData] of sponsorLegSalesMap.entries()) {
      const leftSales = sponsorData.leftLeg.totalSales;
      const rightSales = sponsorData.rightLeg.totalSales;
      const balancedAmount = Math.min(leftSales, rightSales);

      console.log(`\n💰 Sponsor: ${sponsorData.username}`);
      console.log(`   Balanced: ₹${balancedAmount.toFixed(2)}`);

      if (balancedAmount > 0) {
        const incomeAmount = (balancedAmount * 5) / 100;
        const weakerLeg = leftSales < rightSales ? 'left' : rightSales < leftSales ? 'right' : 'equal';
        const carryForward = {
          left: leftSales - balancedAmount,
          right: rightSales - balancedAmount
        };

        const newRecord = new MatchingIncomeRecord({
          userId: new mongoose.Types.ObjectId(sponsorId),
          cycleStartDate,
          cycleEndDate,
          incomeType: 'matching_bonus',
          leftLeg: {
            totalSales: leftSales,
            totalBookings: sponsorData.leftLeg.totalBookings,
            directMembers: Array.from(sponsorData.leftLeg.directMembers.values()),
            bookingDetails: sponsorData.leftLeg.bookingDetails
          },
          rightLeg: {
            totalSales: rightSales,
            totalBookings: sponsorData.rightLeg.totalBookings,
            directMembers: Array.from(sponsorData.rightLeg.directMembers.values()),
            bookingDetails: sponsorData.rightLeg.bookingDetails
          },
          balancedAmount,
          weakerLeg,
          commissionPercentage: 5.0,
          incomeAmount,
          carryForward,
          status: 'calculated',
          notes: `Left: ${sponsorData.leftLeg.totalBookings} sales, Right: ${sponsorData.rightLeg.totalBookings} sales`
        });

        recordsToInsert.push(newRecord);
        console.log(`   ✅ Income: ₹${incomeAmount.toFixed(2)}`);
      }
    }

    // Insert records
    if (recordsToInsert.length > 0) {
      await MatchingIncomeRecord.insertMany(recordsToInsert);
      const totalIncome = recordsToInsert.reduce((sum, r) => sum + r.incomeAmount, 0);
      
      console.log(`\n✅ Successfully inserted ${recordsToInsert.length} matching income records`);
      
      return res.status(200).json({
        success: true,
        message: `Successfully calculated and stored ${recordsToInsert.length} matching income records.`,
        cycle: { 
          start: cycleStartDate.toISOString(), 
          end: cycleEndDate.toISOString() 
        },
        recordsCreated: recordsToInsert.length,
        totalIncomeGenerated: totalIncome
      });
    }

    return res.status(200).json({
      success: true,
      message: 'No matching income records generated for this cycle.',
      recordsCreated: 0
    });

  } catch (error) {
    console.error("❌ Error calculating matching income:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error during matching income calculation.", 
      error: error.message 
    });
  }
};

// ==================== USER INCOME QUERIES ====================

// Get individual matching income for a user
const getUserMatchingIncome = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cycleStartDate, cycleEndDate, status, incomeType, page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid User ID format.' 
      });
    }

    // Build filter
    const filter = { userId: userId };

    if (cycleStartDate) {
      const start = new Date(cycleStartDate);
      start.setHours(0, 0, 0, 0);
      filter.cycleStartDate = { $gte: start };
    }
    
    if (cycleEndDate) {
      const end = new Date(cycleEndDate);
      end.setHours(23, 59, 59, 999);
      filter.cycleEndDate = { ...filter.cycleEndDate, $lte: end };
    }
    
    if (status) {
      filter.status = status;
    }

    if (incomeType) {
      filter.incomeType = incomeType;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, totalRecords] = await Promise.all([
      MatchingIncomeRecord.find(filter)
        .sort({ cycleEndDate: -1, incomeType: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'username email memberId personalInfo')
        .populate('approvedBy', 'username email')
        .lean(),
      MatchingIncomeRecord.countDocuments(filter)
    ]);

    // Calculate totals
    const allRecords = await MatchingIncomeRecord.find({ userId }).lean();
    
    const totalIncome = allRecords.reduce((sum, record) => sum + record.incomeAmount, 0);
    const paidIncome = allRecords
      .filter(r => r.status === 'paid' || r.status === 'credited')
      .reduce((sum, record) => sum + record.incomeAmount, 0);
    const pendingIncome = allRecords
      .filter(r => r.status === 'calculated' || r.status === 'pending' || r.status === 'approved')
      .reduce((sum, record) => sum + record.incomeAmount, 0);

    // Separate income by type
    const personalSaleIncome = allRecords
      .filter(r => r.incomeType === 'personal_sale')
      .reduce((sum, r) => sum + r.incomeAmount, 0);
    
    const matchingBonusIncome = allRecords
      .filter(r => r.incomeType === 'matching_bonus')
      .reduce((sum, r) => sum + r.incomeAmount, 0);

    // Get leg statistics (only from matching_bonus records)
    const matchingRecords = allRecords.filter(r => r.incomeType === 'matching_bonus');
    const leftLegTotal = matchingRecords.reduce((sum, r) => sum + (r.leftLeg?.totalSales || 0), 0);
    const rightLegTotal = matchingRecords.reduce((sum, r) => sum + (r.rightLeg?.totalSales || 0), 0);

    return res.status(200).json({
      success: true,
      message: records.length > 0 
        ? 'Matching income records retrieved successfully.' 
        : 'No matching income records found.',
      data: records,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
        recordsPerPage: parseInt(limit)
      },
      summary: {
        totalRecords: allRecords.length,
        totalIncome,
        paidIncome,
        pendingIncome,
        personalSaleIncome,
        matchingBonusIncome,
        leftLegTotalSales: leftLegTotal,
        rightLegTotalSales: rightLegTotal,
        legBalance: Math.abs(leftLegTotal - rightLegTotal)
      }
    });

  } catch (error) {
    console.error("❌ Error fetching user matching income:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error.", 
      error: error.message 
    });
  }
};

// Get team matching income (all downline members)
const getTeamMatchingIncome = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cycleStartDate, cycleEndDate, status, incomeType } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid User ID format.' 
      });
    }

    // Get all team members
    const leftTeam = await getAllDownlineMembers(userId, 'left');
    const rightTeam = await getAllDownlineMembers(userId, 'right');
    const allTeamIds = [...leftTeam, ...rightTeam].map(m => m._id);

    if (allTeamIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No team members found.',
        data: {
          personal: [],
          team: []
        },
        summary: {
          totalTeamMembers: 0,
          totalTeamIncome: 0
        }
      });
    }

    // Build filter
    const filter = { userId: { $in: allTeamIds } };

    if (cycleStartDate) {
      const start = new Date(cycleStartDate);
      start.setHours(0, 0, 0, 0);
      filter.cycleStartDate = { $gte: start };
    }
    
    if (cycleEndDate) {
      const end = new Date(cycleEndDate);
      end.setHours(23, 59, 59, 999);
      filter.cycleEndDate = { ...filter.cycleEndDate, $lte: end };
    }
    
    if (status) {
      filter.status = status;
    }

    if (incomeType) {
      filter.incomeType = incomeType;
    }

    // Get team records
    const teamRecords = await MatchingIncomeRecord.find(filter)
      .sort({ incomeAmount: -1 })
      .populate('userId', 'username email memberId personalInfo position')
      .lean();

    // Get personal records
    const personalFilter = { userId: userId };
    if (cycleStartDate) {
      const start = new Date(cycleStartDate);
      start.setHours(0, 0, 0, 0);
      personalFilter.cycleStartDate = { $gte: start };
    }
    if (cycleEndDate) {
      const end = new Date(cycleEndDate);
      end.setHours(23, 59, 59, 999);
      personalFilter.cycleEndDate = { ...personalFilter.cycleEndDate, $lte: end };
    }
    if (status) personalFilter.status = status;
    if (incomeType) personalFilter.incomeType = incomeType;

    const personalRecords = await MatchingIncomeRecord.find(personalFilter)
      .sort({ cycleEndDate: -1 })
      .populate('userId', 'username email memberId personalInfo')
      .lean();

    // Calculate statistics
    const totalTeamIncome = teamRecords.reduce((sum, record) => sum + record.incomeAmount, 0);
    const leftTeamIncome = teamRecords
      .filter(r => leftTeam.some(m => m._id.toString() === r.userId._id.toString()))
      .reduce((sum, record) => sum + record.incomeAmount, 0);
    const rightTeamIncome = teamRecords
      .filter(r => rightTeam.some(m => m._id.toString() === r.userId._id.toString()))
      .reduce((sum, record) => sum + record.incomeAmount, 0);

    return res.status(200).json({
      success: true,
      message: 'Team matching income retrieved successfully.',
      data: {
        personal: personalRecords,
        team: teamRecords
      },
      summary: {
        totalTeamMembers: allTeamIds.length,
        leftTeamMembers: leftTeam.length,
        rightTeamMembers: rightTeam.length,
        totalTeamIncome,
        leftTeamIncome,
        rightTeamIncome,
        personalIncome: personalRecords.reduce((sum, r) => sum + r.incomeAmount, 0)
      }
    });

  } catch (error) {
    console.error("❌ Error fetching team matching income:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error.", 
      error: error.message 
    });
  }
};

// ==================== ADMIN FUNCTIONS ====================

// Get matching income for cycle (admin)
const getMatchingIncomeForCycle = async (req, res) => {
  try {
    const { cycleStartDate, cycleEndDate, status, incomeType, page = 1, limit = 50 } = req.query;

    const filter = {};

    if (cycleStartDate && cycleEndDate) {
      const start = new Date(cycleStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(cycleEndDate);
      end.setHours(23, 59, 59, 999);

      filter.cycleStartDate = { $gte: start };
      filter.cycleEndDate = { $lte: end };
    }

    if (status) {
      filter.status = status;
    }

    if (incomeType) {
      filter.incomeType = incomeType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, totalRecords] = await Promise.all([
      MatchingIncomeRecord.find(filter)
        .populate('userId', 'username email memberId personalInfo position')
        .populate('approvedBy', 'username email')
        .sort({ incomeAmount: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      MatchingIncomeRecord.countDocuments(filter)
    ]);

    // Statistics
    const allFilteredRecords = await MatchingIncomeRecord.find(filter).lean();

    const totalIncome = allFilteredRecords.reduce((sum, record) => sum + record.incomeAmount, 0);
    const personalSaleTotal = allFilteredRecords
      .filter(r => r.incomeType === 'personal_sale')
      .reduce((sum, r) => sum + r.incomeAmount, 0);
    const matchingBonusTotal = allFilteredRecords
      .filter(r => r.incomeType === 'matching_bonus')
      .reduce((sum, r) => sum + r.incomeAmount, 0);

    const statusBreakdown = allFilteredRecords.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {});

    const topEarners = allFilteredRecords
      .sort((a, b) => b.incomeAmount - a.incomeAmount)
      .slice(0, 10)
      .map(r => ({
        userId: r.userId?._id || r.userId,
        username: r.userId?.username || 'Unknown',
        income: r.incomeAmount,
        incomeType: r.incomeType,
        cycle: `${new Date(r.cycleStartDate).toLocaleDateString()} - ${new Date(r.cycleEndDate).toLocaleDateString()}`
      }));

    return res.status(200).json({
      success: true,
      message: "Matching income records retrieved successfully.",
      data: records,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
        recordsPerPage: parseInt(limit)
      },
      summary: {
        ...(cycleStartDate && cycleEndDate && { 
          cycleStart: cycleStartDate, 
          cycleEnd: cycleEndDate 
        }),
        totalRecords: allFilteredRecords.length,
        totalIncome,
        personalSaleTotal,
        matchingBonusTotal,
        averageIncome: (totalRecords > 0 ? (totalIncome / totalRecords).toFixed(2) : 0),
        statusBreakdown,
        topEarners
      }
    });

  } catch (error) {
    console.error("❌ Error fetching cycle matching income:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
};

// Approve matching income (FIXED - uses updateOne)
const approveMatchingIncome = async (req, res) => {
  try {
    const { recordId } = req.params;
    const { adminId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid record ID.' 
      });
    }

    const record = await MatchingIncomeRecord.findById(recordId);
    
    if (!record) {
      return res.status(404).json({ 
        success: false,
        message: 'Matching income record not found.' 
      });
    }

    if (record.status !== 'calculated' && record.status !== 'pending') {
      return res.status(400).json({ 
        success: false,
        message: `Cannot approve record with status: ${record.status}` 
      });
    }

    // Use updateOne to avoid validation issues
    await MatchingIncomeRecord.updateOne(
      { _id: recordId },
      { 
        $set: {
          status: 'approved',
          approvedBy: adminId,
          approvedAt: new Date()
        }
      }
    );

    // Fetch updated record
    const updatedRecord = await MatchingIncomeRecord.findById(recordId)
      .populate('userId', 'username email')
      .populate('approvedBy', 'username email');

    return res.status(200).json({
      success: true,
      message: 'Matching income approved successfully.',
      data: updatedRecord
    });

  } catch (error) {
    console.error("❌ Error approving matching income:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error.", 
      error: error.message 
    });
  }
};

// Delete matching income for cycle
const deleteMatchingIncomeForCycle = async (req, res) => {
  try {
    const { cycleStartDate, cycleEndDate } = req.query;

    if (!cycleStartDate || !cycleEndDate) {
      return res.status(400).json({ 
        success: false,
        message: "cycleStartDate and cycleEndDate are required." 
      });
    }

    const start = new Date(cycleStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(cycleEndDate);
    end.setHours(23, 59, 59, 999);

    const filter = {
      cycleStartDate: { $gte: start },
      cycleEndDate: { $lte: end }
    };

    const result = await MatchingIncomeRecord.deleteMany(filter);

    console.log(`🗑️ Deleted ${result.deletedCount} matching income records for cycle`);

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} matching income records.`,
      deletedCount: result.deletedCount,
      cycle: { start: cycleStartDate, end: cycleEndDate }
    });

  } catch (error) {
    console.error("❌ Error deleting matching income:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error.", 
      error: error.message 
    });
  }
};

// Recalculate matching income
const recalculateMatchingIncome = async (req, res) => {
  try {
    const now = new Date();
    const cycleStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const cycleEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    cycleEndDate.setHours(23, 59, 59, 999);

    console.log(`\n🔄 RECALCULATING Matching Income for cycle: ${cycleStartDate.toISOString()} to ${cycleEndDate.toISOString()}`);

    // Delete existing records
    const deleteResult = await MatchingIncomeRecord.deleteMany({
      cycleStartDate: { $gte: cycleStartDate },
      cycleEndDate: { $lte: cycleEndDate }
    });

    console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing records`);

    // Proceed with calculation
    req.skipDuplicateCheck = true;
    return calculateMatchingIncomeForCycle(req, res);

  } catch (error) {
    console.error("❌ Error recalculating matching income:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error.", 
      error: error.message 
    });
  }
};

// ==================== EXPORTS ====================

export { 
  calculateMatchingIncomeForCycle, 
  getUserMatchingIncome,
  getTeamMatchingIncome, 
  getMatchingIncomeForCycle,
  approveMatchingIncome,
  deleteMatchingIncomeForCycle,
  recalculateMatchingIncome
};