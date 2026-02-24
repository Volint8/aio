import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const normalizeOrgName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

export const slugify = (name: string): string => {
  const value = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || 'org';
};

const domainToBaseName = (domain: string): string => {
  const root = domain.split('.')[0] || domain;
  const cleaned = root.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) {
    return 'Organization';
  }
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const buildOrgNameSuggestions = async (domain: string): Promise<string[]> => {
  const base = domainToBaseName(domain);
  const candidates = [base, `${base} Team`, `${base} HQ`];
  const suggestions: string[] = [];

  for (const candidate of candidates) {
    const unique = await makeUniqueOrgName(candidate);
    if (!suggestions.includes(unique)) {
      suggestions.push(unique);
    }
  }

  return suggestions;
};

export const makeUniqueOrgName = async (input: string): Promise<string> => {
  const base = input.trim();
  if (!base) {
    return 'Organization';
  }

  let attempt = 0;
  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : ` ${attempt + 1}`;
    const candidate = `${base}${suffix}`;
    const normalized = normalizeOrgName(candidate);
    const existing = await prisma.organization.findUnique({ where: { normalizedName: normalized } });
    if (!existing) {
      return candidate;
    }
    attempt += 1;
  }

  return `${base} ${Date.now()}`;
};

export const makeUniqueSlug = async (name: string): Promise<string> => {
  const base = slugify(name);
  let attempt = 0;
  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${base}${suffix}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) {
      return candidate;
    }
    attempt += 1;
  }
  return `${base}-${Date.now()}`;
};
