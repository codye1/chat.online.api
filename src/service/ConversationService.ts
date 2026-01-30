import { prisma } from "../lib/prisma";

interface User {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
}

interface Message {
  id: string;
  text: string;
  conversationId: string;
  senderId: string;
  read: boolean;
  createdAt: Date;
}

interface Conversation {
  id: string;
  avatarUrl: string | null;
  title: string;
  type: "DIRECT" | "GROUP";
  participants: User[];
  lastMessage: Message | null;
  unreadMessages: number;
  messages: Message[];
}

interface PrismaConversationRow {
  id: string;
  title: string | null;
  type: "DIRECT" | "GROUP";
  participants: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  }[];
  messages: Message[];
  _count: {
    messages: number;
  };
}

class ConversationService {
  private static toConversationDto(
    row: PrismaConversationRow,
    userId: string,
  ): Conversation {
    const otherParticipant = row.participants.find((p) => p.id !== userId);

    // Determine title and iconUrl based on whether it's a group or direct conversation
    const title =
      row.title ??
      (otherParticipant?.nickname ? otherParticipant.nickname : "");
    const avatarUrl = otherParticipant?.avatarUrl
      ? otherParticipant.avatarUrl
      : null;

    const last = row.messages[0];

    return {
      id: row.id,
      title,
      avatarUrl: avatarUrl || null,
      participants: row.participants,
      messages: row.messages,
      type: row.type,
      lastMessage: last ?? null,
      unreadMessages: row._count.messages,
    };
  }

  static async getConversationsByUserId(
    userId: string,
  ): Promise<Conversation[]> {
    const rows = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { id: userId },
        },
      },
      select: {
        id: true,
        title: true,
        participants: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            text: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                read: false,
                sender: {
                  id: { not: userId },
                },
              },
            },
          },
        },
      },
    });

    return (rows as PrismaConversationRow[]).map((row) =>
      this.toConversationDto(row, userId),
    );
  }

  static async getConversationById(conversationId: string) {
    return await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  static async getConversationByUsersId(userIds: string[], userId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        participants: {
          every: {
            id: { in: userIds },
          },
        },
      },
      select: {
        id: true,
        title: true,
        participants: true,
        type: true,
        messages: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            messages: {
              where: {
                read: false,
                sender: {
                  id: { not: userId },
                },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return this.toConversationDto(
      conversation as PrismaConversationRow,
      userId,
    );
  }

  static async createConversation({
    participantIds,
    title = null,
    userId,
  }: {
    participantIds: string[];
    title: string | null;
    userId: string;
  }) {
    const conversation = await prisma.conversation.create({
      data: {
        title: title,
        participants: {
          connect: participantIds.map((id) => ({ id })),
        },
      },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            messages: {
              where: {
                read: false,
                sender: {
                  id: { not: userId },
                },
              },
            },
          },
        },
      },
    });
    return this.toConversationDto(
      conversation as PrismaConversationRow,
      userId,
    );
  }
}

export default ConversationService;
