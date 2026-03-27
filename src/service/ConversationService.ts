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
  UserPreviewAtConversation,
} from "../types/types";
import FolderService from "./FolderService";
import { stripUndefined } from "../utils/stripUndefined";

const participantInclude = {
  orderBy: { createdAt: "asc" as const },
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
};

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
          createdAt: conversation.createdAt,
          lastMessage,
          activeUsers: [],
          otherParticipant: { id: otherParticipant.user.id },
          isMuted: myParticipant.isMuted,
          isArchived: myParticipant.isArchived,
        };
      }

      const owner = conversation.participants.find((p) => p.role === "OWNER");
      if (!owner) {
        throw new ApiError(
          500,
          "CONVERSATION_OWNER_NOT_FOUND",
          "Conversation owner not found",
        );
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
        createdAt: conversation.createdAt,
        participantsCount: conversation._count?.participants ?? 0,
        ownerId: owner.user.id,
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
      createdAt: conversation.createdAt,
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

    const participants: UserPreviewAtConversation[] = conversation.participants
      .slice(0, 10) // перші 10 з вже завантажених (вже відсортовані по createdAt через participantInclude)
      .map((p) => ({
        id: p.user.id,
        nickname: p.user.nickname,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatarUrl: p.user.avatarUrl,
        conversationId: conversation.id,
        role: p.role,
        lastSeenAt: p.user.lastSeenAt,
      }));

    if (conversation.type === "DIRECT") {
      return {
        ...baseConversation,
        type: "DIRECT" as const,
        lastSeenAt,
        otherParticipant,
      };
    } else {
      const ownerId = conversation.participants.find((p) => p.role === "OWNER")
        ?.user?.id;
      if (!ownerId) {
        throw new ApiError(
          500,
          "CONVERSATION_OWNER_NOT_FOUND",
          "Conversation owner not found",
        );
      }
      return {
        ...baseConversation,
        type: "GROUP" as const,
        participantsCount: conversation._count?.participants ?? 0,
        participants,
        ownerId,
        avatarUrl: conversation.avatarUrl,
        hasMoreParticipants: conversation._count?.participants > 10,
      };
    }
  }

  static async initConversations(
    userId: string,
    take = 20,
  ): Promise<ConversationsInit> {
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
            createdAt: true,
            _count: {
              select: { participants: true },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
            participants: {
              ...participantInclude,
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
        _count: {
          select: { participants: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          ...participantInclude,
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
        _count: {
          select: { participants: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          ...participantInclude,
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
        _count: {
          select: { participants: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          ...participantInclude,
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
        _count: {
          select: { participants: true },
        },
        participants: {
          ...participantInclude,
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
        _count: {
          select: { participants: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          ...participantInclude,
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
    avatarUrl = null,
    type = "DIRECT",
  }: {
    participantIds: string[];
    title: string | null;
    userId: string;
    avatarUrl?: string | null;
    type?: ConversationTypes;
  }): Promise<Conversation | null> {
    const participantsHasAuthor = participantIds.includes(userId);
    if (!participantsHasAuthor) {
      participantIds.push(userId);
    }

    const conversation = await prisma.conversation.create({
      data: {
        title,
        avatarUrl,
        type,
        participants: {
          create: participantIds.map((id) => ({
            userId: id,
            role: id === userId ? "OWNER" : "PARTICIPANT",
          })),
        },
      },
      include: {
        _count: {
          select: { participants: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        participants: {
          ...participantInclude,
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

    if (
      updated.archivedPinnedPosition !== null &&
      dataToUpdate.isArchived === false
    ) {
      await FolderService.updatePinnedPositions(
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

  static async deleteConversation(conversationId: string) {
    await prisma.conversation.delete({
      where: { id: conversationId },
    });
  }

  static async getConversationParticipant(
    conversationId: string,
    userId: string,
  ) {
    return await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
  }

  static async deleteConversationParticipant(
    conversationId: string,
    userId: string,
  ) {
    const [, participantsCount] = await prisma.$transaction([
      prisma.conversationParticipant.delete({
        where: { userId_conversationId: { userId, conversationId } },
      }),
      prisma.conversationParticipant.count({
        where: { conversationId },
      }),
    ]);

    return { participantsCount };
  }

  static async getConversationParticipants(
    conversationId: string,
    cursor?: string,
    take = 10,
  ): Promise<{ participants: UserPreviewAtConversation[]; hasMore: boolean }> {
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            firstName: true,
            lastName: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      ...(cursor
        ? {
            cursor: {
              userId_conversationId: { userId: cursor, conversationId },
            },
          }
        : {}),
      take: take + 1,
      skip: cursor ? 1 : 0,
    });

    const hasMore = participants.length > take;
    if (hasMore) {
      participants.pop();
    }

    const formattedParticipants: UserPreviewAtConversation[] = participants.map(
      (p) => ({
        id: p.user.id,
        nickname: p.user.nickname,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatarUrl: p.user.avatarUrl,
        conversationId,
        role: p.role,
        lastSeenAt: p.user.lastSeenAt,
      }),
    );

    return { participants: formattedParticipants, hasMore };
  }

  static async addParticipants(conversationId: string, userIds: string[]) {
    const lastMessage = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });

    const data = userIds.map((userId) => ({
      conversationId,
      userId,
      lastReadMessageId: lastMessage ? lastMessage.id : null,
      role: "PARTICIPANT" as const,
    }));
    const [, participantsCount] = await prisma.$transaction([
      prisma.conversationParticipant.createMany({
        data,
        skipDuplicates: true,
      }),
      prisma.conversationParticipant.count({
        where: { conversationId },
      }),
    ]);

    return { participantsCount };
  }
}

export default ConversationService;
