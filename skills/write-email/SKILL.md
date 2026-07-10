---
name: write-email
description: Drafts polished, professional emails from a topic or a few bullet points, matching the sender's tone and purpose. Use when the user wants to write, reply to, or improve an email, or mentions mail, follow-ups, or correspondence.
license: MIT
metadata:
  vua-title: Write Email
  vua-tagline: Turn a few bullet points into a polished, professional email.
  vua-emoji: "✉️"
  vua-category: Office
  vua-prompt: "Write a professional email about: "
  vua-order: "1"
---

# Write Email

Draft a complete, ready-to-send email from whatever the user provides — a
topic, bullet points, or a rough draft.

## Steps

1. Identify the recipient, purpose and desired outcome from the user's input.
   If the tone is not stated, default to friendly-professional.
2. Write a concise subject line.
3. Structure the body: one-line opening, the substance in short paragraphs
   (or a bulleted list for multiple items), a clear call to action, and a
   sign-off.
4. Keep it brief — most business emails should fit on one screen.

## Output format

Return the subject line and the email body, ready to paste. Do not add
commentary around it unless the user asks for alternatives.

## Edge cases

- Replying to an email: quote only what's needed, answer every question the
  original asked.
- Sensitive topics (complaints, refusals, escalations): stay factual and
  courteous; never invent commitments the user didn't state.
- If the user writes in Vietnamese, write the email in Vietnamese unless
  they ask otherwise.
