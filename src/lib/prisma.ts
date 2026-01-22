import "dotenv/config";

import { PrismaClient } from "../../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
