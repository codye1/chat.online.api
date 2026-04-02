import { Server } from "socket.io";

let io: Server | null = null;

export const setIo = (instance: Server) => {
  io = instance;
};

export const getIo = () => {
  if (!io) {
    throw new Error("Socket.IO server is not initialized");
  }

  return io;
};
