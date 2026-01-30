/*
  Warnings:

  - You are about to drop the column `isGroup` on the `Conversation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "isGroup",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'DIRECT';
