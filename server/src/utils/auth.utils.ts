import crypto from 'crypto';

const DEFAULT_PERSONAL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com'
];

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const getEmailDomain = (email: string): string => {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : '';
};

export const getPersonalEmailDomains = (): Set<string> => {
  const configured = (process.env.PERSONAL_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_PERSONAL_DOMAINS);
};

export const isWorkEmail = (email: string): boolean => {
  const domain = getEmailDomain(email);
  if (!domain) {
    return false;
  }
  return !getPersonalEmailDomains().has(domain);
};

export const randomOtp = (): string => Math.floor(100000 + Math.random() * 900000).toString();

export const otpExpiryDate = (): Date => new Date(Date.now() + 15 * 60 * 1000);

export const generateInviteToken = (): string => crypto.randomBytes(24).toString('hex');

export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
