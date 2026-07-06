Feature: Appraise (Generate Appraisal)
Goal
Allow users to generate performance appraisals for:
Individuals
Teams
Entire organization
With flexible output formats and smart filtering based on OKRs.

User Flow (Step-by-Step)
1. Start Appraisal
User clicks:
Appraise → Generate Appraisal

2. Select Appraisal Scope
Option A: Individuals
Dropdown displays all organization members
User can:
Select specific individuals
OR click “Select All”
Option B: Teams
Dropdown displays all teams
User can:
Select specific teams
OR click “Select All”
⚠️ Important Logic
Selections here dynamically determine:
Which Key Results (OKRs) are included
Because OKRs are tied to owners (people/teams)

3. Select Output Format
User chooses:
 Single File
All appraisals are combined into one document
 Separate Files
Appraisals are split based on selection:
Per individual (if individuals selected)
Per team (if teams selected)
 Include tooltip:
“Single file combines all appraisals into one document. Separate files generate individual reports per selected entity.”

4. Select Time Period
Input:
Start Date
End Date

5. Auto-Fetch Relevant OKRs
System automatically displays OKRs that overlap with selected timeframe.
 Inclusion Logic:
An OKR is included if:
It fully falls within the selected dates
OR partially overlaps
Examples:
OKR: May–June | Appraisal: Jan–Dec →  Included
OKR: Feb–April | Appraisal: Jan–March → Included
UI Behavior:
All fetched OKRs are pre-selected (checked)
User can uncheck any they don’t want

6. Select Purpose of Appraisal
Popup or section with multi-select options:
Promotion
Salary Review
Performance Review
Layoffs
Skills Gap Analysis
Other (optional input)
⚠️ This selection influences how the appraisal is generated (tone, metrics, emphasis)

7. Add Custom Focus (Optional)
Open text field:
Prompt:
“What would you like this appraisal to focus on?”
Examples:
Leadership growth
Communication
Delivery speed
Technical depth

8. Auto Summary (System-Generated)
System generates a preview summary of the appraisal setup:
Includes:
Selected individuals / teams
Their roles
Their teams
Selected date range
Selected OKRs
Selected purpose
 No need for user-written summary — system handles it

9. Final Confirmation
CTA Button:
“Confirm & Generate Appraisal”

Output: Appraisal Structure
Now, how the generated appraisal should look:

Appraisal Report Layout
1. Header
Name (Individual / Team)
Role (for individuals)
Team
Appraisal Period
Purpose of Appraisal (As summary)

2. Overview Summary
High-level performance summary
Context based on:
Selected purpose
Selected focus
OKR performance
Shifts in task deadlines (if any) during the period

3. OKR Performance Breakdown
For each OKR:
Objective
Key Results
Owner
Timeline
Status (Completed / Ongoing / Missed)
Performance Insight

4. Strengths
Key areas where performance was strong

5. Areas for Improvement
Gaps, underperformance, or excessive deadline shifts (if applicable)

6. Skills / Capability Insights
Especially important for:
Promotions
Skills gap analysis
7. Recommendations
Based on purpose:
Promotion readiness
Salary adjustment suggestions
Training needs
Role changes (if applicable)

8. Final Rating / Verdict (Optional
e.g.:
Exceeds Expectations
Meets Expectations
Needs Improvement

9. Next Steps
Clear, actionable steps:
Training
New responsibilities
Monitoring period

Key System Behaviors (Important for Devs)
OKRs must be:
Dynamically filtered by date + ownership
Selections must:
Update in real-time
Summary must:
Auto-generate (no manual input required)
Output format must:
Respect single vs separate file logic

