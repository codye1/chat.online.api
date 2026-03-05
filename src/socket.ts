import { Server } from "socket.io";
import MessageService from "./service/MessageService";
import ConversationService from "./service/ConversationService";
import { log } from "node:console";
import ReactionService from "./service/ReactionService";
import UserService from "./service/UserService";
const initializeSocket = async (io: Server) => {
  io.on("connect", (socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    UserService.updateLastSeenAt(socket.data.userId);
    socket.join(socket.data.userId);

    socket.on("lastSeenAt:update", () => {
      UserService.updateLastSeenAt(socket.data.userId);
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
      "activity:start",
      async (data: {
        conversationId: string;
        nickname: string;
        reason: string;
      }) => {
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
          `User ${socket.data.userId} ${socket.id} started activity in conversation ${data.conversationId}`,
        );
        socket.to(data.conversationId).emit("activity:start", data);
      },
    );

    socket.on(
      "activity:stop",
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

        socket.to(data.conversationId).emit("activity:stop", data);
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
      const { conversationId, recipientId, text, replyToMessageId } = data;

      if (!conversationId && recipientId) {
        const conversation = await ConversationService.getConversationByUsersId(
          [socket.data.userId, recipientId],
          socket.data.userId,
        );

        if (conversation) {
          socket.join(conversation.id);
          io.to(conversation.id).emit("conversation:update", {
            conversation,
            recipientId,
          });
          console.log(
            `User ${socket.data.userId} ${socket.id} sent message to existing conversation ${conversation.id}`,
          );
          const message = await MessageService.createMessage({
            conversationId: conversation.id,
            senderId: socket.data.userId,
            text,
            replyToMessageId: replyToMessageId,
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
        const message = await MessageService.createMessage({
          conversationId: createdConversation.id,
          senderId: socket.data.userId,
          text,
          replyToMessageId: replyToMessageId,
        });

        // to sender
        socket.emit("conversation:new", {
          conversation: {
            ...createdConversation,
            lastMessage: { text: message.text, createdAt: message.createdAt },
            unreadMessages: 0,
          },
          recipientId,
          firstMessage: message,
        });

        // to recipient
        socket.to(recipientId).emit("conversation:new", {
          conversation: {
            ...createdConversation,
            lastMessage: { text: message.text, createdAt: message.createdAt },
            unreadMessages: 1,
          },
          recipientId,
          initiator: socket.data.userId,
          firstMessage: message,
        });

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
          replyToMessageId: replyToMessageId,
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

        socket.to(conversationId).emit("message:read", {
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

    socket.on("reaction:add", async (data) => {
      const { messageId, content } = data;

      try {
        const message = await MessageService.getMessageById(messageId);

        // Validate user is a participant in the conversation
        const isParticipant = await ConversationService.isParticipant(
          message.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "User is not a participant in this conversation",
          });
          return;
        }

        const existingReaction =
          await ReactionService.getReactionByUserAndMessage(
            messageId,
            socket.data.userId,
          );

        if (existingReaction) {
          await ReactionService.removeReaction({
            userId: socket.data.userId,
            messageId,
          });
        }

        const newReaction = await ReactionService.addReaction(
          messageId,
          socket.data.userId,
          content,
        );

        io.to(message.conversationId).emit("reaction:new", {
          conversationId: message.conversationId,
          messageId,
          newReaction,
          prevReaction: existingReaction,
        });

        console.log(
          `User ${socket.data.userId} ${socket.id} added reaction to message ${messageId}`,
        );
      } catch (error) {
        console.error("Error in reaction:add handler:", error);
        socket.emit("error", {
          message: "Failed to add reaction",
        });
      }
    });

    socket.on("reaction:remove", async (data) => {
      const { messageId } = data;

      try {
        const message = await MessageService.getMessageById(messageId);

        // Validate user is a participant in the conversation
        const isParticipant = await ConversationService.isParticipant(
          message.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          socket.emit("error", {
            message: "User is not a participant in this conversation",
          });
          return;
        }

        const removedReaction = await ReactionService.removeReaction({
          userId: socket.data.userId,
          messageId,
        });

        io.to(message.conversationId).emit("reaction:removed", {
          conversationId: message.conversationId,
          messageId,
          removedReaction,
        });

        console.log(
          `User ${socket.data.userId} ${socket.id} removed reaction ${removedReaction?.content} from message ${messageId}`,
        );
      } catch (error) {
        console.error("Error in reaction:remove handler:", error);
        socket.emit("error", {
          message: "Failed to remove reaction",
        });
      }
    });

    socket.on("message:delete", async (data) => {
      const { messageId } = data;
      try {
        const message = await MessageService.getMessageById(messageId);

        if (message.senderId !== socket.data.userId) {
          socket.emit("error", {
            message: "User is not the sender of this message",
          });
          return;
        }

        await MessageService.deleteMessage(messageId);

        io.to(message.conversationId).emit("message:deleted", {
          conversationId: message.conversationId,
          messageId,
        });

        console.log(
          `User ${socket.data.userId} ${socket.id} deleted message ${messageId}`,
        );
      } catch (error) {
        console.error("Error in message:delete handler:", error);
        socket.emit("error", {
          message: "Failed to delete message",
        });
      }
    });

    socket.on("message:edit", async (data) => {
      const { messageId, conversationId, newText } = data;
      try {
        const message = await MessageService.getMessageById(messageId);

        if (message.senderId !== socket.data.userId) {
          socket.emit("error", {
            message: "User is not the sender of this message",
          });
          return;
        }

        const editedMessage = await MessageService.editMessage({
          messageId,
          userId: socket.data.userId,
          newText,
        });

        io.to(conversationId).emit("message:edited", {
          editedMessage,
        });

        console.log(
          `User ${socket.data.userId} ${socket.id} edited message ${messageId}`,
        );
      } catch (error) {
        console.error("Error in message:edit handler:", error);
        socket.emit("error", {
          message: "Failed to edit message",
        });
      }
    });
  });
};

export default initializeSocket;
