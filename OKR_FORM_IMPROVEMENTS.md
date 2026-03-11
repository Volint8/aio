# OKR Creation Form - Improvement Plan

**Created:** March 11, 2026  
**Status:** Pending Implementation

---

## Current Issues

The current OKR creation form has several UX problems:

1. **Tag Name + Color Picker fields** - Technical implementation leaking into UI
   - Users want to track Key Results, not create tags
   - Color picker is small, hard to use, not intuitive

2. **No delete button** - Can add Key Results but can't remove individual ones

3. **No reordering** - Can't rearrange Key Results after adding

4. **Flat visual structure** - Doesn't clearly show Objective → Key Results hierarchy

---

## Proposed Improvements

### Option A: Simplified Key Result Input (Recommended)

**Changes:**
1. **Remove "Tag Name" field** - Auto-generate tag internally from Key Result title
2. **Replace color picker with preset colors** - Show 6-8 color chips to click
3. **Add delete (×) button** per Key Result card
4. **Add reordering arrows** (↑↓) per Key Result card
5. **Better visual hierarchy** - Card header shows "Key Result #1, #2, #3"

**Visual Mockup:**
```
┌─ Key Result #1 ────────────[×][↑][↓]─┐
│ Measure: [Acquire 100 customers]     │
│ Color: 🔵 🟢 🔴 🟡 🟣 🟠            │
└───────────────────────────────────────┘
```

---

### Option B: Two-Step OKR Creation

**Step 1:** Enter Objective details (title, description, period)
- Objective Title
- Description (optional)
- Period Start/End

**Step 2:** Add Key Results in cleaner interface
- Simple text input per KR
- Quick-add buttons for common KR templates
- Visual cards with delete/reorder
- Color selection via preset chips

---

### Option C: Table/Grid Layout

Replace stacked cards with compact table:

| # | Key Result | Color | Actions |
|---|------------|-------|---------|
| 1 | [input field...] | 🔵 | [×][↑↓] |
| 2 | [input field...] | 🟢 | [×][↑↓] |
| 3 | [input field...] | 🔴 | [×][↑↓] |

[+ Add Key Result]

---

## Implementation Decisions Needed

1. **Which option to implement?** (A/B/C)
2. **Tag system handling:**
   - Keep but hide from users (auto-generate internally)?
   - Or remove tag concept entirely for OKRs?
3. **Number of preset colors?** (6-10 recommended)
   - Suggested: Blue, Green, Red, Yellow, Purple, Orange, Pink, Teal
4. **Add KR templates?**
   - "Acquire X customers"
   - "Launch X products"
   - "Increase X by Y%"
   - "Achieve NPS score of X"

---

## Files to Modify

- `client/src/pages/DashboardPage.tsx` - OKR form UI
- `client/src/styles/Dashboard.css` - New styles for improved form
- `server/src/controllers/org.controller.ts` - Possibly simplify KR creation logic

---

## Related Context

- OKRs are created by Admins only
- Each Key Result gets a colored tag for task linking
- Tasks can be tagged with Key Results for tracking
- Tags appear in task filters and visual indicators

---

**Next Steps:** User will review and select preferred option for implementation.
