# SoloDesk Design System

**Version:** 0.1
**Date:** 2026-04-27
**Status:** Design spec, applies from Sprint 1 onwards
**Brief:** Reserved but memorable. No modern AI design tropes. No Claude design tropes. Built for daily use by power users, not for a marketing screenshot.

---

## Position statement

SoloDesk is a tool, not a product demo. The interface is for someone who opens it 50 times a day for six months. Every pixel pays rent. The design language is closer to a financial terminal or a precision instrument than to a consumer app.

**One-line summary:** Looks like it was made in 1998 by someone who deeply respects the user, then quietly updated for 2026.

The aesthetic targets are Bloomberg, the New York Times' interior pages, the original Things 3, Linear circa 2022, the Financial Times' app, Working Copy on iPad, the Edward Tufte aesthetic. Specifically *not* targets: Notion (too airy, too much marketing in the interface), Vercel (too much chrome), Apple Mail (too forgiving), most VC-funded SaaS (too many gradients, too much "delight"), every generative-AI landing page from the last 24 months.

---

## Anti-tropes — what this design will not do

These are non-negotiable. If you find yourself reaching for any of these, stop.

**Modern AI tropes to avoid:**
- No purple-to-pink gradients. No gradients at all on UI elements (focus rings only, single colour).
- No glassmorphism. No frosted-glass overlays, no backdrop-blur as decoration.
- No "intelligence" iconography — sparkles, lightning bolts, brains, orbs, geometric "AI" marks, atom symbols.
- No animated typing dots. Loading is a static state, not a performance.
- No pulsing orbs, no "thinking…" reveals as a primary motif.
- No soft drop-shadows on cards. Borders only, where needed.
- No oversized hero illustrations of abstract 3D shapes.
- No emoji as UI. No emoji in error messages, empty states, button labels, anywhere in the chrome.
- No "✨" or "🚀" or any decorative unicode pretending to be an icon.
- No "Powered by AI" badges, "Beta" pills, "Early access" stickers.
- No suggested-prompt chips floating around an input.

**Claude design tropes to avoid specifically:**
- No warm cream / paper-bag backgrounds. No `#fafaf7` or similar.
- No burnt-orange or sienna as the accent colour.
- No serif display headings paired with sans body. Single typeface family.
- No "conversational" interface as the primary surface. Documents are primary, chat is auxiliary.
- No mascot, no character, no illustrated friend.

**Generic SaaS tropes to avoid:**
- No avatar circles with coloured initials.
- No "👋 Welcome back, Tim!" greetings.
- No motivational empty-state copy ("Let's get started!" "You've got this!").
- No progress bars where a number would do.
- No tooltips on every icon. If the meaning isn't obvious, fix the label.
- No skeuomorphic textures — no paper, no leather, no felt, no chalkboard.

---

## Aesthetic principles

Five principles, in order of priority. When they conflict, earlier wins.

### 1. The interface is the data
The chrome should disappear. No frames around content unless the frame is doing semantic work. A document on screen looks like a document, not a card containing a document. A list looks like a list, not a deck of cards. Dashboard panels are not "panels" — they're regions defined by typography and whitespace, not borders and backgrounds.

### 2. Density is respect
Tim is a power user. Showing him three things when he wants thirty is condescension. Default information density is high — closer to Linear's project view or the FT's markets page than to Notion. Whitespace exists for hierarchy, not for "breathing room."

Concrete: line-height 1.4 on body, not 1.7. Cell padding 8-12px, not 16-20px. Tables show 25-40 rows on a desktop screen by default.

### 3. Reserved, not minimal
Minimalism in 2026 means "white background, lots of space, one accent colour." That's the trope. Reserved means "show what's needed, with conviction, in a voice." A reserved interface can have a strong colour palette, distinctive typography, idiosyncratic iconography — it just doesn't shout.

### 4. Memorable through restraint, not ornament
The memorable detail is *what's missing*, not *what's added*. SoloDesk is memorable because there are no avatars, because the typeface is unexpected, because everything is one column on mobile, because the table cells aren't striped, because there's no logo in the chrome — not because of a clever logo or a custom illustration.

### 5. Built for the user who already knows
Onboarding hand-holding is for products selling themselves. SoloDesk is selling you nothing — you wrote the spec. No tooltips explaining what "Loop 1" means. No introductory modals. No "Try our new feature" badges. The interface assumes you read the spec and rewards you for it.

---

## Type system

### Typeface choice

