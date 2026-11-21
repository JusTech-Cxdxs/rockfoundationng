-- D'Phoenix phase 4 — the customer's approval and credit terms: the
-- organisation's deposit switch, the customer's own answer on the estimate
-- (approved by link, portal, phone or deposit, or declined), the secure
-- approval links, credit terms on organisation customers and the invoice's
-- due date. Additive only (new columns, one new table, a unique index on a
-- table that starts empty); re-runnable; skipped on a brand-new database,
-- where `prisma db push` creates everything. The push that follows adds the
-- foreign keys.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL OR to_regclass('public.job_cards') IS NULL THEN
    RETURN;
  END IF;

  -- Off by default; individual customers only (worked out in the app).
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "depositRequired" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "depositPercent" INTEGER NOT NULL DEFAULT 70;

  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "customerApprovedAt" TIMESTAMP(3);
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "customerApprovedVia" TEXT;
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "customerApprovedByStaffId" TEXT;
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "customerApprovalNote" TEXT;
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "customerDeclinedAt" TIMESTAMP(3);
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "customerDeclineNote" TEXT;

  -- Only the SHA-256 of each token is kept, never the token.
  CREATE TABLE IF NOT EXISTS "estimate_approval_links" (
    "id"          TEXT NOT NULL,
    "estimateId"  TEXT NOT NULL,
    "tokenHash"   TEXT NOT NULL,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "usedAt"      TIMESTAMP(3),
    "revokedAt"   TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "estimate_approval_links_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "estimate_approval_links_tokenHash_key" ON "estimate_approval_links"("tokenHash");
  CREATE INDEX IF NOT EXISTS "estimate_approval_links_estimateId_idx" ON "estimate_approval_links"("estimateId");

  -- On credit = payment terms above 0 days, approved by Finance or the Manager.
  ALTER TABLE "customer_companies" ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(14,2);
  ALTER TABLE "customer_companies" ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER;
  ALTER TABLE "customer_companies" ADD COLUMN IF NOT EXISTS "creditApprovedById" TEXT;
  ALTER TABLE "customer_companies" ADD COLUMN IF NOT EXISTS "creditApprovedAt" TIMESTAMP(3);

  -- Issued date + the payment terms; null on invoices due before collection.
  ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
END $$;
