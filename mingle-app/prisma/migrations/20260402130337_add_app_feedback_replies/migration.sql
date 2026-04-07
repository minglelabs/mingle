-- CreateTable
CREATE TABLE "app_feedback_replies" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "author_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_feedback_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_feedback_replies_feedback_created_at_idx" ON "app_feedback_replies"("feedback_id", "created_at");

-- CreateIndex
CREATE INDEX "app_feedback_replies_author_type_created_at_idx" ON "app_feedback_replies"("author_type", "created_at");

-- AddForeignKey
ALTER TABLE "app_feedback_replies" ADD CONSTRAINT "app_feedback_replies_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "app_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
