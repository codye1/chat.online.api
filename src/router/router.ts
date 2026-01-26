import { Router } from "express";
import AuthController from "../controllers/AuthController";
import authMiddleware from "../middlewares/authMiddleware";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/", async (req, res) => {
  res.json({ message: "Welcome to the API" });
});

router.get("/health", async (req, res) => {
  const count = await prisma.user.count();
  res.json({ status: "OK", userCount: count });
});

router.post("/auth/register", AuthController.register);
router.post("/auth/login", AuthController.login);
router.post("/auth/refresh", AuthController.refreshToken);
router.post("/auth/logout", AuthController.logout);
router.post("/auth/google", AuthController.googleAuth);
router.get("/protected", authMiddleware, async (req, res) => {
  res.json({
    message: `Hello user ${req.userId}, you have accessed a protected route!`,
  });
});

export default router;
