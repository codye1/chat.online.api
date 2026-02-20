import { prisma } from "../lib/prisma";
import TokenService from "./TokenService";

interface ConversationsItem {
  id: string;
  title: string;
  type: "DIRECT" | "GROUP";
  avatarUrl: string | null;
  unreadMessages: number;
  lastMessage: { text: string; createdAt: Date } | null;
  lastSeenAt: Date | null;
}

interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string;
  avatarUrl: string | null;
  participants: {
    user: { id: string; nickname: string; avatarUrl: string | null };
  }[];
  lastReadId: string | null;
  lastReadIdByParticipants: string | null;
  unreadMessages?: number;
  otherParticipant?: { id: string; nickname: string; avatarUrl: string | null };
  lastSeenAt: Date | null;
}

interface ConversationWithParticipants {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string | null;
  participants: {
    userId: string;
    lastReadMessageId: string | null;
    user: { id: string; nickname: string; avatarUrl: string | null };
  }[];
}

class ConversationService {
  private static async mapConversationToDto(
    conversation: ConversationWithParticipants,
    userId: string,
    options?: { includeUnreadCount?: boolean },
  ): Promise<Conversation> {
    const otherParticipant = conversation.participants.find(
      (p) => p.userId !== userId,
    )?.user;

    const title =
      conversation.title ??
      (otherParticipant?.nickname ? otherParticipant.nickname : "");

    const avatarUrl = otherParticipant?.avatarUrl
      ? otherParticipant.avatarUrl
      : null;

    const myParticipant = conversation.participants.find(
      (p) => p.userId === userId,
    );

    const [lastReadIdByParticipants, unreadCount, lastSeenAt] =
      await Promise.all([
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
        conversation.type === "DIRECT" && otherParticipant
          ? TokenService.getLastSeenAt(otherParticipant.id)
          : Promise.resolve(null),
      ]);

    return {
      ...conversation,
      title,
      avatarUrl,
      lastReadId: myParticipant?.lastReadMessageId ?? null,
      unreadMessages: unreadCount,
      lastReadIdByParticipants:
        lastReadIdByParticipants[0]?.lastReadMessageId ?? null,
      lastSeenAt,
      otherParticipant:
        conversation.type === "DIRECT" ? otherParticipant : undefined,
    };
  }

  static async getConversationsByUserId(
    userId: string,
  ): Promise<ConversationsItem[]> {
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
              select: { id: true, nickname: true, avatarUrl: true },
            },
          },
        },
      },
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation) => {
        const myParticipant = conversation.participants.find(
          (p) => p.userId === userId,
        );
        const otherParticipant = conversation.participants.find(
          (p) => p.userId !== userId,
        );
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            id: {
              gt: myParticipant?.lastReadMessageId ?? "",
            },
          },
        });

        return {
          ...conversation,
          title: conversation.title ?? otherParticipant?.user.nickname ?? "",
          avatarUrl: otherParticipant?.user.avatarUrl ?? null,
          lastMessage: conversation.messages[0] ?? null,
          unreadMessages: unreadCount,
          lastSeenAt:
            conversation.type === "DIRECT" && otherParticipant
              ? await TokenService.getLastSeenAt(otherParticipant.user.id)
              : null,
        };
      }),
    );

    return conversationsWithUnread;
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
                nickname: true,
                avatarUrl: true,
              },
            },
          },
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
                nickname: true,
                avatarUrl: true,
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
                nickname: true,
                avatarUrl: true,
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
