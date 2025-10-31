import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/userSchema.js";

// Middleware to verify JWT token
export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer", "").trim();

    if (!token) {
      throw new ApiError(401, "Unauthorized Request: No Token Provided");
    }

    console.log("Token being verified:", token);

    // Verify the token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Fetch user and proceed
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken -confirmPassword"
    );
    
    if (!user) {
      throw new ApiError(401, "Unauthorized Request: Invalid Access Token");
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    if (error instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, "Access Token Expired");
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(401, "Invalid Access Token");
    }
    throw new ApiError(401, error.message || "Unauthorized Request");
  }
});

// Middleware to check if user is an admin
export const isAdminLogin = asyncHandler(async (req, res, next) => {
  // Check if the user exists and is an admin
  if (req.user?.role !== "admin") {
    throw new ApiError(401, "Unauthorized Request: Admin Access Required");
  }

  // Call the next middleware if the user is an admin
  next();
});
