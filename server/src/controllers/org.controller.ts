import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { buildOrgNameSuggestions, makeUniqueOrgName, makeUniqueSlug, normalizeOrgName } from '../utils/org.utils';
import { generateInviteToken, getEmailDomain, hashToken, isWorkEmail, normalizeEmail } from '../utils/auth.utils';
import { sendInviteEmail } from '../services/email.service';

const prisma = new PrismaClient();

const getMembership = async (userId: string, organizationId: string) => {
  return prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId
      }
    }
  });
};

const requireAdmin = async (userId: string, organizationId: string) => {
  const membership = await getMembership(userId, organizationId);
  return !!membership && membership.role === 'ADMIN';
};

const buildTeamName = (name: string) => normalizeOrgName(name);

const validateTeamParticipants = async (tx: any, organizationId: string, leadUserId: string, memberUserIds: string[]) => {
  const uniqueMemberIds = Array.from(new Set(memberUserIds));

  if (!uniqueMemberIds.includes(leadUserId)) {
    uniqueMemberIds.push(leadUserId);
  }

  const memberships = await tx.organizationMember.findMany({
    where: {
      organizationId,
      userId: { in: uniqueMemberIds }
    }
  });

  if (memberships.length !== uniqueMemberIds.length) {
    throw new Error('All team users must be members of this organization');
  }

  const leadMembership = memberships.find((m: any) => m.userId === leadUserId);
  if (!leadMembership || leadMembership.role !== 'TEAM_LEAD') {
    throw new Error('Team lead must have TEAM_LEAD role in this organization');
  }

  const hasAdmin = memberships.some((m: any) => m.role === 'ADMIN');
  if (hasAdmin) {
    throw new Error('Admins cannot be assigned to teams');
  }

  return uniqueMemberIds;
};

const createOrReuseTag = async (params: {
  tx: any;
  organizationId: string;
  name: string;
  color?: string;
}) => {
  const { tx, organizationId, name, color } = params;
  const normalized = normalizeOrgName(name);
  const existing = await tx.tag.findFirst({
    where: {
      organizationId,
      normalizedName: normalized
    }
  });

  if (existing) {
    return existing;
  }

  return tx.tag.create({
    data: {
      organizationId,
      name: name.trim(),
      normalizedName: normalized,
      color: color || '#2563eb'
    }
  });
};

export const getOrgNameSuggestions = async (req: Request, res: Response) => {
  try {
    const email = req.query.email as string | undefined;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isWorkEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please use a work email address' });
    }

    const domain = getEmailDomain(normalizedEmail);
    const suggestions = await buildOrgNameSuggestions(domain);
    return res.json({ suggestions });
  } catch (error) {
    console.error('Get org name suggestions error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrgs = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;

    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: true
      },
      orderBy: { organization: { createdAt: 'asc' } }
    });

    const organizations = memberships.map((m) => ({
      ...m.organization,
      userRole: m.role
    }));

    return res.json(organizations);
  } catch (error) {
    console.error('Get orgs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createOrg = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const { name } = req.body as { name?: string };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const uniqueName = await makeUniqueOrgName(name.trim());
    const normalizedName = normalizeOrgName(uniqueName);
    const slug = await makeUniqueSlug(uniqueName);

    const organization = await prisma.organization.create({
      data: {
        name: uniqueName,
        normalizedName,
        slug,
        members: {
          create: {
            userId,
            role: 'ADMIN'
          }
        }
      }
    });

    return res.status(201).json(organization);
  } catch (error) {
    console.error('Create org error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrgById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const id = req.params.id as string;

    const membership = await getMembership(userId, id);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          },
          orderBy: { user: { email: 'asc' } }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.json({
      ...organization,
      userRole: membership.role
    });
  } catch (error) {
    console.error('Get org by ID error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const addMember = async (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'Direct add member is deprecated. Use invite flow: POST /orgs/:id/invites.'
  });
};

