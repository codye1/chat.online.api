/*
  Warnings:

  - A unique constraint covering the columns `[messageId,userId,content]` on the table `Reaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Reaction_messageId_userId_content_key" ON "Reaction"("messageId", "userId", "content");
