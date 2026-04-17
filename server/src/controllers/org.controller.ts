import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { buildOrgNameSuggestions, makeUniqueOrgName, makeUniqueSlug, normalizeOrgName } from '../utils/org.utils';
import { generateInviteToken, getEmailDomain, hashToken, isWorkEmail, normalizeEmail } from '../utils/auth.utils';
import { sendInviteEmail, sendOkrNotificationEmail, sendKeyResultNotificationEmail } from '../services/email.service';
import * as XLSX from 'xlsx';

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

const getEditorMembership = async (userId: string, organizationId: string) => {
  const membership = await getMembership(userId, organizationId);
  if (!membership) {
    return null;
  }
  if (!['TEAM_LEAD', 'MEMBER'].includes(membership.role)) {
    return null;
  }
  return membership;
};

const buildTeamName = (name: string) => normalizeOrgName(name);

const normalizeInviteRole = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return normalized ? normalized : null;
};

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

type OkrImpactKrSummary = {
  krId: string;
  krTitle: string;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  metricName: string | null;
  metricUnit: string | null;
  targetValue: number | null;
  actualValue: number;
  weight: number;
  contributionValue: number | null;
  contributionPct: number | null;
  achievedPct: number | null;
  approvalStatus: string;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
};

type OkrImpactSummary = {
  okrs: Array<{
    okrId: string;
    okrTitle: string;
    objectiveTargetValue: number | null;
    objectiveMetricUnit: string | null;
    achievedPct: number | null;
    targetValueTotal: number | null;
    actualValueTotal: number;
    keyResults: OkrImpactKrSummary[];
    quantitativeKrCount: number;
    excludedKrCount: number;
  }>;
  totals: {
    achievedPct: number | null;
    quantitativeOkrCount: number;
    excludedOkrCount: number;
  };
};

const asNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseFirstNumericValue = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/);
  if (!match) return null;
  const normalized = match[0].replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundMetric = (value: number | null | undefined, precision = 2): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const okrInclude = {
  assignments: true,
  keyResults: {
    include: {
      tag: true,
      assignedUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      approver: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  },
  creator: {
    select: {
      name: true,
      email: true
    }
  }
} as const;

const resolveTagForKr = async (params: {
  tx: any;
  organizationId: string;
  tagId?: string | null;
  tagName?: string | null;
  tagColor?: string | null;
}) => {
  const { tx, organizationId, tagId, tagName, tagColor } = params;

  if (tagId) {
    const existing = await tx.tag.findUnique({ where: { id: tagId } });
    if (!existing || existing.organizationId !== organizationId) {
      throw new Error('Selected tag is invalid for this organization');
    }
    return existing;
  }

  if (!tagName?.trim()) {
    throw new Error('Each key result requires a tag');
  }

  return createOrReuseTag({
    tx,
    organizationId,
    name: tagName,
    color: tagColor || undefined
  });
};

const getAssigneeLeadMembership = async (organizationId: string, assignedUserId: string) => {
  const assigneeMembership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: assignedUserId,
        organizationId
      }
    }
  });

  if (!assigneeMembership?.teamId) {
    return null;
  }

  return prisma.organizationMember.findFirst({
    where: {
      organizationId,
      teamId: assigneeMembership.teamId,
      role: 'TEAM_LEAD'
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
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

    // Check if user has admin role in any organization
    const memberships = await prisma.organizationMember.findMany({
      where: { userId }
    });

    const hasAdminRole = memberships.some(m => m.role === 'ADMIN');
    if (!hasAdminRole) {
      return res.status(403).json({ error: 'Only organization administrators can create new organizations' });
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

export const updateOrg = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const id = req.params.id as string;
    const { name } = req.body as { name?: string };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const membership = await getMembership(userId, id);

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only organization administrators can update the organization' });
    }

    // Check if name is actually changing
    const existingOrg = await prisma.organization.findUnique({ where: { id } });
    if (!existingOrg) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const normalizedName = normalizeOrgName(name.trim());

    // Only check uniqueness if name is actually changing
    if (normalizedName !== existingOrg.normalizedName) {
      const existingName = await prisma.organization.findUnique({
        where: { normalizedName }
      });
      if (existingName && existingName.id !== id) {
        return res.status(409).json({ error: 'Organization name already exists' });
      }
    }

    const uniqueName = name.trim();
    const slug = existingOrg.slug; // Keep existing slug

    const organization = await prisma.organization.update({
      where: { id },
      data: {
        name: uniqueName,
        normalizedName
      }
    });

    return res.json(organization);
  } catch (error) {
    console.error('Update org error:', error);
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
            team: {
              select: {
                id: true,
                name: true
              }
            },
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                jobTitle: true,
                signupSource: true,
                initialRole: true,
                createdAt: true
              }
            }
          },
          orderBy: { joinedAt: 'asc' }
        }
      }
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.json({
      ...organization,
      userRole: membership.role,
      canReviewSubmissions: ['ADMIN', 'TEAM_LEAD'].includes(membership.role)
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
    const { email, role, name } = req.body as { email?: string; role?: string; name?: string };

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    const normalizedRole = normalizeInviteRole(role);
    if (!normalizedRole || !['TEAM_LEAD', 'MEMBER'].includes(normalizedRole)) {
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
        role: normalizedRole,
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
        role: normalizedRole,
        inviteUrl,
        inviterName: invite.invitedBy.name || invite.invitedBy.email,
        inviteeName: name
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
    }

    return res.status(201).json({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      name: name || null
    });
  } catch (error) {
    console.error('Create invite error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const bulkInviteMembers = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can bulk invite members' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse the uploaded file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'Spreadsheet is empty' });
    }

    // Validate required columns
    const requiredColumns = ['Email', 'Role'];
    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        error: `Missing required columns: ${missingColumns.join(', ')}. Required columns are: ${requiredColumns.join(', ')}`
      });
    }

    // Get existing teams for validation
    const existingTeams = await prisma.team.findMany({
      where: { organizationId }
    });
    const teamNameMap = new Map<string, any>();
    existingTeams.forEach(team => {
      teamNameMap.set(normalizeOrgName(team.name), team);
    });

    // Process invites
    const results = {
      successful: [] as any[],
      failed: [] as Array<{ row: number; email: string; error: string }>
    };

    const baseUrl = process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row numbers start at 1, +1 for header

      try {
        const email = row['Email']?.toString()?.trim();
        const role = normalizeInviteRole(row['Role']);
        const teamName = row['Team']?.toString()?.trim();
        const category = row['Category']?.toString()?.trim();
        const name = row['Name']?.toString()?.trim();

        // Validate email
        if (!email) {
          results.failed.push({ row: rowNum, email: email || '', error: 'Email is required' });
          continue;
        }

        const normalizedEmail = normalizeEmail(email);
        if (!isWorkEmail(normalizedEmail)) {
          results.failed.push({ row: rowNum, email, error: 'Please use a work email address' });
          continue;
        }

        // Validate role
        if (!role || !['TEAM_LEAD', 'MEMBER'].includes(role)) {
          results.failed.push({ row: rowNum, email, error: 'Role must be TEAM_LEAD or MEMBER' });
          continue;
        }

        // Check if user already exists in organization
        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
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
            results.failed.push({ row: rowNum, email, error: 'User is already a member of this organization' });
            continue;
          }
        }

        // Validate team if provided, or create it if it doesn't exist
        let teamId: string | null = null;
        if (teamName) {
          const normalizedTeamName = normalizeOrgName(teamName);
          let team = teamNameMap.get(normalizedTeamName);

          // Auto-create team if it doesn't exist
          if (!team) {
            try {
              const newTeam = await prisma.team.create({
                data: {
                  organizationId,
                  name: teamName,
                  normalizedName: normalizeOrgName(teamName)
                }
              });
              teamNameMap.set(normalizedTeamName, newTeam);
              team = newTeam;
            } catch (createError: any) {
              // If team creation fails, check if it was created by another concurrent request
              const existingTeam = await prisma.team.findFirst({
                where: {
                  organizationId,
                  name: {
                    equals: teamName,
                    mode: 'insensitive'
                  }
                }
              });
              if (existingTeam) {
                team = existingTeam;
                teamNameMap.set(normalizedTeamName, existingTeam);
              } else {
                results.failed.push({ row: rowNum, email, error: `Failed to create team "${teamName}": ${createError.message}` });
                continue;
              }
            }
          }
          teamId = team.id;
        }

        // Revoke any existing pending invites for this email
        await prisma.invite.updateMany({
          where: {
            organizationId,
            email: normalizedEmail,
            status: 'PENDING'
          },
          data: { status: 'REVOKED' }
        });

        // Create invite
        const rawToken = generateInviteToken();
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

        const invite = await prisma.invite.create({
          data: {
            organizationId,
            email: normalizedEmail,
            role,
            teamId,
            category: category || null,
            tokenHash,
            expiresAt,
            invitedByUserId: requesterUserId,
            status: 'PENDING'
          },
          include: {
            organization: { select: { name: true } },
            invitedBy: { select: { name: true, email: true } },
            team: { select: { name: true } }
          }
        });

        const inviteUrl = `${baseUrl}/accept-invite?token=${rawToken}`;

        try {
          await sendInviteEmail({
            to: normalizedEmail,
            organizationName: invite.organization.name,
            role,
            inviteUrl,
            inviterName: invite.invitedBy.name || invite.invitedBy.email,
            inviteeName: name
          });
        } catch (emailError) {
          console.error(`Failed to send invite email to ${email}:`, emailError);
        }

        results.successful.push({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          team: invite.team?.name || null,
          category: invite.category,
          status: invite.status
        });

      } catch (error: any) {
        results.failed.push({
          row: rowNum,
          email: row['Email']?.toString() || 'Unknown',
          error: error.message || 'Unknown error'
        });
      }
    }

    return res.status(201).json({
      summary: {
        total: data.length,
        successful: results.successful.length,
        failed: results.failed.length
      },
      invites: results.successful,
      errors: results.failed
    });

  } catch (error: any) {
    console.error('Bulk invite error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
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
        team: { select: { name: true } },
        category: true,
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

export const resendInviteById = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const inviteId = req.params.inviteId as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can resend invites' });
    }

    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        organization: true,
        invitedBy: {
          select: { name: true, email: true }
        }
      }
    });

    if (!invite || invite.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending invites can be resent' });
    }

    const baseUrl = process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
    const rawToken = generateInviteToken();
    const tokenHash = hashToken(rawToken);
    const newExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await prisma.invite.update({
      where: { id: inviteId },
      data: {
        tokenHash,
        expiresAt: newExpiresAt
      }
    });

    const inviteUrl = `${baseUrl}/accept-invite?token=${rawToken}`;

    try {
      await sendInviteEmail({
        to: invite.email,
        organizationName: invite.organization.name,
        role: invite.role,
        inviteUrl,
        inviterName: invite.invitedBy.name || invite.invitedBy.email
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
    }

    return res.json({ message: 'Invite resent' });
  } catch (error) {
    console.error('Resend invite error:', error);
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

export const deleteInvite = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const inviteId = req.params.inviteId as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete invites' });
    }

    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status === 'ACCEPTED') {
      return res.status(400).json({ error: 'Cannot delete accepted invites' });
    }

    await prisma.invite.delete({ where: { id: inviteId } });

    return res.json({ message: 'Invite deleted' });
  } catch (error) {
    console.error('Delete invite error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeMember = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const memberId = req.params.memberId as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    const member = await prisma.organizationMember.findUnique({
      where: { id: memberId }
    });

    if (!member || member.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (member.userId === requesterUserId) {
      return res.status(400).json({ error: 'You cannot remove yourself from the organization. Use the "Leave Organization" feature or transfer ownership if available.' });
    }

    // Check if they are the only admin
    if (member.role === 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId, role: 'ADMIN' }
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last administrator.' });
      }
    }

    await prisma.organizationMember.delete({
      where: { id: memberId }
    });

    const remainingMemberships = await prisma.organizationMember.count({
      where: { userId: member.userId }
    });

    if (remainingMemberships === 0) {
      await prisma.user.update({
        where: { id: member.userId },
        data: {
          deletedAt: new Date(),
          purgedAt: null,
          otp: null,
          otpExpiresAt: null,
          passwordResetOtp: null,
          passwordResetOtpExpiresAt: null,
          pendingInviteId: null
        }
      }).catch((error) => {
        console.error('Failed to soft-delete user after removing last membership:', error);
      });
    }

    return res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
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

    if (role === 'ADMIN' && targetMembership.role !== 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: 'ADMIN'
        }
      });

      if (adminCount >= 1) {
        return res.status(400).json({ error: 'An organization can only have one admin' });
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

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can create teams' });
    }

    const normalizedName = buildTeamName(name);

    const created = await prisma.$transaction(async (tx) => {
      let participantIds: string[] = [];

      if (leadUserId) {
        participantIds = await validateTeamParticipants(tx, organizationId, leadUserId, memberUserIds);
      } else if (memberUserIds.length > 0) {
        // If no lead but members provided, just validate members
        const memberships = await tx.organizationMember.findMany({
          where: {
            organizationId,
            userId: { in: memberUserIds }
          }
        });

        if (memberships.length !== memberUserIds.length) {
          throw new Error('All team members must be members of this organization');
        }

        const hasAdmin = memberships.some((m: any) => m.role === 'ADMIN');
        if (hasAdmin) {
          throw new Error('Admins cannot be assigned to teams');
        }

        participantIds = memberUserIds;
      }

      const team = await tx.team.create({
        data: {
          organizationId,
          name: name.trim(),
          normalizedName,
          ...(leadUserId ? { leadUserId } : {})
        }
      });

      if (participantIds.length > 0) {
        await tx.organizationMember.updateMany({
          where: {
            organizationId,
            userId: { in: participantIds }
          },
          data: { teamId: team.id }
        });
      }

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
      const now = new Date();
      const [pending, ongoing, completed, overdue] = await Promise.all([
        prisma.task.count({ where: { deletedAt: null, status: 'CREATED', taskTeams: { some: { teamId: team.id } } } }),
        prisma.task.count({ where: { deletedAt: null, status: 'IN_PROGRESS', taskTeams: { some: { teamId: team.id } } } }),
        prisma.task.count({ where: { deletedAt: null, status: 'COMPLETED', taskTeams: { some: { teamId: team.id } } } }),
        prisma.task.count({
          where: {
            deletedAt: null,
            status: { not: 'COMPLETED' },
            taskTeams: { some: { teamId: team.id } },
            dueDate: { lt: now }
          }
        })
      ]);

      // Calculate OKR Progress for the team
      const teamOkrs = await prisma.okr.findMany({
        where: {
          organizationId,
          assignments: {
            some: {
              targetType: 'TEAM',
              targetId: team.id
            }
          }
        },
        include: {
          keyResults: true
        }
      });

      let totalProgress = 0;
      if (teamOkrs.length > 0) {
        const okrProgresses = await Promise.all(teamOkrs.map(async (okr) => {
          const tagIds = okr.keyResults.map(kr => kr.tagId);
          if (tagIds.length === 0) return 0;

          const [totalTasks, completedTasks] = await Promise.all([
            prisma.task.count({ where: { organizationId, tagId: { in: tagIds }, deletedAt: null } }),
            prisma.task.count({ where: { organizationId, tagId: { in: tagIds }, status: 'COMPLETED', deletedAt: null } })
          ]);

          return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        }));
        totalProgress = okrProgresses.reduce((acc, curr) => acc + curr, 0) / teamOkrs.length;
      }

      const members = await Promise.all(team.members.map(async (member) => {
        const [mPending, mOngoing, mCompleted, mOverdue, mOkrTasks] = await Promise.all([
          prisma.task.count({ where: { deletedAt: null, assigneeId: member.userId, status: 'CREATED' } }),
          prisma.task.count({ where: { deletedAt: null, assigneeId: member.userId, status: 'IN_PROGRESS' } }),
          prisma.task.count({ where: { deletedAt: null, assigneeId: member.userId, status: 'COMPLETED' } }),
          prisma.task.count({
            where: {
              deletedAt: null,
              assigneeId: member.userId,
              status: { not: 'COMPLETED' },
              dueDate: { lt: now }
            }
          }),
          prisma.task.count({
            where: {
              organizationId,
              assigneeId: member.userId,
              deletedAt: null,
              tag: {
                keyResults: { some: {} }
              }
            }
          })
        ]);

        const mTotal = mPending + mOngoing + mCompleted;
        let performanceScore = 0;
        let temperature = '🔴 Low Activity';

        if (mTotal > 0) {
          const completionRate = (mCompleted / mTotal) * 50;
          const deadlineRate = ((mTotal - mOverdue) / mTotal) * 30;
          const okrContribution = (mOkrTasks / mTotal) * 20;
          performanceScore = Math.round(completionRate + deadlineRate + okrContribution);

          if (performanceScore > 75) temperature = '🔥 High Performance';
          else if (performanceScore > 35) temperature = '🟡 Moderate Performance';
        }

        return {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          role: member.role,
          stats: {
            pending: mPending,
            ongoing: mOngoing,
            completed: mCompleted,
            overdue: mOverdue,
            total: mTotal,
            performanceScore,
            temperature
          }
        };
      }));

      return {
        id: team.id,
        name: team.name,
        leadUser: team.leadUser,
        stats: {
          pending,
          ongoing,
          completed,
          overdue,
          total: pending + ongoing + completed,
          okrProgress: Math.round(totalProgress)
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

    await prisma.$transaction(async (tx) => {
      let participantIds: string[] = [];

      if (leadUserId) {
        participantIds = await validateTeamParticipants(tx, organizationId, leadUserId, memberUserIds);
      } else if (memberUserIds.length > 0) {
        const memberships = await tx.organizationMember.findMany({
          where: {
            organizationId,
            userId: { in: memberUserIds }
          }
        });

        if (memberships.length !== memberUserIds.length) {
          throw new Error('All team members must be members of this organization');
        }

        const hasAdmin = memberships.some((m: any) => m.role === 'ADMIN');
        if (hasAdmin) {
          throw new Error('Admins cannot be assigned to teams');
        }

        participantIds = memberUserIds;
      }

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
          leadUserId: leadUserId || null
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

export const listClients = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const membership = await getMembership(userId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const isAdmin = membership.role === 'ADMIN';

    const whereClause: any = {
      organizationId,
      ...(isAdmin ? {} : {
        OR: [
          { visibility: 'ORG_WIDE' },
          { createdByUserId: userId }
        ]
      })
    };

    const clients = await prisma.client.findMany({
      where: whereClause,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const data = await Promise.all(clients.map(async (client) => {
      const taskCount = await prisma.task.count({
        where: {
          organizationId,
          deletedAt: null
        }
      });
      return {
        id: client.id,
        organizationId: client.organizationId,
        name: client.name,
        normalizedName: client.normalizedName,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        createdByUserId: client.createdByUserId,
        createdBy: client.createdBy,
        projectCount: 0,
        taskCount
      };
    }));

    return res.json(data);
  } catch (error) {
    console.error('List clients error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createClient = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { name, visibility } = req.body as { name?: string; visibility?: string };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const editorMembership = await getEditorMembership(userId, organizationId);
    if (!editorMembership) {
      return res.status(403).json({ error: 'Only team leads or members can create clients' });
    }

    if (visibility && !['ORG_WIDE', 'CREATOR_ONLY'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibility must be ORG_WIDE or CREATOR_ONLY' });
    }

    const client = await prisma.client.create({
      data: {
        organizationId,
        name: name.trim(),
        normalizedName: normalizeOrgName(name),
        createdByUserId: userId,
        visibility: visibility || 'ORG_WIDE'
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    return res.status(201).json({
      ...client,
      projectCount: 0,
      taskCount: 0
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'Client already exists in this organization' });
    }
    console.error('Create client error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateClient = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const clientId = req.params.clientId as string;
    const { name, visibility } = req.body as { name?: string; visibility?: string };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const editorMembership = await getEditorMembership(userId, organizationId);
    if (!editorMembership) {
      return res.status(403).json({ error: 'Only team leads or members can update clients' });
    }

    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Client not found' });
    }
    if (existing.createdByUserId !== userId) {
      return res.status(403).json({ error: 'You can only update clients you created' });
    }

    if (visibility && !['ORG_WIDE', 'CREATOR_ONLY'].includes(visibility)) {
      return res.status(400).json({ error: 'Visibility must be ORG_WIDE or CREATOR_ONLY' });
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        name: name.trim(),
        normalizedName: normalizeOrgName(name),
        ...(visibility !== undefined ? { visibility } : {})
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const taskCount = await prisma.task.count({
      where: {
        organizationId,
        deletedAt: null
      }
    });

    return res.json({
      ...updated,
      projectCount: 0,
      taskCount
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'Client already exists in this organization' });
    }
    console.error('Update client error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteClient = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const clientId = req.params.clientId as string;

    const editorMembership = await getEditorMembership(userId, organizationId);
    if (!editorMembership) {
      return res.status(403).json({ error: 'Only team leads or members can delete clients' });
    }

    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Client not found' });
    }
    if (existing.createdByUserId !== userId) {
      return res.status(403).json({ error: 'You can only delete clients you created' });
    }

    await prisma.client.delete({
      where: { id: clientId }
    });

    return res.json({ message: 'Client deleted' });
  } catch (error) {
    console.error('Delete client error:', error);
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
      include: {
        _count: {
          select: { tasks: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    return res.json(tags.map(tag => ({
      ...tag,
      taskCount: tag._count.tasks
    })));
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

export const deleteTag = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const tagId = req.params.tagId as string;

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete tags' });
    }

    const existingTag = await prisma.tag.findUnique({
      where: { id: tagId },
      include: { _count: { select: { tasks: true, keyResults: true } } }
    });

    if (!existingTag || existingTag.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (existingTag._count.tasks > 0 || existingTag._count.keyResults > 0) {
      return res.status(400).json({ error: 'Cannot delete tag that is in use by tasks or OKRs' });
    }

    await prisma.tag.delete({ where: { id: tagId } });

    return res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Delete tag error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const notifyAssignedKeyResults = async (params: {
  organizationId: string;
  actorUserId: string;
  okr: any;
  periodStart: string;
  periodEnd: string;
}) => {
  const { organizationId, actorUserId, okr, periodStart, periodEnd } = params;

  if (!okr?.keyResults?.length) {
    return;
  }

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    });

    const creator = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { name: true }
    });

    const seenUsers = new Set<string>();
    for (const kr of okr.keyResults) {
      const assignee = kr.assignedUser;
      if (!assignee?.id || seenUsers.has(`${kr.id}:${assignee.id}`)) {
        continue;
      }
      seenUsers.add(`${kr.id}:${assignee.id}`);

      try {
        await prisma.notification.create({
          data: {
            organizationId,
            senderId: actorUserId,
            targetType: 'INDIVIDUAL',
            targetId: assignee.id,
            type: 'PRIORITY_ALERT',
            message: `You have been assigned a key result: ${kr.title}`
          }
        });

        await sendKeyResultNotificationEmail({
          to: assignee.email,
          recipientName: assignee.name,
          okrTitle: okr.title,
          keyResultTitle: kr.title,
          organizationName: organization?.name || '',
          creatorName: creator?.name || null,
          periodStart,
          periodEnd
        });
      } catch (notifyErr) {
        console.error(`Failed to notify ${assignee.email} about assigned KR:`, notifyErr);
      }
    }
  } catch (error) {
    console.error('Failed to send assigned KR notifications:', error);
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
      status,
      assignments = [],
      keyResults = []
    } = req.body as {
      title?: string;
      description?: string;
      periodStart?: string;
      periodEnd?: string;
      status?: string;
      assignments?: Array<{ targetType: string; targetId: string }>;
      keyResults?: Array<{
        title: string;
        tagId?: string;
        tagName?: string;
        tagColor?: string;
        assignedUserId?: string;
        isGeneral?: boolean;
        metricName?: string;
        metricUnit?: string;
        targetValue?: number | string | null;
        weight?: number | string | null;
      }>;
    };

    if (!title || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'title, periodStart, and periodEnd are required' });
    }

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can create OKRs' });
    }

    const objectiveTargetValue = parseFirstNumericValue(title);

    const nonGeneralKeyResults = keyResults.filter((kr) => kr?.title?.trim() && !kr.isGeneral);
    const assignableUserIds = Array.from(new Set(
      nonGeneralKeyResults
        .map((kr) => kr?.assignedUserId)
        .filter((value): value is string => !!value)
    ));
    if (assignableUserIds.length !== nonGeneralKeyResults.length) {
      return res.status(400).json({ error: 'Each non-general key result requires an assigned user' });
    }

    if (assignableUserIds.length > 0) {
      const memberships = await prisma.organizationMember.findMany({
        where: {
          organizationId,
          userId: { in: assignableUserIds }
        }
      });
      if (memberships.length !== assignableUserIds.length || memberships.some((member) => member.role === 'ADMIN')) {
        return res.status(400).json({ error: 'Assigned users must be non-admin organization members' });
      }
    }

    const okr = await prisma.$transaction(async (tx) => {
      const created = await tx.okr.create({
        data: {
          organizationId,
          title,
          description,
          objectiveTargetValue,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          status: status || 'NOT_YET_OPEN',
          createdBy: userId,
          assignments: {
            create: assignments
              .filter((a) => ['TEAM', 'MEMBER'].includes(a.targetType) && a.targetId)
              .map((a) => ({ targetType: a.targetType, targetId: a.targetId }))
          }
        }
      });

      for (const kr of keyResults) {
        if (!kr?.title?.trim()) {
          continue;
        }

        const tag = await resolveTagForKr({
          tx,
          organizationId,
          tagId: kr.tagId,
          tagName: kr.tagName,
          tagColor: kr.tagColor
        });
        const contributionValue = parseFirstNumericValue(kr.title);
        const contributionPct =
          contributionValue !== null && objectiveTargetValue !== null && objectiveTargetValue > 0
            ? roundMetric((contributionValue / objectiveTargetValue) * 100)
            : null;

        await tx.okrKeyResult.create({
          data: {
            okrId: created.id,
            title: kr.title.trim(),
            tagId: tag.id,
            assignedUserId: kr.isGeneral ? null : kr.assignedUserId,
            isGeneral: kr.isGeneral || false,
            metricName: kr.metricName?.trim() || null,
            metricUnit: kr.metricUnit?.trim() || null,
            targetValue: asNumberOrNull(kr.targetValue),
            weight: asNumberOrNull(kr.weight) ?? 1,
            contributionValue,
            contributionPct
          }
        });
      }

      return tx.okr.findUnique({
        where: { id: created.id },
        include: okrInclude
      });
    });

    // Send notifications to teams assigned to this OKR
    const teamAssignments = assignments.filter((a) => a.targetType === 'TEAM' && a.targetId);
    if (teamAssignments.length > 0 && okr) {
      try {
        const creator = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true }
        });

        const organization = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true }
        });

        for (const assignment of teamAssignments) {
          try {
            const team = await prisma.team.findUnique({
              where: { id: assignment.targetId },
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
                  }
                }
              }
            });

            if (team) {
              // Create in-app notification for the team
              await prisma.notification.create({
                data: {
                  organizationId,
                  senderId: userId,
                  targetType: 'TEAM',
                  targetId: assignment.targetId,
                  type: 'PRIORITY_ALERT',
                  message: `New OKR assigned to ${team.name}: ${okr.title}`
                }
              });

              // Send email notifications to all team members
              for (const member of team.members) {
                try {
                  await sendOkrNotificationEmail({
                    to: member.user.email,
                    recipientName: member.user.name,
                    okrTitle: okr.title,
                    okrDescription: okr.description || null,
                    teamName: team.name,
                    organizationName: organization?.name || '',
                    creatorName: creator?.name || null,
                    periodStart,
                    periodEnd
                  });
                } catch (memberNotifyErr) {
                  console.error(`Failed to notify member ${member.user.email} about OKR:`, memberNotifyErr);
                }
              }
            }
          } catch (teamNotifyErr) {
            console.error(`Failed to notify team ${assignment.targetId} about OKR:`, teamNotifyErr);
          }
        }
      } catch (notificationErr) {
        console.error('Failed to send team notifications:', notificationErr);
      }
    }

    if (keyResults.length > 0 && okr) {
      await notifyAssignedKeyResults({
        organizationId,
        actorUserId: userId,
        okr,
        periodStart,
        periodEnd
      });
    }

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

    const now = new Date();
    const where: any = { organizationId };

    // For non-admin users, restrict to OKRs they are involved in (team/member/KR assignment).
    // Keep org-wide OKRs limited to OPEN and within period.
    if (membership.role === 'MEMBER' || membership.role === 'TEAM_LEAD') {
      const assignmentScope: any[] = [
        { assignments: { some: { targetType: 'MEMBER', targetId: userId } } },
        { keyResults: { some: { assignedUserId: userId } } }
      ];
      if (membership.teamId) {
        assignmentScope.unshift({ assignments: { some: { targetType: 'TEAM', targetId: membership.teamId } } });
      }

      assignmentScope.push({
        assignments: { none: {} },
        status: 'OPEN',
        periodStart: { lte: now },
        periodEnd: { gte: now }
      });

      where.OR = assignmentScope;
    }

    const okrs = await prisma.okr.findMany({
      where,
      include: okrInclude,
      orderBy: { createdAt: 'desc' }
    });

    // Enrich assignments with team data
    const enrichedOkrs = await Promise.all(okrs.map(async (okr) => {
      const enrichedAssignments = await Promise.all(okr.assignments.map(async (assignment) => {
        if (assignment.targetType === 'TEAM') {
          const team = await prisma.team.findUnique({
            where: { id: assignment.targetId },
            select: { id: true, name: true }
          });
          return { ...assignment, team };
        }
        return assignment;
      }));
      return { ...okr, assignments: enrichedAssignments };
    }));

    return res.json(enrichedOkrs);
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
      keyResults,
      status
    } = req.body as {
      title?: string;
      description?: string;
      periodStart?: string;
      periodEnd?: string;
      assignments?: Array<{ targetType: string; targetId: string }>;
      keyResults?: Array<{
        title: string;
        tagId?: string;
        tagName?: string;
        tagColor?: string;
        assignedUserId?: string;
        isGeneral?: boolean;
        metricName?: string;
        metricUnit?: string;
        targetValue?: number | string | null;
        weight?: number | string | null;
      }>;
      status?: string;
    };

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can update OKRs' });
    }

    const existing = await prisma.okr.findUnique({ where: { id: okrId } });
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: 'OKR not found' });
    }

    const resolvedTitle = title !== undefined ? title : existing.title;
    const objectiveTargetValue = parseFirstNumericValue(resolvedTitle);

    if (keyResults) {
      const nonGeneralKeyResults = keyResults.filter((kr) => kr?.title?.trim() && !kr.isGeneral);
      const requiredAssignments = nonGeneralKeyResults;
      if (requiredAssignments.some((kr) => !kr.assignedUserId)) {
        return res.status(400).json({ error: 'Each non-general key result requires an assigned user' });
      }

      const assignableUserIds = Array.from(new Set(
        requiredAssignments
          .map((kr) => kr.assignedUserId)
          .filter((value): value is string => !!value)
      ));

      if (assignableUserIds.length > 0) {
        const memberships = await prisma.organizationMember.findMany({
          where: {
            organizationId,
            userId: { in: assignableUserIds }
          }
        });
        if (memberships.length !== assignableUserIds.length || memberships.some((member) => member.role === 'ADMIN')) {
          return res.status(400).json({ error: 'Assigned users must be non-admin organization members' });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.okr.update({
        where: { id: okrId },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          objectiveTargetValue,
          ...(periodStart !== undefined ? { periodStart: new Date(periodStart) } : {}),
          ...(periodEnd !== undefined ? { periodEnd: new Date(periodEnd) } : {}),
          ...(status !== undefined ? { status } : {})
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
          if (!kr?.title?.trim()) {
            continue;
          }

          const tag = await resolveTagForKr({
            tx,
            organizationId,
            tagId: kr.tagId,
            tagName: kr.tagName,
            tagColor: kr.tagColor
          });
          const contributionValue = parseFirstNumericValue(kr.title);
          const contributionPct =
            contributionValue !== null && objectiveTargetValue !== null && objectiveTargetValue > 0
              ? roundMetric((contributionValue / objectiveTargetValue) * 100)
              : null;
          await tx.okrKeyResult.create({
            data: {
              okrId,
              title: kr.title.trim(),
              tagId: tag.id,
              assignedUserId: kr.isGeneral ? null : kr.assignedUserId,
              isGeneral: kr.isGeneral || false,
              metricName: kr.metricName?.trim() || null,
              metricUnit: kr.metricUnit?.trim() || null,
              targetValue: asNumberOrNull(kr.targetValue),
              weight: asNumberOrNull(kr.weight) ?? 1,
              contributionValue,
              contributionPct
            }
          });
        }
      }

      return tx.okr.findUnique({
        where: { id: updatedRecord.id },
        include: okrInclude
      });
    });

    if (!updated) {
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (keyResults) {
      await notifyAssignedKeyResults({
        organizationId,
        actorUserId: userId,
        okr: updated,
        periodStart: updated.periodStart.toISOString(),
        periodEnd: updated.periodEnd.toISOString()
      });
    }

    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      try {
        const organization = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true }
        });

        const assignmentRecipients = await prisma.okrAssignment.findMany({
          where: { okrId: updated.id, targetType: 'TEAM' },
          select: { targetId: true }
        });

        const teamIds = assignmentRecipients.map(a => a.targetId);
        const members = await prisma.organizationMember.findMany({
          where: {
            organizationId,
            OR: [
              { teamId: { in: teamIds } },
              { role: 'ADMIN' }
            ]
          },
          include: { user: { select: { email: true } } }
        });

        const recipientEmails = Array.from(new Set(members.map(m => m.user.email).filter(Boolean)));

        const subject = `OKR Completed: ${updated.title}`;
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #22C55E;">OKR Completed! 🎉</h2>
            <p>The following OKR in <strong>${organization?.name}</strong> has been marked as completed:</p>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">${updated.title}</h3>
              <p>${updated.description || 'No description provided.'}</p>
            </div>
            <p>Well done to all involved teams!</p>
          </div>
        `;

        const { sendEmail } = require('../services/email.service');
        await Promise.all(recipientEmails.map(email => sendEmail(email, subject, html)));

        await prisma.notification.create({
          data: {
            organizationId,
            senderId: userId,
            targetType: 'TEAM',
            targetId: teamIds[0] || organizationId,
            type: 'OKR_COMPLETED',
            message: `OKR "${updated.title}" has been completed.`
          }
        });

      } catch (notifyError) {
        console.error('Failed to send OKR completion alert:', notifyError);
      }
    }

    return res.json(updated);
  } catch (error) {
    console.error('Update OKR error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteOkr = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const okrId = req.params.okrId as string;

    const isAdmin = await requireAdmin(userId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete OKRs' });
    }

    const existing = await prisma.okr.findUnique({ where: { id: okrId } });
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: 'OKR not found' });
    }

    await prisma.okr.delete({ where: { id: okrId } });

    return res.json({ message: 'OKR deleted successfully' });
  } catch (error) {
    console.error('Delete OKR error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const reviewKeyResult = async (req: Request, res: Response) => {
  try {
    const reviewerUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const okrId = req.params.okrId as string;
    const keyResultId = req.params.keyResultId as string;
    const { status, approvalNotes } = req.body as {
      status?: string;
      approvalNotes?: string;
    };

    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status || '')) {
      return res.status(400).json({ error: 'status must be APPROVED, REJECTED, or PENDING' });
    }

    const reviewerMembership = await getMembership(reviewerUserId, organizationId);
    if (!reviewerMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const keyResult = await prisma.okrKeyResult.findFirst({
      where: {
        id: keyResultId,
        okrId,
        okr: { organizationId }
      },
      include: {
        okr: true,
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        tag: true
      }
    });

    if (!keyResult) {
      return res.status(404).json({ error: 'Key result not found' });
    }

    let assigneeLeadMembership = null;
    if (keyResult.assignedUserId) {
      assigneeLeadMembership = await getAssigneeLeadMembership(organizationId, keyResult.assignedUserId);
    }
    const isAssigneeLead = assigneeLeadMembership?.userId === reviewerUserId;
    const isAdmin = reviewerMembership.role === 'ADMIN';

    if (!isAssigneeLead && !isAdmin) {
      return res.status(403).json({ error: 'Only the assignee team lead or an admin fallback can review this key result' });
    }

    const updated = await prisma.okrKeyResult.update({
      where: { id: keyResultId },
      data: {
        approvalStatus: status,
        approvedBy: status === 'PENDING' ? null : reviewerUserId,
        approvedAt: status === 'PENDING' ? null : new Date(),
        approvalNotes: approvalNotes?.trim() || null
      },
      include: {
        tag: true,
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (keyResult.assignedUserId) {
      await prisma.notification.create({
        data: {
          organizationId,
          senderId: reviewerUserId,
          targetType: 'INDIVIDUAL',
          targetId: keyResult.assignedUserId,
          type: 'PRIORITY_ALERT',
          message:
            status === 'APPROVED'
              ? `Your key result "${keyResult.title}" was approved`
              : status === 'REJECTED'
                ? `Your key result "${keyResult.title}" was rejected and needs revision`
                : `Your key result "${keyResult.title}" was returned to pending review`
        }
      }).catch(() => undefined);
    }

    return res.json(updated);
  } catch (error) {
    console.error('Review key result error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateAppraisal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { subjectUserId, cycle, okrIds, fromDate, toDate } = req.body as {
      subjectUserId?: string;
      cycle?: string;
      okrIds?: string[];
      fromDate?: string;
      toDate?: string;
    };

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

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    if ((fromDate && Number.isNaN(from?.getTime())) || (toDate && Number.isNaN(to?.getTime()))) {
      return res.status(400).json({ error: 'Invalid fromDate or toDate' });
    }

    const taskWhere: any = {
      organizationId,
      assigneeId: subjectUserId,
      deletedAt: null
    };
    if (from || to) {
      taskWhere.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {})
      };
    }

    // Task performance calculations
    const now = new Date();
    const [allTasks, completedTasks, overdueTasks] = await Promise.all([
      prisma.task.count({ where: taskWhere }),
      prisma.task.count({ where: { ...taskWhere, status: 'COMPLETED' } }),
      prisma.task.count({
        where: {
          ...taskWhere,
          status: { not: 'COMPLETED' },
          dueDate: { lt: now }
        }
      })
    ]);

    const tasksCompleted = allTasks > 0 ? (completedTasks / allTasks) * 100 : 0;
    const deadlinesMet = allTasks > 0 ? ((allTasks - overdueTasks) / allTasks) * 100 : 0;

    // Assigned-KR appraisal calculations
    const okrScopeWhere: any = { organizationId };
    if (okrIds && okrIds.length > 0) {
      okrScopeWhere.id = { in: okrIds };
    }

    const scopedOkrs = await prisma.okr.findMany({
      where: okrScopeWhere,
      include: {
        keyResults: {
          where: { assignedUserId: subjectUserId },
          include: {
            assignedUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            approver: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const krIds = scopedOkrs.flatMap((okr) => okr.keyResults.map((kr) => kr.id));
    const impactRows = krIds.length > 0
      ? await prisma.taskKrImpact.findMany({
        where: {
          okrKeyResultId: { in: krIds },
          task: { is: taskWhere }
        },
        select: {
          okrKeyResultId: true,
          actualValue: true
        }
      })
      : [];

    const actualByKr = new Map<string, number>();
    for (const row of impactRows) {
      const prev = actualByKr.get(row.okrKeyResultId) || 0;
      actualByKr.set(row.okrKeyResultId, prev + row.actualValue);
    }

    const assignedKeyResults = scopedOkrs.flatMap((okr) => okr.keyResults);
    const contributionWeightTotal = assignedKeyResults.reduce((acc, kr) => {
      const effectiveWeight = kr.contributionPct && kr.contributionPct > 0 ? kr.contributionPct : (kr.weight || 1);
      return acc + effectiveWeight;
    }, 0);

    const okrSummaries: OkrImpactSummary['okrs'] = scopedOkrs.map((okr) => {
      const keyResults: OkrImpactKrSummary[] = okr.keyResults.map((kr) => {
        const actualValue = actualByKr.get(kr.id) || 0;
        const targetValue = kr.targetValue ?? null;
        const achievedPct =
          targetValue && targetValue > 0
            ? Math.min((actualValue / targetValue) * 100, 100)
            : null;

        return {
          krId: kr.id,
          krTitle: kr.title,
          assignedUserId: kr.assignedUserId,
          assignedUserName: kr.assignedUser?.name || null,
          assignedUserEmail: kr.assignedUser?.email || null,
          metricName: kr.metricName || null,
          metricUnit: kr.metricUnit || null,
          targetValue,
          actualValue,
          weight: kr.weight || 1,
          contributionValue: kr.contributionValue ?? null,
          contributionPct: kr.contributionPct ?? null,
          achievedPct,
          approvalStatus: kr.approvalStatus,
          approvedByName: kr.approver?.name || kr.approver?.email || null,
          approvedAt: kr.approvedAt ? kr.approvedAt.toISOString() : null,
          approvalNotes: kr.approvalNotes || null
        };
      });

      const quantitativeKrs = keyResults.filter((kr) => kr.achievedPct !== null);
      const excludedKrCount = keyResults.length - quantitativeKrs.length;
      const weightTotal = quantitativeKrs.reduce((acc, kr) => {
        const effectiveWeight = kr.contributionPct && kr.contributionPct > 0 ? kr.contributionPct : (kr.weight || 1);
        return acc + effectiveWeight;
      }, 0);
      const achievedPct = weightTotal > 0
        ? quantitativeKrs.reduce((acc, kr) => {
          const effectiveWeight = kr.contributionPct && kr.contributionPct > 0 ? kr.contributionPct : (kr.weight || 1);
          const approvalFactor = kr.approvalStatus === 'APPROVED' ? 1 : 0;
          return acc + ((kr.achievedPct || 0) * effectiveWeight * approvalFactor);
        }, 0) / weightTotal
        : null;

      const hasAnyTarget = quantitativeKrs.length > 0;
      const targetValueTotal = hasAnyTarget
        ? quantitativeKrs.reduce((acc, kr) => acc + (kr.targetValue || 0), 0)
        : null;
      const actualValueTotal = keyResults.reduce((acc, kr) => acc + kr.actualValue, 0);

      return {
        okrId: okr.id,
        okrTitle: okr.title,
        objectiveTargetValue: okr.objectiveTargetValue ?? null,
        objectiveMetricUnit: okr.objectiveMetricUnit ?? null,
        achievedPct,
        targetValueTotal,
        actualValueTotal,
        keyResults,
        quantitativeKrCount: quantitativeKrs.length,
        excludedKrCount
      };
    });

    const approvedKeyResultCount = assignedKeyResults.filter((kr) => kr.approvalStatus === 'APPROVED').length;
    const rejectedKeyResultCount = assignedKeyResults.filter((kr) => kr.approvalStatus === 'REJECTED').length;
    const pendingKeyResultCount = assignedKeyResults.filter((kr) => kr.approvalStatus === 'PENDING').length;
    const krScore = contributionWeightTotal > 0
      ? assignedKeyResults.reduce((acc, kr) => {
        const actualValue = actualByKr.get(kr.id) || 0;
        const targetValue = kr.targetValue ?? null;
        const achievedPct =
          targetValue && targetValue > 0
            ? Math.min((actualValue / targetValue) * 100, 100)
            : 0;
        const effectiveWeight = kr.contributionPct && kr.contributionPct > 0 ? kr.contributionPct : (kr.weight || 1);
        const approvalFactor = kr.approvalStatus === 'APPROVED' ? 1 : 0;
        return acc + (achievedPct * effectiveWeight * approvalFactor);
      }, 0) / contributionWeightTotal
      : 0;
    const okrImpactScore = krScore;
    const okrImpactSummary: OkrImpactSummary = {
      okrs: okrSummaries,
      totals: {
        achievedPct: assignedKeyResults.length > 0 ? okrImpactScore : null,
        quantitativeOkrCount: assignedKeyResults.length,
        excludedOkrCount: okrSummaries.reduce((acc, okr) => acc + okr.excludedKrCount, 0)
      }
    };

    let okrContribution = 'LOW';
    if (okrImpactScore >= 70) okrContribution = 'HIGH';
    else if (okrImpactScore >= 30) okrContribution = 'MEDIUM';

    // Rating logic
    let overallRating = 'AVERAGE';
    const performanceScore = (tasksCompleted * 0.25) + (deadlinesMet * 0.2) + (okrImpactScore * 0.55);
    if (performanceScore >= 85) overallRating = 'EXCELLENT';
    else if (performanceScore >= 70) overallRating = 'GOOD';
    else if (performanceScore < 40) overallRating = 'POOR';

    const subjectUser = await prisma.user.findUnique({ where: { id: subjectUserId }, select: { name: true, email: true } });
    const name = subjectUser?.name || subjectUser?.email || 'Employee';

    const renderedOkrLines = okrSummaries.slice(0, 3).map((okr) => {
      if (okr.targetValueTotal && okr.targetValueTotal > 0 && okr.achievedPct !== null) {
        const approved = okr.keyResults.filter((kr) => kr.approvalStatus === 'APPROVED').length;
        return `For OKR "${okr.okrTitle}", approved delivery was ${Math.round(okr.actualValueTotal * 100) / 100} against target ${Math.round(okr.targetValueTotal * 100) / 100}, weighted achievement ${Math.round(okr.achievedPct)}%, with ${approved}/${okr.keyResults.length} key results approved.`;
      }
      return `For OKR "${okr.okrTitle}", assigned ownership is tracked but quantitative target data is incomplete.`;
    });

    const summary = `${name} logged ${allTasks} tasks during ${cycle}.
