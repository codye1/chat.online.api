import { Server, Socket } from "socket.io";

export interface SocketHandlerContext {
  io: Server;
  socket: Socket;
}
