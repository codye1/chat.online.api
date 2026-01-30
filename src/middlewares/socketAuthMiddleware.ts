import TokenService from "../service/TokenService";
import ApiError from "../utils/ApiError";
import { Socket } from "socket.io";

const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new ApiError(401, "UNAUTHORIZED", "No token provided"));
  }

  try {
    const tokenData = TokenService.verifyAccessToken(token);

    if (!tokenData || typeof tokenData.userId !== "string") {
      return next(new ApiError(401, "UNAUTHORIZED", "Invalid token"));
    }

    socket.data.userId = tokenData.userId;
    return next();
  } catch {
    return next(new ApiError(401, "UNAUTHORIZED", "Invalid token"));
  }
};

export default socketAuthMiddleware;
