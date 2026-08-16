CREATE TABLE "app"."admin_dashboard_daily_metrics" (
    "day" DATE NOT NULL,
    "signup_count" INTEGER NOT NULL,
    "dau_count" INTEGER NOT NULL,
    "message_count" INTEGER NOT NULL,
    "usage_seconds" DOUBLE PRECISION NOT NULL,
    "stt_avg_ms" DOUBLE PRECISION,
    "stt_p95_ms" DOUBLE PRECISION,
    "translation_avg_ms" DOUBLE PRECISION,
    "translation_p95_ms" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_dashboard_daily_metrics_pkey" PRIMARY KEY ("day")
);
