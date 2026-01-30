import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { prisma } from "../lib/prisma";
import ApiError from "../utils/ApiError";

interface CreateUserData {
  email: string;
  nickname: string;
  password?: string;
  provider?: string;
}

class UserService {
  static async createUser(data: CreateUserData) {
    try {
      return await prisma.user.create({ data });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const targets = getTargets(error);

        if (targets.includes("email")) {
          throw new ApiError(400, "EMAIL_TAKEN", "Email is already taken");
        }

        if (targets.includes("nickname")) {
          throw new ApiError(
            400,
            "NICKNAME_TAKEN",
            "Nickname is already taken",
          );
        }
      }
      throw error;
    }
  }

  static async getUserByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
    });
  }
  static async getUserById(id: string) {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  static async updateById(id: string, data: Partial<CreateUserData>) {
    return await prisma.user.update({
      where: { id },
      data,
    });
  }

  static async getUsersByNicknameQuery(query: string) {
    return await prisma.user.findMany({
      where: {
        nickname: {
          contains: query,
          mode: "insensitive",
        },
      },
      take: 10,
    });
  }
}

export default UserService;

const getTargets = (error: PrismaClientKnownRequestError) => {
  const meta = error.meta as unknown as {
    target?: string | string[];
    driverAdapterError?: {
      cause?: {
        constraint?: {
          fields?: string[];
        };
      };
    };
  };

  const target = meta?.target;
  const targetsFromTarget = Array.isArray(target)
    ? target
    : typeof target === "string"
      ? [target]
      : [];

  const targetsFromAdapter =
    meta?.driverAdapterError?.cause?.constraint?.fields ?? [];

  return Array.from(new Set([...targetsFromTarget, ...targetsFromAdapter]));
};