${name} completed ${completedTasks} tasks (${Math.round(tasksCompleted)}%) and met deadlines on ${Math.round(deadlinesMet)}% of tasks.
Assigned key results approved: ${approvedKeyResultCount}/${assignedKeyResults.length}. Pending: ${pendingKeyResultCount}. Rejected: ${rejectedKeyResultCount}.
${renderedOkrLines.length > 0 ? renderedOkrLines.join('\n') : 'No scoped OKRs were included for this appraisal.'}
Overall Rating: ${overallRating}`;

    const created = await prisma.appraisal.create({
      data: {
        organizationId,
        subjectUserId,
        createdByUserId: userId,
        cycle,
        summary,
        tasksCompleted,
        deadlinesMet,
        okrContribution,
        okrImpactScore,
        okrImpactSummary: okrImpactSummary as any,
        scoreBreakdown: {
          tasksCompletedWeight: 0.25,
          deadlinesMetWeight: 0.2,
          okrImpactWeight: 0.55,
          tasksCompleted,
          deadlinesMet,
          okrImpactScore,
          approvedKeyResultCount,
          pendingKeyResultCount,
          rejectedKeyResultCount,
          performanceScore
        } as any,
        overallRating,
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

    // Get team memberships for all subject users
    const subjectUserIds = appraisals.map(a => a.subjectUserId);
    const memberships = await prisma.organizationMember.findMany({
      where: {
        organizationId,
        userId: { in: subjectUserIds }
      },
      include: {
        team: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Create a map of userId to team
    const userTeamMap = new Map<string, { id: string; name: string } | null>();
    memberships.forEach(m => {
      userTeamMap.set(m.userId, m.team);
    });

    // Transform to include team info in subjectUser
    const transformedAppraisals = appraisals.map(appraisal => ({
      ...appraisal,
      subjectUser: appraisal.subjectUser ? {
        ...appraisal.subjectUser,
        team: userTeamMap.get(appraisal.subjectUserId) || null
      } : null
    }));

    return res.json(transformedAppraisals);
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

export const listQuotes = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;

    const membership = await getMembership(requesterUserId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const quotes = await prisma.quote.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(quotes);
  } catch (error) {
    console.error('List quotes error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createQuote = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const { text, author } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Quote text is required' });
    }

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can add quotes' });
    }

    const quote = await prisma.quote.create({
      data: {
        text: text.trim(),
        author: author?.trim(),
        organizationId
      }
    });

    return res.status(201).json(quote);
  } catch (error) {
    console.error('Create quote error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteQuote = async (req: Request, res: Response) => {
  try {
    const requesterUserId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const quoteId = req.params.quoteId as string;

    const isAdmin = await requireAdmin(requesterUserId, organizationId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete quotes' });
    }

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId }
    });

    if (!quote || quote.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    await prisma.quote.delete({
      where: { id: quoteId }
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Delete quote error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listUserOkrs = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.params.id as string;
    const targetUserId = req.params.userId as string;

    const membership = await getMembership(userId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date();
    const where: any = { organizationId };

    if (membership.role === 'MEMBER' || membership.role === 'TEAM_LEAD') {
      const assignmentScope: any[] = [
        { assignments: { some: { targetType: 'MEMBER', targetId: targetUserId } } },
        { keyResults: { some: { assignedUserId: targetUserId } } }
      ];
      if (membership.teamId) {
        assignmentScope.unshift({ assignments: { some: { targetType: 'TEAM', targetId: membership.teamId } } });
      }

      assignmentScope.push({
        assignments: { none: {} },
        status: 'OPEN',
        periodStart: { lte: now },
        periodEnd: { gte: now }
      });

      where.OR = assignmentScope;
    }

    const okrs = await prisma.okr.findMany({
      where,
      include: {
        assignments: true,
        keyResults: {
          where: {
            OR: [
              { assignedUserId: targetUserId },
              { isGeneral: true }
            ]
          },
          include: {
            tag: true,
            assignedUser: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            approver: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        creator: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const enrichedOkrs = await Promise.all(okrs.map(async (okr) => {
      const enrichedAssignments = await Promise.all(okr.assignments.map(async (assignment) => {
        if (assignment.targetType === 'TEAM') {
          const team = await prisma.team.findUnique({
            where: { id: assignment.targetId },
            select: { id: true, name: true }
          });
          return { ...assignment, team };
        }
        return assignment;
      }));
      return { ...okr, assignments: enrichedAssignments };
    }));

    return res.json(enrichedOkrs);
  } catch (error) {
    console.error('List user OKRs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
