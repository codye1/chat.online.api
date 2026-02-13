import { Server } from "socket.io";
import MessageService from "./service/MessageService";
import ConversationService from "./service/ConversationService";

const initializeSocket = async (io: Server) => {
  io.on("connect", (socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    socket.join(socket.data.userId);

    socket.on(
      "conversation:join",
      ({
        conversationId,
        oldconversationId,
      }: {
        conversationId: string;
        oldconversationId: string | null;
      }) => {
        if (oldconversationId) {
          socket.leave(oldconversationId);
          console.log(
            `User ${socket.data.userId} ${socket.id} left conversation ${oldconversationId}`,
          );
        }
        socket.join(conversationId);

        console.log(
          `User ${socket.data.userId} ${socket.id} joined conversation ${conversationId}`,
        );
      },
    );

    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(conversationId);
      console.log(
        `User ${socket.data.userId} ${socket.id} left conversation ${conversationId}`,
      );
    });

    socket.on("message:send", async (data) => {
      const { conversationId, recipientId, text } = data;

      if (!conversationId && recipientId) {
        const conversation = await ConversationService.getConversationByUsersId(
          [socket.data.userId, recipientId],
          socket.data.userId,
        );

        if (conversation) {
          socket.join(conversation.id);
          io.to(conversation.id).emit("conversation:update", conversation);

          console.log(
            `User ${socket.data.userId} ${socket.id} sent message to existing conversation ${conversation.id}`,
          );
          const message = await MessageService.createMessage({
            conversationId: conversation.id,
            senderId: socket.data.userId,
            text,
          });
          io.to(conversation.id).emit("message:new", message);
          return;
        }

        const createdConversation =
          await ConversationService.createConversation({
            participantIds: [socket.data.userId, recipientId],
            title: null,
            userId: socket.data.userId,
          });

        if (!createdConversation) {
          throw new Error("Failed to create conversation");
        }

        socket.to(recipientId).emit("conversation:new", {
          ...createdConversation,
          unreadMessages: 0,
        });
        socket.join(createdConversation.id);
        io.to(createdConversation.id).emit(
          "conversation:update",
          createdConversation,
        );
        const message = await MessageService.createMessage({
          conversationId: createdConversation.id,
          senderId: socket.data.userId,
          text,
        });
        io.to(createdConversation.id).emit("message:new", message);

        console.log(
          `User ${socket.data.userId} ${socket.id} sent message to conversation ${createdConversation.id}`,
        );
      }

      if (conversationId) {
        const message = await MessageService.createMessage({
          conversationId,
          senderId: socket.data.userId,
          text,
        });

        io.to(conversationId).emit("message:new", message);
        console.log(
          `User ${socket.data.userId} ${socket.id} sent message to conversation ${conversationId}`,
        );
      }
    });

    socket.on("message:read", async (data) => {
      const { conversationId, lastReadMessageId } = data;
      console.log(lastReadMessageId);

      io.to(conversationId).emit("message:read", {
        conversationId,
        lastReadMessageId,
      });

      await MessageService.markMessagesAsRead({
        conversationId,
        userId: socket.data.userId,
        lastReadMessageId,
      });

      console.log(
        `User ${socket.data.userId} ${socket.id} read messages in conversation ${conversationId}`,
      );
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.userId} ${socket.id}`);
    });
  });
};

export default initializeSocket;
