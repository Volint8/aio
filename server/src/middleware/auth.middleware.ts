import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = (global as any).prisma || new PrismaClient();

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.split(' ')[1];
    const queryToken = req.query.token as string;
    const token = bearerToken || queryToken;

    if (token == null) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    let user: any;
    try {
        user = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    } catch {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }

    if (user && !user.userId && user.id) {
        user.userId = user.id;
    }

    if (!user?.userId) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
        const record = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { id: true, deletedAt: true }
        });

        if (!record || record.deletedAt) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }
    } catch (error) {
        console.error('Auth middleware user lookup failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    (req as any).user = user;
    next();
};
