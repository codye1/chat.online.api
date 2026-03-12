import { prisma } from "../lib/prisma";
import { FolderDto } from "../types/types";

type folderData = {
  folderConversations: {
    id: string;
    pinnedPosition: number | null;
    folderId: string;
    conversationId: string;
  }[];
} & {
  userId: string;
  title: string;
  position: number;
  icon: string | null;
  id: string;
  createdAt: Date;
};

class FolderService {
  static async createFolder(data: {
    userId: string;
    title: string;
    position: number;
    conversations: string[];
    icon?: string;
  }): Promise<FolderDto> {
    const { conversations, ...folderData } = data;
    const folder = await prisma.folder.create({
      data: folderData,
    });
    if (conversations?.length) {
      await prisma.folderConversation.createMany({
        data: conversations.map((conversationId) => ({
          folderId: folder.id,
          conversationId,
        })),
      });
    }
    const folderWithConversations = await prisma.folder.findUnique({
      where: { id: folder.id },
      include: {
        folderConversations: true,
      },
    });

    return this.folderDto(folderWithConversations as folderData);
  }

  static async addConversationToFolder(
    folderId: string,
    conversationId: string,
  ) {
    const folder = await prisma.folderConversation.create({
      data: {
        folderId,
        conversationId,
      },
    });
    return folder;
  }

  static async removeConversationFromFolder(
    folderId: string,
    conversationId: string,
  ) {
    await prisma.folderConversation.delete({
      where: { folderId_conversationId: { folderId, conversationId } },
    });
  }

  static async isOwnedByUser(
    userId: string,
    folderId: string,
  ): Promise<boolean> {
    const folder = await prisma.folder.findUnique({
      where: {
        id: folderId,
        userId,
      },
    });
    if (!folder) {
      return false;
    }
    return true;
  }

  static folderDto(folderData: folderData): FolderDto {
    const pinnedConversationIds: string[] = [];
    const unpinnedConversationIds: string[] = [];
    for (const fc of folderData.folderConversations) {
      if (fc.pinnedPosition !== null) {
        pinnedConversationIds.push(fc.conversationId);
      } else {
        unpinnedConversationIds.push(fc.conversationId);
      }
    }
    return {
      id: folderData.id,
      title: folderData.title,
      position: folderData.position,
      ...(folderData.icon ? { icon: folderData.icon } : {}),
      pinnedConversationIds,
      unpinnedConversationIds,
    };
  }

  static async updatePinnedPositions(
    userId: string,
    updates: Array<{
      conversationId: string;
      newPinnedPosition: number | null;
    }>,
    folderId: string,
  ) {
    if (updates.length === 0) return;
    if (folderId === "ACTIVE" || folderId === "ARCHIVED") {
      {
        const conversationIds = updates.map((u) => u.conversationId);
        const positions = updates.map((u) => u.newPinnedPosition);

        await prisma.$executeRaw`
      UPDATE "ConversationParticipant" cp
      SET "pinnedPosition" = data.position
      FROM (
        SELECT
          UNNEST(${conversationIds}::text[]) AS conversation_id,
          UNNEST(${positions}::int[])        AS position
      ) AS data
      WHERE cp."conversationId" = data.conversation_id
        AND cp."userId" = ${userId}
    `;

        await prisma.$executeRaw`
      WITH ranked AS (
        SELECT "conversationId",
               (ROW_NUMBER() OVER (ORDER BY "pinnedPosition"))::int - 1 AS new_position
        FROM "ConversationParticipant"
        WHERE "userId" = ${userId} AND "pinnedPosition" IS NOT NULL
      )
      UPDATE "ConversationParticipant" cp
      SET "pinnedPosition" = ranked.new_position
      FROM ranked
      WHERE cp."conversationId" = ranked."conversationId"
        AND cp."userId" = ${userId}
    `;
      }
    }

    const conversationIds = updates.map((u) => u.conversationId);
    const positions = updates.map((u) => u.newPinnedPosition);

    await prisma.$executeRaw`
      UPDATE "FolderConversation" fc
      SET "pinnedPosition" = data.position
      FROM (
        SELECT
          UNNEST(${conversationIds}::text[]) AS conversation_id,
          UNNEST(${positions}::int[])        AS position
      ) AS data
      WHERE fc."conversationId" = data.conversation_id
        AND fc."folderId" = ${folderId}
    `;

    await prisma.$executeRaw`
      WITH ranked AS (
        SELECT "conversationId",
               (ROW_NUMBER() OVER (ORDER BY "pinnedPosition"))::int - 1 AS new_position
        FROM "FolderConversation"
        WHERE "folderId" = ${folderId} AND "pinnedPosition" IS NOT NULL
      )
      UPDATE "FolderConversation" fc
      SET "pinnedPosition" = ranked.new_position
      FROM ranked
      WHERE fc."conversationId" = ranked."conversationId"
        AND fc."folderId" = ${folderId}
    `;
  }
}

export default FolderService;
