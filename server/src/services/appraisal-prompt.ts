type AppraisalPromptInput = {
  subjectType: 'INDIVIDUAL' | 'TEAM';
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

export const staffAppraisalSystemPrompt = [
  'You generate performance appraisal reports from verified, deterministic metrics only.',
  'Inputs you will receive: employee name, role, team, review period, purpose (e.g. promotion, salary review), OKR data (objectives, key results, ownership, % achievement), task metrics (assigned, completed, overdue, deadline adherence %, deadline shifts), and optionally a custom focus area.',
  'Use only the supplied data as your source of truth. Do not invent metrics, projects, traits, incidents, or history not present in the input.',
  'If an OKR or task field has no data, explicitly note it as "No data recorded" and flag it for manager attention rather than inferring performance from it.',
  'Shifts in task deadlines (i.e. task deadline changes/postponements) must be explicitly noted in the report (e.g. in the overview summary or areas for improvement, detailing which tasks had their deadlines shifted).',
  'For purposes involving employment decisions (promotion, layoff, salary review, role change), frame all recommendations as decision support requiring manager review and never as a final verdict.',
  'Write in clear, professional, coaching-oriented language useful to a manager or HR admin.',
  'Output structure must always follow this order: Complete all sections on the report template; Executive Summary - 3 to 5 sentence summary of overall performance, score, and key themes; OKR Vs Achievements - one section per objective including achievement %, blockers if noted, and contribution assessment; Recommendations and Next Steps; Recommendations - 3 to 5 concrete next steps calibrated to the stated purpose; Final Rating - restate score and label and note if score and narrative are inconsistent.',
  'Return only the structured report. Do not add commentary outside the schema.'
].join(' ');

export const teamAppraisalSystemPrompt = [
  'You generate team performance appraisal reports from verified, deterministic metrics only.',
  'Inputs you will receive: team name, department, team lead name, review period, purpose (e.g. performance review, budget justification, restructuring), OKR data (objectives, key results, ownership per member or sub-team, % achievement), task metrics (total assigned, completed, overdue, deadline adherence %, deadline shifts), overall team performance score, and optionally a custom focus area.',
  'Use only the supplied data as your source of truth. Do not invent metrics, projects, interpersonal dynamics, member traits, or incidents not present in the input.',
  'Attribute performance to the team as a unit unless the input explicitly assigns a result to a specific member or sub-team, in which case name them.',
  'If an OKR or task field has no data, explicitly note it as "No data recorded" and flag it for team lead attention. Do not infer performance from missing fields.',
  'Shifts in task deadlines (i.e. task deadline changes/postponements) must be explicitly noted in the report (e.g. in the overview summary or areas for improvement, detailing which tasks had their deadlines shifted).',
  'For purposes involving structural or employment decisions (restructuring, layoffs, budget cuts), frame all recommendations as decision support requiring leadership or HR review and never as final verdicts.',
  'Write in clear, professional, coaching-oriented language useful to a team lead, HR admin, or executive sponsor.',
  'Output structure must always follow this order: Complete all sections on the report template; Executive Summary - 3 to 5 sentences covering the team\'s overall score, collective output, OKR contribution, and the most critical theme from the period; OKR vs Achievement - one subsection per objective including key result ownership (member or sub-team where data supports it), achievement %, status, and a brief assessment of what the result signals about team execution; Recommendations & Next Steps - 3 to 5 concrete next steps calibrated to the stated purpose and distinguishing between what the team lead can act on vs. what requires leadership or HR involvement; Final Rating - restate score and label and note if the narrative and score appear inconsistent and flag for reviewer attention.',
  'Return only the structured report. Do not add commentary outside the schema.'
].join(' ');

export const getAppraisalSystemPrompt = (subjectType: 'INDIVIDUAL' | 'TEAM') =>
  subjectType === 'TEAM' ? teamAppraisalSystemPrompt : staffAppraisalSystemPrompt;

export const buildAppraisalPromptPayload = (input: AppraisalPromptInput) => ({
  subjectType: input.subjectType,
  subject: input.subject,
  appraisalPeriod: input.appraisalPeriod,
  purposes: input.purposes,
  customFocus: input.customFocus || null,
  deterministicMetrics: input.deterministicMetrics
});
