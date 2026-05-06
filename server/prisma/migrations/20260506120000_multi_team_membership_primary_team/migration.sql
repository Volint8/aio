ALTER TABLE "OrganizationMember" RENAME COLUMN "teamId" TO "primaryTeamId";

ALTER TABLE "Invite" RENAME COLUMN "teamId" TO "primaryTeamId";
ALTER TABLE "Invite" ADD COLUMN "teamIds" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "OrganizationMemberTeam" (
    "id" TEXT NOT NULL,
    "organizationMemberId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMemberTeam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationMemberTeam_organizationMemberId_teamId_key" ON "OrganizationMemberTeam"("organizationMemberId", "teamId");
CREATE INDEX "OrganizationMemberTeam_teamId_idx" ON "OrganizationMemberTeam"("teamId");
CREATE INDEX "OrganizationMember_primaryTeamId_idx" ON "OrganizationMember"("primaryTeamId");

ALTER TABLE "OrganizationMember" DROP CONSTRAINT "OrganizationMember_teamId_fkey";
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_primaryTeamId_fkey" FOREIGN KEY ("primaryTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invite" DROP CONSTRAINT "Invite_teamId_fkey";
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_primaryTeamId_fkey" FOREIGN KEY ("primaryTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationMemberTeam" ADD CONSTRAINT "OrganizationMemberTeam_organizationMemberId_fkey" FOREIGN KEY ("organizationMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMemberTeam" ADD CONSTRAINT "OrganizationMemberTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "OrganizationMemberTeam" ("id", "organizationMemberId", "teamId", "createdAt")
SELECT gen_random_uuid(), "id", "primaryTeamId", CURRENT_TIMESTAMP
FROM "OrganizationMember"
WHERE "primaryTeamId" IS NOT NULL;

UPDATE "Invite"
SET "teamIds" = jsonb_build_array("primaryTeamId")
WHERE "primaryTeamId" IS NOT NULL;
