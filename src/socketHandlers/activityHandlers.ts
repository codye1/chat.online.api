import ConversationService from "../service/ConversationService";
import SocketError from "../utils/SocketError";
import { SocketHandlerContext } from "./types";

type ActivityStartPayload = {
  conversationId: string;
  nickname: string;
  reason: string;
};

type ActivityStopPayload = {
  conversationId: string;
  nickname: string;
};

type Callback = (data: {
  error: SocketError | { message: string; status: number; code: string };
}) => void;

export const registerActivityHandlers = ({
  socket,
}: Pick<SocketHandlerContext, "socket">) => {
  socket.on(
    "activity:start",
    async (data: ActivityStartPayload, callback?: Callback) => {
      try {
        const isParticipant = await ConversationService.isParticipant(
          data.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          throw new SocketError(
            403,
            "CONVERSATION_NOT_A_PARTICIPANT",
            "User is not a participant in this conversation",
          );
        }

        console.log(
          `User ${socket.data.userId} ${socket.id} started activity in conversation ${data.conversationId}`,
        );
        socket.to(data.conversationId).emit("activity:start", data);
      } catch (error) {
        console.error("Error in activity:start handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to start activity",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "activity:stop",
    async (data: ActivityStopPayload, callback?: Callback) => {
      try {
        const isParticipant = await ConversationService.isParticipant(
          data.conversationId,
          socket.data.userId,
        );

        if (!isParticipant) {
          throw new SocketError(
            403,
            "CONVERSATION_NOT_A_PARTICIPANT",
            "User is not a participant in this conversation",
          );
        }

        socket.to(data.conversationId).emit("activity:stop", data);
      } catch (error) {
        console.error("Error in activity:stop handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to stop activity",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );
};
