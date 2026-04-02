import ConversationService from "../service/ConversationService";
import { SocketHandlerContext } from "./types";

type JoinConversationPayload = {
  conversationId: string | string[];
  oldConversationId?: string | null;
};

type LeaveConversationPayload = {
  conversationId: string[];
};

export const registerConversationHandlers = ({
  socket,
}: Pick<SocketHandlerContext, "socket">) => {
  socket.on("conversation:join", async (data: JoinConversationPayload) => {
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

    validConversationIds.forEach((id) => {
      socket.join(id);
    });
  });

  socket.on(
    "conversation:leave",
    async ({ conversationId }: LeaveConversationPayload) => {
      conversationId.forEach((id) => socket.leave(id));

      console.log(
        `User ${socket.data.userId} ${socket.id} left conversation ${conversationId}`,
      );
    },
  );
};
