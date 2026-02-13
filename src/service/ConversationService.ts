import { prisma } from "../lib/prisma";

interface Conversation {
  id: string;
  title: string;
  avatarUrl: string | null;
  participants: {
    user: {
      id: string;
      nickname: string;
      avatarUrl: string | null;
    };
  }[];
  lastReadMessageId: string | null;
  unreadMessages?: number;
}

interface ConversationsItem {
  id: string;
  title: string;
  avatarUrl: string | null;
  unreadMessages: number;
  lastMessage: {
    text: string;
    createdAt: Date;
  } | null;
}

class ConversationService {
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
          lastMessage: conversation.messages[0],
          unreadMessages: unreadCount,
        };
      }),
    );

    return conversationsWithUnread;
  }

  static async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<Conversation | null> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
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

    const otherParticipant = conversation.participants
      .map((p) => p.user)
      .find((user) => user.id !== userId);

    const title =
      conversation.title ??
      (otherParticipant?.nickname ? otherParticipant.nickname : "");

    const avatarUrl = otherParticipant?.avatarUrl
      ? otherParticipant.avatarUrl
      : null;

    const myParticipant = conversation.participants.find(
      (p) => p.userId === userId,
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
      title,
      avatarUrl,
      lastReadMessageId: myParticipant?.lastReadMessageId ?? null,
      unreadMessages: unreadCount,
    };
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

    const otherParticipant = conversation.participants
      .map((p) => p.user)
      .find((user) => user.id !== userId);

    const title =
      conversation.title ??
      (otherParticipant?.nickname ? otherParticipant.nickname : "");

    const avatarUrl = otherParticipant?.avatarUrl
      ? otherParticipant.avatarUrl
      : null;

    const myParticipant = conversation.participants.find(
      (p) => p.userId === userId,
    );
    return {
      ...conversation,
      title,
      avatarUrl,
      lastReadMessageId: myParticipant?.lastReadMessageId ?? null,
    };
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

    const otherParticipant = conversation.participants
      .map((p) => p.user)
      .find((user) => user.id !== userId);

    const conversationTitle =
      conversation.title ??
      (otherParticipant?.nickname ? otherParticipant.nickname : "");

    const avatarUrl = otherParticipant?.avatarUrl
      ? otherParticipant.avatarUrl
      : null;
    const myParticipant = conversation.participants.find(
      (p) => p.userId === userId,
    );
    return {
      ...conversation,
      title: conversationTitle,
      avatarUrl,
      lastReadMessageId: myParticipant?.lastReadMessageId ?? null,
    };
  }
}

export default ConversationService;
