-- CreateTable
CREATE TABLE "MessageMedia" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageMedia_messageId_idx" ON "MessageMedia"("messageId");

-- AddForeignKey
ALTER TABLE "MessageMedia" ADD CONSTRAINT "MessageMedia_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