**Primary: Söhne, by Klim Type Foundry.** If unavailable for licensing, use **Inter** as the fallback (not Geist — Geist is a Vercel/AI trope at this point). System UI fallback: `-apple-system, system-ui`.

Söhne is the right choice because:
- It's used by The New Yorker, the New York Times' design team, and high-end editorial publications. Strong serious connotation.
- It's not on every AI startup's landing page (Geist, Inter, Söhne-likes from Google Fonts are).
- It has a purposeful Mono variant for tabular data.
- Reading "Söhne" makes you feel like you've made a choice, not picked a default.

If Söhne licensing is blocking ($600+/year), the licensed alternative is **Founders Grotesk** (Klim, similar pricing) or **Neue Haas Grotesk Display** for headings paired with **Neue Haas Grotesk Text** for body.

The acceptable free fallback is **Inter** with `font-feature-settings: "ss01", "cv11"` for the more idiosyncratic stylistic alternates. Geist is forbidden.

**Mono: Söhne Mono** (or **JetBrains Mono** as fallback). Used for: any numeric column in a table, IDs (decision IDs, document IDs), code, terminal output, secrets/keys when displayed.

### Type scale

Eight sizes. No more.

```
xs    11px   captions, badges, table footnotes
sm    13px   secondary metadata, labels, sidebar items
base  14px   body, table cells, form inputs
md    16px   document body prose, important labels
lg    18px   subsection headers, prominent metrics
xl    22px   section headers, daily digest headline
2xl   28px   page titles
3xl   36px   document title (single use per page)
```

Note that **base is 14px, not 16px**. This is the density principle. Reserved-but-memorable means slightly tighter than the modern web default. 16px is for document prose specifically (reading, not scanning).

### Weight

Three weights, used purposefully:

- **Regular (400)** — body text, default
- **Medium (500)** — labels, table headers, button text, emphasis
- **Bold (700)** — page titles only, used sparingly

No semibold (600) — looks indecisive between medium and bold. No extra-light or light (300, 200) — invisible at small sizes and a "designed" affectation.

### Italic

Use real italic (Söhne Italic), not synthetic. Reserved for:
- Quoted material in document prose
- Scientific or proper nouns (book titles, etc.)
- Status states inline ("revision pending", "draft")

Never used for emphasis in UI labels — that's what medium weight is for.

### Tabular figures

Every numeric column, every metric card, every monetary value uses `font-feature-settings: "tnum"`. Numbers must align in columns. If a number is ever in a table or in a card position, tabular by default.

### Quote characters

Use real curly quotes — `"`, `"`, `'`, `'` — not `"`, `'`. En dashes — `–` — for ranges. Em dashes — `—` — for sentence breaks. This is the reserved-but-memorable signal. Most software gets it wrong; getting it right is invisible to most users and quietly correct to the ones who notice.

---

## Colour system

### Philosophy

**One ink, one paper, one accent.** Plus minimum-viable semantic colours.

The danger zone is "designed palette with personality" — three accents and a neutral, every one of them communicating something. That ages immediately and looks like every other startup's brand book. Restraint is to commit to monochrome with one earned colour.

### Light mode (primary)

```
ink         #1A1A1A    body text, primary surfaces
ink-strong  #000000    page titles only
ink-mute    #595959    secondary text, metadata
ink-faint   #8C8C8C    tertiary text, disabled, hint
paper       #F7F6F1    page background
paper-card  #FFFFFF    document body, dialog body
rule        #E5E3DB    borders, dividers, table lines
rule-strong #C4C2B7    emphasised borders, focus
accent      #1F3A5F    Prussian blue. The single accent.
```

The accent is **Prussian blue** (`#1F3A5F`) — deep, slightly desaturated, historic. Not Anthropic orange, not Linear purple, not generic VC-blue, not the bright-blue that every AI tool defaults to. Prussian blue carries connotations of cartography, technical drawing, archival print. It signals precision without performing it.

Used for: links, primary action accents, the cursor in inputs, the active state in navigation, focused outlines, the single-pixel rule under page titles. Used sparingly — Prussian blue should appear maybe 5-10 times on a typical screen, not 50.

The paper colour `#F7F6F1` is **off-white with a faint warm bias toward cream**, but it is *not* the Claude cream (`#FAFAF7` or similar warm neutrals). It's closer to the colour of unbleached printing paper or an old map's margin. The distinction is small but real — view both side-by-side and the difference is obvious.

### Semantic colours

Used only when the colour does semantic work. Never decorative.

