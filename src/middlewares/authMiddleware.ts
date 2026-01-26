import TokenService from "../service/TokenService";
import { Request, Response, NextFunction } from "express";
import ApiError from "../utils/ApiError";

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new ApiError(401, "UNAUTHORIZED", "No authorization header provided");
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Invalid authorization header format",
    );
  }
  const token = parts[1];
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "No token provided");
  }

  try {
    const tokenData = TokenService.verifyAccessToken(token);

    if (!tokenData || typeof tokenData.userId !== "string") {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid token");
    }

    req.userId = tokenData.userId;
    next();
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid token");
  }
};

export default authMiddleware;
