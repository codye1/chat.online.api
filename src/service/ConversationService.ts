import { prisma } from "../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import ApiError from "../utils/ApiError";
import {
  Conversation,
  ConversationPreview,
  ConversationTypes,
  ConversationWithParticipants,
} from "../types/types";

class ConversationService {
  private static async mapConversationsToPreview(
    conversations: ConversationWithParticipants[],
    userId: string,
  ): Promise<ConversationPreview[]> {
    const conversationIds = conversations.map((c) => c.id);

    const unreadRows = conversationIds.length
      ? await prisma.$queryRaw<{ conversationId: string; count: number }[]>(
          Prisma.sql`
            SELECT m."conversationId", COUNT(*)::int AS count
            FROM "Message" m
            JOIN "ConversationParticipant" cp
              ON cp."conversationId" = m."conversationId"
              AND cp."userId" = ${userId}
            WHERE m."senderId" != ${userId}
              AND (cp."lastReadMessageId" IS NULL OR m.id > cp."lastReadMessageId")
              AND m."conversationId" IN (${Prisma.join(conversationIds)})
            GROUP BY m."conversationId"
          `,
        )
      : [];

    const unreadMap = new Map(
      unreadRows.map((r) => [r.conversationId, Number(r.count)]),
    );

    return conversations.map((conversation) => {
      const otherParticipant = conversation.participants.find(
        (p) => p.userId !== userId,
      );

      const lastMessage = conversation.messages?.[0]
        ? {
            id: conversation.messages[0].id,
            text: conversation.messages[0].text,
            createdAt: conversation.messages[0].createdAt.toISOString(),
          }
        : null;

      const unreadCount = unreadMap.get(conversation.id) ?? 0;

      if (conversation.type === "DIRECT") {
        if (!otherParticipant) {
          throw new ApiError(
            500,
            "CONVERSATION_PARTICIPANT_NOT_FOUND",
            "Conversation participant not found",
          );
        }

        return {
          id: conversation.id,
          type: "DIRECT" as const,
          title: conversation.title ?? otherParticipant.user.nickname,
          avatarUrl: conversation.avatarUrl ?? otherParticipant.user.avatarUrl,
          unreadMessages: unreadCount,
          lastMessage,
          activeUsers: [],
          otherParticipant: { id: otherParticipant.user.id },
        };
      }

      return {
        id: conversation.id,
        type: "GROUP" as const,
        title: conversation.title ?? "",
        avatarUrl: conversation.avatarUrl,
        unreadMessages: unreadCount,
        lastMessage,
        activeUsers: [],
      };
    });
  }

  private static async mapConversationToDto(
    conversation: ConversationWithParticipants,
    userId: string,
    options?: { includeUnreadCount?: boolean },
  ): Promise<Conversation> {
    const otherParticipant = conversation.participants.find(
      (p) => p.userId !== userId,
    )?.user;

    const myParticipant = conversation.participants.find(
      (p) => p.userId === userId,
    );

    if (!otherParticipant || !myParticipant) {
      throw new ApiError(
        500,
        "CONVERSATION_PARTICIPANT_NOT_FOUND",
        "Conversation participant not found",
      );
    }

    const title = conversation.title ?? otherParticipant.nickname;

    const avatarUrl = conversation.avatarUrl ?? otherParticipant.avatarUrl;

    const [lastReadIdByParticipants, unreadCount] = await Promise.all([
      prisma.conversationParticipant.findMany({
        where: { conversationId: conversation.id, userId: { not: userId } },
        select: {
          userId: true,
          lastReadMessageId: true,
        },
        orderBy: { lastReadMessageId: "desc" },
        take: 1,
      }),
      options?.includeUnreadCount
        ? prisma.message.count({
            where: {
              conversationId: conversation.id,
              senderId: { not: userId },
              id: {
                gt: myParticipant?.lastReadMessageId ?? "",
              },
            },
          })
        : Promise.resolve(undefined),
    ]);

    const lastSeenAt =
      conversation.type === "DIRECT" && otherParticipant
        ? otherParticipant.lastSeenAt
        : null;

    const lastMessage = conversation.messages?.[0] ?? null;

    const baseConversation = {
      id: conversation.id,
      avatarUrl,
      title,
      type: conversation.type as ConversationTypes,
      unreadMessages: unreadCount || 0,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            text: lastMessage.text,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
      lastReadId: myParticipant?.lastReadMessageId ?? null,
      lastReadIdByParticipants:
        lastReadIdByParticipants[0]?.lastReadMessageId ?? null,
      activeUsers: [] as { nickname: string; reason: "typing" | "editing" }[],
    };

    if (conversation.type === "DIRECT") {
      return {
        ...baseConversation,
        type: "DIRECT" as const,
        lastSeenAt,
        otherParticipant,
      };
    } else {
      return {
        ...baseConversation,
        type: "GROUP" as const,
      };
    }
  }

