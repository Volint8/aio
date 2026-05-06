import { PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | any;

export const uniqueIds = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));

export const asTeamIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueIds(
    value.map((item) => (typeof item === 'string' ? item.trim() : null))
  );
};

export const getMembershipWithTeams = async (prisma: PrismaLike, userId: string, organizationId: string) => {
  return prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    },
    include: {
      primaryTeam: {
        select: { id: true, name: true }
      },
      teamMemberships: {
        include: {
          team: {
            select: { id: true, name: true }
          }
        },
        orderBy: {
          team: {
            name: 'asc'
          }
        }
      }
    }
  });
};

export const getMembershipTeamIds = (membership: any): string[] => {
  if (!membership) {
    return [];
  }

  const linkedTeamIds = Array.isArray(membership.teamMemberships)
    ? membership.teamMemberships.map((item: any) => item.teamId || item.team?.id || null)
    : [];

  return uniqueIds([...linkedTeamIds, membership.primaryTeamId]);
};

export const getMembershipTeams = (membership: any) => {
  const byId = new Map<string, { id: string; name: string }>();

  if (membership?.primaryTeam?.id) {
    byId.set(membership.primaryTeam.id, membership.primaryTeam);
  }

  if (Array.isArray(membership?.teamMemberships)) {
    membership.teamMemberships.forEach((item: any) => {
      if (item.team?.id) {
        byId.set(item.team.id, item.team);
      }
    });
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const ensurePrimaryTeamId = (teamIds: string[], preferredPrimaryTeamId?: string | null) => {
  if (preferredPrimaryTeamId && teamIds.includes(preferredPrimaryTeamId)) {
    return preferredPrimaryTeamId;
  }
  return teamIds[0] || null;
};

export const syncOrganizationMemberTeams = async (tx: PrismaLike, params: {
  organizationMemberId: string;
  teamIds: string[];
  primaryTeamId?: string | null;
}) => {
  const { organizationMemberId } = params;
  const teamIds = uniqueIds(params.teamIds);
  const primaryTeamId = ensurePrimaryTeamId(teamIds, params.primaryTeamId);

  await tx.organizationMemberTeam.deleteMany({
    where: { organizationMemberId }
  });

  if (teamIds.length > 0) {
    await tx.organizationMemberTeam.createMany({
      data: teamIds.map((teamId) => ({
        organizationMemberId,
        teamId
      }))
    });
  }

  await tx.organizationMember.update({
    where: { id: organizationMemberId },
    data: {
      primaryTeamId
    }
  });
};

export const addTeamsToOrganizationMember = async (tx: PrismaLike, params: {
  organizationMemberId: string;
  teamIds: string[];
  primaryTeamId?: string | null;
}) => {
  const { organizationMemberId } = params;
  const nextTeamIds = uniqueIds(params.teamIds);
  if (nextTeamIds.length > 0) {
    await tx.organizationMemberTeam.createMany({
      data: nextTeamIds.map((teamId) => ({
        organizationMemberId,
        teamId
      })),
      skipDuplicates: true
    });
  }

  const membership = await tx.organizationMember.findUnique({
    where: { id: organizationMemberId },
    include: {
      teamMemberships: true
    }
  });

  const allTeamIds = uniqueIds([
    ...(membership?.teamMemberships || []).map((item: any) => item.teamId),
    membership?.primaryTeamId,
    ...nextTeamIds
  ]);

  const primaryTeamId = membership?.primaryTeamId || ensurePrimaryTeamId(allTeamIds, params.primaryTeamId);

  await tx.organizationMember.update({
    where: { id: organizationMemberId },
    data: {
      primaryTeamId
    }
  });
};

export const removeTeamFromOrganizationMembers = async (tx: PrismaLike, params: {
  organizationId: string;
  teamId: string;
}) => {
  const memberships = await tx.organizationMember.findMany({
    where: {
      organizationId: params.organizationId,
      OR: [
        { primaryTeamId: params.teamId },
        { teamMemberships: { some: { teamId: params.teamId } } }
      ]
    },
    include: {
      teamMemberships: true
    }
  });

  await tx.organizationMemberTeam.deleteMany({
    where: { teamId: params.teamId }
  });

  await Promise.all(memberships.map(async (membership: any) => {
    const remainingTeamIds = uniqueIds(
      membership.teamMemberships
        .map((item: any) => item.teamId)
        .filter((teamId: string) => teamId !== params.teamId)
    );

    await tx.organizationMember.update({
      where: { id: membership.id },
      data: {
        primaryTeamId: ensurePrimaryTeamId(remainingTeamIds, membership.primaryTeamId === params.teamId ? null : membership.primaryTeamId)
      }
    });
  }));
};

export const getAccessibleTeamIds = async (prisma: PrismaLike, membership: any): Promise<string[]> => {
  if (!membership) {
    return [];
  }

  const teamIds = getMembershipTeamIds(membership);

  if (membership.role !== 'TEAM_LEAD') {
    return teamIds;
  }

  const ledTeams = await prisma.team.findMany({
    where: {
      organizationId: membership.organizationId,
      leadUserId: membership.userId
    },
    select: { id: true }
  });

  return uniqueIds([...teamIds, ...ledTeams.map((team: any) => team.id)]);
};

export const buildTeamsPayloadFromMembership = (membership: any) => {
  const teams = getMembershipTeams(membership);
  const primaryTeam = membership?.primaryTeam || null;

  return {
    teams,
    primaryTeam,
    team: primaryTeam,
    teamId: primaryTeam?.id || null
  };
};
