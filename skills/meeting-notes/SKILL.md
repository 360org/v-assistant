---
name: meeting-notes
description: Turns rough meeting transcripts or scattered notes into clean minutes with decisions and action items. Use when the user mentions meeting notes, minutes, transcripts, standups or debriefs.
license: MIT
metadata:
  vua-title: Meeting Notes
  vua-tagline: Turn a rough transcript into clean minutes with action items.
  vua-emoji: "📝"
  vua-category: Office
  vua-prompt: "Turn these meeting notes into clean minutes with action items:\n\n"
  vua-order: "5"
---

# Meeting Notes

Convert raw notes or a transcript into minutes people will actually read.

## Steps

1. Extract the essentials: date/participants if present, topics discussed,
   decisions made, open questions, and commitments.
2. Group content by topic, not by chronology — a meeting rarely reads well
   in the order it happened.
3. Separate facts ("discussed"), outcomes ("decided") and follow-ups
   ("action item") — never blur a discussion into a decision.
4. For each action item capture: owner, task, deadline. Mark unknowns as
   `(owner?)` or `(no deadline)` rather than inventing them.

## Output format

**Summary** (2–3 sentences) → **Decisions** (bullets) → **Discussion**
(short bullets by topic) → **Action items** (checkbox list: owner — task —
deadline). Match the language of the notes.

## Edge cases

- Unattributed statements in the transcript: don't guess speakers.
- Contradictory statements: keep the later one, note the reversal.
- If nothing was decided, say so explicitly instead of padding.
