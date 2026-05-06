// Chunker for venture documents (COMPANY.md initially; future: runbooks, specs).
// Strategy from Sprint 0.5 spec:
//   1. Split the source on `## ` (top-level headings) so chunks track natural
//      sections.
//   2. Any chunk > 500 tokens is split into 500-token windows with 50-token
//      overlap.
// Token estimation is ~chars/4. Approximate, but fine for budgeting.

const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;
const CHARS_PER_TOKEN = 4;

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export type Chunk = { ord: number; text: string };

/**
 * Split a markdown document into ordered chunks.
 * Empty input returns an empty array.
 */
export function chunkMarkdown(source: string): Chunk[] {
  const trimmed = source.trim();
  if (trimmed.length === 0) return [];

  // Split on `## ` at line start, but keep the heading attached to its body.
  const parts: string[] = [];
  const headingRegex = /^## /gm;
  let lastIdx = 0;
  let match;
  while ((match = headingRegex.exec(trimmed)) !== null) {
    if (match.index > lastIdx) {
      const segment = trimmed.slice(lastIdx, match.index).trim();
      if (segment.length > 0) parts.push(segment);
    }
    lastIdx = match.index;
  }
  const tail = trimmed.slice(lastIdx).trim();
  if (tail.length > 0) parts.push(tail);
  if (parts.length === 0) parts.push(trimmed);

  // Window any oversized part
  const windowed: string[] = [];
  for (const part of parts) {
    if (part.length <= TARGET_CHARS) {
      windowed.push(part);
      continue;
    }
    let start = 0;
    while (start < part.length) {
      const end = Math.min(start + TARGET_CHARS, part.length);
      const slice = part.slice(start, end).trim();
      if (slice.length > 0) windowed.push(slice);
      if (end >= part.length) break;
      start = end - OVERLAP_CHARS;
    }
  }

  return windowed.map((text, ord) => ({ ord, text }));
}
