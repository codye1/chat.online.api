import express from "express";
import cookieParser from "cookie-parser";
import cors, { CorsOptions } from "cors";
import * as http from "http";
import router from "./router/router";
import errorMiddleware from "./middlewares/errorMiddleware";
import { Server } from "socket.io";
import socketAuthMiddleware from "./middlewares/socketAuthMiddleware";
import initializeSocket from "./socket";

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.use(cookieParser());

const corsAllowList = (process.env.CORS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (corsAllowList.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("/{*splat}", cors(corsOptions));
app.use(router);
app.use(errorMiddleware);
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  cors: corsOptions,
});

io.use(socketAuthMiddleware);
initializeSocket(io);
server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
