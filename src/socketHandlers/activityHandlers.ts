import { log } from "node:console";
import ConversationService from "../service/ConversationService";
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

export const registerActivityHandlers = ({
  socket,
}: Pick<SocketHandlerContext, "socket">) => {
  socket.on("activity:start", async (data: ActivityStartPayload) => {
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
  });

  socket.on("activity:stop", async (data: ActivityStopPayload) => {
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
  });
};
