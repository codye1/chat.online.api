import express from "express";
import cookieParser from "cookie-parser";
import cors, { CorsOptions } from "cors";
import router from "./router/router";
import errorMiddleware from "./middlewares/errorMiddleware";

const app = express();

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

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
