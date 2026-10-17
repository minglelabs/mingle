-- Staff-editable admin settings (key -> JSON value), e.g. the operator auto-reply delay.
CREATE TABLE "app_admin_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_session_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_admin_settings_pkey" PRIMARY KEY ("key")
);
