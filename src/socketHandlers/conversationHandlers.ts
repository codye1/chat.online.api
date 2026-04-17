import ConversationService from "../service/ConversationService";
import SocketError from "../utils/SocketError";
import { SocketHandlerContext } from "./types";

type JoinConversationPayload = {
  conversationId: string | string[];
  oldConversationId?: string | null;
};

type LeaveConversationPayload = {
  conversationId: string[];
};

type Callback = (data: {
  error: SocketError | { message: string; status: number; code: string };
}) => void;

export const registerConversationHandlers = ({
  socket,
}: Pick<SocketHandlerContext, "socket">) => {
  socket.on(
    "conversation:join",
    async (data: JoinConversationPayload, callback?: Callback) => {
      try {
        const conversationIds = Array.isArray(data.conversationId)
          ? data.conversationId
          : [data.conversationId];

        const membershipChecks = await Promise.all(
          conversationIds.map((id) =>
            ConversationService.isParticipant(id, socket.data.userId),
          ),
        );

        const validConversationIds = conversationIds.filter(
          (_, index) => membershipChecks[index],
        );

        if (validConversationIds.length === 0) {
          throw new SocketError(
            403,
            "CONVERSATION_NOT_A_PARTICIPANT",
            "User is not a participant in any of these conversations",
          );
        }

        if (data.oldConversationId) {
          socket.leave(data.oldConversationId);
          console.log(
            `User ${socket.data.userId} ${socket.id} left conversation ${data.oldConversationId}`,
          );
        }

        validConversationIds.forEach((id) => {
          socket.join(id);
        });
      } catch (error) {
        console.error("Error in conversation:join handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to join conversation",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "conversation:leave",
    async (
      { conversationId }: LeaveConversationPayload,
      callback?: Callback,
    ) => {
      try {
        conversationId.forEach((id) => socket.leave(id));

        console.log(
          `User ${socket.data.userId} ${socket.id} left conversation ${conversationId}`,
        );
      } catch (error) {
        console.error("Error in conversation:leave handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to leave conversation",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );
};
