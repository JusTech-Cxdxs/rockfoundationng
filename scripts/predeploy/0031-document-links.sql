-- D'Phoenix phase 6A — documents on WhatsApp: the secure link a WhatsApp
-- message carries to a customer's estimate, invoice or receipt PDF (a
-- WhatsApp message cannot attach a file). Only the SHA-256 of each token is
-- kept, never the token. Additive only (one new type, one new table that
-- starts empty, its indexes); re-runnable; skipped on a brand-new database,
-- where `prisma db push` creates everything. The push that follows adds the
-- foreign keys.
DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL OR to_regclass('public.job_cards') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentLinkKind') THEN
    CREATE TYPE "DocumentLinkKind" AS ENUM ('ESTIMATE', 'INVOICE', 'RECEIPT');
  END IF;

  -- recordId: the Job Card (estimate, invoice) or the payment (receipt). 30 days; revocable.
  CREATE TABLE IF NOT EXISTS "document_links" (
    "id"             TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind"           "DocumentLinkKind" NOT NULL,
    "recordId"       TEXT NOT NULL,
    "tokenHash"      TEXT NOT NULL,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "revokedAt"      TIMESTAMP(3),
    "createdById"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openCount"      INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt"   TIMESTAMP(3),
    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "document_links_tokenHash_key" ON "document_links"("tokenHash");
  CREATE INDEX IF NOT EXISTS "document_links_organisationId_kind_recordId_idx" ON "document_links"("organisationId", "kind", "recordId");
END $$;
