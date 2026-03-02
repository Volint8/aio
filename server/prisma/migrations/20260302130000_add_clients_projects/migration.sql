ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_organizationId_normalizedName_key" ON "Client"("organizationId", "normalizedName");
CREATE UNIQUE INDEX "Project_clientId_normalizedName_key" ON "Project"("clientId", "normalizedName");
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Client" ("id", "organizationId", "name", "normalizedName", "createdByUserId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o."id") AS "id",
  o."id" AS "organizationId",
  'General' AS "name",
  'general' AS "normalizedName",
  COALESCE(
    (
      SELECT om."userId"
      FROM "OrganizationMember" om
      WHERE om."organizationId" = o."id" AND om."role" IN ('TEAM_LEAD', 'MEMBER')
      ORDER BY om."id" ASC
      LIMIT 1
    ),
    (
      SELECT om2."userId"
      FROM "OrganizationMember" om2
      WHERE om2."organizationId" = o."id"
      ORDER BY om2."id" ASC
      LIMIT 1
    )
  ) AS "createdByUserId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "Client" c
  WHERE c."organizationId" = o."id" AND c."normalizedName" = 'general'
);

INSERT INTO "Project" ("id", "organizationId", "clientId", "name", "normalizedName", "createdByUserId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || c."id") AS "id",
  c."organizationId",
  c."id" AS "clientId",
  'Internal' AS "name",
  'internal' AS "normalizedName",
  c."createdByUserId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Client" c
WHERE c."normalizedName" = 'general'
  AND NOT EXISTS (
    SELECT 1 FROM "Project" p
    WHERE p."clientId" = c."id" AND p."normalizedName" = 'internal'
  );

UPDATE "Task" t
SET "projectId" = p."id"
FROM "Project" p
JOIN "Client" c ON c."id" = p."clientId"
WHERE t."organizationId" = c."organizationId"
  AND c."normalizedName" = 'general'
  AND p."normalizedName" = 'internal'
  AND t."projectId" IS NULL;

ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ALTER COLUMN "projectId" SET NOT NULL;

CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_organizationId_projectId_status_deletedAt_idx" ON "Task"("organizationId", "projectId", "status", "deletedAt");
