import UserService from "../service/UserService";
import SocketError from "../utils/SocketError";
import { SocketHandlerContext } from "./types";

type Callback = (data: {
  error: SocketError | { message: string; status: number; code: string };
}) => void;

export const registerPresenceHandlers = ({
  io,
  socket,
}: SocketHandlerContext) => {
  socket.on("lastSeenAt:update", async (callback?: Callback) => {
    try {
      await UserService.updateLastSeenAt(socket.data.userId);

      io.to(`lastSeenAt:${socket.data.userId}`).emit("lastSeenAt:update", {
        userId: socket.data.userId,
        lastSeenAt: new Date(),
      });
    } catch (error) {
      console.error("Error in lastSeenAt:update handler:", error);
      if (error instanceof SocketError) {
        callback?.({ error });
        return;
      }
      callback?.({
        error: {
          message: "Failed to update lastSeenAt",
          status: 500,
          code: "UNKNOWN_ERROR",
        },
      });
    }
  });

  socket.on(
    "subscribe:lastSeenAt",
    async (userId: string, callback?: Callback) => {
      try {
        console.log(
          `User ${socket.data.userId} ${socket.id} subscribed to lastSeenAt updates for user ${userId}`,
        );
        socket.join(`lastSeenAt:${userId}`);
      } catch (error) {
        console.error("Error in subscribe:lastSeenAt handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to subscribe to lastSeenAt",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );

  socket.on(
    "unsubscribe:lastSeenAt",
    async (userId: string, callback?: Callback) => {
      try {
        socket.leave(`lastSeenAt:${userId}`);
      } catch (error) {
        console.error("Error in unsubscribe:lastSeenAt handler:", error);
        if (error instanceof SocketError) {
          callback?.({ error });
          return;
        }
        callback?.({
          error: {
            message: "Failed to unsubscribe from lastSeenAt",
            status: 500,
            code: "UNKNOWN_ERROR",
          },
        });
      }
    },
  );
};
