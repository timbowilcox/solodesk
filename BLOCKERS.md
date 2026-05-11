# BLOCKERS — Phase B overnight build

Rows appended as blockers are hit. Tim reviews in the morning.

Format per entry:
```
## [SPRINT-ID] <short title>
- **Sprint:** B.X
- **Blocker type:** credential | external-dependency | decision | test-failure | spec-ambiguity | deploy-required
- **What's blocked:** ...
- **Why blocked:** ...
- **What was done instead:** ...
- **What Tim needs to do:** ...
```

---

## [B.2] Visual library v1 — illustrator commission

- **Sprint:** B.2
- **Blocker type:** external-dependency
- **What's blocked:** The 10–15 Atrium-aesthetic illustrations required as visual heroes for Brief, Question, and Promotion modal archetypes (per MODAL-ARCHETYPES.md §3). Without the visual library, hero slots render as styled placeholder divs.
- **Why blocked:** Illustration commission is a human + budget action. No asset delivery mechanism exists overnight.
- **What was done instead:** All 8 modal archetype components are built with a styled `<AtriumHeroPlaceholder archetype="..." />` component — a rectangular div with the archetype name, Atrium-aesthetic warm gradient backdrop, and an `aria-label`. The illustration slot is typed and wired; swapping in real assets requires only changing the `src` prop on the `<AtriumHero>` component.
- **What Tim needs to do:** Brief illustrator with spec from MODAL-ARCHETYPES.md §3. Deliver assets to `/public/atrium/heroes/<archetype-name>.png`. Update `AtriumHero` component's asset map in `/components/modals/AtriumHero.tsx`.

---

## [B.2] Söhne font licence

- **Sprint:** B.2
- **Blocker type:** external-dependency
- **What's blocked:** Söhne typeface for modal headline typography (per CLAUDE.md stack decisions).
- **Why blocked:** Söhne requires a commercial licence purchase. Klim Type Foundry has no API.
- **What was done instead:** All modal headline type renders in Inter (Next.js `next/font/google` fallback), identical to the pattern used in Phase A. The `font-editorial` CSS class is defined and ready — replacing the font-family value is a one-line change once the licence is in place.
- **What Tim needs to do:** Purchase Söhne licence from Klim Type Foundry. Install woff2 files to `/public/fonts/`. Update `app/layout.tsx` font config.

---

## [B.6] DNS routing for per-venture inbound email

- **Sprint:** B.6
- **Blocker type:** deploy-required
- **What's blocked:** Per-venture inbound email subdomain routing (e.g. `support.kounta.solodesk.ai` → ingest pipeline). The Resend inbound routing webhook is wired and the venture-resolution logic is implemented, but the DNS records and Resend domain configuration must be set up in the Resend dashboard.
- **Why blocked:** DNS propagation requires human action in the Resend dashboard and domain registrar. Cannot be done overnight.
- **What was done instead:** Inbound handler implemented at `/api/webhooks/inbound-mail` with full venture resolution from recipient. Supports both subdomain-based (`<venture-slug>@inbound.solodesk.ai`) and tag-based (`support+<venture-slug>@inbound.solodesk.ai`) routing. Tests use synthetic webhook payloads.
- **What Tim needs to do:**
  1. In Resend dashboard: add `inbound.solodesk.ai` as an inbound domain.
  2. Add DNS MX record: `inbound.solodesk.ai → inbound-smtp.resend.com` (TTL 300).
  3. Set Resend webhook URL to `https://app.solodesk.ai/api/webhooks/inbound-mail`.
  4. Verify with a test forward from `support@<venture>.com` to `support+<venture-slug>@inbound.solodesk.ai`.

---

## [B.6] Resend webhook secret for inbound mail

- **Sprint:** B.6
- **Blocker type:** credential
- **What's blocked:** The inbound mail webhook handler validates a `x-resend-signature` header. The signing secret is needed to validate real Resend payloads in production.
- **Why blocked:** Resend generates the webhook signing secret at webhook endpoint creation time. This requires Tim to create the endpoint in the Resend dashboard first.
- **What was done instead:** Handler accepts `x-solodesk-secret` shared-secret fallback (same pattern as existing webhook handlers). This is functional for testing but less secure than HMAC signature validation.
- **What Tim needs to do:** After creating the Resend inbound webhook, copy the signing secret to Vercel environment variable `RESEND_INBOUND_WEBHOOK_SECRET`. Handler auto-upgrades to HMAC validation when this var is set.
