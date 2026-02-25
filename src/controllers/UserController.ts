import { Request, Response } from "express";
import UserService from "../service/UserService";
import ApiError from "../utils/ApiError";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

class UserController {
  static async updateUser(req: Request, res: Response) {
    const userId = req.userId;

    const { nickname, firstName, lastName, biography, avatarUrl } = req.body;

    if (
      nickname === undefined &&
      firstName === undefined &&
      lastName === undefined &&
      biography === undefined &&
      avatarUrl === undefined
    ) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "At least one field must be provided",
      );
    }

    const updateData: {
      nickname?: string;
      firstName?: string | null;
      lastName?: string | null;
      biography?: string | null;
      avatarUrl?: string | null;
    } = {};
    if (nickname !== undefined && (!nickname || nickname.trim() === "")) {
      throw new ApiError(400, "INVALID_INPUT", "Nickname cannot be empty");
    }
    if (nickname !== undefined) updateData.nickname = nickname;
    if (firstName !== undefined) updateData.firstName = firstName || null;
    if (lastName !== undefined) updateData.lastName = lastName || null;
    if (biography !== undefined) updateData.biography = biography || null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl || null;

    try {
      const updatedUser = await UserService.updateById(userId, updateData);

      const { password: _password, ...userWithoutPassword } = updatedUser;

      res.json(userWithoutPassword);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(400, "NICKNAME_TAKEN", "Nickname is already taken");
      }
      throw error;
    }
  }

  static async getMe(req: Request, res: Response) {
    const userId = req.userId;
    if (!userId) {
      throw new ApiError(401, "UNAUTHORIZED", "User not authenticated");
    }

    const user = await UserService.getUserById(userId);
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found");
    }

    const { password: _password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  }
}

export default UserController;
