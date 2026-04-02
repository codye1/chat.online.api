import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import {
  GroupedReactions,
  Message,
  MessageMedia,
  Roles,
  UserPreviewAtConversation,
} from "../types/types";

class MessageService {
  static async createMessage({
    conversationId,
    senderId,
    text,
    replyToMessageId,
    media,
  }: {
    conversationId: string;
    senderId: string;
    text: string;
    replyToMessageId?: string;
    media?: Omit<MessageMedia, "messageId">[];
  }) {
    const message = await prisma.message.create({
      data: { conversationId, senderId, text, replyToMessageId },
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            lastSeenAt: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            text: true,
            sender: {
              select: {
                id: true,
                nickname: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    // Fetch the participant role for the sender in this conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId: senderId, conversationId } },
      select: { role: true },
    });

    let createdMedia: MessageMedia[] = [];
    if (media && media.length > 0) {
      createdMedia = await prisma.messageMedia.createManyAndReturn({
        data: media.map((m) => ({
          ...m,
          messageId: message.id,
        })),
      });
    }

    return {
      id: message.id,
      text: message.text,
      conversationId: message.conversationId,
      createdAt: message.createdAt.toISOString(),
      sender: {
        ...message.sender,
        conversationId,
        role: (participant?.role ?? "PARTICIPANT") as Roles,
      } satisfies UserPreviewAtConversation,
      replyTo: message.replyTo,
      reactions: {} as GroupedReactions,
      media: createdMedia.length > 0 ? createdMedia : undefined,
    } satisfies Message;
  }

  static async deleteMessage(messageId: string) {
    await prisma.message.delete({
      where: { id: messageId },
    });
  }

  static async getMessagesByConversationId(
    conversationId: string,
    userId: string,
    cursor?: string,
    direction?: "UP" | "DOWN",
    take: number = 20,
    jumpToLatest?: boolean,
  ) {
    // ── 1. Jump to latest ────────────────────────────────────────────────────
    if (jumpToLatest) {
      const messages = await this.fetchMessagesWithReactions(
        Prisma.sql`
        SELECT * FROM "Message"
        WHERE "conversationId" = ${conversationId}
        ORDER BY id DESC
        LIMIT ${take}
      `,
        userId,
      );

      return { items: messages, hasMoreUp: true, hasMoreDown: false };
    }

    // ── 2. Without cursor ────────────────────────────────────────────────────
    if (!cursor) {
      const participant = await prisma.conversationParticipant.findUnique({
        where: { userId_conversationId: { userId: userId!, conversationId } },
        select: { lastReadMessageId: true },
      });

      const lastReadId = participant?.lastReadMessageId;

      // 2a. No lastRead → first page
      if (!lastReadId) {
        const messages = await this.fetchMessagesWithReactions(
          Prisma.sql`
          SELECT * FROM "Message"
          WHERE "conversationId" = ${conversationId}
          ORDER BY id ASC
          LIMIT ${take}
        `,
          userId,
        );

        return {
          items: messages,
          hasMoreUp: false,
          hasMoreDown: messages.length === take,
          anchor: messages[0]?.id,
        };
      }

      // 2b. Has lastRead → load new messages after it
      const newerMessages = await this.fetchMessagesWithReactions(
        Prisma.sql`
        SELECT * FROM "Message"
        WHERE "conversationId" = ${conversationId}
          AND id > ${lastReadId}
        ORDER BY id ASC
        LIMIT ${take}
      `,
        userId,
      );

      // 2c. No new messages → show last N messages
      if (newerMessages.length === 0) {
        const messages = await this.fetchMessagesWithReactions(
          Prisma.sql`
          SELECT * FROM "Message"
          WHERE "conversationId" = ${conversationId}
          ORDER BY id DESC
          LIMIT ${take}
        `,
          userId,
        );

        return {
          items: messages,
          hasMoreUp: messages.length === take,
          hasMoreDown: false,
          anchor: messages[messages.length - 1]?.id,
        };
      }

      // 2d. New messages less than take → fill with older ones
      if (newerMessages.length < take) {
        const olderCount = take - newerMessages.length;

        const olderMessages = await this.fetchMessagesWithReactions(
          Prisma.sql`
          SELECT * FROM "Message"
          WHERE "conversationId" = ${conversationId}
            AND id <= ${lastReadId}
          ORDER BY id DESC
          LIMIT ${olderCount}
        `,
          userId,
        );

        const items = [...olderMessages, ...newerMessages];
        const anchor = items.find((msg) => msg.id >= lastReadId)?.id;

        return {
          items,
          anchor,
          hasMoreUp: olderMessages.length === olderCount,
          hasMoreDown: newerMessages.length === take,
        };
      }

      // 2e. New messages exactly take
      return {
        items: newerMessages,
        hasMoreUp: true,
        hasMoreDown: newerMessages.length === take,
        anchor: newerMessages[0]?.id,
      };
    }

    // ── 3. With cursor ──────────────────────────────────────────────────────
    if (direction === "UP") {
      const messages = await this.fetchMessagesWithReactions(
        Prisma.sql`
        SELECT * FROM "Message"
        WHERE "conversationId" = ${conversationId}
          AND id < ${cursor}
        ORDER BY id DESC
        LIMIT ${take}
      `,
        userId,
      );

      return { items: messages, hasMoreUp: messages.length === take };
    } else {
      const messages = await this.fetchMessagesWithReactions(
        Prisma.sql`
        SELECT * FROM "Message"
        WHERE "conversationId" = ${conversationId}
          AND id > ${cursor}
        ORDER BY id ASC
        LIMIT ${take}
      `,
        userId,
      );

      return { items: messages, hasMoreDown: messages.length === take };
    }
  }

  static async markMessagesAsRead({
    conversationId,
    userId,
    lastReadMessageId,
  }: {
    conversationId: string;
    userId: string;
    lastReadMessageId: string;
  }) {
    await prisma.conversationParticipant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { lastReadMessageId },
    });
  }

