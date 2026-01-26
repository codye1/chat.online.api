import { SignOptions } from "jsonwebtoken";
import getEnv from "../utils/getEnv";

const jwtConfig = {
  accessSecret: getEnv("JWT_ACCESS_SECRET"),
  refreshSecret: getEnv("JWT_REFRESH_SECRET"),
  accessExpiresIn:
    (getEnv("JWT_ACCESS_EXPIRES_IN") as SignOptions["expiresIn"]) || "15m",
  refreshExpiresIn: (getEnv("JWT_REFRESH_EXPIRES_IN") ||
    "30d") as SignOptions["expiresIn"],
};

export default jwtConfig;
