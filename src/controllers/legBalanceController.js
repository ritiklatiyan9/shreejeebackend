// controllers/legBalanceController.js - View Carry-Forward Balances
import { LegBalance } from '../models/legBalanceSchema.js';

/**
 * Get leg balance for a specific user
 * GET /api/leg-balance/:userId
 */
export const getUserLegBalance = async (req, res) => {
  try {
    const { userId } = req.params;

    const legBalance = await LegBalance.findOne({ userId })
      .populate('userId', 'username email personalInfo')
      .populate('leftLeg.unmatchedSales.plotId', 'plotNumber plotName')
      .populate('leftLeg.unmatchedSales.buyerId', 'username personalInfo')
      .populate('rightLeg.unmatchedSales.plotId', 'plotNumber plotName')
      .populate('rightLeg.unmatchedSales.buyerId', 'username personalInfo')
      .lean();

    if (!legBalance) {
      return res.status(404).json({
        success: false,
        message: 'No leg balance record found for this user'
      });
    }

    // Filter to show only unmatched sales with remaining balance
    const leftUnmatched = legBalance.leftLeg.unmatchedSales.filter(
      s => s.remainingAmount > 0
    );
    const rightUnmatched = legBalance.rightLeg.unmatchedSales.filter(
      s => s.remainingAmount > 0
    );

    res.status(200).json({
      success: true,
      data: {
        ...legBalance,
        leftLeg: {
          ...legBalance.leftLeg,
          unmatchedSales: leftUnmatched
        },
        rightLeg: {
          ...legBalance.rightLeg,
          unmatchedSales: rightUnmatched
        },
        summary: {
          totalMatched: legBalance.totalMatchedAmount,
          totalIncome: legBalance.totalMatchingIncome,
          matchingCount: legBalance.matchingCount,
          carryForward: {
            leg: legBalance.leftLeg.availableBalance > legBalance.rightLeg.availableBalance ? 'left' : 'right',
            amount: Math.abs(legBalance.leftLeg.availableBalance - legBalance.rightLeg.availableBalance)
          }
        }
      }
    });

  } catch (error) {
    console.error('Error in getUserLegBalance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch leg balance'
    });
  }
};

/**
 * Get leg balance summary (lightweight)
 * GET /api/leg-balance/:userId/summary
 */
export const getUserLegBalanceSummary = async (req, res) => {
  try {
    const { userId } = req.params;

    const legBalance = await LegBalance.findOne({ userId })
      .select('-leftLeg.unmatchedSales -rightLeg.unmatchedSales')
      .populate('userId', 'username email')
      .lean();

    if (!legBalance) {
      return res.status(404).json({
        success: false,
        message: 'No leg balance record found',
        data: {
          leftLeg: { totalSales: 0, availableBalance: 0 },
          rightLeg: { totalSales: 0, availableBalance: 0 },
          totalMatchedAmount: 0,
          carryForward: { leg: 'none', amount: 0 }
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: legBalance.userId,
        leftLeg: {
          totalSales: legBalance.leftLeg.totalSales,
          matchedAmount: legBalance.leftLeg.matchedAmount,
          availableBalance: legBalance.leftLeg.availableBalance
        },
        rightLeg: {
          totalSales: legBalance.rightLeg.totalSales,
          matchedAmount: legBalance.rightLeg.matchedAmount,
          availableBalance: legBalance.rightLeg.availableBalance
        },
        totalMatchedAmount: legBalance.totalMatchedAmount,
        totalMatchingIncome: legBalance.totalMatchingIncome,
        matchingCount: legBalance.matchingCount,
        carryForward: {
          leg: legBalance.leftLeg.availableBalance > legBalance.rightLeg.availableBalance ? 'left' : 'right',
          amount: Math.abs(legBalance.leftLeg.availableBalance - legBalance.rightLeg.availableBalance)
        },
        lastMatchedDate: legBalance.lastMatchedDate
      }
    });

  } catch (error) {
    console.error('Error in getUserLegBalanceSummary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch leg balance summary'
    });
  }
};

