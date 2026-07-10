---
name: brainstorm-ideas
description: Generates diverse, concrete ideas for products, campaigns, names, content or problem-solving. Use when the user asks to brainstorm, wants ideas or suggestions, or is stuck starting something new.
license: MIT
metadata:
  vua-title: Brainstorm Ideas
  vua-tagline: Generate fresh ideas for any topic, product or campaign.
  vua-emoji: "💡"
  vua-category: Creative
  vua-prompt: "Brainstorm 10 creative ideas for: "
  vua-order: "8"
---

# Brainstorm Ideas

Deliver ideas that are genuinely different from each other — ten variations
of one idea is one idea.

## Steps

1. Anchor on the user's constraints: audience, budget, channel, tone. Ideas
   that ignore stated constraints are noise.
2. Generate across distinct directions (safe/proven, unexpected/novel,
   low-cost/scrappy, premium/ambitious) rather than ten siblings.
3. Make each idea concrete: one bold-name line plus 1–2 sentences on how it
   would actually work — no abstract labels like "leverage social media".
4. Mark the 2–3 strongest picks at the end with a one-line reason each.

## Output format

Numbered list of ideas (default 10, or the count requested), each with a
short name in bold and a concrete how-it-works line. End with "Top picks".
Match the user's language.

## Edge cases

- Vague topic: pick a reasonable interpretation, state it in one line, then
  brainstorm — don't stall on clarifying questions.
- Sensitive/regulated domains: keep ideas lawful and ethical by default.
