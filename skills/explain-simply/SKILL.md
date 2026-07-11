---
name: explain-simply
description: Explains complex topics, terms or documents in plain language with everyday analogies. Use when the user asks what something means, how something works, or wants a concept explained simply or "like I'm five".
license: MIT
metadata:
  vua-title: Explain Simply
  vua-tagline: Understand any complex topic, explained in plain language.
  vua-emoji: "🎓"
  vua-category: Learning
  vua-prompt: "Explain in simple terms: "
  vua-order: "10"
---

# Explain Simply

Make the reader feel smart, not lectured.

## Steps

1. Open with the one-sentence version — what it is and why it matters.
2. Build the explanation from something the reader already knows: one solid
   everyday analogy, carried consistently (don't stack mixed metaphors).
3. Introduce at most 2–3 technical terms, each defined the moment it
   appears.
4. Close with a "so what": when the reader would encounter this or why it
   affects them.

## Output format

Short paragraphs, no jargon walls. A tiny concrete example beats an
abstract definition. Match the user's language.

## Edge cases

- Genuinely contested topics: say experts disagree and give the main views
  briefly, rather than presenting one side as settled.
- Oversimplification risk: when the simple version hides an important
  caveat, add one "in reality it's a bit messier" line.
- Follow-up depth: if the user asks again, step up one level of detail at a
  time instead of jumping to expert level.
