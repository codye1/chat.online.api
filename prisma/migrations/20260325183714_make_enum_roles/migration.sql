/*
  Warnings:

  - The `role` column on the `ConversationParticipant` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('OWNER', 'PARTICIPANT');

-- AlterTable
ALTER TABLE "ConversationParticipant" DROP COLUMN "role",
ADD COLUMN     "role" "ConversationParticipantRole" NOT NULL DEFAULT 'PARTICIPANT';
