import ConversationService from "../service/ConversationService";
import MessageService from "../service/MessageService";
import { MessageMedia } from "../types/types";
import SocketError from "../utils/SocketError";
import { SocketHandlerContext } from "./types";

interface SendMessagePayload {
  conversationId?: string;
  recipientId?: string;
  text: string;
  replyToMessageId?: string;
  media?: Omit<MessageMedia, "messageId">[];
  tempId?: string;
}

interface ReadMessagePayload {
  conversationId: string;
  lastReadMessageId: string;
}

interface DeleteMessagePayload {
  messageId: string;
}

interface EditMessagePayload {
  messageId: string;
  conversationId: string;
  newText: string;
  replaceMedia?: {
    oldMediaId?: string;
    newMedia: MessageMedia;
  };
}

type Callback = (data: {
  error: SocketError | { message: string; status: number; code: string };
}) => void;

export const registerMessageHandlers = ({
  io,
  socket,
}: SocketHandlerContext) => {
  socket.on(
    "message:send",
    async (data: SendMessagePayload, callback?: Callback) => {
      try {
        const {
          conversationId,
          recipientId,
          text,
          replyToMessageId,
          media,
          tempId,
        } = data;

        if (!conversationId && recipientId) {
          const conversation =
            await ConversationService.getConversationByUsersId(
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
              replyToMessageId,
              media,
            });

            socket.to(conversation.id).emit("message:new", message);
            socket.emit("message:sent", { message, tempId });
            await MessageService.markMessagesAsRead({
              conversationId: conversation.id,
              userId: socket.data.userId,
              lastReadMessageId: message.id,
            });
            return;
          }

          const createdConversation =
            await ConversationService.createConversation({
              participantIds: [socket.data.userId, recipientId],
              title: null,
              userId: socket.data.userId,
            });

          if (!createdConversation) {
            throw new SocketError(
              500,
              "CONVERSATION_CREATION_FAILED",
              "Failed to create conversation",
            );
          }

          const message = await MessageService.createMessage({
            conversationId: createdConversation.id,
            senderId: socket.data.userId,
            text,
            replyToMessageId,
            media,
          });

          socket.emit("conversation:new", {
            conversation: {
              ...createdConversation,
              lastMessage: { text: message.text, createdAt: message.createdAt },
              unreadMessages: 0,
            },
            recipientId,
            firstMessage: message,
            firstMessageTempId: tempId,
          });

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

          await MessageService.markMessagesAsRead({
            conversationId: createdConversation.id,
            userId: socket.data.userId,
            lastReadMessageId: message.id,
          });

          console.log(
            `User ${socket.data.userId} ${socket.id} sent message to conversation ${createdConversation.id}`,
          );
          return;
        }

        if (conversationId) {
          const isParticipant = await ConversationService.isParticipant(
            conversationId,
            socket.data.userId,
          );

          if (!isParticipant) {
            throw new SocketError(
              403,
              "CONVERSATION_NOT_A_PARTICIPANT",
              "User is not a participant in this conversation",
            );
          }
          console.log(media);

          const message = await MessageService.createMessage({
            conversationId,
            senderId: socket.data.userId,
            text,
            replyToMessageId,
            media,
          });

          socket.to(conversationId).emit("message:new", message);
          socket.emit("message:sent", { message, tempId });
          await MessageService.markMessagesAsRead({
            conversationId,
            userId: socket.data.userId,
            lastReadMessageId: message.id,
          });
          console.log(
            `User ${socket.data.userId} ${socket.id} sent message to conversation ${conversationId}`,
          );
          return;
        }
        throw new SocketError(
          400,
          "CONVERSATION_OR_RECIPIENT_REQUIRED",
          "conversationId or recipientId is required",
        );
      } catch (error) {
        console.error("Error in message:send handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to send a message",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "message:read",
    async (data: ReadMessagePayload, callback?: Callback) => {
      const { conversationId, lastReadMessageId } = data;

      try {
        const message = await MessageService.getMessageById(lastReadMessageId);

        if (message.conversationId !== conversationId) {
          throw new SocketError(
            400,
            "MESSAGE_CONVERSATION_MISMATCH",
            "Message does not belong to the specified conversation",
          );
        }

        const isParticipant = await ConversationService.isParticipant(
          conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          throw new SocketError(
            403,
            "CONVERSATION_NOT_A_PARTICIPANT",
            "User is not a participant in this conversation",
          );
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
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to mark messages as read",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "message:delete",
    async (data: DeleteMessagePayload, callback?: Callback) => {
      const { messageId } = data;
      try {
        const message = await MessageService.getMessageById(messageId);
        if (message.senderId !== socket.data.userId) {
          throw new SocketError(
            403,
            "MESSAGE_NOT_SENDER",
            "User is not the sender of this message",
          );
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
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to delete message",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "message:edit",
    async (data: EditMessagePayload, callback?: Callback) => {
      const { messageId, conversationId, newText, replaceMedia } = data;
      try {
        const message = await MessageService.getMessageById(messageId);
        if (message.senderId !== socket.data.userId) {
          throw new SocketError(
            403,
            "MESSAGE_NOT_SENDER",
            "User is not the sender of this message",
          );
        }

        const editedMessage = await MessageService.editMessage({
          messageId,
          userId: socket.data.userId,
          newText,
          replaceMedia,
        });

        io.to(conversationId).emit("message:edited", {
          editedMessage,
        });

        console.log(
          `User ${socket.data.userId} ${socket.id} edited message ${messageId}`,
        );
      } catch (error) {
        console.error("Error in message:edit handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to edit message",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );
};
