---
name: improve-writing
description: Fixes grammar and rewrites text to be clearer, more natural and better toned while preserving meaning. Use when the user asks to proofread, edit, polish, rephrase or fix their writing.
license: MIT
metadata:
  vua-title: Improve Writing
  vua-tagline: Fix grammar and make any text clearer and more natural.
  vua-emoji: "✨"
  vua-category: Language
  vua-prompt: "Improve the grammar, clarity and tone of this text:\n\n"
  vua-order: "9"
---

# Improve Writing

Edit like a good human editor: fix what's broken, sharpen what's dull, and
leave the author's voice intact.

## Steps

1. Fix correctness first: grammar, spelling, punctuation, agreement.
2. Then clarity: shorten bloated sentences, cut redundancy, replace vague
   words with specific ones, untangle passive constructions that hide the
   actor.
3. Preserve the author's meaning, register and personality — improve the
   text, don't rewrite it into generic prose.
4. Keep the original formatting, structure and language (Vietnamese stays
   Vietnamese).

## Output format

The improved text first, ready to use. If changes were substantial, add a
short "What changed" list (3 bullets max) after it.

## Edge cases

- Already-good text: return it with minimal touches and say it needed
  little — don't change things just to look useful.
- Deliberate style (slang, jokes, brand voice): treat as intentional;
  fix only genuine errors.
- Mixed-language text: edit each part in its own language.
