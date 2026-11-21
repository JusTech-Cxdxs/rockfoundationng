-- D'Phoenix phase 3 — money and documents: the organisation's billing & tax
-- settings, discounts on Job Card estimates, a receipt number on each payment
-- and the invoices table. Additive only (new columns, one new table, unique
-- indexes on columns that start empty); re-runnable; skipped on a brand-new
-- database, where `prisma db push` creates everything. The push that follows
-- adds the invoices table's foreign keys.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL OR to_regclass('public.job_cards') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "vatEnabled" BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7.5;
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "vatNumber" TEXT;
  ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "discountApprovalPercent" INTEGER;

  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2);
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "discountApprovedById" TEXT;
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "discountApprovedAt" TIMESTAMP(3);
  -- The VAT rate fixed at the Manager's final approval (null until then).
  ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2);
  ALTER TABLE "estimate_line_items" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12,2);

  -- RCT-2026-000001; payments recorded before receipts existed keep none.
  ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS "payments_receiptNumber_key" ON "payments"("receiptNumber");

  CREATE TABLE IF NOT EXISTS "invoices" (
    "id"                TEXT NOT NULL,
    "invoiceNumber"     TEXT NOT NULL,
    "organisationId"    TEXT NOT NULL,
    "branchId"          TEXT NOT NULL,
    "jobCardId"         TEXT NOT NULL,
    "customerId"        TEXT NOT NULL,
    "subtotal"          DECIMAL(12,2) NOT NULL,
    "lineDiscounts"     DECIMAL(12,2) NOT NULL,
    "discountAmount"    DECIMAL(12,2) NOT NULL,
    "discountReason"    TEXT,
    "vatRate"           DECIMAL(5,2) NOT NULL,
    "vatAmount"         DECIMAL(12,2) NOT NULL,
    "vatNumber"         TEXT,
    "total"             DECIMAL(12,2) NOT NULL,
    "amountPaidAtIssue" DECIMAL(12,2) NOT NULL,
    "lines"             JSONB NOT NULL,
    "issuedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById"        TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
  );
  -- One invoice per Job Card, one number per invoice.
  CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
  CREATE UNIQUE INDEX IF NOT EXISTS "invoices_jobCardId_key" ON "invoices"("jobCardId");
  CREATE INDEX IF NOT EXISTS "invoices_organisationId_issuedAt_idx" ON "invoices"("organisationId", "issuedAt");
  CREATE INDEX IF NOT EXISTS "invoices_branchId_idx" ON "invoices"("branchId");
  CREATE INDEX IF NOT EXISTS "invoices_customerId_idx" ON "invoices"("customerId");
END $$;