export const createInvite = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    if (!['TEAM_LEAD', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be TEAM_LEAD or MEMBER' });
    }

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    const normalizedInviteEmail = normalizeEmail(email);
    if (!isWorkEmail(normalizedInviteEmail)) {
      return res.status(400).json({ error: 'Please invite a work email address' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedInviteEmail } });
    if (existingUser) {
      const existingMembership = await prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId
          }
        }
      });

      if (existingMembership) {
        return res.status(400).json({ error: 'User is already a member of this organization' });
      }
    }

    await prisma.invite.updateMany({
      where: {
        organizationId,
        email: normalizedInviteEmail,
        status: 'PENDING'
      },
      data: {
        status: 'REVOKED'
      }
    });

    const rawToken = generateInviteToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const invite = await prisma.invite.create({
      data: {
        organizationId,
        email: normalizedInviteEmail,
        role,
        tokenHash,
        expiresAt,
        invitedByUserId: requesterUserId,
        status: 'PENDING'
      },
      include: {
        organization: {
          select: { name: true }
        },
        invitedBy: {
          select: { name: true, email: true }
        }
      }
    });

    const baseUrl = process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
    const inviteUrl = `${baseUrl}/accept-invite?token=${rawToken}`;

    try {
      await sendInviteEmail({
        to: normalizedInviteEmail,
        organizationName: invite.organization.name,
        role,
        inviteUrl,
        inviterName: invite.invitedBy.name || invite.invitedBy.email
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
    }

    return res.status(201).json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt
    });
  } catch (error) {
    console.error('Create invite error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listInvites = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can view invites' });
    }

    await prisma.invite.updateMany({
      where: {
        organizationId,
        status: 'PENDING',
        expiresAt: { lt: new Date() }
      },
      data: { status: 'EXPIRED' }
    });

    const invites = await prisma.invite.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true
      }
    });

    return res.json(invites);
  } catch (error) {
    console.error('List invites error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const resendInvite = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const token = req.params.token as string;
    const tokenHash = hashToken(token);

    const invite = await prisma.invite.findFirst({
      where: { tokenHash },
      include: { organization: true }
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    const isAdmin = await requireAdmin(requesterUserId, invite.organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can resend invites' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invites can be resent' });
    }

    const baseUrl = process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

    await sendInviteEmail({
      to: invite.email,
      organizationName: invite.organization.name,
      role: invite.role,
      inviteUrl
    });

    return res.json({ message: 'Invite resent' });
  } catch (error) {
    console.error('Resend invite error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateMemberRole = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const memberId = req.params.memberId as string;
    const { role } = req.body as { role?: string };

    if (!role || !['ADMIN', 'TEAM_LEAD', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Role must be ADMIN, TEAM_LEAD, or MEMBER' });
    }

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update member roles' });
    }

    const targetMembership = await prisma.organizationMember.findUnique({
      where: { id: memberId }
    });

    if (!targetMembership || targetMembership.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Member not found in this organization' });
    }

    if (targetMembership.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'ADMIN'
        }
      });

      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin from this organization' });
      }
    }

    if (targetMembership.role === 'TEAM_LEAD' && role !== 'TEAM_LEAD') {
      const leadingTeam = await prisma.team.findFirst({
        where: {
          organizationId,
          leadUserId: targetMembership.userId
        }
      });

      if (leadingTeam) {
        return res.status(400).json({ error: 'Reassign this team lead before changing their role' });
      }
    }

    const updatedMembership = await prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        role,
        ...(role === 'ADMIN' ? { teamId: null } : {})
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    return res.json(updatedMembership);
  } catch (error) {
    console.error('Update member role error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTeam = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { name, leadUserId, memberUserIds = [] } = req.body as {
      name?: string;
      leadUserId?: string;
      memberUserIds?: string[];
    };

    if (!name?.trim() || !leadUserId) {
      return res.status(400).json({ error: 'Team name and leadUserId are required' });
    }

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can create teams' });
    }

    const normalizedName = buildTeamName(name);

    const created = await prisma.$transaction(async (tx) => {
      const participantIds = await validateTeamParticipants(tx, organizationId, leadUserId, memberUserIds);

      const team = await tx.team.create({
        data: {
          organizationId,
          name: name.trim(),
          normalizedName,
          leadUserId
        }
      });

      await tx.organizationMember.updateMany({
        where: {
          organizationId,
          userId: { in: participantIds }
        },
        data: { teamId: team.id }
      });

      return team;
    });

    const fullTeam = await prisma.team.findUnique({
      where: { id: created.id },
      include: {
        leadUser: {
          select: { id: true, name: true, email: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    return res.status(201).json(fullTeam);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'A team with this name already exists in the organization' });
    }
    const message = typeof error?.message === 'string' ? error.message : 'Internal server error';
    if (message !== 'Internal server error') {
      return res.status(400).json({ error: message });
    }
    console.error('Create team error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTeams = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can view teams' });
    }

    const teams = await prisma.team.findMany({
      where: { organizationId },
      include: {
        leadUser: {
          select: { id: true, name: true, email: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const teamData = await Promise.all(teams.map(async (team) => {
      const [created, inProgress, completed] = await Promise.all([
        prisma.task.count({ where: { deletedAt: null, status: 'CREATED', taskTeams: { some: { teamId: team.id } } } }),
        prisma.task.count({ where: { deletedAt: null, status: 'IN_PROGRESS', taskTeams: { some: { teamId: team.id } } } }),
        prisma.task.count({ where: { deletedAt: null, status: 'COMPLETED', taskTeams: { some: { teamId: team.id } } } })
      ]);

      const members = await Promise.all(team.members.map(async (member) => {
        const [mCreated, mInProgress, mCompleted] = await Promise.all([
          prisma.task.count({ where: { deletedAt: null, assigneeId: member.userId, status: 'CREATED' } }),
          prisma.task.count({ where: { deletedAt: null, assigneeId: member.userId, status: 'IN_PROGRESS' } }),
          prisma.task.count({ where: { deletedAt: null, assigneeId: member.userId, status: 'COMPLETED' } })
        ]);

        return {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
          stats: {
            created: mCreated,
            inProgress: mInProgress,
            completed: mCompleted,
            total: mCreated + mInProgress + mCompleted
          }
        };
      }));

      return {
        id: team.id,
        name: team.name,
        leadUser: team.leadUser,
        stats: {
          created,
          inProgress,
          completed,
          total: created + inProgress + completed
        },
        members
      };
    }));

    return res.json(teamData);
  } catch (error) {
    console.error('Get teams error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTeam = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const teamId = req.params.teamId as string;
    const { name, leadUserId, memberUserIds = [] } = req.body as {
      name?: string;
      leadUserId?: string;
      memberUserIds?: string[];
    };

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update teams' });
    }

    const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });
    if (!existingTeam || existingTeam.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (!leadUserId) {
      return res.status(400).json({ error: 'leadUserId is required' });
    }

    await prisma.$transaction(async (tx) => {
      const participantIds = await validateTeamParticipants(tx, organizationId, leadUserId, memberUserIds);

      await tx.organizationMember.updateMany({
        where: { organizationId, teamId },
        data: { teamId: null }
      });

      await tx.organizationMember.updateMany({
        where: {
          organizationId,
          userId: { in: participantIds }
        },
        data: { teamId }
      });

      await tx.team.update({
        where: { id: teamId },
        data: {
          ...(name?.trim() ? { name: name.trim(), normalizedName: buildTeamName(name) } : {}),
          leadUserId
        }
      });
    });

    const updated = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        leadUser: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'A team with this name already exists in the organization' });
    }
    const message = typeof error?.message === 'string' ? error.message : 'Internal server error';
    if (message !== 'Internal server error') {
      return res.status(400).json({ error: message });
    }
    console.error('Update team error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTeam = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const teamId = req.params.teamId as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete teams' });
    }

    const existingTeam = await prisma.team.findUnique({ where: { id: teamId } });
    if (!existingTeam || existingTeam.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Team not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.updateMany({
        where: { organizationId, teamId },
        data: { teamId: null }
      });

      await tx.taskTeam.deleteMany({ where: { teamId } });
      await tx.team.delete({ where: { id: teamId } });
    });

    return res.json({ message: 'Team deleted' });
  } catch (error) {
    console.error('Delete team error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTag = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { name, color } = req.body as { name?: string; color?: string };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can create tags' });
    }

    const normalizedName = normalizeOrgName(name);

    const tag = await prisma.tag.create({
      data: {
        organizationId,
        name: name.trim(),
        normalizedName,
        color: color || '#2563eb'
      }
    });

    return res.status(201).json(tag);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Tag already exists in this organization' });
    }
    console.error('Create tag error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listTags = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const membership = await getMembership(userId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tags = await prisma.tag.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' }
    });

    return res.json(tags);
  } catch (error) {
    console.error('List tags error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTag = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const tagId = req.params.tagId as string;
    const { name, color } = req.body as { name?: string; color?: string };

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update tags' });
    }

    const existingTag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!existingTag || existingTag.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const updated = await prisma.tag.update({
      where: { id: tagId },
      data: {
        ...(name !== undefined ? { name: name.trim(), normalizedName: normalizeOrgName(name) } : {}),
        ...(color !== undefined ? { color } : {})
      }
    });

    return res.json(updated);
  } catch (error) {
    console.error('Update tag error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createOkr = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const {
      title,
      description,
      periodStart,
      periodEnd,
      assignments = [],
      keyResults = []
    } = req.body as {
      title?: string;
      description?: string;
      periodStart?: string;
      periodEnd?: string;
      assignments?: Array<{ targetType: string; targetId: string }>;
      keyResults?: Array<{ title: string; tagName: string; tagColor?: string }>;
    };

    if (!title || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'title, periodStart, and periodEnd are required' });
    }

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can create OKRs' });
    }

    const okr = await prisma.$transaction(async (tx) => {
      const created = await tx.okr.create({
        data: {
          organizationId,
          title,
          description,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          createdBy: userId,
          assignments: {
            create: assignments
              .filter((a) => ['TEAM', 'MEMBER'].includes(a.targetType) && a.targetId)
              .map((a) => ({ targetType: a.targetType, targetId: a.targetId }))
          }
        }
      });

      for (const kr of keyResults) {
        if (!kr?.title?.trim() || !kr?.tagName?.trim()) {
          continue;
        }

        const tag = await createOrReuseTag({
          tx,
          organizationId,
          name: kr.tagName,
          color: kr.tagColor
        });

        await tx.okrKeyResult.create({
          data: {
            okrId: created.id,
            title: kr.title.trim(),
            tagId: tag.id
          }
        });
      }

      return tx.okr.findUnique({
        where: { id: created.id },
        include: {
          assignments: true,
          keyResults: {
            include: {
              tag: true
            }
          }
        }
      });
    });

    return res.status(201).json(okr);
  } catch (error) {
    console.error('Create OKR error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listOkrs = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const membership = await getMembership(userId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where: any = { organizationId };
    if (['TEAM_LEAD', 'MEMBER'].includes(membership.role)) {
      const assignmentScope = [
        { assignments: { some: { targetType: 'MEMBER', targetId: userId } } },
        { assignments: { none: {} } }
      ];
      if (membership.teamId) {
        assignmentScope.unshift({ assignments: { some: { targetType: 'TEAM', targetId: membership.teamId } } });
      }

      where.OR = assignmentScope;
    }

    const okrs = await prisma.okr.findMany({
      where,
      include: {
        assignments: true,
        keyResults: {
          include: {
            tag: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(okrs);
  } catch (error) {
    console.error('List OKRs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateOkr = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const okrId = req.params.okrId as string;
    const {
      title,
      description,
      periodStart,
      periodEnd,
      assignments,
      keyResults
    } = req.body as {
      title?: string;
      description?: string;
      periodStart?: string;
      periodEnd?: string;
      assignments?: Array<{ targetType: string; targetId: string }>;
      keyResults?: Array<{ title: string; tagName: string; tagColor?: string }>;
    };

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update OKRs' });
    }

    const existing = await prisma.okr.findUnique({ where: { id: okrId } });
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: 'OKR not found' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.okr.update({
        where: { id: okrId },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(periodStart !== undefined ? { periodStart: new Date(periodStart) } : {}),
          ...(periodEnd !== undefined ? { periodEnd: new Date(periodEnd) } : {})
        }
      });

      if (assignments) {
        await tx.okrAssignment.deleteMany({ where: { okrId } });
        await tx.okrAssignment.createMany({
          data: assignments
            .filter((a) => ['TEAM', 'MEMBER'].includes(a.targetType) && a.targetId)
            .map((a) => ({
              okrId,
              targetType: a.targetType,
              targetId: a.targetId
            }))
        });
      }

      if (keyResults) {
        await tx.okrKeyResult.deleteMany({ where: { okrId } });
        for (const kr of keyResults) {
          if (!kr?.title?.trim() || !kr?.tagName?.trim()) {
            continue;
          }
          const tag = await createOrReuseTag({
            tx,
            organizationId,
            name: kr.tagName,
            color: kr.tagColor
          });
          await tx.okrKeyResult.create({
            data: {
              okrId,
              title: kr.title.trim(),
              tagId: tag.id
            }
          });
        }
      }

      return tx.okr.findUnique({
        where: { id: updatedRecord.id },
        include: {
          assignments: true,
          keyResults: {
            include: {
              tag: true
            }
          }
        }
      });
    });

    return res.json(updated);
  } catch (error) {
    console.error('Update OKR error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateAppraisal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { subjectUserId, cycle, summary } = req.body as { subjectUserId?: string; cycle?: string; summary?: string };

    if (!subjectUserId || !cycle) {
      return res.status(400).json({ error: 'subjectUserId and cycle are required' });
    }

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can generate appraisals' });
    }

    const membership = await getMembership(subjectUserId, organizationId);
    if (!membership) {
      return res.status(400).json({ error: 'Subject user is not a member of this organization' });
    }

    const created = await prisma.appraisal.create({
      data: {
        organizationId,
        subjectUserId,
        createdByUserId: userId,
        cycle,
        summary: summary || 'Auto-generated appraisal placeholder',
        status: 'GENERATED'
      }
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error('Generate appraisal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listAppraisals = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const membership = await getMembership(userId, organizationId);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const appraisals = await prisma.appraisal.findMany({
      where: { organizationId },
      include: {
        subjectUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(appraisals);
  } catch (error) {
    console.error('List appraisals error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAudit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can view organization audit' });
    }

    const [memberCount, taskCount, pendingInvites, tagCount, okrCount, appraisalCount] = await Promise.all([
      prisma.organizationMember.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId, deletedAt: null } }),
      prisma.invite.count({ where: { organizationId, status: 'PENDING', expiresAt: { gte: new Date() } } }),
      prisma.tag.count({ where: { organizationId } }),
      prisma.okr.count({ where: { organizationId } }),
      prisma.appraisal.count({ where: { organizationId } })
    ]);

    return res.json({
      organizationId,
      memberCount,
      taskCount,
      pendingInvites,
      tagCount,
      okrCount,
      appraisalCount
    });
  } catch (error) {
    console.error('Get audit error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
