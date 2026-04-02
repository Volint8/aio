export interface Tier {
  users: number;
  prices: {
    NGN: {
      monthly: number;
      yearly: number;
    };
  };
}

export const PRICING_TIERS: Tier[] = [
  { users: 10, prices: { NGN: { monthly: 0, yearly: 0 } } },      // FREE - permanent free tier
  { users: 100, prices: { NGN: { monthly: 1000000, yearly: 12000000 } } },   // ₦10,000/month or ₦120,000/year
  { users: 250, prices: { NGN: { monthly: 2500000, yearly: 30000000 } } },   // ₦25,000/month or ₦300,000/year
  { users: 500, prices: { NGN: { monthly: 5500000, yearly: 66000000 } } },   // ₦55,000/month or ₦660,000/year
  { users: 1000, prices: { NGN: { monthly: 11000000, yearly: 132000000 } } }, // ₦110,000/month or ₦1,320,000/year
];

export const TRIAL_PERIOD_DAYS = 30;

export const getTierByUserCount = (userCount: number): Tier | undefined => {
  return PRICING_TIERS.find(tier => tier.users === userCount);
};

export const getPriceForTier = (tier: Tier, period: 'monthly' | 'yearly'): number => {
  return tier.prices.NGN[period];
};
