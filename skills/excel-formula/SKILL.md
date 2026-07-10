---
name: excel-formula
description: Writes and explains Excel and Google Sheets formulas from a plain-language description of the desired calculation. Use when the user mentions Excel, Google Sheets, spreadsheets, formulas, VLOOKUP, pivot logic or cell calculations.
license: MIT
metadata:
  vua-title: Excel Formula
  vua-tagline: Describe what you need and get the exact Excel formula.
  vua-emoji: "📊"
  vua-category: Office
  vua-prompt: "Write an Excel formula that: "
  vua-order: "4"
---

# Excel Formula

Turn a plain-language request into a working spreadsheet formula the user
can paste directly.

## Steps

1. Restate the assumed layout (which data sits in which columns/rows) in one
   line, using the user's ranges when given and sensible placeholders
   (`A2:A100`) when not.
2. Give the formula in a code block, ready to paste.
3. Explain what each part does in one or two sentences — enough to adapt it,
   not a tutorial.
4. Prefer modern functions (XLOOKUP, FILTER, SUMIFS, LET) but mention the
   classic fallback (VLOOKUP, SUMPRODUCT) when the user may be on an older
   Excel.

## Output format

Assumption line → formula in a code block → short explanation → fallback
variant if relevant.

## Edge cases

- Google Sheets vs Excel differences (ARRAYFORMULA, QUERY): ask nothing —
  give the version for what the user named, and note the difference briefly.
- Text-vs-number pitfalls: warn when the formula depends on consistent data
  types.
- If the request is really a multi-step transformation, suggest the simplest
  helper-column approach instead of one unreadable mega-formula.
