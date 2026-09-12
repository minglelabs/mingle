-- CreateTable
CREATE TABLE "profile_bio_states" (
    "user_id" TEXT NOT NULL,
    "current_version_id" TEXT,
    "published_version_id" TEXT,

    CONSTRAINT "profile_bio_states_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "profile_bio_versions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_text" TEXT NOT NULL,
    "source_language" TEXT,
    "target_languages" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'queued',
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_bio_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_bio_translations" (
    "version_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "text" TEXT,
    "attempt_id" TEXT NOT NULL,
    "deadline_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_bio_translations_pkey" PRIMARY KEY ("version_id","language")
);

-- CreateIndex
CREATE INDEX "profile_bio_versions_user_id_created_at_idx" ON "profile_bio_versions"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "profile_bio_states" ADD CONSTRAINT "profile_bio_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_bio_versions" ADD CONSTRAINT "profile_bio_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_bio_translations" ADD CONSTRAINT "profile_bio_translations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "profile_bio_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
