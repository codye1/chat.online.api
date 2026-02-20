import { Server } from "socket.io";
import MessageService from "./service/MessageService";
import ConversationService from "./service/ConversationService";
import TokenService from "./service/TokenService";
import { log } from "node:console";
const initializeSocket = async (io: Server) => {
  io.on("connect", (socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    TokenService.updateLastSeenAt(socket.data.userId);
    socket.join(socket.data.userId);

    socket.on("lastSeenAt:update", () => {
      TokenService.updateLastSeenAt(socket.data.userId);
      io.to(`lastSeenAt:${socket.data.userId}`).emit("lastSeenAt:update", {
        userId: socket.data.userId,
        lastSeenAt: new Date(),
      });
    });

    socket.on("subscribe:lastSeenAt", async (userId: string) => {
      log(
        `User ${socket.data.userId} ${socket.id} subscribed to lastSeenAt updates for user ${userId}`,
      );
      socket.join(`lastSeenAt:${userId}`);
    });

    socket.on("unsubscribe:lastSeenAt", async (userId: string) => {
      socket.leave(`lastSeenAt:${userId}`);
    });

    socket.on(
      "typing:start",
      async (data: { conversationId: string; nickname: string }) => {
        const isParticipant = await ConversationService.isParticipant(
          data.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "User is not a participant in this conversation",
          });
          return;
        }

        log(
          `User ${socket.data.userId} ${socket.id} started typing in conversation ${data.conversationId}`,
        );
        socket.to(data.conversationId).emit("typing:start", data);
      },
    );

    socket.on(
      "typing:stop",
      async (data: { conversationId: string; nickname: string }) => {
        const isParticipant = await ConversationService.isParticipant(
          data.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "User is not a participant in this conversation",
          });
          return;
        }

        socket.to(data.conversationId).emit("typing:stop", data);
      },
    );

    socket.on(
      "conversation:join",
      async (data: {
        conversationId: string | string[];
        oldConversationId?: string | null;
      }) => {
        // Handle both single ID and array of IDs
        const conversationIds = Array.isArray(data.conversationId)
          ? data.conversationId
          : [data.conversationId];

        // Verify membership in all conversations
        const membershipChecks = await Promise.all(
          conversationIds.map((id) =>
            ConversationService.isParticipant(id, socket.data.userId),
          ),
        );

        // Filter out conversations where user is not a participant
        const validConversationIds = conversationIds.filter(
          (_, index) => membershipChecks[index],
        );

        if (validConversationIds.length === 0) {
          socket.emit("error", {
            message: "User is not a participant in any of these conversations",
          });
          return;
        }

        if (data.oldConversationId) {
          socket.leave(data.oldConversationId);
          console.log(
            `User ${socket.data.userId} ${socket.id} left conversation ${data.oldConversationId}`,
          );
        }

        // Join all valid conversations
        validConversationIds.forEach((id) => {
          socket.join(id);
          console.log(
            `User ${socket.data.userId} ${socket.id} joined conversation ${id}`,
          );
        });
      },
    );

    socket.on("conversation:leave", async (conversationId: string) => {
      // Verify membership before allowing leave
      const isParticipant = await ConversationService.isParticipant(
        conversationId,
        socket.data.userId,
      );

      if (!isParticipant) {
        socket.emit("error", {
          message: "User is not a participant in this conversation",
        });
        return;
      }

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
          socket.emit("conversation:error", {
            message: "Failed to create conversation",
          });
          return;
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
        return;
      }

      if (conversationId) {
        // Verify membership before sending message
        const isParticipant = await ConversationService.isParticipant(
          conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "User is not a participant in this conversation",
          });
          return;
        }

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

      try {
        const message = await MessageService.getMessageById(lastReadMessageId);

        // Validate message belongs to the conversation
        if (message.conversationId !== conversationId) {
          socket.emit("error", {
            message: "Message does not belong to the specified conversation",
          });
          return;
        }

        // Validate user is a participant
        const isParticipant = await ConversationService.isParticipant(
          conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "User is not a participant in this conversation",
          });
          return;
        }

        io.to(conversationId).emit("message:read", {
          conversationId,
          lastReadMessage: {
            id: message.id,
            senderId: message.senderId,
          },
        });

        await MessageService.markMessagesAsRead({
          conversationId,
          userId: socket.data.userId,
          lastReadMessageId,
        });

        console.log(
          `User ${socket.data.userId} ${socket.id} read messages in conversation ${conversationId}`,
        );
      } catch (error) {
        console.error("Error in message:read handler:", error);
        socket.emit("error", {
          message: "Failed to mark messages as read",
        });
      }
    });
  });
};

export default initializeSocket;