/**
 * Get all leg balances (Admin only)
 * GET /api/leg-balance/admin/all
 */
export const getAllLegBalances = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50,
      sortBy = 'totalMatchedAmount',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const legBalances = await LegBalance.find()
      .populate('userId', 'username email personalInfo')
      .select('-leftLeg.unmatchedSales -rightLeg.unmatchedSales')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalRecords = await LegBalance.countDocuments();

    // Calculate aggregate statistics
    const aggregateStats = await LegBalance.aggregate([
      {
        $group: {
          _id: null,
          totalLeftSales: { $sum: '$leftLeg.totalSales' },
          totalRightSales: { $sum: '$rightLeg.totalSales' },
          totalMatchedAmount: { $sum: '$totalMatchedAmount' },
          totalMatchingIncome: { $sum: '$totalMatchingIncome' },
          totalUsers: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: legBalances.map(lb => ({
        ...lb,
        carryForward: {
          leg: lb.leftLeg.availableBalance > lb.rightLeg.availableBalance ? 'left' : 'right',
          amount: Math.abs(lb.leftLeg.availableBalance - lb.rightLeg.availableBalance)
        }
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        limit: parseInt(limit)
      },
      aggregateStats: aggregateStats[0] || {
        totalLeftSales: 0,
        totalRightSales: 0,
        totalMatchedAmount: 0,
        totalMatchingIncome: 0,
        totalUsers: 0
      }
    });

  } catch (error) {
    console.error('Error in getAllLegBalances:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch leg balances'
    });
  }
};

/**
 * Get detailed unmatched sales for a user
 * GET /api/leg-balance/:userId/unmatched
 */
export const getUnmatchedSales = async (req, res) => {
  try {
    const { userId } = req.params;
    const { leg } = req.query; // 'left' or 'right' or 'both'

    const legBalance = await LegBalance.findOne({ userId })
      .populate('leftLeg.unmatchedSales.plotId', 'plotNumber plotName pricing')
      .populate('leftLeg.unmatchedSales.buyerId', 'username personalInfo')
      .populate('rightLeg.unmatchedSales.plotId', 'plotNumber plotName pricing')
      .populate('rightLeg.unmatchedSales.buyerId', 'username personalInfo')
      .lean();

    if (!legBalance) {
      return res.status(404).json({
        success: false,
        message: 'No leg balance found'
      });
    }

    let unmatchedSales = [];

    if (!leg || leg === 'both' || leg === 'left') {
      const leftUnmatched = legBalance.leftLeg.unmatchedSales
        .filter(s => s.remainingAmount > 0)
        .map(s => ({ ...s, leg: 'left' }));
      unmatchedSales.push(...leftUnmatched);
    }

    if (!leg || leg === 'both' || leg === 'right') {
      const rightUnmatched = legBalance.rightLeg.unmatchedSales
        .filter(s => s.remainingAmount > 0)
        .map(s => ({ ...s, leg: 'right' }));
      unmatchedSales.push(...rightUnmatched);
    }

    res.status(200).json({
      success: true,
      data: {
        userId,
        unmatchedSales,
        summary: {
          leftCount: legBalance.leftLeg.unmatchedSales.filter(s => s.remainingAmount > 0).length,
          leftAmount: legBalance.leftLeg.availableBalance,
          rightCount: legBalance.rightLeg.unmatchedSales.filter(s => s.remainingAmount > 0).length,
          rightAmount: legBalance.rightLeg.availableBalance,
          totalUnmatched: legBalance.leftLeg.availableBalance + legBalance.rightLeg.availableBalance
        }
      }
    });

  } catch (error) {
    console.error('Error in getUnmatchedSales:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch unmatched sales'
    });
  }
};

export default {
  getUserLegBalance,
  getUserLegBalanceSummary,
  getAllLegBalances,
  getUnmatchedSales
};