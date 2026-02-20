/*
  Warnings:

  - The `type` column on the `Conversation` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "type",
ADD COLUMN     "type" "ConversationType" NOT NULL DEFAULT 'DIRECT';
