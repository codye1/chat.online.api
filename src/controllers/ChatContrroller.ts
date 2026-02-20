import { Request, Response } from "express";
import MessageService from "../service/MessageService";
import ConversationService from "../service/ConversationService";
import UserService from "../service/UserService";
import ApiError from "../utils/ApiError";

class ChatController {
  static getConversation = async (req: Request, res: Response) => {
    const userId = req.userId;
    const { conversationId, recipientId } = req.query as {
      conversationId?: string;
      recipientId?: string;
    };

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
          id: null,
          title: recipient.nickname,
          type: "DIRECT",
          otherParticipant: {
            id: recipient.id,
            nickname: recipient.nickname,
            avatarUrl: recipient.avatarUrl,
            lastSeenAt: recipient.refreshTokens[0]?.lastSeenAt || null,
          },
        });
      }

      return res.json(conversation);
    }

    throw new ApiError(
      400,
      "INVALID_INPUT",
      "conversationId or userId is required",
    );
  };

  static async getConversations(req: Request, res: Response) {
    const userId = req.userId;

    const conversations =
      await ConversationService.getConversationsByUserId(userId);
    return res.json(conversations);
  }

  static async createConversation(req: Request, res: Response) {
    const { participantIds, title } = req.body;
    const userId = req.userId;
    const conversation = await ConversationService.createConversation({
      participantIds,
      title,
      userId,
    });

    return res.json(conversation);
  }

  static async sendMessage(req: Request<{ id: string }>, res: Response) {
    const { text } = req.body;
    const senderId = req.userId;
    const { id: conversationId } = req.params;

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
      jumpToLatest?: boolean;
    };

    const messages = await MessageService.getMessagesByConversationId(
      id,
      cursor,
      direction,
      userId,
      take,
      jumpToLatest,
    );

    return res.json(messages);
  }

  static async search(req: Request, res: Response) {
    const { query } = req.query as { query: string };

    const conversations = (
      await ConversationService.getConversationsByUserId(req.userId)
    ).filter((conversation) =>
      conversation.title?.toLowerCase().includes(query.toLowerCase()),
    );

    const users = (await UserService.getUsersByNicknameQuery(query)).map(
      (user) => ({
        type: "user",
        ...user,
      }),
    );

    const results = {
      conversations,
      global: users,
    };
    return res.json(results);
  }
}

export default ChatController;
