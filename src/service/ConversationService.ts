import { prisma } from "../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import ApiError from "../utils/ApiError";
import {
  Conversation,
  ConversationPreview,
  ConversationsInit,
  ConversationTypes,
  ConversationWithParticipants,
  EditableConversationSettings,
  FolderDto,
} from "../types/types";
import FolderService from "./FolderService";
import { stripUndefined } from "../utils/stripUndefined";

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
      const myParticipant = conversation.participants.find(
        (p) => p.userId === userId,
      );

      if (!myParticipant) {
        throw new ApiError(
          500,
          "CONVERSATION_PARTICIPANT_NOT_FOUND",
          "Conversation participant not found",
        );
      }

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
          isMuted: myParticipant.isMuted,
          isArchived: myParticipant.isArchived,
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
        isMuted: myParticipant.isMuted,
        isArchived: myParticipant.isArchived,
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
                gt: myParticipant.lastReadMessageId || "",
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
      isMuted: myParticipant.isMuted,
      isArchived: myParticipant.isArchived,
      type: conversation.type as ConversationTypes,
      unreadMessages: unreadCount || 0,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            text: lastMessage.text,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
      lastReadId: myParticipant.lastReadMessageId,
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

  static async initConversations(
    userId: string,
    take = 20,
  ): Promise<ConversationsInit> {
    // 1. Загружаем ВСЕ participant-записи (для полных activeIds/archivedIds)
    const allParticipants = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: {
        conversationId: true,
        pinnedPosition: true,
        archivedPinnedPosition: true,
        isArchived: true,
        conversation: {
          select: {
            updatedAt: true,
          },
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
    });

    // 2. Строим activeIds / archivedIds из ВСЕХ записей
    const activeIds = { pinned: [] as string[], unpinned: [] as string[] };
    const archivedIds = { pinned: [] as string[], unpinned: [] as string[] };

    for (const p of allParticipants) {
      const bucket = p.isArchived ? archivedIds : activeIds;
      const isPinned = p.isArchived
        ? p.archivedPinnedPosition !== null
        : p.pinnedPosition !== null;
      const list = isPinned ? bucket.pinned : bucket.unpinned;
      list.push(p.conversationId);
    }

    activeIds.pinned.sort((a, b) => {
      const pa = allParticipants.find(
        (p) => p.conversationId === a,
      )!.pinnedPosition!;
      const pb = allParticipants.find(
        (p) => p.conversationId === b,
      )!.pinnedPosition!;
      return pa - pb;
    });
    archivedIds.pinned.sort((a, b) => {
      const pa = allParticipants.find(
        (p) => p.conversationId === a,
      )!.archivedPinnedPosition!;
      const pb = allParticipants.find(
        (p) => p.conversationId === b,
      )!.archivedPinnedPosition!;
      return pa - pb;
    });

    // 3. Загружаем только первые take диалогов с полными данными для byId
    const previewParticipants = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: {
        conversationId: true,
        conversation: {
          select: {
            id: true,
            title: true,
            type: true,
            avatarUrl: true,
            updatedAt: true,
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            participants: {
              where: {
                OR: [{ userId }, { userId: { not: userId } }],
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
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
      take: take + 1,
    });

    const sliced = previewParticipants.slice(0, take);

    const conversations = sliced.map((p) => p.conversation);
    const previews = await this.mapConversationsToPreview(
      conversations,
      userId,
    );

    const byId: Record<string, ConversationPreview> = {};
    for (const preview of previews) {
      byId[preview.id] = preview;
    }

    // 4. Папки
    const folders = await prisma.folder.findMany({
      where: { userId },
      orderBy: { position: "asc" },
      include: {
        folderConversations: {
          orderBy: { pinnedPosition: "asc" },
        },
      },
    });

    const folderDtos: FolderDto[] = folders.map((f) => {
      return FolderService.folderDto(f);
    });

    const result: ConversationsInit = {
      byId,
      activeIds,
      archivedIds,
      folders: folderDtos,
    };
    return result;
  }

  static async getConversationsByUserId(
    userId: string,
    take = 20,
    cursor?: string,
  ): Promise<Pick<ConversationsInit, "byId"> & { hasMore: boolean }> {
    console.log(take);

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
      },
      ...(cursor ? { cursor: { id: cursor } } : {}),
      take: take + 1,
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
    const previews = await this.mapConversationsToPreview(
      conversations,
      userId,
    );
    const hasMore = previews.length > take;
    if (hasMore) {
      previews.pop();
    }
    const byId: Record<string, ConversationPreview> = {};
    for (const preview of previews) {
      byId[preview.id] = preview;
    }
    return { byId, hasMore };
  }

  static async getConversationsByIds(
    userId: string,
    ids: string[],
  ): Promise<Pick<ConversationsInit, "byId">> {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
        id: { in: ids },
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
    const previews = await this.mapConversationsToPreview(
      conversations,
      userId,
    );
    const byId: Record<string, ConversationPreview> = {};
    for (const preview of previews) {
      byId[preview.id] = preview;
    }
    return { byId };
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

  static async updateConversationSettings(
    conversationId: string,
    userId: string,
    data: EditableConversationSettings,
  ) {
    const dataToUpdate = stripUndefined(data);
    const updated = await prisma.conversationParticipant.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: dataToUpdate,
    });

    // if conversation was pinned in archive when we remove it from archive we need to remove pinned position because pinned conversations in archive and in active have different order and different pinned positions
    if (
      updated.archivedPinnedPosition !== null &&
      dataToUpdate.isArchived === false
    ) {
      FolderService.updatePinnedPositions(
        userId,
        [{ conversationId, newPinnedPosition: null }],
        "ARCHIVED",
      );
    }
    return updated;
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
