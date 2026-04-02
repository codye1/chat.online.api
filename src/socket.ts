import { Server } from "socket.io";
import UserService from "./service/UserService";
import { registerPresenceHandlers } from "./socketHandlers/presenceHandlers";
import { registerActivityHandlers } from "./socketHandlers/activityHandlers";
import { registerConversationHandlers } from "./socketHandlers/conversationHandlers";
import { registerMessageHandlers } from "./socketHandlers/messageHandlers";
import { registerReactionHandlers } from "./socketHandlers/reactionHandlers";

const initializeSocket = async (io: Server) => {
  io.on("connect", (socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    UserService.updateLastSeenAt(socket.data.userId);
    socket.join(socket.data.userId);

    registerPresenceHandlers({ io, socket });
    registerActivityHandlers({ socket });
    registerConversationHandlers({ socket });
    registerMessageHandlers({ io, socket });
    registerReactionHandlers({ socket });
  });
};

export default initializeSocket;
