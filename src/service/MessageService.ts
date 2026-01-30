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

  static async getMessagesByConversationId(conversationId: string) {
    return await prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}

export default MessageService;
