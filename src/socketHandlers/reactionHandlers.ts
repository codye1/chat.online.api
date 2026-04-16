import ConversationService from "../service/ConversationService";
import MessageService from "../service/MessageService";
import ReactionService from "../service/ReactionService";
import SocketError from "../utils/SocketError";
import { SocketHandlerContext } from "./types";

type AddReactionPayload = {
  messageId: string;
  content: string;
};

type RemoveReactionPayload = {
  messageId: string;
};

type Callback = (data: {
  error: SocketError | { message: string; status: number; code: string };
}) => void;

export const registerReactionHandlers = ({
  socket,
}: Pick<SocketHandlerContext, "socket">) => {
  socket.on(
    "reaction:add",
    async (data: AddReactionPayload, callback?: Callback) => {
      const { messageId, content } = data;
      try {
        const message = await MessageService.getMessageById(messageId);

        const isParticipant = await ConversationService.isParticipant(
          message.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          throw new SocketError(
            403,
            "CONVERSATION_NOT_A_PARTICIPANT",
            "User is not a participant in this conversation",
          );
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
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to add reaction",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "reaction:remove",
    async (data: RemoveReactionPayload, callback?: Callback) => {
      const { messageId } = data;

      try {
        const message = await MessageService.getMessageById(messageId);

        const isParticipant = await ConversationService.isParticipant(
          message.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          throw new SocketError(
            403,
            "CONVERSATION_NOT_A_PARTICIPANT",
            "User is not a participant in this conversation",
          );
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
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to remove reaction",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );
};
