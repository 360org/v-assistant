---
name: summarize-document
description: Condenses long text, articles or documents into key points, decisions and action items. Use when the user wants a summary, TL;DR, key takeaways, or asks what a document, report or article says.
license: MIT
metadata:
  vua-title: Summarize Document
  vua-tagline: Get the key points of any long text or document in seconds.
  vua-emoji: "📄"
  vua-category: Office
  vua-prompt: "Summarize the key points of the following document:\n\n"
  vua-order: "2"
---

# Summarize Document

Produce a summary that lets the reader skip the original without missing
anything that matters.

## Steps

1. Read the whole input before summarizing; identify the document type
   (report, article, contract, email thread, meeting transcript).
2. Lead with a one-sentence essence of the document.
3. Follow with 3–7 bullet points covering the key facts, numbers, decisions
   and risks — keep concrete figures and dates, drop filler.
4. If the document contains tasks or commitments, end with an
   "Action items" list naming who does what by when.

## Output format

One-sentence essence, then bullets, then action items (only if present).
Match the language of the source document.

## Edge cases

- Very short input: say it's already brief and give a one-line summary.
- Mixed languages: summarize in the dominant language of the document.
- Tables or figures: state the headline number, not the whole table.
