import { SignOptions } from "jsonwebtoken";
import getEnv from "../utils/getEnv";

const jwtConfig = {
  accessSecret: getEnv("JWT_ACCESS_SECRET"),
  refreshSecret: getEnv("JWT_REFRESH_SECRET"),
  accessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ||
    "15m") as SignOptions["expiresIn"],
  refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ||
    "30d") as SignOptions["expiresIn"],
};

export default jwtConfig;
