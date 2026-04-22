type AppraisalPromptInput = {
  subject: unknown;
  appraisalPeriod: string;
  purposes: string[];
  customFocus?: string | null;
  deterministicMetrics: unknown;
};

export const appraisalReportSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'header',
    'overviewSummary',
    'okrPerformanceBreakdown',
    'strengths',
    'areasForImprovement',
    'skillsCapabilityInsights',
    'recommendations',
    'finalRating',
    'nextSteps'
  ],
  properties: {
    header: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'role', 'team', 'appraisalPeriod', 'purpose'],
      properties: {
        name: { type: 'string' },
        role: { type: ['string', 'null'] },
        team: { type: ['string', 'null'] },
        appraisalPeriod: { type: 'string' },
        purpose: { type: 'string' }
      }
    },
    overviewSummary: { type: 'string' },
    okrPerformanceBreakdown: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['objective', 'keyResults', 'owner', 'timeline', 'status', 'performanceInsight'],
        properties: {
          objective: { type: 'string' },
          keyResults: { type: 'array', items: { type: 'string' } },
          owner: { type: 'string' },
          timeline: { type: 'string' },
          status: { type: 'string' },
          performanceInsight: { type: 'string' }
        }
      }
    },
    strengths: { type: 'array', items: { type: 'string' } },
    areasForImprovement: { type: 'array', items: { type: 'string' } },
    skillsCapabilityInsights: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    finalRating: { type: 'string' },
    nextSteps: { type: 'array', items: { type: 'string' } }
  }
};

export const appraisalSystemPrompt = [
  'You generate performance appraisal reports from verified deterministic metrics.',
  'Use the supplied scores, OKR evidence, task metrics, purpose, and custom focus as the only source of truth.',
  'Write balanced, evidence-based appraisal language that is useful to an admin or manager.',
  'Do not invent metrics, projects, job history, personal traits, or incidents that are not present in the input.',
  'For promotion, salary review, layoffs, or role-change purposes, frame recommendations as decision support that requires manager review, not as final employment decisions.',
  'Return only the schema fields.'
].join(' ');

export const buildAppraisalPromptPayload = (input: AppraisalPromptInput) => ({
  subject: input.subject,
  appraisalPeriod: input.appraisalPeriod,
  purposes: input.purposes,
  customFocus: input.customFocus || null,
  deterministicMetrics: input.deterministicMetrics
});
