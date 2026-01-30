import { Request, Response } from "express";
import UserService from "../service/UserService";
import ApiError from "../utils/ApiError";
import bcrypt from "bcrypt";
import TokenService from "../service/TokenService";
import expireToNumber from "../utils/expireToNumber";
import jwtConfig from "../configs/jwtConfig";
import { googleClient } from "../lib/google";
import getEnv from "../utils/getEnv";

class AuthController {
  static issueTokensAndSetRefreshCookie = async (
    res: Response,
    userId: string,
  ) => {
    const tokens = TokenService.generateTokens({ userId });

    await TokenService.saveRefreshToken({
      userId,
      refreshToken: tokens.refreshToken,
    });

    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      maxAge: expireToNumber(jwtConfig.refreshExpiresIn),
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return tokens.accessToken;
  };

  static async register(req: Request, res: Response) {
    const { nickname, email, password } = req.body;
    if (!nickname || !email || !password) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "Nickname, email, and password are required",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await UserService.createUser({
      nickname,
      email,
      password: hashedPassword,
    });

    const { password: _password, ...safeUser } = user;

    const accessToken = await AuthController.issueTokensAndSetRefreshCookie(
      res,
      safeUser.id,
    );

    return res.json({ accessToken, safeUser });
  }

  static async login(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "Email and password are required",
      );
    }

    const user = await UserService.getUserByEmail(email);

    if (!user) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "User not found");
    }
    // Handle users registered via Google OAuth
    // user with password can connect google, so handle only if password is missing and provider is not LOCAL
    if (!user.password && user.provider !== "LOCAL")
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        `Please log in using ${user.provider}`,
      );

    if (!user.password) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Password not set for this user",
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect password");
    }

    const accessToken = await AuthController.issueTokensAndSetRefreshCookie(
      res,
      user.id,
    );
    const { password: _password, ...safeUser } = user;
    return res.json({ accessToken, user: safeUser });
  }

  static async refreshToken(req: Request, res: Response) {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken)
      throw new ApiError(
        401,
        "UNAUTHORIZED_REFRESH",
        "No refresh token provided",
      );

    const tokenData = TokenService.verifyRefreshToken(refreshToken);
    const savedToken = await TokenService.findRefreshToken(refreshToken);
    if (!savedToken)
      throw new ApiError(401, "UNAUTHORIZED_REFRESH", "Invalid refresh token");

    const user = await UserService.getUserById(tokenData.userId);
    if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
    await TokenService.removeRefreshToken(refreshToken);

    const { password: _password, ...safeUser } = user;

    const accessToken = await AuthController.issueTokensAndSetRefreshCookie(
      res,
      safeUser.id,
    );

    return res.json({
      accessToken,
      user: safeUser,
      message: "Token refreshed successfully",
    });
  }

  static async logout(req: Request, res: Response) {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await TokenService.removeRefreshToken(refreshToken);
      res.clearCookie("refreshToken");
    }

    return res.json({ message: "Logged out successfully" });
  }

  static googleAuth = async (req: Request, res: Response) => {
    const { credential } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: getEnv("GOOGLE_CLIENT_ID"),
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new ApiError(
        400,
        "INVALID_GOOGLE_TOKEN",
        "Google token is invalid",
      );
    }

    let user = await UserService.getUserByEmail(payload.email);

    if (user && user.provider === "LOCAL") {
      user = await UserService.updateById(user.id, {
        provider: "GOOGLE",
      });
    }

    if (!user) {
      user = await UserService.createUser({
        nickname: payload.name || payload.email.split("@")[0],
        email: payload.email,
        provider: "GOOGLE",
      });
    }

    const { password: _password, ...safeUser } = user;

    await TokenService.removeRefreshTokensByUserId(user.id);

    const accessToken = await AuthController.issueTokensAndSetRefreshCookie(
      res,
      safeUser.id,
    );

    return res.json({ accessToken, user: safeUser });
  };
}

export default AuthController;
