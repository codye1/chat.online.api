import { Request, Response } from "express";
import MessageService from "../service/MessageService";
import ConversationService from "../service/ConversationService";
import UserService from "../service/UserService";
import ApiError from "../utils/ApiError";
import ReactionService from "../service/ReactionService";
import FolderService from "../service/FolderService";
import { EditableConversationSettings, UserPreview } from "../types/types";
import { io } from "..";

interface CreateConversationData {
  participantIds: string[];
  title: string;
  avatarUrl: string | null;
  type: "DIRECT" | "GROUP";
}

class ChatController {
  static getConversation = async (req: Request, res: Response) => {
    const userId = req.userId;
    const { conversationId, recipientId } = req.query as {
      conversationId?: string;
      recipientId?: string;
    };

    if (!conversationId && !recipientId) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "conversationId or recipientId is required",
      );
    }

    if (conversationId) {
      const conversation = await ConversationService.getConversationById(
        conversationId,
        userId,
      );

      return res.json(conversation);
    }

    if (recipientId) {
      const conversation = await ConversationService.getConversationByUsersId(
        [userId, recipientId],
        userId,
      );

      if (!conversation) {
        const recipient = await UserService.getUserById(recipientId);
        if (!recipient) {
          throw new ApiError(404, "USER_NOT_FOUND", "Recipient user not found");
        }

        return res.json({
          id: "tempId:" + recipientId,
          title: recipient.nickname,
          type: "DIRECT",
          otherParticipant: {
            id: recipient.id,
            nickname: recipient.nickname,
            avatarUrl: recipient.avatarUrl,
            lastSeenAt: recipient.lastSeenAt,
          },
          activeUsers: [],
        });
      }

      return res.json(conversation);
    }
  };

  static async getConversations(req: Request, res: Response) {
    const userId = req.userId;
    const { ids } = req.query as { ids: string };
    const conversations = await ConversationService.getConversationsByIds(
      userId,
      ids.split(","),
    );
    return res.json(conversations);
  }

  static async initConversations(req: Request, res: Response) {
    const userId = req.userId;
    const result = await ConversationService.initConversations(userId);
    return res.json(result);
  }

  static async createConversation(req: Request, res: Response) {
    const { participantIds, title, avatarUrl, type } =
      req.body as CreateConversationData;
    const userId = req.userId;

    if (participantIds.includes(userId)) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "Creator cannot be included in participantIds",
      );
    }

    if (participantIds.length < 1) {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "At least 1 participant (other than the creator) is required to create a conversation",
      );
    }

    if (title && title.trim() === "")
      throw new ApiError(400, "INVALID_INPUT", "Title cannot be empty");

    const conversation = await ConversationService.createConversation({
      participantIds,
      title,
      userId,
      avatarUrl,
      type,
    });

    participantIds.forEach((id) => {
      io.to(id).emit("conversation:new", {
        conversation,
        initiatorId: userId,
      });
    });

    return res.json(conversation);
  }

  static async sendMessage(req: Request<{ id: string }>, res: Response) {
    const { text } = req.body;
    const senderId = req.userId;
    const { id: conversationId } = req.params;

    const isParticipant = await ConversationService.isParticipant(
      conversationId,
      senderId,
    );
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }

    const message = await MessageService.createMessage({
      conversationId,
      senderId,
      text,
    });
    return res.json(message);
  }

  static async getMessages(req: Request<{ id: string }>, res: Response) {
    const userId = req.userId;
    const { id } = req.params;
    const take = 20;
    const { cursor, direction, jumpToLatest } = req.query as {
      cursor?: string;
      direction?: "UP" | "DOWN";
      jumpToLatest?: string;
    };

    const parsedJumpToLatest =
      typeof jumpToLatest === "string"
        ? jumpToLatest.toLowerCase() === "true"
        : undefined;

    const isParticipant = await ConversationService.isParticipant(id, userId);
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }

    const messages = await MessageService.getMessagesByConversationId(
      id,
      userId,
      cursor,
      direction,
      take,
      parsedJumpToLatest,
    );

    return res.json(messages);
  }

  static async search(req: Request, res: Response) {
    const { query, type } = req.query as { query: string; type?: string };

    if (!query || query.trim() === "") {
      return res.json({ conversations: [], global: [] });
    }

    const conversations = await ConversationService.searchConversationsByUserId(
      req.userId,
      query,
    );

    let global: UserPreview[] = [];

    if (!type || type === "users") {
      const users = (await UserService.getUsersByNicknameQuery(query)).map(
        (user) => ({
          type: "user",
          id: user.id,
          nickname: user.nickname,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.avatarUrl,
          lastSeenAt: user.lastSeenAt,
        }),
      );
      global = global.concat(users);
    }

    const results = {
      conversations,
      global,
    };
    return res.json(results);
  }

  static async getMessageReactions(
    req: Request<{
      messageId: string;
      reactionContent: string;
      cursor?: string;
    }>,
    res: Response,
  ) {
    const { messageId } = req.params;
    const { reactionContent, cursor, take } = req.query as {
      reactionContent?: string;
      cursor?: string;
      take?: number;
    };

    console.log({
      messageId,
      reactionContent,
      cursor,
    });

    const reactions = await ReactionService.getReactorsByMessage({
      messageId,
      reactionContent,
      cursor,
      take: Number(take) || 20,
    });
    return res.json(reactions);
  }

  static async createFolder(req: Request, res: Response) {
    const userId = req.userId;
    const { title, position, icon, conversations } = req.body;

    if (!title || title.trim() === "") {
      throw new ApiError(400, "INVALID_INPUT", "Title is required");
    }

    if (typeof position !== "number") {
      throw new ApiError(400, "INVALID_INPUT", "Position must be a number");
    }

    const folder = await FolderService.createFolder({
      userId,
      title,
      position,
      icon,
      conversations,
    });
    return res.json(folder);
  }

  static async updatePinnedPositions(
    req: Request<{ id: string }>,
    res: Response,
  ) {
    const userId = req.userId;
    const { updates, folderId } = req.body as {
      updates: Array<{
        conversationId: string;
        newPinnedPosition: number | null;
      }>;
      folderId: string;
    };

    if (!updates || !Array.isArray(updates)) {
      throw new ApiError(400, "INVALID_INPUT", "Updates must be an array");
    }

    await FolderService.updatePinnedPositions(userId, updates, folderId);

    return res.json({ success: true });
  }

  static async updateConversationSettings(
    req: Request<{ id: string }>,
    res: Response,
  ) {
    const userId = req.userId;
    const { id: conversationId } = req.params;
    const { isMuted, isArchived } = req.body as EditableConversationSettings;

    if (typeof isMuted === "undefined" && typeof isArchived === "undefined") {
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "At least one of isMuted or isArchived must be provided",
      );
    }

    const isParticipant = await ConversationService.isParticipant(
      conversationId,
      userId,
    );
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }

    await ConversationService.updateConversationSettings(
      conversationId,
      userId,
      {
        isMuted,
        isArchived,
      },
    );

    return res.json({ success: true });
  }

  static async addToFolder(req: Request, res: Response) {
    const userId = req.userId;
    const { folderId, conversationId } = req.params as {
      folderId: string;
      conversationId: string;
    };

    const isParticipant = await ConversationService.isParticipant(
      conversationId,
      userId,
    );
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }
    const isOwned = await FolderService.isOwnedByUser(userId, folderId);
    if (!isOwned) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this folder",
      );
    }
    await FolderService.addConversationToFolder(folderId, conversationId);

    return res.json({ success: true });
  }

  static async removeFromFolder(req: Request, res: Response) {
    const userId = req.userId;
    const { folderId, conversationId } = req.params as {
      folderId: string;
      conversationId: string;
    };

    const isParticipant = await ConversationService.isParticipant(
      conversationId,
      userId,
    );
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }
    const isOwned = await FolderService.isOwnedByUser(userId, folderId);
    if (!isOwned) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this folder",
      );
    }
    await FolderService.removeConversationFromFolder(folderId, conversationId);

    return res.json({ success: true });
  }

  static async deleteConversation(req: Request<{ id: string }>, res: Response) {
    const userId = req.userId;
    const { id: conversationId } = req.params;

    const participant = await ConversationService.getConversationParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }
    if (participant.role !== "OWNER") {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this conversation",
      );
    }
    await ConversationService.deleteConversation(conversationId);
    io.to(conversationId).emit("conversation:deleted", {
      conversationId,
      initiatorId: userId,
    });

    return res.json({ success: true });
  }

  static async renameFolder(req: Request<{ folderId: string }>, res: Response) {
    const userId = req.userId;
    const { folderId } = req.params;
    const { newTitle } = req.body as { newTitle: string };

    if (!newTitle || newTitle.trim() === "") {
      throw new ApiError(400, "INVALID_INPUT", "New title is required");
    }

    const isOwned = await FolderService.isOwnedByUser(userId, folderId);
    if (!isOwned) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this folder",
      );
    }

    await FolderService.renameFolder(folderId, newTitle);
    return res.json({ success: true });
  }

  static async deleteFolder(req: Request<{ folderId: string }>, res: Response) {
    const userId = req.userId;
    const { folderId } = req.params;

    const isOwned = await FolderService.isOwnedByUser(userId, folderId);
    if (!isOwned) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this folder",
      );
    }

    await FolderService.deleteFolder(folderId);
    return res.json({ success: true });
  }

  static async removeUserFromConversation(
    req: Request<{ conversationId: string; participantId: string }>,
    res: Response,
  ) {
    const userId = req.userId;
    const { conversationId, participantId: targetUserId } = req.params;
    const participant = await ConversationService.getConversationParticipant(
      conversationId,
      userId,
    );
    const isTargetParticipant = await ConversationService.isParticipant(
      conversationId,
      targetUserId,
    );
    if (!isTargetParticipant) {
      throw new ApiError(
        404,
        "USER_NOT_FOUND",
        "The user to be removed is not a participant of this conversation",
      );
    }
    if (!participant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }
    if (participant?.role !== "OWNER") {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this conversation",
      );
    }

    const { participantsCount } =
      await ConversationService.deleteConversationParticipant(
        conversationId,
        targetUserId,
      );

    if (participantsCount < 2) {
      await ConversationService.deleteConversation(conversationId);
      io.to(conversationId).emit("conversation:deleted", {
        conversationId,
        initiatorId: userId,
      });
      return res.json({ success: true });
    }

    io.to(conversationId).emit("conversation:userRemoved", {
      conversationId,
      userId: targetUserId,
      participantsCount,
    });

    return res.json({ success: true });
  }

  static async leaveConversation(
    req: Request<{ conversationId: string }>,
    res: Response,
  ) {
    const userId = req.userId;
    const { conversationId } = req.params;

    const isParticipant = await ConversationService.getConversationParticipant(
      conversationId,
      userId,
    );
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }

    if (isParticipant.role === "OWNER") {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Owner cannot leave the conversation. Please transfer ownership or delete the conversation.",
      );
    }

    const { participantsCount } =
      await ConversationService.deleteConversationParticipant(
        conversationId,
        userId,
      );

    if (participantsCount < 2) {
      await ConversationService.deleteConversation(conversationId);
      io.to(conversationId).emit("conversation:deleted", {
        conversationId,
        initiatorId: userId,
      });
      return res.json({ success: true });
    }

    io.to(conversationId).emit("conversation:userRemoved", {
      conversationId,
      userId,
      participantsCount,
    });

    return res.json({ success: true });
  }

  static async getConversationParticipants(
    req: Request<{ conversationId: string }>,
    res: Response,
  ) {
    const userId = req.userId;
    const { conversationId } = req.params;
    const { cursor, take } = req.query as { cursor?: string; take?: string };

    const isParticipant = await ConversationService.isParticipant(
      conversationId,
      userId,
    );
    if (!isParticipant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }

    const { participants, hasMore } =
      await ConversationService.getConversationParticipants(
        conversationId,
        cursor,
        Number(take) || 10,
      );

    return res.json({ participants, hasMore });
  }

  static async addParticipantsToConversation(
    req: Request<{ conversationId: string }>,
    res: Response,
  ) {
    const userId = req.userId;
    const { conversationId } = req.params;
    const { participantIds } = req.body as { participantIds: string[] };

    const participant = await ConversationService.getConversationParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not a participant of this conversation",
      );
    }
    if (participant?.role !== "OWNER") {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You are not the owner of this conversation",
      );
    }

    const { participantsCount } = await ConversationService.addParticipants(
      conversationId,
      participantIds,
    );

    console.log(participantsCount);

    io.to(conversationId).emit("conversation:participantsAdded", {
      conversationId,
      participantIds,
      participantsCount,
    });

    await Promise.all(
      participantIds.map(async (participantId) => {
        const conversation = await ConversationService.getConversationById(
          conversationId,
          participantId,
        );
        io.to(participantId).emit("conversation:new", {
          conversation,
          initiatorId: userId,
        });
      }),
    );

    return res.json({ success: true });
  }
}

export default ChatController;
