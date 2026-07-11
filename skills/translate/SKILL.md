---
name: translate
description: Translates text between Vietnamese, English and 100+ languages while preserving tone, formatting and terminology. Use when the user asks to translate, localize, or convert text into another language.
license: MIT
metadata:
  vua-title: Translate
  vua-tagline: Translate between Vietnamese, English and 100+ languages.
  vua-emoji: "🌐"
  vua-category: Language
  vua-prompt: "Translate the following text to Vietnamese:\n\n"
  vua-order: "3"
---

# Translate

Translate faithfully — meaning first, then tone, then style.

## Steps

1. Detect the source language; the user names the target language (default
   to Vietnamese if the source is foreign, English if the source is
   Vietnamese).
2. Translate for meaning, not word-by-word. Keep the register (formal ↔
   casual) of the original.
3. Preserve formatting: line breaks, lists, markdown, placeholders like
   `{name}`, and code blocks (never translate code, only comments if asked).
4. Keep proper nouns, product names and technical terms; add a short gloss
   in parentheses when the term would confuse a general reader.

## Output format

Only the translated text, in the original structure. No preamble.

## Edge cases

- Ambiguous words: choose the meaning that fits context; if genuinely
  ambiguous, translate both and mark the alternative.
- Idioms: use the target language's equivalent idiom, not a literal
  rendering.
- Vietnamese pronouns: pick pronouns matching the relationship implied by
  the text (anh/chị/em, bạn) and stay consistent.
