import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import jwtConfig from "../configs/jwtConfig";
import { prisma } from "../lib/prisma";

class TokenService {
  static generateTokens(payload: { userId: string }) {
    const accessToken = jwt.sign(payload, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessExpiresIn,
    });
    const refreshToken = jwt.sign(payload, jwtConfig.refreshSecret, {
      expiresIn: jwtConfig.refreshExpiresIn,
      jwtid: randomUUID(),
    });

    return { accessToken, refreshToken };
  }

  static verifyAccessToken = (token: string) => {
    const payload = jwt.verify(token, jwtConfig.accessSecret) as {
      userId: string;
    };
    return { userId: payload.userId };
  };

  static verifyRefreshToken = (token: string) => {
    const payload = jwt.verify(token, jwtConfig.refreshSecret) as {
      userId: string;
    };
    return { userId: payload.userId };
  };

  static saveRefreshToken = async (data: {
    userId: string;
    refreshToken: string;
  }) => {
    console.log(`Saving refresh token for user ${data.userId}`);
    const token = await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({
        where: { userId: data.userId },
      });
      return await tx.refreshToken.create({
        data,
      });
    });
    console.log(`Saved refresh token for user ${data.userId}`);
    return token;
  };

  static removeRefreshToken = async (refreshToken: string) => {
    const token = await prisma.refreshToken.deleteMany({
      where: { refreshToken },
    });
    return token;
  };

  static removeRefreshTokensByUserId = async (userId: string) => {
    const tokens = await prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return tokens;
  };

  static findRefreshToken = async (refreshToken: string) => {
    const token = await prisma.refreshToken.findUnique({
      where: { refreshToken },
    });
    return token;
  };

  static updateLastSeenAt = async (userId: string) => {
    const token = await prisma.refreshToken.updateMany({
      where: { userId },
      data: { lastSeenAt: new Date() },
    });
    return token;
  };

  static getLastSeenAt = async (userId: string) => {
    const token = await prisma.refreshToken.findFirst({
      where: { userId },
      select: { lastSeenAt: true },
    });
    return token?.lastSeenAt || null;
  };

  static getLastSeenAtBatch = async (
    userIds: string[],
  ): Promise<Map<string, Date | null>> => {
    if (userIds.length === 0) {
      return new Map();
    }

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, lastSeenAt: true },
      distinct: ["userId"],
      orderBy: { lastSeenAt: "desc" },
    });

    const lastSeenMap = new Map<string, Date | null>();

    // Initialize all userIds with null
    userIds.forEach((id) => lastSeenMap.set(id, null));

    // Override with actual values
    tokens.forEach((token) => {
      lastSeenMap.set(token.userId, token.lastSeenAt);
    });

    return lastSeenMap;
  };
}
export default TokenService;
