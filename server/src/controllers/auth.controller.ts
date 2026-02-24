import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { sendOtpEmail } from '../services/email.service';
import {
  getEmailDomain,
  isWorkEmail,
  normalizeEmail,
  otpExpiryDate,
  randomOtp,
  hashToken
} from '../utils/auth.utils';
import { makeUniqueOrgName, makeUniqueSlug, normalizeOrgName } from '../utils/org.utils';

const prisma = new PrismaClient();

const signAuthToken = (user: { id: string; email: string; role: string }) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' }
  );
};

const attachInviteMembershipIfPending = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pendingInviteId) {
    return;
  }

  const invite = await prisma.invite.findUnique({ where: { id: user.pendingInviteId } });
  if (!invite || invite.status !== 'PENDING' || new Date() > invite.expiresAt) {
    await prisma.user.update({ where: { id: userId }, data: { pendingInviteId: null } });
    return;
  }

  const existingMembership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: invite.organizationId
      }
    }
  });

  await prisma.$transaction(async (tx) => {
    if (!existingMembership) {
      await tx.organizationMember.create({
        data: {
          userId,
          organizationId: invite.organizationId,
          role: invite.role
        }
      });
    }

    await tx.invite.update({
      where: { id: invite.id },
      data: {
        status: 'ACCEPTED',
        acceptedByUserId: userId
      }
    });

    await tx.user.update({
      where: { id: userId },
      data: { pendingInviteId: null }
    });
  });
};

export const signup = async (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'Public signup is deprecated. Use /auth/admin-signup/init then /auth/admin-signup/complete.'
  });
};

export const adminSignupInit = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isWorkEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please use a work email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser?.isVerified) {
      return res.status(400).json({
        error: 'Account already exists. Sign in and create a new organization from the organization screen.'
      });
    }

    const domain = getEmailDomain(normalizedEmail);
    const suggestions = [
      await makeUniqueOrgName(domain.split('.')[0] || 'Organization'),
      await makeUniqueOrgName(`${domain.split('.')[0] || 'Organization'} Team`)
    ];

    return res.json({
      email: normalizedEmail,
      suggestions
    });
  } catch (error) {
    console.error('Admin signup init error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const adminSignupComplete = async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      name,
      organizationName
    } = req.body as { email?: string; password?: string; name?: string; organizationName?: string };

    if (!email || !password || !organizationName) {
      return res.status(400).json({ error: 'Email, password and organizationName are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isWorkEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Please use a work email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingVerified = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingVerified?.isVerified) {
      return res.status(400).json({
        error: 'Account already exists. Sign in and create a new organization from the organization screen.'
      });
    }

    if (existingVerified && !existingVerified.isVerified) {
      await prisma.user.delete({ where: { id: existingVerified.id } });
    }

    const uniqueOrgName = await makeUniqueOrgName(organizationName.trim());
    const normalizedOrgName = normalizeOrgName(uniqueOrgName);
    const slug = await makeUniqueSlug(uniqueOrgName);

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = randomOtp();
    const otpExpiresAt = otpExpiryDate();

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: name?.trim() || normalizedEmail.split('@')[0],
          role: 'USER',
          otp,
          otpExpiresAt,
          isVerified: false
        }
      });

      const organization = await tx.organization.create({
        data: {
          name: uniqueOrgName,
          normalizedName: normalizedOrgName,
          slug
        }
      });

      await tx.organizationMember.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: 'ADMIN'
        }
      });

      return createdUser;
    });

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      await prisma.user.delete({ where: { id: user.id } });
      console.error('Failed to send OTP email during admin signup:', emailError);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }

    return res.status(200).json({ message: 'OTP sent to email. Please verify.' });
  } catch (error) {
    console.error('Admin signup complete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const inviteAcceptInit = async (req: Request, res: Response) => {
  try {
    const { token, password, name } = req.body as { token?: string; password?: string; name?: string };

    if (!token) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    const tokenHash = hashToken(token);
    const invite = await prisma.invite.findFirst({
      where: { tokenHash, status: 'PENDING' },
      include: {
        organization: { select: { id: true, name: true } }
      }
    });

    if (!invite || new Date() > invite.expiresAt) {
      return res.status(400).json({ error: 'Invite is invalid or expired' });
    }

    const email = normalizeEmail(invite.email);
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser?.isVerified) {
      return res.json({
        mode: 'EXISTING_ACCOUNT_LOGIN_REQUIRED',
        email,
        organization: invite.organization,
        role: invite.role
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password with at least 6 characters is required for onboarding' });
    }

    const otp = randomOtp();
    const otpExpiresAt = otpExpiryDate();
    const passwordHash = await bcrypt.hash(password, 10);

    if (!existingUser) {
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name?.trim() || email.split('@')[0],
          role: 'USER',
          isVerified: false,
          otp,
          otpExpiresAt,
          pendingInviteId: invite.id
        }
      });
    } else {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          otp,
          otpExpiresAt,
          pendingInviteId: invite.id
        }
      });
    }

    await sendOtpEmail(email, otp);

    return res.json({
      mode: 'OTP_REQUIRED',
      email,
      organization: invite.organization,
      role: invite.role
    });
  } catch (error) {
    console.error('Invite accept init error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const inviteAcceptComplete = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || !password) {
      return res.status(400).json({ error: 'Invite token and password are required' });
    }

    const tokenHash = hashToken(token);
    const invite = await prisma.invite.findFirst({ where: { tokenHash, status: 'PENDING' } });

    if (!invite || new Date() > invite.expiresAt) {
      return res.status(400).json({ error: 'Invite is invalid or expired' });
    }

    const email = normalizeEmail(invite.email);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isVerified) {
      return res.status(400).json({ error: 'Account not ready. Complete invite initialization and OTP verification first.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invite.organizationId
        }
      }
    });

    await prisma.$transaction(async (tx) => {
      if (!existingMembership) {
        await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId: invite.organizationId,
            role: invite.role
          }
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedByUserId: user.id
        }
      });
    });

    const authToken = signAuthToken({ id: user.id, email: user.email, role: user.role });

    return res.json({
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Invite accept complete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'User already verified' });
    }

    if (!user.otp || !user.otpExpiresAt || user.otp !== otp || new Date() > user.otpExpiresAt) {
      if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ error: 'OTP expired. Please register again.' });
      }

      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        otp: null,
        otpExpiresAt: null
      }
    });

    await attachInviteMembershipIfPending(verifiedUser.id);

    const authToken = signAuthToken({ id: verifiedUser.id, email: verifiedUser.email, role: verifiedUser.role });

    return res.json({
      token: authToken,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: verifiedUser.name,
        role: verifiedUser.role
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ error: 'Registration expired. Please sign up again.' });
      }
      return res.status(401).json({ error: 'Please verify your email first.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await attachInviteMembershipIfPending(user.id);

    const token = signAuthToken({ id: user.id, email: user.email, role: user.role });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
