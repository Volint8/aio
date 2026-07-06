import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/email.service';
import { getAccessibleTeamIds, getMembershipTeamIds, getMembershipWithTeams, uniqueIds } from '../utils/membership.utils';

const prisma = new PrismaClient();

const getNotificationAudienceWhere = (params: {
  organizationId: string;
  userId: string;
  teamIds?: string[];
}) => ({
  organizationId: params.organizationId,
  dismissedBy: { not: { array_contains: [params.userId] } },
  OR: [
    { targetType: 'INDIVIDUAL', targetId: params.userId },
    ...((params.teamIds || []).length > 0 ? [{ targetType: 'TEAM', targetId: { in: params.teamIds } }] : [])
  ]
});

const asDismissedByList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const dismissNotificationsForUser = async (notifications: Array<{ id: string; dismissedBy: unknown }>, userId: string) => {
  await prisma.$transaction(
    notifications.map((notification) => {
      const dismissedBy = asDismissedByList(notification.dismissedBy);
      const nextDismissedBy = dismissedBy.includes(userId) ? dismissedBy : [...dismissedBy, userId];
      return prisma.notification.update({
        where: { id: notification.id },
        data: { dismissedBy: nextDismissedBy }
      });
    })
  );
};

export const sendAlert = async (req: Request, res: Response) => {
  try {
    const senderId = (req as any).user.userId;
    const { organizationId, targetType, targetId, type, message } = req.body;

    if (!organizationId || !targetType || !targetId || !type || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const membership = await getMembershipWithTeams(prisma, senderId, organizationId);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const senderContext = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        members: {
          where: { role: 'ADMIN' },
          include: { user: { select: { id: true, email: true } } }
        }
      }
    });

    if (!senderContext) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const membershipTeamIds = getMembershipTeamIds(membership);
    const accessibleTeamIds = await getAccessibleTeamIds(prisma, membership);

    if (membership.role === 'MEMBER') {
      if (targetType !== 'INDIVIDUAL') {
        return res.status(403).json({ error: 'Members can only send alerts to an admin or their team lead' });
      }

      const targetMembership = await getMembershipWithTeams(prisma, targetId, organizationId);
      const targetTeamIds = getMembershipTeamIds(targetMembership);
      const sharesTeam = targetTeamIds.some((teamId) => membershipTeamIds.includes(teamId));

      const canAlertTarget =
        targetMembership?.role === 'ADMIN' ||
        (
          targetMembership?.role === 'TEAM_LEAD' &&
          sharesTeam
        );

      if (!canAlertTarget) {
        return res.status(403).json({ error: 'Members can only send alerts to an admin or their team lead' });
      }
    }

    if (membership.role === 'TEAM_LEAD') {
      if (targetType === 'ADMINS') {
        if (senderContext.members.length === 0) {
          return res.status(400).json({ error: 'No admins found for this organization' });
        }
      } else if (targetType === 'TEAM') {
        if (!accessibleTeamIds.includes(targetId)) {
          return res.status(403).json({ error: 'Team leads can only send team alerts to their own team' });
        }
      } else if (targetType === 'INDIVIDUAL') {
        const targetMembership = await prisma.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId: targetId,
              organizationId
            }
          }
        });

        if (targetMembership?.role !== 'ADMIN') {
          return res.status(403).json({ error: 'Team leads can only send individual alerts to admins' });
        }
      } else {
        return res.status(403).json({ error: 'Team leads can only send alerts to admins or their own team' });
      }
    }

    if (targetType === 'ADMINS') {
      const adminRecipients = senderContext.members;
      const notifications = await prisma.$transaction(
        adminRecipients.map((admin) =>
          prisma.notification.create({
            data: {
              organizationId,
              senderId,
              targetType: 'INDIVIDUAL',
              targetId: admin.userId,
              type,
              message
            },
            include: {
              sender: { select: { name: true, email: true } },
              organization: { select: { name: true } }
            }
          })
        )
      );

      const notification = notifications[0];
      const subject = `Alert: ${type.replace('_', ' ')}`;
      const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${clientBaseUrl}/images/image.png" alt="Apraizal Logo" style="height: 40px;" />
          </div>
          <h2 style="color: #2563eb; text-align: center;">Notification Alert</h2>
          <p><strong>From:</strong> ${notification.sender.name || notification.sender.email}</p>
          <p><strong>Org:</strong> ${notification.organization.name}</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;">${message}</p>
          </div>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${clientBaseUrl}/dashboard" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
              Open Apraizal Dashboard
            </a>
          </p>
          <p style="color: #666; font-size: 12px; text-align: center;">This is an automated alert from Apraizal.</p>
        </div>
      `;

      await Promise.all(adminRecipients.map((admin) => sendEmail(admin.user.email, subject, html)));

      return res.status(201).json({
        message: 'Alert sent successfully',
        count: notifications.length,
        notification
      });
    }

    // Create notification record
    const notification = await prisma.notification.create({
      data: {
        organizationId,
        senderId,
        targetType,
        targetId,
        type,
        message
      },
      include: {
        sender: { select: { name: true, email: true } },
        organization: { select: { name: true } }
      }
    });

    // Identify recipients and send emails
    let recipientEmails: string[] = [];

    if (targetType === 'INDIVIDUAL') {
      const user = await prisma.user.findUnique({ where: { id: targetId }, select: { email: true } });
      if (user) recipientEmails.push(user.email);
    } else if (targetType === 'TEAM') {
      const members = await prisma.organizationMemberTeam.findMany({
        where: { teamId: targetId, organizationMember: { organizationId } },
        include: {
          organizationMember: {
            include: {
              user: {
                select: { email: true }
              }
            }
          }
        }
      });
      recipientEmails = uniqueIds(members.map((member: any) => member.organizationMember?.user?.email));
    }

    // Send emails
    const subject = `Alert: ${type.replace('_', ' ')}`;
    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].replace(/\/$/, '');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${clientBaseUrl}/images/image.png" alt="Apraizal Logo" style="height: 40px;" />
        </div>
        <h2 style="color: #2563eb; text-align: center;">Notification Alert</h2>
        <p><strong>From:</strong> ${notification.sender.name || notification.sender.email}</p>
        <p><strong>Org:</strong> ${notification.organization.name}</p>
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;">${message}</p>
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${clientBaseUrl}/dashboard" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
            Open Apraizal Dashboard
          </a>
        </p>
        <p style="color: #666; font-size: 12px; text-align: center;">This is an automated alert from Apraizal.</p>
      </div>
    `;

    await Promise.all(recipientEmails.map(email => sendEmail(email, subject, html)));

    return res.status(201).json(notification);
  } catch (error) {
    console.error('Send alert error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    // Get user's team ID in this org
    const membership = await getMembershipWithTeams(prisma, userId, organizationId as string);

    const notifications = await prisma.notification.findMany({
      where: getNotificationAudienceWhere({
        organizationId: organizationId as string,
        userId,
        teamIds: await getAccessibleTeamIds(prisma, membership)
      }),
      include: {
        sender: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { notificationId } = req.params;
    const id = Array.isArray(notificationId) ? notificationId[0] : notificationId;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { organizationId: true }
    });
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const membership = await getMembershipWithTeams(prisma, userId, notification.organizationId);
    const visible = await prisma.notification.findFirst({
      where: {
        id,
        ...getNotificationAudienceWhere({
          organizationId: notification.organizationId,
          userId,
          teamIds: await getAccessibleTeamIds(prisma, membership)
        })
      }
    });

    if (!visible) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const membership = await getMembershipWithTeams(prisma, userId, organizationId);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await prisma.notification.updateMany({
      where: {
        ...getNotificationAudienceWhere({ organizationId, userId, teamIds: await getAccessibleTeamIds(prisma, membership) }),
        isRead: false
      },
      data: { isRead: true }
    });

    return res.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const clearReadNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { organizationId } = req.query;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const membership = await getMembershipWithTeams(prisma, userId, organizationId);

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        ...getNotificationAudienceWhere({ organizationId, userId, teamIds: await getAccessibleTeamIds(prisma, membership) }),
        isRead: true
      },
      select: { id: true, dismissedBy: true }
    });

    await dismissNotificationsForUser(notifications, userId);

    return res.json({ success: true, count: notifications.length });
  } catch (error) {
    console.error('Clear read notifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
