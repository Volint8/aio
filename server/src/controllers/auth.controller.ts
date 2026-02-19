import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { sendOtpEmail } from '../services/email.service';

const prisma = new PrismaClient();

export const signup = async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        // Validate email domain
        const validDomains = ['volintpas.com', 'fformatio.org'];
        const domain = email.split('@')[1];
        if (!validDomains.includes(domain)) {
            return res.status(400).json({ error: 'Only Volintpas or Formatio email addresses are allowed' });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            if (!existingUser.isVerified) {
                // If user exists but not verified, and OTP expired, we restart the process
                // Or just update OTP and resend
                // For simplicity as requested "delete from database", we can delete and recreate
                await prisma.user.delete({ where: { id: existingUser.id } });
            } else {
                return res.status(400).json({ error: 'User already exists' });
            }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name: name || email.split('@')[0],
                role: 'USER',
                otp,
                otpExpiresAt,
                isVerified: false
            }
        });

        // Send OTP via email
        try {
            await sendOtpEmail(email, otp);
            console.log(`[EMAIL SENT] OTP for ${email}: ${otp}`); // Keep log for dev/debugging
        } catch (emailError) {
            console.error('Failed to send email:', emailError);
            // Optionally delete user if email fails or just return error
            await prisma.user.delete({ where: { id: user.id } });
            return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
        }

        res.status(200).json({ message: 'OTP sent to email. Please verify.' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { email, otp } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (user.isVerified) {
            return res.status(400).json({ error: 'User already verified' });
        }

        if (!user.otp || !user.otpExpiresAt || user.otp !== otp || new Date() > user.otpExpiresAt) {
            // Delete user if OTP expired or invalid as per instructions "details should be DELETED"
            // Although deleting on wrong OTP attempt is harsh, deleting on EXPIRY is what was asked.
            // If improper OTP, maybe just error. If expired, delete?
            // User said: "if they do not include the OTP in 15 mins / expiry... DELETED"

            if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
                await prisma.user.delete({ where: { id: user.id } });
                return res.status(400).json({ error: 'OTP expired. Please register again.' });
            }

            return res.status(400).json({ error: 'Invalid OTP' });
        }

        // Verify user
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                otp: null,
                otpExpiresAt: null
            }
        });

        // Auto-join organization based on domain
        const domain = email.split('@')[1];
        // Find or create organization for the domain
        // We assume 'volint.com' -> 'Volint' and 'formatio.com' -> 'Formatio'
        // Ideally we should have seeded this or check strictly

        let orgName = '';
        if (domain === 'volintpas.com') orgName = 'Volint Operations';
        if (domain === 'fformatio.org') orgName = 'Formatio Operations';

        if (orgName) {
            // Find org by domain, create if not exists (or find by name for backward compat)
            let org = await prisma.organization.findUnique({ where: { domain } })
                || await prisma.organization.findFirst({ where: { name: orgName } });

            if (!org) {
                org = await prisma.organization.create({
                    data: {
                        name: orgName,
                        domain: domain
                    }
                });
            } else if (!org.domain) {
                // Backfill domain
                await prisma.organization.update({
                    where: { id: org.id },
                    data: { domain }
                });
            }

            // Create membership
            // Check if already member (shouldn't be for new user but good practice)
            const existingMember = await prisma.organizationMember.findUnique({
                where: {
                    userId_organizationId: {
                        userId: user.id,
                        organizationId: org.id
                    }
                }
            });

            const memberCount = await prisma.organizationMember.count({
                where: { organizationId: org.id }
            });
            const roleForUser = memberCount === 0 ? 'ADMIN' : 'MEMBER';

            if (!existingMember) {
                await prisma.organizationMember.create({
                    data: {
                        userId: user.id,
                        organizationId: org.id,
                        role: roleForUser
                    }
                });
            } else if (memberCount === 1 && existingMember.role !== 'ADMIN') {
                // Safety net: if this is the only member, ensure they are admin.
                await prisma.organizationMember.update({
                    where: { id: existingMember.id },
                    data: { role: 'ADMIN' }
                });
            }
        }

        // Generate Token
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET as string,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isVerified) {
            // Check expiry
            if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
                await prisma.user.delete({ where: { id: user.id } });
                return res.status(400).json({ error: 'Registration expired. Please sign up again.' });
            }
            return res.status(401).json({ error: 'Please verify your email first.' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET as string,
            { expiresIn: '7d' }
        );

        res.json({
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
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMe = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

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

        res.json(user);
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
