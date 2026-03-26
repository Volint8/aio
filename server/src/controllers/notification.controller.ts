import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/email.service';

const prisma = new PrismaClient();

export const sendAlert = async (req: Request, res: Response) => {
  try {
    const senderId = (req as any).user.userId;
    const { organizationId, targetType, targetId, type, message } = req.body;

    if (!organizationId || !targetType || !targetId || !type || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if sender is admin or team lead
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: senderId, organizationId } }
    });

    if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'TEAM_LEAD')) {
      return res.status(403).json({ error: 'Only admins and team leads can send alerts' });
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
      const members = await prisma.organizationMember.findMany({
        where: { teamId: targetId, organizationId },
        include: { user: { select: { email: true } } }
      });
      recipientEmails = members.map(m => m.user.email);
    }

    // Send emails
    const subject = `Alert: ${type.replace('_', ' ')}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #2563eb;">Notification Alert</h2>
        <p><strong>From:</strong> ${notification.sender.name || notification.sender.email}</p>
        <p><strong>Org:</strong> ${notification.organization.name}</p>
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;">${message}</p>
        </div>
        <p style="color: #666; font-size: 12px;">This is an automated alert from Apraizal Platform.</p>
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
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: organizationId as string } }
    });

    const notifications = await prisma.notification.findMany({
      where: {
        organizationId: organizationId as string,
        OR: [
          { targetType: 'INDIVIDUAL', targetId: userId },
          ...(membership?.teamId ? [{ targetType: 'TEAM', targetId: membership.teamId }] : [])
        ]
      },
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
    const { notificationId } = req.params;
    await prisma.notification.update({
      where: { id: Array.isArray(notificationId) ? notificationId[0] : notificationId },
      data: { isRead: true }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};