```
positive    #2D5F3F    "approved", "active", "passed" states only
caution     #8B6914    "needs review", "draft", "pending" states only
negative    #6B1F1F    "killed", "failed", "blocked" states only
info        #1F3A5F    same as accent — for new/notice states
```

Note these are deep, desaturated versions, not bright traffic-light reds and greens. A "negative" state is communicated, not screamed. The colour is muted enough that a long list of items with status badges doesn't visually shout.

Backgrounds for status badges are 8% tints of the same hue, not pastel pinks and greens.

### Dark mode

Yes, dark mode is supported. It's not the default and it's not preferred — Tim is doing knowledge work that benefits from light backgrounds — but it exists for low-light environments. The dark mode philosophy is "ink and paper, inverted" — *not* the iOS-style "dark grey with bright accents."

```
ink         #F0EEE6
ink-strong  #FFFFFF
ink-mute    #A6A6A6
ink-faint   #6E6E6E
paper       #14110D
paper-card  #1F1B14
rule        #2E2A22
rule-strong #4A4538
accent      #7DA3D4    Prussian blue, lifted for contrast
```

The dark paper is *warm dark* — closer to the colour of dark walnut or deep oxblood ink than to true black or iOS dark grey. Memorable because it's not what's expected.

### What's banned

- No purple anywhere. Banned outright. Closest associated tropes: AI, Anthropic-adjacent, Linear, Stripe.
- No pink. Same reason.
- No teal. Default startup accent.
- No gradient anywhere on a UI element. Solid colours only.
- No neon-green for "success" — that's Spotify, that's terminal-green, that's wrong here.
- No bright red for "danger" — see semantic palette above.

---

## Iconography

### The library

**Phosphor Icons, "regular" weight only.** Not Lucide (default for shadcn, AI-startup default), not Heroicons (Tailwind default), not Tabler.

Phosphor is the right choice because:
- Distinctive but not trendy. Slightly more characterful than the safe alternatives.
- Six weights available, but using only "regular" creates consistency without performing it.
- Comprehensive — has icons for documents, sections, filters, comments, all the operational primitives.

Use Phosphor regular, 16px stroke, sized to match the font baseline. Two icon sizes only: **14px** (inline with body text), **20px** (sidebar nav, table actions).

### Where icons are allowed

Restricted list. Icons appear *only* in:
- Sidebar navigation
- Table row action columns
- Filter pills
- Comment thread anchors
- Status indicators in tables (paired with text)

### Where icons are forbidden

- Buttons. Text only on buttons. No icon-and-text, no icon-only.
- Empty states. Use type, not pictograms.
- Section headers. The label is enough.
- Inline in body prose.
- Anywhere in marketing pages or the landing page.

### No custom icons

No custom-drawn icons for SoloDesk concepts. No unique mark for "loop", no special icon for "decision". The Phosphor library suffices. Custom iconography is performative branding.

---

## Layout grammar

### Page structure

Every authenticated page follows this skeleton:

```
┌────────┬─────────────────────────────────────┐
│        │                                       │
│ side   │       page title                     │
│ bar    │       [single-pixel Prussian rule]   │
│        │                                       │
│        │       content                         │
│        │                                       │
└────────┴─────────────────────────────────────┘
```

- Sidebar: fixed 220px, `paper` background, no border (the paper colour change is enough)
- Page title: 28px, weight 700, `ink-strong`, with a 1px Prussian-blue rule beneath at 50% opacity
- Content: max-width 960px for documents, full-width for tables and dashboards
- No top bar. No header chrome. Sidebar contains everything navigational.

### The sidebar

```
SoloDesk
─────────────
Dashboard
Ventures
  Kounta
  Counsel
  Corum
  CaneMate
  RealStyler
  Realtelligence
Decisions
Content
Intel
Support
Settings
─────────────
tim@solodesk.ai
Sign out
```

No icons in the sidebar (overrides the icon-allowed list — the sidebar is so frequent that iconography becomes noise). Type-only. Active state is medium weight + Prussian-blue accent on a 2px left border. Hover is just a slightly darker text colour, no background change.

### Spacing

Six tokens, no more. All multiples of 4, with one exception.

```
0.5x  2px   tight inline gaps (icon-to-text)
1x    4px   small inline gaps
2x    8px   default inline gaps, table cell padding
3x    12px  card internal padding
4x    16px  section spacing
6x    24px  major section spacing
8x    32px  page-level spacing
```

The exception: 2px exists because the small-gap is genuinely needed between an icon and its text label.

### Borders and rules

