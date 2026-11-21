-- Job Card for repairs and services: whether a Job Card was opened as a
-- routine service (it then starts the vehicle's next-service count once
-- checked out) and when staff attended to its prediction. Two columns only;
-- re-runnable; skipped on a brand-new database.
DO $$
BEGIN
  IF to_regclass('public.job_cards') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "isService" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "job_cards" ADD COLUMN IF NOT EXISTS "serviceAttendedAt" TIMESTAMP(3);
END $$;
