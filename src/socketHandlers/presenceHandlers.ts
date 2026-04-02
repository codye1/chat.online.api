import { log } from "node:console";
import UserService from "../service/UserService";
import { SocketHandlerContext } from "./types";

export const registerPresenceHandlers = ({
  io,
  socket,
}: SocketHandlerContext) => {
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
};