  static async getConversationsByUserId(
    userId: string,
  ): Promise<ConversationPreview[]> {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                nickname: true,
                avatarUrl: true,
                lastName: true,
                firstName: true,
                biography: true,
                lastSeenAt: true,
              },
            },
          },
          where: {
            OR: [{ userId: userId }, { userId: { not: userId } }],
          },
          take: 2,
        },
      },
    });

    return this.mapConversationsToPreview(conversations, userId);
  }

  static async searchConversationsByUserId(
    userId: string,
    query: string,
  ): Promise<ConversationPreview[]> {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
        OR: [
          {
            type: "GROUP",
            title: { contains: query, mode: "insensitive" },
          },
          {
            type: "DIRECT",
            participants: {
              some: {
                userId: { not: userId },
                user: {
                  nickname: { contains: query, mode: "insensitive" },
                },
              },
            },
          },
        ],
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                nickname: true,
                avatarUrl: true,
                lastName: true,
                firstName: true,
                biography: true,
                lastSeenAt: true,
              },
            },
          },
          where: {
            OR: [{ userId: userId }, { userId: { not: userId } }],
          },
          take: 2,
        },
      },
    });

    return this.mapConversationsToPreview(conversations, userId);
  }

  static async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<Conversation | null> {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId } },
      },
      include: {
        participants: {
          // we need 1 user who userId===userId and 1 random user but not userId===userId
          where: {
            OR: [{ userId: userId }, { userId: { not: userId } }],
          },
          take: 2,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                nickname: true,
                avatarUrl: true,
                lastName: true,
                firstName: true,
                biography: true,
                lastSeenAt: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!conversation) return null;

    return this.mapConversationToDto(conversation, userId, {
      includeUnreadCount: true,
    });
  }

  static async getConversationByUsersId(
    userIds: string[],
    userId: string,
  ): Promise<Conversation | null> {
    const conversation = await prisma.conversation.findFirst({
      where: {
        participants: {
          every: {
            userId: { in: userIds },
          },
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          // we need 1 user who userId===userId and 1 random user but not userId===userId
          where: {
            OR: [{ userId: userId }, { userId: { not: userId } }],
          },
          take: 2,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                nickname: true,
                avatarUrl: true,
                lastName: true,
                firstName: true,
                biography: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });
    if (!conversation) return null;

    return this.mapConversationToDto(conversation, userId);
  }

  static async createConversation({
    participantIds,
    title = null,
    userId,
  }: {
    participantIds: string[];
    title: string | null;
    userId: string;
  }): Promise<Conversation | null> {
    const participantsHasAuthor = participantIds.includes(userId);
    if (!participantsHasAuthor) {
      throw new Error("Author must be included in participants");
    }

    const conversation = await prisma.conversation.create({
      data: {
        title,
        participants: {
          create: participantIds.map((id) => ({
            userId: id,
          })),
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          // we need 1 user who userId===userId and 1 random user but not userId===userId
          where: {
            OR: [{ userId: userId }, { userId: { not: userId } }],
          },
          take: 2,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                nickname: true,
                avatarUrl: true,
                lastName: true,
                firstName: true,
                biography: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });
    if (!conversation) return null;

    return this.mapConversationToDto(conversation, userId);
  }

  static async isParticipant(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    return !!participant;
  }
}

export default ConversationService;
