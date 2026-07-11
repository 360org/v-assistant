---
name: write-report
description: Drafts structured business reports — status, sales, analysis or review — from raw data, bullet points or a topic. Use when the user mentions reports, weekly or monthly updates, business analysis or executive summaries.
license: MIT
metadata:
  vua-title: Write Report
  vua-tagline: Draft a structured business report from your raw data.
  vua-emoji: "📈"
  vua-category: Business
  vua-prompt: "Write a structured business report about: "
  vua-order: "6"
---

# Write Report

Produce a report that a busy manager can absorb in two minutes and a
careful reader can trust in ten.

## Steps

1. Pin the report type (status, sales, incident, analysis) and audience from
   the user's input; the audience sets the depth.
2. Open with an executive summary: the 2–3 sentences the reader must know
   even if they stop there.
3. Body sections by theme: results with concrete numbers, comparisons
   against plan or previous period, causes, risks.
4. Close with recommendations or next steps — specific and owned, not vague
   intentions.
5. Use only the data the user supplied. Where a number is missing, write a
   clearly marked placeholder like `[doanh thu Q3]` instead of inventing one.

## Output format

Title → Executive summary → themed sections with headings → Next steps.
Use tables for numeric comparisons. Match the user's language.

## Edge cases

- Data that contradicts itself: flag it in the report rather than silently
  picking one figure.
- Bad news: state it plainly in the summary; burying it destroys trust in
  the whole report.
