# Launch Film Storyboard

## The Story

**Sam** is a solo indie hacker building **Supafan** — a creator storefront platform where creators sell digital products (courses, templates, assets). Think Gumroad meets Lemon Squeezy. Sam's been building for a few months and is picking up paying creators.

Today Sam is shipping the **checkout flow** — Stripe-powered payments with receipts, discount codes, and creator payouts. This is the make-or-break feature: without a smooth checkout, creators can't sell.

The film follows one work session: plan the feature (Chat) → organize the tickets (Board) → spec the details (Notes) → write the code (Code) → automate the deploy pipeline (Workflow) → ship it (Montage).

---

## Shared Universe

These are the canonical names, IDs, and values that must appear consistently across every chapter. When a thread, branch, or command shows up in multiple places, it must be identical.

### Threads

| Thread | Short Code | Status Color | Role |
|---|---|---|---|
| Checkout flow implementation | AB-42 | busy (spinner) | Parent thread, the main plan |
| Stripe payment integration | AB-47 | green (#22c55e) | Active child, pinned, the one Sam just finished |
| Deploy checklist | AB-53 | amber (#f59e0b) | Pending, waiting for checkout to land |

### New thread (created during Board)

| Thread | Role |
|---|---|
| Add discount code support | Created in Board's "New Thread" form, linked to parent AB-42. Also appears as a kanban card that moves from Backlog → In Progress, and as a `#threads:` reference in Notes |

### Branch & project

| Key | Value |
|---|---|
| Branch | `sam/checkout-flow` |
| Base branch | `main` |
| Project path | `~/Supafan` |
| GitHub repo | `supafan/supafan` |
| Author | `sam` |

### Command (Workflow → Montage)

| Key | Value |
|---|---|
| Command | `/supafan deploy-checkout` |

---

## Chapter 1: Chat

Sam is in the "Checkout flow implementation" thread. They paste a screenshot and reference their notes to scope the checkout feature.

**Breadcrumbs**: "Threads > Checkout Thread" initially, switches to "Threads > Stripe payment integration" after loading a recent thread.

**User prompt** (typed with caret): `"Use #notes:current and this screenshot to scope the checkout flow — Stripe payments, receipts, and discount codes."`
- `#notes:current` triggers the reference autocomplete (category list → notes items → selects "current")
- Image attachment: SVG placeholder showing a Supafan checkout page mockup

**Assistant thinking**: `"Examining the tasklist and screenshot to identify the checkout components and determine the right Stripe integration pattern before creating tickets."`

**Assistant response**: `"I'll scope the checkout feature from the tasklist: create the Stripe integration, wire receipt emails, add the discount engine, and prepare the creator payout stub."`

**Tool activity** (streaming):
1. Read — `notes/supafan/tasklist/current.md` — 312ms — "Checkout tasklist loaded"
2. Task — `create implementation tickets from checkout scope` — 1280ms — "3 tickets created"
3. Write — `packages/api/src/services/checkout-service.ts` — running
4. Bash — `npm run typecheck` — running

**Plan artifact**: "Checkout Implementation Plan"
- Steps: Design payment flow (done), Create tickets (done), Wire Stripe integration (done), Review deploy checklist (running)
- Table: Stripe (wired), Receipts (wired), Discounts (stubbed)
- Quote: "Every creator gets paid. Every buyer gets a receipt."

**Plan markdown** (expanded block):
```
## Supafan Checkout → Implementation Pass

### Context
The checkout thread has the current tasklist, payment requirements, and a product screenshot
in one place. The next step is to turn that context into implementation work without leaving
the thread.

Goal: create the implementation tickets, wire the Stripe integration, and prepare the deploy
path for a shippable PR.

### Key Discovery
The existing tasklist identifies three pillars: Stripe checkout sessions (webhook-driven),
receipt emails (Resend transport), and discount codes (validation middleware). A shared
PaymentProvider interface keeps all three behind one dispatch surface.

### Implementation Plan
- Create implementation tickets for each checkout component.
- Design the PaymentProvider interface and session flow.
- Wire Stripe checkout.session.completed webhook handler.
- Configure Resend receipt emails with order summary template.
- Stub discount code validation endpoint.
- Run integration tests across all payment paths.

### Files
`packages/api/src/services/checkout-service.ts` — session creation and payment confirmation.
`packages/api/src/webhooks/stripe-webhook.ts` — Stripe event handling.
`packages/api/src/services/receipt-service.ts` — Resend email transport.
```

**Recent threads menu** (bottom tabs → click recent → menu appears):
1. "Stripe payment integration" — AB-47 — pinned — green — now
2. "Checkout flow implementation" — AB-42 — busy — 2 min ago
3. "Deploy checklist" — AB-53 — amber — 8 min ago

**After switching to "Stripe payment integration"**:
- Breadcrumbs change to "Threads > Stripe payment integration"
- Bottom tab label changes
- New user message: `"Polish the checkout flow and prepare the PR path."`
- Completed response: `"The checkout flow is wired. Stripe webhook handles payment_intent.succeeded, receipt emails send via Resend, and discount validation works. All three paths pass integration tests."`
- Completed tool activity:
  1. Read — `packages/api/src/services` — "Service directory reviewed"
  2. Edit — `checkout service, Stripe webhooks, receipt emails` — "Payment flow wired"
  3. Edit — `discount engine and validation middleware` — "Discount codes ready"
  4. Bash — `npm test -- --filter checkout` — "Integration tests passed"

**Quick prompt flow**: User clicks quick prompts, selects the review prompt (kept as-is — it's generic), sends it.

---

## Chapter 2: Board

Sam navigates from Chat to the thread board. We see the dashboard, create a new thread, then view the kanban.

**Flow**: Dashboard view → click "New Thread" → fill form → switch to kanban → drag card

### Dashboard view
- **Tabs**: Deploy checklist (pinned), Checkout flow implementation (active), Receipt email templates
- **Artifact sidebar**: Checkout flow implementation (approved), Deploy checklist (ready), Receipt email templates (next)
- **Artifact shown**: Same plan artifact from Chat, but status = "approved"

### Create form
- **Title** (typed): `"Add discount code support"`
- **Instructions** (typed): `"Create the discount code validation endpoint and checkout price adjustment. Link it to the parent checkout thread and keep the Stripe integration visible."`
- **Linked thread**: searches `"Checkout flow implementation"`, selects parent thread AB-42
- **Parent thread tag**: "Checkout flow implementation" / AB-42 / Active / tags: `['checkout']`

### Kanban board
- **Backlog**: "Draft creator payout spec" (parent tag), "Add discount code support"
- **In Progress**: "Wire receipt email templates"
- **Done**: (empty)
- **Moving card**: "Add discount code support" animates from Backlog → In Progress

### Filter popover (demo states)
- Statuses: Active (selected), Paused, Done
- Tags: `checkout` (selected, purple), `payments` (cyan), `bug` (red)

---

## Chapter 3: Notes

Sam opens Notes home, navigates to their checkout spec note, works in the editor with the tasklist panel open.

### Notes Home
- **Greeting**: "Good afternoon"
- **Recent**: current (💳, just now, active), Tasklist (📝, 4m ago), api (🔌, 18m ago)
- **Favorites**: current (💳), Roadmap (🗺️), Design (🎨)

### Notes Editor
- **Breadcrumbs**: Notes > Supafan > Tasklist > Current
- **Title**: 💳 current
- **Before lines** (static): "Stripe webhook integration", "checkout session flow works in staging"
- **Animated lines** (typed during shot):
  1. "add checkout diagram, resize it, and keep tasks nearby"
  2. "mark receipt emails complete, then create the next todo"
  3. "new todo: link #threads: Add discount code support back to the parent ticket"
- Line 3 contains an inline **thread reference chip**: `#threads: Add discount code support` — this is the same thread created in the Board chapter

### Image block
- SVG showing a Supafan checkout flow diagram (replace the current launch plan SVG)
- Resize interaction: 76% → 54% width

### Tasklist panel (right side)
1. Stripe webhooks (🔧)
2. **current** (💳) — active
3. receipt emails — *gets marked complete during animation*
4. checkout UI
5. discount codes
6. creator payouts
7. product variants
8. landing page redesign (completed, muted)
9. pricing tiers (💰)
10. analytics dashboard

**Interactions**:
- Checkbox press on "receipt emails" → marks complete
- Add button on "current" → new todo "Add discount code support" slides in (linked to thread)

### Right rail
- **Favorites**: current (💳), api (🔌), Roadmap (🗺️)
- **Tree**: Supafan (⚡), Payments (💳), Tasklist (📝), Design (🎨)

---

## Chapter 4: Code

Sam is in the code plugin, working on the checkout branch. Source control shows the implementation progress, then the PR flow.

### Source control panel
- **Base directory**: ~/Supafan
- **Branch**: `sam/checkout-flow`
- **Branch sync**: 4 commits ahead, 0 behind
- **Worktrees**: `sam/checkout-flow` at ~/Supafan (current), `main` at ~/Supafan-main

### Diff view
- **File**: `checkout-service.ts` (line 24)
- **Lines**:
  ```
  context:  "export async function processCheckout(cart, customer) {"
  add:      "  const session = await stripe.checkout.create(cart);"
  add:      "  const receipt = await receipts.generate(session);"
  remove:   "  return createGenericOrder(cart);"
  add:      "  return stripe.confirmPayment({ session, receipt });"
  add:      "  await analytics.track('checkout.completed', session.id);"
  context:  "}"
  ```

### Files
- **Staged**: `packages/api/src/services/checkout-service.ts` (modified)
- **Changed**: `packages/api/src/webhooks/stripe-webhook.ts` (modified), `packages/api/src/services/receipt-service.ts` (added), `packages/worker/src/jobs/payout-worker.ts` (modified)

### Commits (author: sam)
1. `a1b2c3d` — "Add Stripe checkout session and webhook handler" — 2m ago
2. `e4f5g6h` — "Wire receipt email generation with Resend" — 18m ago
3. `i7j8k9l` — "Add checkout service and cart validation" — 1h ago

### Commit flow
- Commit message starts as typed "incomplete work", gets stashed
- Switch to main worktree
- Generated commit message: `"feat(checkout): wire Stripe payment flow with receipts"`

### Terminal (brief appearance)
```
$ npm test -- --filter checkout
> supafan@0.4.0 test
> vitest run --filter checkout

 ✓ checkout-service.test.ts (4 tests)
 ✓ stripe-webhook.test.ts (3 tests)
 ✓ receipt-service.test.ts (2 tests)
All tests passed
```

### PR flow
- **Publish branch** (progress bar)
- **Create PR**: title "Checkout flow", base: main, head: sam/checkout-flow
- **PR body**: "Wire Stripe checkout sessions and webhook handler\nAdd receipt email generation via Resend\nKeep the payment flow consistent with creator payout path"
- **PR #42**: OPEN → MERGED, CLEAN merge, APPROVED review
- **Checks**: CI passed, Preview deploy ready
- **PR files**: checkout-service.ts, stripe-webhook.ts (added), receipt-service.ts (added), discount-service.ts (added), payout-worker.ts (modified)
- **Open PRs list**: #42 Checkout flow (OPEN), #38 Creator dashboard analytics (OPEN), #35 Product variant picker (DRAFT)
- **Review comment**: "Verified the webhook handler validates Stripe signatures correctly."

---

## Chapter 5: Workflow

The deploy automation. Starts with just the listener node on black, progressively reveals the full flow canvas.

### Flow canvas
- **Breadcrumbs**: Flows > Root Flow (Root)
- **Nodes**:
  1. Listener — "start command listener" (user.command)
  2. Switch — `"is /supafan deploy-checkout"` — branches: `/supafan deploy-checkout`, Else
  3. Action — "Run database migrations"
  4. Action — "Notify #releases channel"
- **Edges**: listener → switch → migrations / notify (elbow routing)

### Flow list (sidebar)
1. Root Flow — "Default entrypoint for Supafan"
2. **Deploy Checkout** — "Checkout feature deploy pipeline" (selected)
3. Post-purchase Flow — "Receipt and payout automation"
4. Creator Onboarding — "New creator setup wizard"
5. Daily Digest — "Scheduled sales summary"

---

## Chapter 6: Montage

Quick flashes across plugin surfaces showing the deploy in action.

### Threads (frames 0–72)
- Command typed: `/supafan deploy-checkout`
- Response: `"Matched the deploy-checkout command, ran migrations, and notified the #releases channel."`

### Logs (frames 72–142)
- Entries referencing the deploy-checkout pipeline, database migrations, command routing

### Database (frames 142–222)
- Query results referencing checkout/payment messages

### Settings (frames 222–360)
- Provider configuration (keep current interaction pattern)

---

## Continuity Map

```
Chat                    Board                   Notes                   Code                    Workflow / Montage
─────────────────────── ─────────────────────── ─────────────────────── ─────────────────────── ──────────────────────
"Checkout flow          Dashboard tab           —                       —                       —
 implementation"        Artifact sidebar
 AB-42 (busy)           Create form parent

"Stripe payment         —                       —                       Commit: "Add Stripe     —
 integration"                                                           checkout session..."
 AB-47 (pinned, green)

"Deploy checklist"      Dashboard tab (pinned)  —                       —                       —
 AB-53 (amber)

"Add discount code      Kanban card (moving)    Animated line 3         PR file:                —
 support"               Create form title       (#threads: reference)   discount-service.ts
                                                Linked todo in tasklist

sam/checkout-flow       —                       —                       Branch, worktree,       —
                                                                        stash, PR head

/supafan deploy-        —                       —                       —                       Switch node label,
checkout                                                                                        Montage command

receipt emails          Board kanban:           Tasklist item           Commit: "Wire receipt   —
                        "Wire receipt email      (marked complete)       email generation..."
                         templates"

checkout-service.ts     —                       —                       Diff file, staged       —
                                                                        Tool activity (Write)
```

---

## State files to update

| File | What changes |
|---|---|
| `state/launchStory.ts` | Central story constants — all thread names/IDs, branch, command, flow labels. Other files import from here. |
| `state/chat.ts` | All prompt/response text, plan content, tool activity, recent threads, thinking block |
| `state/board.ts` | Dashboard tabs, kanban cards, create form, artifact sidebar, filter tags |
| `state/notes.ts` | Tasklist items, editor copy, right rail, home cards, thread reference, SVG image |
| `state/code.ts` | Branch, diff, commits, PR details, terminal output, worktrees, author |
| `state/workflow.ts` | Switch label, action labels, flow list |
| `state/paths.ts` | Project directory paths |
| `state/logs.ts` | Log entries referencing checkout/deploy |
| Montage-related state (MontageShot.tsx or wherever montage data lives) | Command, response text |

All changes are data-only. No component, type, or animation logic changes needed. Text lengths may differ, so verify reveal animations complete before scene cuts after updating.
