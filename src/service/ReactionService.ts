import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { ReactorListItem } from "../types/types";

class ReactionService {
  static async upsertReaction(
    messageId: string,
    userId: string,
    content: string,
  ) {
    const userSelect = {
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        firstName: true,
        lastName: true,
      },
    };

    const [prevReaction, newReaction] = await Promise.all([
      prisma.reaction.findUnique({
        where: { messageId_userId: { messageId, userId } },
        include: { user: userSelect },
      }),
      prisma.reaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, content },
        update: { content },
        include: { user: userSelect },
      }),
    ]);

    return { newReaction, prevReaction };
  }

  static async removeReaction({
    messageId,
    userId,
  }: {
    messageId: string;
    userId: string;
  }) {
    const deletedReaction = await prisma.reaction.delete({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return deletedReaction;
  }

  static async getReactionByUserAndMessage(messageId: string, userId: string) {
    return await prisma.reaction.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  static async getReactorsByMessage({
    messageId,
    reactionContent,
    cursor,
    take = 20,
  }: {
    messageId: string;
    reactionContent?: string;
    cursor?: string;
    take: number;
  }) {
    const contentCondition =
      reactionContent && reactionContent !== "all"
        ? Prisma.sql`AND r."content" = ${reactionContent}`
        : Prisma.empty;

    const cursorCondition = cursor
      ? Prisma.sql`AND (r."createdAt", r."id") < (
          SELECT "createdAt", "id" FROM "Reaction" WHERE "id" = ${cursor}
        )`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<
      {
        id: string;
        nickname: string;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
        reaction: ReactorListItem["reaction"] | string;
      }[]
    >`
      WITH reaction_raw AS (
        SELECT
          r."id",
          r."messageId",
          r."content",
          r."userId",
          r."createdAt"
        FROM "Reaction" r
        WHERE r."messageId" = ${messageId}
          ${contentCondition}
          ${cursorCondition}
        ORDER BY r."createdAt" DESC, r."id" DESC
        LIMIT ${take + 1}
      )
      SELECT
        u."id",
        u."nickname",
        u."firstName",
        u."lastName",
        u."avatarUrl",
        json_build_object(
          'id',        rr."id",
          'content',   rr."content",
          'createdAt', rr."createdAt",
          'messageId', rr."messageId",
          'userId',    rr."userId"
        ) AS reaction
      FROM reaction_raw rr
      JOIN "User" u ON u."id" = rr."userId"
      ORDER BY rr."createdAt" DESC, rr."id" DESC
    `;

    const items: ReactorListItem[] = rows.map((row) => ({
      id: row.id,
      nickname: row.nickname,
      firstName: row.firstName,
      lastName: row.lastName,
      avatarUrl: row.avatarUrl,
      reaction:
        typeof row.reaction === "string"
          ? JSON.parse(row.reaction)
          : row.reaction,
    }));
    console.log(items.length);

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return { items, hasMore };
  }
}

export default ReactionService;