  static async getMessageById(id: string) {
    const message = await prisma.message.findUnique({
      where: { id },
    });
    if (!message) throw new Error("Message not found");
    return message;
  }

  static async editMessage({
    messageId,
    userId,
    newText,
    replaceMedia,
  }: {
    messageId: string;
    userId: string;
    newText: string;
    replaceMedia?: {
      oldMediaId?: string;
      newMedia: MessageMedia;
    };
  }) {
    const updateMessagePromise = prisma.message.update({
      where: { id: messageId, senderId: userId },
      data: { text: newText },
    });
    let upsertMediaPromise: Promise<unknown> | undefined;
    if (replaceMedia) {
      upsertMediaPromise = prisma.messageMedia.upsert({
        where: { id: replaceMedia.oldMediaId ?? "", messageId },
        create: { ...replaceMedia.newMedia, messageId },
        update: { ...replaceMedia.newMedia },
      });
    }
    if (upsertMediaPromise) {
      await Promise.all([updateMessagePromise, upsertMediaPromise]);
    } else {
      await updateMessagePromise;
    }

    const [updated] = await this.fetchMessagesWithReactions(
      Prisma.sql`SELECT * FROM "Message" WHERE id = ${messageId}`,
      userId,
    );

    return updated;
  }

  static async fetchMessagesWithReactions(
    messagesSql: Prisma.Sql,
    userId: string,
  ): Promise<Message[]> {
    const rows = await prisma.$queryRaw<
      (Omit<
        Message,
        "reactions" | "sender" | "createdAt" | "replyTo" | "media"
      > & {
        createdAt: Date;
        sender: Message["sender"] | string;
        reactions: GroupedReactions | string | null;
        replyTo: Message["replyTo"] | string | null;
        media: MessageMedia[] | string | null;
      })[]
    >`WITH msg AS (
      ${messagesSql}
    ),

    -- Single pass over Reaction: count + top-3 users + isActive
    reaction_raw AS (
      SELECT
        r."messageId",
        r."content",
        r."userId",
        r."createdAt",
        COUNT(*)          OVER w_group                                     AS count,
        ROW_NUMBER()      OVER (PARTITION BY r."messageId", r."content"
                                ORDER BY r."createdAt" DESC)               AS rn,
        bool_or(r."userId" = ${userId}) OVER w_group                      AS "isActive"
      FROM "Reaction" r
      WHERE r."messageId" IN (SELECT id FROM msg)
      WINDOW w_group AS (PARTITION BY r."messageId", r."content")
    ),

    -- Join User only for top-3 rows (not all reactors)
    reaction_top_users AS (
      SELECT
        rr."messageId",
        rr.content,
        rr.count::int,
        rr."isActive",
        json_agg(
          json_build_object(
            'id',        u."id",
            'nickname',  u."nickname",
            'firstName', u."firstName",
            'lastName',  u."lastName",
            'avatarUrl', u."avatarUrl"
          )
        ) AS users
      FROM reaction_raw rr
      JOIN "User" u ON u."id" = rr."userId"
      WHERE rr.rn <= 3
      GROUP BY rr."messageId", rr.content, rr.count, rr."isActive"
    ),

    -- Final object { "👍": { count, users, isActive }, }
    reactions_grouped AS (
      SELECT
        rtu."messageId",
        json_object_agg(
          rtu.content,
          json_build_object(
            'count',    rtu.count,
            'users',    COALESCE(rtu.users, '[]'::json),
            'isActive', COALESCE(rtu."isActive", false)
          )
        ) AS reactions
      FROM reaction_top_users rtu
      GROUP BY rtu."messageId"
    ),

    -- ── Media ──────────────────────────────────────────────────────────────
    media_grouped AS (
      SELECT
        mm."messageId",
        json_agg(
          json_build_object(
            'id',       mm."id",
            'src',      mm."src",
            'type',     mm."type",
            'filename', mm."filename"
          )
        ) AS media
      FROM "MessageMedia" mm
      WHERE mm."messageId" IN (SELECT id FROM msg)
      GROUP BY mm."messageId"
    )

    SELECT
      m."id",
      m."text",
      m."conversationId",
      to_char(m."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      json_build_object(
        'id',             u."id",
        'nickname',       u."nickname",
        'firstName',      u."firstName",
        'lastName',       u."lastName",
        'avatarUrl',      u."avatarUrl",
        'lastSeenAt',     u."lastSeenAt",
        'conversationId', COALESCE(cp."conversationId", m."conversationId"),
        'role',           COALESCE(cp."role"::text, 'PARTICIPANT')
      ) AS sender,
      COALESCE(rg.reactions, '{}'::json) AS reactions,
      CASE
        WHEN rm."id" IS NOT NULL THEN
          json_build_object(
            'id',     rm."id",
            'text',   rm."text",
            'sender', json_build_object(
              'id',        ru."id",
              'nickname',  ru."nickname",
              'firstName', ru."firstName",
              'lastName',  ru."lastName",
              'avatarUrl', ru."avatarUrl"
            )
          )
        ELSE NULL
      END AS "replyTo",
      mg.media AS media
    FROM msg m
    JOIN "User" u ON u."id" = m."senderId"
    LEFT JOIN "ConversationParticipant" cp ON cp."userId" = m."senderId" AND cp."conversationId" = m."conversationId"
    LEFT JOIN reactions_grouped rg ON rg."messageId" = m.id
    LEFT JOIN "Message" rm ON rm."id" = m."replyToMessageId"
    LEFT JOIN "User" ru ON ru."id" = rm."senderId"
    LEFT JOIN media_grouped mg ON mg."messageId" = m.id
    ORDER BY m.id ASC
  `;

    return rows.map((row) => {
      const parsedSender:
        | (Partial<Message["sender"]> & {
            role?: Roles | string;
            conversationId?: string;
            lastSeenAt?: Date | string;
          })
        | null =
        typeof row.sender === "string"
          ? JSON.parse(row.sender)
          : (row.sender as Message["sender"]);

      return {
        ...row,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : (row.createdAt as string),
        sender: {
          ...(parsedSender ?? {}),
          conversationId:
            parsedSender?.conversationId ?? (row.conversationId as string),
          role: (parsedSender?.role ?? "PARTICIPANT") as Roles,
          lastSeenAt:
            parsedSender?.lastSeenAt instanceof Date
              ? parsedSender.lastSeenAt
              : new Date(parsedSender?.lastSeenAt ?? 0),
        } as Message["sender"],
        reactions:
          typeof row.reactions === "string"
            ? JSON.parse(row.reactions)
            : (row.reactions ?? {}),
        replyTo:
          typeof row.replyTo === "string"
            ? JSON.parse(row.replyTo)
            : (row.replyTo ?? null),
        media:
          typeof row.media === "string"
            ? JSON.parse(row.media)
            : (row.media ?? null),
      };
    });
  }
}

export default MessageService;
