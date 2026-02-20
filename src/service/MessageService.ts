import { log } from "node:console";
import { prisma } from "../lib/prisma";

class MessageService {
  static async createMessage({
    conversationId,
    senderId,
    text,
  }: {
    conversationId: string;
    senderId: string;
    text: string;
  }) {
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        text,
      },
    });

    return { ...message, createdAt: message.createdAt.toISOString() };
  }

  static async getMessagesByConversationId(
    conversationId: string,
    cursor?: string,
    direction?: "UP" | "DOWN",
    userId?: string,
    take: number = 20,
    jumpToLatest?: boolean,
  ) {
    if (jumpToLatest) {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { id: "asc" },
        take: -take,
      });
      return { items: messages, hasMoreUp: true, hasMoreDown: false };
    }

    if (!cursor) {
      const participant = await prisma.conversationParticipant.findUnique({
        where: { userId_conversationId: { userId: userId!, conversationId } },
        select: { lastReadMessageId: true },
      });

      const lastReadId = participant?.lastReadMessageId;

      if (!lastReadId) {
        const messages = await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "asc" },
          take: take,
        });

        return {
          items: messages,
          hasMoreUp: false,
          hasMoreDown: messages.length === take,
          anchor: messages[0]?.id,
        };
      }

      const newerMessages = await prisma.message.findMany({
        where: { conversationId, id: { gt: lastReadId } },
        orderBy: { id: "asc" },
        take: take,
      });

      if (newerMessages.length === 0) {
        const olderMessages = await prisma.message.findMany({
          where: { conversationId },
          orderBy: { id: "asc" },
          take: -take,
        });

        return {
          items: olderMessages,
          hasMoreUp: olderMessages.length === take,
          hasMoreDown: false,
          anchor: olderMessages[olderMessages.length - 1]?.id,
        };
      }

      if (newerMessages.length < take) {
        const olderMessages = await prisma.message.findMany({
          where: { conversationId, id: { lte: lastReadId } },
          orderBy: { id: "asc" },
          take: -(take - newerMessages.length),
        });

        const items = [...olderMessages, ...newerMessages];

        const anchor = items.find((msg) => msg.id >= lastReadId)?.id;
        log("Anchor message ID:", anchor);
        return {
          items,
          anchor,
          hasMoreUp: olderMessages.length === take - newerMessages.length,
          hasMoreDown: newerMessages.length === take,
        };
      }
      return {
        items: newerMessages,
        hasMoreUp: true,
        hasMoreDown: newerMessages.length === take,
        anchor: newerMessages[0]?.id,
      };
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      cursor: { id: cursor },
      skip: 1,
      take: direction === "UP" ? -take : take,
      orderBy: { id: "asc" },
    });

    return {
      items: messages,
      [direction === "UP" ? "hasMoreUp" : "hasMoreDown"]:
        messages.length === take,
    };
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
}

export default MessageService;
