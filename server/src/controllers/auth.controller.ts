import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/email.service';
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

const DOMAIN_ALREADY_EXISTS_ERROR =
  'An organization already exists for this email domain. Please sign in or contact your administrator.';

const signAuthToken = (user: { id: string; email: string; role: string; orgRole?: string | null }) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, orgRole: user.orgRole },
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' }
  );
};

const getSuiteSsoSecret = () => {
  return process.env.VOLINT_SUITE_SSO_SECRET || process.env.JWT_SSO_SECRET || 'volint-suite-sso-secret';
};

const getSuiteSsoIssuer = () => {
  return process.env.VOLINT_SUITE_JWT_ISSUER || 'volint-suite-api';
};

const buildAuthResponse = async (user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
}) => {
  await attachInviteMembershipIfPending(user.id);

  const primaryMembership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: 'asc' }
  });

  const orgRole = primaryMembership?.role || null;
  const token = signAuthToken({ id: user.id, email: user.email, role: user.role, orgRole });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgRole
    }
  };
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
          role: invite.role,
          teamId: invite.teamId
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
    const existingOrg = await prisma.organization.findUnique({ where: { domain } });
    if (existingOrg) {
      return res.status(409).json({ error: DOMAIN_ALREADY_EXISTS_ERROR });
    }

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
      organizationName
    } = req.body as { email?: string; password?: string; organizationName?: string };

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

    const domain = getEmailDomain(normalizedEmail);
    if (domain) {
      const existingDomainOrg = await prisma.organization.findUnique({ where: { domain } });
      if (existingDomainOrg) {
        return res.status(409).json({ error: DOMAIN_ALREADY_EXISTS_ERROR });
      }
    }

    const uniqueOrgName = await makeUniqueOrgName(organizationName.trim());
    const normalizedOrgName = normalizeOrgName(uniqueOrgName);
    const slug = await makeUniqueSlug(uniqueOrgName);

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = randomOtp();
    const otpExpiresAt = otpExpiryDate();

    let user: any;
    try {
      user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            name: normalizedEmail.split('@')[0],
            role: 'USER',
            signupSource: 'ADMIN',
            initialRole: 'ADMIN',
            otp,
            otpExpiresAt,
            isVerified: false
          }
        });

        const organization = await tx.organization.create({
          data: {
            name: uniqueOrgName,
            normalizedName: normalizedOrgName,
            slug,
            ...(domain ? { domain } : {})
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
    } catch (error: any) {
      if (error?.code === 'P2002' && error?.meta?.target?.includes('Organization_domain_key')) {
        return res.status(409).json({ error: DOMAIN_ALREADY_EXISTS_ERROR });
      }
      throw error;
    }

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

    if (existingUser?.deletedAt) {
      return res.status(400).json({ error: 'Account is deactivated' });
    }

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
          pendingInviteId: invite.id,
          signupSource: 'INVITE',
          initialRole: invite.role
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

    if (!user || !user.isVerified || user.deletedAt) {
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
            role: invite.role,
            teamId: invite.teamId
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

    // Fetch user's primary organization membership role
    const primaryMembership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: 'asc' }
    });

    const orgRole = primaryMembership?.role || null;

    const authToken = signAuthToken({ id: user.id, email: user.email, role: user.role, orgRole });

    return res.json({
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgRole
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

    if (!user || user.deletedAt) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'User already verified' });
    }

    if (!user.otp || !user.otpExpiresAt || user.otp !== otp || new Date() > user.otpExpiresAt) {
      if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
        // Clean up: delete organization and all its data when OTP expires
        await prisma.$transaction(async (tx) => {
          // Find the organization this admin created
          const orgMember = await tx.organizationMember.findFirst({
            where: { userId: user.id }
          });

          if (orgMember) {
            // Delete all members of the organization
            await tx.organizationMember.deleteMany({
              where: { organizationId: orgMember.organizationId }
            });
            // Delete the organization (cascade will handle related data)
            await tx.organization.delete({
              where: { id: orgMember.organizationId }
            });
          }

          // Delete the user
          await tx.user.delete({ where: { id: user.id } });
        });

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

    // Fetch user's primary organization membership role
    const primaryMembership = await prisma.organizationMember.findFirst({
      where: { id: verifiedUser.id },
      orderBy: { joinedAt: 'asc' }
    });

    const orgRole = primaryMembership?.role || null;

    const authToken = signAuthToken({ id: verifiedUser.id, email: verifiedUser.email, role: verifiedUser.role, orgRole });

    return res.json({
      token: authToken,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: verifiedUser.name,
        role: verifiedUser.role,
        orgRole
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const resendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || user.deletedAt) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: 'User already verified' });
    }

    // Generate new OTP
    const otp = randomOtp();
    const otpExpiresAt = otpExpiryDate();

    await prisma.user.update({
      where: { id: user.id },
      data: { otp, otpExpiresAt }
    });

    await sendOtpEmail(normalizedEmail, otp);

    return res.json({ message: 'New OTP sent to your email' });
  } catch (error) {
    console.error('Resend OTP error:', error);
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

    if (user.deletedAt) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    if (!user.isVerified) {
      if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
        // Clean up: delete organization and all its data when OTP expires
        await prisma.$transaction(async (tx) => {
          // Find the organization this admin created
          const orgMember = await tx.organizationMember.findFirst({
            where: { userId: user.id }
          });

          if (orgMember) {
            // Delete all members of the organization
            await tx.organizationMember.deleteMany({
              where: { organizationId: orgMember.organizationId }
            });
            // Delete the organization (cascade will handle related data)
            await tx.organization.delete({
              where: { id: orgMember.organizationId }
            });
          }

          // Delete the user
          await tx.user.delete({ where: { id: user.id } });
        });

        return res.status(400).json({ error: 'Registration expired. Please sign up again.' });
      }
      return res.status(401).json({ error: 'Please verify your email first.' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    return res.json(await buildAuthResponse(user));
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const exchangeSso = async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token?: string };

    if (!token) {
      return res.status(400).json({ error: 'SSO token is required' });
    }

    let payload: any;

    try {
      payload = jwt.verify(token, getSuiteSsoSecret(), {
        issuer: getSuiteSsoIssuer(),
        audience: 'apraizal'
      });
    } catch {
      return res.status(401).json({ error: 'Invalid or expired SSO token' });
    }

    if (payload?.tokenType !== 'sso' || payload?.toolKey !== 'apraizal' || !payload?.toolUserId) {
      return res.status(400).json({ error: 'Invalid SSO token payload' });
    }

    const user = await prisma.user.findUnique({ where: { id: String(payload.toolUserId) } });

    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'Provisioned Apraizal user not found' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Apraizal account is not ready for SSO yet' });
    }

    if (payload.email && normalizeEmail(payload.email) !== user.email) {
      return res.status(403).json({ error: 'SSO token does not match the provisioned Apraizal account' });
    }

    return res.json(await buildAuthResponse(user));
  } catch (error) {
    console.error('SSO exchange error:', error);
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
        jobTitle: true,
        role: true,
        deletedAt: true,
        createdAt: true
      }
    });

    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { deletedAt: _deletedAt, ...safeUser } = user;
    return res.json(safeUser);
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPasswordInit = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    // Always return success message to prevent email enumeration
    if (!user || !user.isVerified || user.deletedAt) {
      return res.json({ message: 'If the email exists and is verified, a password reset code has been sent.' });
    }

    const otp = randomOtp();
    const otpExpiresAt = otpExpiryDate();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetOtp: otp,
        passwordResetOtpExpiresAt: otpExpiresAt
      }
    });

    try {
      await sendPasswordResetEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Rollback OTP
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetOtp: null,
          passwordResetOtpExpiresAt: null
        }
      });
      return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }

    return res.json({ message: 'If the email exists and is verified, a password reset code has been sent.' });
  } catch (error) {
    console.error('Forgot password init error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPasswordComplete = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body as { email?: string; otp?: string; newPassword?: string };

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.isVerified || user.deletedAt) {
      return res.status(400).json({ error: 'Invalid reset request. Please try again.' });
    }

    if (!user.passwordResetOtp || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ error: 'No password reset request found. Please initiate a new reset.' });
    }

    if (new Date() > user.passwordResetOtpExpiresAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetOtp: null,
          passwordResetOtpExpiresAt: null
        }
      });
      return res.status(400).json({ error: 'Reset code expired. Please request a new one.' });
    }

    if (user.passwordResetOtp !== otp) {
      return res.status(400).json({ error: 'Invalid reset code' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetOtp: null,
        passwordResetOtpExpiresAt: null
      }
    });

    // Fetch user's primary organization membership role
    const primaryMembership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: 'asc' }
    });

    const orgRole = primaryMembership?.role || null;

    const authToken = signAuthToken({ id: user.id, email: user.email, role: user.role, orgRole });

    return res.json({
      message: 'Password reset successful',
      token: authToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgRole
      }
    });
  } catch (error) {
    console.error('Forgot password complete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid current password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const targetUserId = req.params.id as string;
    const { name, jobTitle } = req.body as { name?: string; jobTitle?: string | null };

    // Users can only update their own profile
    if (userId !== targetUserId) {
      return res.status(403).json({ error: 'You can only update your own profile' });
    }

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        name: name.trim(),
        ...(jobTitle !== undefined ? { jobTitle: jobTitle?.trim() || null } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        jobTitle: true
      }
    });

    return res.json(updated);
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
