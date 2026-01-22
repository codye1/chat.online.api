import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// Define your routes here
router.get("/", async (req, res) => {
  const users = await prisma.user.findMany();

  res.json({ message: "Welcome to the API", users });
});

export default router;
