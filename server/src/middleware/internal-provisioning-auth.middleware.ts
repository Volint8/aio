import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const requireInternalProvisioningKey = (req: Request, res: Response, next: NextFunction) => {
    const providedKey = req.header('x-internal-api-key');
    const expectedKey = process.env.APRAIZAL_INTERNAL_API_KEY || '';

    if (!expectedKey) {
        return res.status(503).json({ error: 'Internal provisioning API key is not configured' });
    }

    if (!providedKey) {
        return res.status(401).json({ error: 'Unauthorized internal provisioning request' });
    }

    const expected = Buffer.from(expectedKey, 'utf8');
    const provided = Buffer.from(providedKey, 'utf8');
    const isMatch = expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

    if (!isMatch) {
        return res.status(401).json({ error: 'Unauthorized internal provisioning request' });
    }

    next();
};