Borders are a feature of the layout, not decoration. Used only when:
- Separating table rows (1px `rule`, every row)
- Underlining a page title (1px Prussian blue at 50% opacity)
- Separating sidebar from content (no border — paper-colour difference does the work)
- Defining input fields (1px `rule-strong` on bottom only, 0px on top/sides — see input style)

No border-radius on anything except form inputs (4px) and modal/dialog (6px). Documents, cards, pills, badges, buttons — all square corners. This is one of the load-bearing memorable details.

### What there are no boxes around

- Documents. A document is the page; it doesn't sit in a card.
- Metric cards on the dashboard. The number sits on the page, with a label above it. No surrounding box.
- Sections within a document. A section is a typography pattern, not a container.
- The landing page hero. No card, no panel, no contained region.

### What does have a box

- Modals (square corners, 1px `rule-strong` border, no shadow)
- Dropdowns (square corners, 1px `rule-strong` border, no shadow)
- Form inputs (4px corner, single bottom border)
- Status badges (square corners, 8% tint of semantic colour)

---

## Component patterns

### Buttons

Three button types. All have square corners. All use medium weight text. None use icons.

**Primary** — for the highest-priority action on a screen. Single per screen.
```
background: ink-strong
color: paper-card
padding: 8px 16px
border: none
text: 14px / medium / sentence case
hover: opacity 0.85
active: opacity 0.7
```

**Secondary** — most actions.
```
background: transparent
color: ink
border: 1px rule-strong
padding: 8px 16px
text: 14px / medium / sentence case
hover: background paper, border ink-mute
active: background rule
```

**Tertiary** — destructive, inline, or low-priority.
```
background: transparent
color: ink-mute
border: none
padding: 8px 16px
text: 14px / regular / sentence case
hover: color ink, underline
active: color ink-strong
```

Sentence case always. "Approve section", not "Approve Section" or "APPROVE SECTION".

### Inputs

```
background: paper-card
border-bottom: 1px rule-strong
border-top: none
border-left: none
border-right: none
border-radius: 0
padding: 8px 0
font: 14px regular ink
```

Only a bottom border. Looks like a form on government paperwork — square, deliberate. Focus state: bottom border thickens to 2px Prussian blue, no glow, no ring, no shadow.

### Tables

The most important component because most operational work happens here.

```
default row height: 32px
default cell padding: 8px 12px
header row: medium weight, ink-mute, 13px, single bottom border 1px rule
body rows: regular weight, ink, 14px
row separator: 1px rule between every row (no zebra stripes, no alternating colours)
hover: row background paper-card (very subtle lift from paper)
selected: 2px left border accent, no background change
```

Numeric columns: tabular figures, right-aligned. Text columns: left-aligned. Status badges in their own column, not inline in the title column.

Sort indicators: a single character "↑" or "↓" after the column label, in `ink-mute`. No icon button.

Pagination: page numbers as plain links separated by spaces, not buttons in a row. "Previous · 1 2 3 4 5 · Next."

### Status badges

Used in tables and document sections to indicate state. Square corners. Tiny.

```
font: 11px medium uppercase
padding: 2px 6px
background: 8% tint of semantic colour
color: 100% of semantic colour
border: none
```

