/*
  Warnings:

  - You are about to drop the column `isPinned` on the `ConversationParticipant` table. All the data in the column will be lost.
  - You are about to drop the column `isPinned` on the `FolderConversation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ConversationParticipant" DROP COLUMN "isPinned",
ADD COLUMN     "archivedPinnedPosition" INTEGER,
ADD COLUMN     "pinnedPosition" INTEGER;

-- AlterTable
ALTER TABLE "FolderConversation" DROP COLUMN "isPinned",
ADD COLUMN     "pinnedPosition" INTEGER;
