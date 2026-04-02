import ConversationService from "../service/ConversationService";
import MessageService from "../service/MessageService";
import ReactionService from "../service/ReactionService";
import { SocketHandlerContext } from "./types";

type AddReactionPayload = {
  messageId: string;
  content: string;
};

type RemoveReactionPayload = {
  messageId: string;
};

export const registerReactionHandlers = ({
  socket,
}: Pick<SocketHandlerContext, "socket">) => {
  socket.on("reaction:add", async (data: AddReactionPayload) => {
    const { messageId, content } = data;

    try {
      const message = await MessageService.getMessageById(messageId);

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
      const { newReaction, prevReaction } =
        await ReactionService.upsertReaction(
          messageId,
          socket.data.userId,
          content,
        );

      socket.to(message.conversationId).emit("reaction:new", {
        conversationId: message.conversationId,
        messageId,
        newReaction,
        prevReaction,
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

  socket.on("reaction:remove", async (data: RemoveReactionPayload) => {
    const { messageId } = data;

    try {
      const message = await MessageService.getMessageById(messageId);

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

      socket.to(message.conversationId).emit("reaction:removed", {
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
};