States have specific labels — never variable:
- DRAFT (caution)
- REVIEW (info)
- ACTIVE (positive)
- KILLED (negative)
- DONE (ink-mute on transparent — finished work doesn't deserve a colour)

The uppercase is the *only* place ALL CAPS appears in the system. It's earned because the badges are 11px and need maximum compactness with maximum legibility.

### Document section markers

Each document section has a tiny marker in the left margin, 60px from the section content. Just the section kind in 11px `ink-faint` mono uppercase, e.g. "RECOMMENDATION", "EVIDENCE", "AGENT NOTE". No icon, no badge, no colour.

This is the load-bearing detail that makes SoloDesk look like a Tufte-influenced reference work rather than a SaaS app.

### Comments

Comments appear in the right margin of a document, not inline below the section. 240px-wide column. Each comment is:

```
[3-letter author tag in 11px mono] · [timestamp]
[comment body in 13px regular]
[evidence pointer if present, 12px ink-mute]
[actions row: Accept · Revise · Dismiss · Reply]
```

Author tags are three lowercase letters: `tim`, `agt` (any agent — specific name in tooltip), `crt` (critic). Three letters because it's a fixed-width signal that doesn't fight for visual weight with the comment body.

No avatar circles. No user names beyond the three-letter tag.

---

## Motion

Almost none. This is a deliberate position.

**What animates:**
- Modal/dropdown open: 120ms ease-out fade + 4px translate. Closes the same.
- Page transitions: nothing. Hard cut.
- Optimistic UI updates: nothing. The change appears, the server confirms, no animation either way.
- Hover states: 80ms colour fade only. No movement, no scale.
- Focus state on inputs: instant. No animation on the underline thickening.

**What doesn't animate:**
- Loading states. A region shows the word "Loading…" in `ink-mute` italic, no spinner, no skeleton, no pulse. Replaces with content when ready.
- Numbers updating. Hard swap, no count-up animation.
- Tables sorting. Instant reorder, no transition.
- Tabs / accordions. Open/closed is instant.
- Notifications. Toast slides in 120ms, sits, slides out 120ms. No bounce.

The position: motion in software is almost always a tax on the user. Each animation is a beat the user has to wait through. Reserve them for state changes that actually need the transition to be legible.

---

## Voice and tone

The interface speaks the way you'd write a quick directive to a competent colleague. Not corporate. Not chummy. Not algorithmic.

### Examples

**Good:**
- "Approve section" (not "✓ Approve" or "Looks good!")
- "No decisions yet." (not "Let's create your first decision!" or "✨ Get started")
- "This venture has no events for the selected window." (not "🔍 No results found")
- "Send to Resend" (not "🚀 Send")
- "Sign out" (not "Logout" — sign in/sign out is more grown-up)
- "Save" (not "Save changes")

**Buttons say what they do.** "Save". "Send". "Approve section". "Revise". "Dismiss".

**Empty states are facts, not encouragement.**
- "No decisions in review."
- "No comments on this section."
- "No intel signals this week."

That's the whole text. No call-to-action button cluttering the empty state. No illustration.

**Errors are direct.**
- "Email invalid." (not "Oops! That doesn't look like a valid email 😅")
- "Hash mismatch — payload likely modified."
- "Allowlist check failed."

**Confirmations are minimal.**
- "Saved." (not "Saved successfully!" or "✅ Your changes have been saved.")
- "Sent." for actions that send something.
- "Done." for actions that complete something.

### Numbers

Numbers in the UI use abbreviated forms with proper unicode:
- "1,247" not "1247"
- "£12.3k" not "£12,300" in metric cards (full number on hover)
- "3m ago", "2h ago", "yesterday", "Apr 14" — relative for recent, absolute past 7 days
- En dash for ranges: "10–12 active decisions" not "10-12"

### Capitalisation

Sentence case for all UI labels, button text, headers, page titles. The only ALL CAPS is status badges (11px) and the section markers in document margins (11px mono). Never Title Case. Never sentence case with capitalised proper noun within ("View ventures", not "View Ventures" or "View ventures and projects").

---

## Mobile pattern

SoloDesk on mobile is **read + approve only**. No writing, no agent invocation, no document editing.

Specifically:
- Approve / dismiss decisions and content drafts
- Read intel digests and metric digests
- Resolve agent_note flags (yes/no/defer)
- Sign out

Specifically *not* on mobile:
- Create or edit ventures
- Create decisions or content briefs
- Type comments (read existing only)
- Manage settings or allowlist

Why: mobile use happens during the gaps — coffee, transit, between meetings. Approval-heavy workflows fit those gaps. Composition does not. A truncated mobile experience that excels at one thing beats a complete experience that's mediocre at everything.

Layout on mobile:
- Single column always
- Sidebar collapses to a hamburger that slides over
- Tables collapse to vertical card lists, but only show the top 3 columns plus a "View" link
- Document sections stack with no margin section markers (label appears inline as a caption above the section)

---

## Accessibility floor

Non-negotiable.

- WCAG 2.2 AA contrast minimum on all text (the palette above clears this with margin in light mode; dark mode tested per token)
- Every interactive element keyboard reachable in tab order
- Focus state visible on every focusable element (Prussian-blue 2px outline, 2px offset, no glow)
- All form inputs have associated labels (visible or `aria-label`)
- Tables have proper `<th>` and `scope` attributes
- Modals trap focus and return focus on close
- No hover-only affordances (every hover action has a click or keyboard equivalent)
- Live regions used for status announcements (saved, sent, errored)
- Reduced motion: respects `prefers-reduced-motion: reduce` (eliminates the 120ms fades — instant)

Tested via axe-core in CI from Sprint 1 onwards. Lighthouse Accessibility ≥ 95 (not 90).

---

## What this looks like vs what it doesn't

To make this concrete:

**A SoloDesk decision document looks like:**
A wide column of off-white paper. A 28px black title at the top with a thin Prussian-blue rule beneath. Section markers in tiny grey mono in the margin. Paragraphs in 16px Söhne with curly quotes and proper em dashes. A right margin column of comments with three-letter author tags. No card. No background. No drop shadow. No avatar. No emoji.

**A SoloDesk decision document does *not* look like:**
A white card floating on a grey background. A purple "AI" badge in the corner. An avatar circle for "Claude" with a sparkle next to it. Soft shadows. Rounded corners. A hero illustration of papers fanning out. A "✨ Generate alternatives" button.

**A SoloDesk table looks like:**
Single-pixel rules between every row. Column headers in 13px medium uppercase grey. Tabular figures in numeric columns. Status badges as 11px coloured pills. Selected row marked by a 2px Prussian-blue left border, no background change. j/k keyboard nav. No striping, no card backgrounds, no expanded row animations.

**A SoloDesk table does *not* look like:**
A "data-grid component" with cell shadows on hover, animated chevrons opening sub-rows, gradient header backgrounds, alternating row stripes, oversized rounded-corner action buttons, "AI insights ✨" badges in cells.

---

## Implementation

### Tailwind v4 config

Custom palette via `@theme` in CSS. No "neutral", no "gray" defaults — those are removed. The eight tokens above are the palette.

CSS:
```css
@theme {
  --color-ink: #1A1A1A;
  --color-ink-strong: #000000;
  --color-ink-mute: #595959;
  --color-ink-faint: #8C8C8C;
  --color-paper: #F7F6F1;
  --color-paper-card: #FFFFFF;
  --color-rule: #E5E3DB;
  --color-rule-strong: #C4C2B7;
  --color-accent: #1F3A5F;
  --color-positive: #2D5F3F;
  --color-caution: #8B6914;
  --color-negative: #6B1F1F;

  --font-sans: "Söhne", "Inter", -apple-system, system-ui, sans-serif;
  --font-mono: "Söhne Mono", "JetBrains Mono", monospace;

  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
}
```

### shadcn/ui

Use shadcn primitives as **structural** components only — `Dialog`, `DropdownMenu`, `Tooltip`, `Command`. Override every visual token with the palette and patterns above. The shadcn defaults are forbidden — no slate-grey neutrals, no rounded-md cards, no soft shadows.

In practice this means importing the headless logic and rewriting the styling completely.

### What Sprint 1 changes

The Sprint 0 build used shadcn's default neutral palette and Geist font. The first task in Sprint 1 (before any Document substrate work) is:

1. Install Söhne (or Inter as fallback if Söhne isn't licensed yet)
2. Replace the Tailwind colour palette with the SoloDesk palette
3. Override shadcn primitive styles
4. Replace Lucide icon imports with Phosphor "regular" weight
5. Audit existing pages and rewrite component styles to match this spec
6. Replace existing avatar/initials components with three-letter mono tags

Estimate: half a session before any new feature work.

---

## Where I'm uncertain

These are calls I'm flagging because they're aesthetic judgements, not engineering decisions, and you might disagree:

1. **Söhne specifically.** It's a paid font ($600+/year for web licensing). If you're not willing to pay, Inter is the fallback but Inter is a default — it gives up some of the memorability. There's also a case for **Tiempos Headline** (Klim, serif) for page titles paired with Söhne for body, but that risks veering into editorial-magazine territory and away from "tool."

2. **Prussian blue specifically.** It's a strong call and a memorable choice. It might feel cold or corporate to some eyes. Alternatives that hit similar territory: Pantone 281 (deep navy), Yves Klein blue (more saturated), or a deep oxblood as the accent. I'd defend Prussian, but it's the most subjective single decision in the spec.

3. **Square corners on everything.** This is the most assertive design choice. Square corners read as "deliberate" and "tool-like" to some, "harsh" or "dated" to others. The bet is that it's memorable through restraint. Could be wrong.

4. **No icons in the sidebar.** Goes against modern convention. Reasoning: high-frequency navigation is faster with type-only when the labels are short. But it's possible that 6 weeks in you'd want them. Easy to add.

5. **Paper colour `#F7F6F1`.** Could be argued either way — it's 95% there to "off-white" but the warm bias is the whole point of distinguishing from the cold-grey defaults. Worth eyeballing on your actual monitor before committing.

If any of these don't sit right, say so before Sprint 1 begins to rebuild the styles. They're cheap to change before the substrate is built, expensive after.
