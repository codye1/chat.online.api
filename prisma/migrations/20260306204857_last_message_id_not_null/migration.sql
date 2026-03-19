/*
  Warnings:

  - Made the column `lastMessageId` on table `Conversation` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "lastMessageId" SET NOT NULL;
