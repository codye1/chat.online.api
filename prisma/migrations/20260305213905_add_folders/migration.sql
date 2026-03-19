-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderConversation" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "FolderConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Folder_userId_idx" ON "Folder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_userId_position_key" ON "Folder"("userId", "position");

-- CreateIndex
CREATE INDEX "FolderConversation_folderId_idx" ON "FolderConversation"("folderId");

-- CreateIndex
CREATE INDEX "FolderConversation_conversationId_idx" ON "FolderConversation"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "FolderConversation_folderId_conversationId_key" ON "FolderConversation"("folderId", "conversationId");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderConversation" ADD CONSTRAINT "FolderConversation_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderConversation" ADD CONSTRAINT "FolderConversation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
