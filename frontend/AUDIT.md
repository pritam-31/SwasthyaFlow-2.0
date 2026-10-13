# आरोग्य Sathi — Frontend Audit

Date: 2026-10-11
Scope: `frontend/` — routing, navigation, layout/overlays, role correctness, offline UX, responsiveness, accessibility.
Verified with: `npm run build` (tsc -b + vite build), `npm run lint` (oxlint), `npm test` (Vitest + Testing Library, 35 tests), `npm run test:e2e` (Playwright, 4 tests), and a `react-router-dom` `matchRoutes` harness.

---

## P0 — Routing crash (fixed)

### Symptoms
Clicking any sidebar / More item changed the URL hash but the main area kept showing the Dashboard.

### Root cause
The old nested `<Routes>` declared child paths as **absolute** (`/app/triage`, `/app/dashboard`, …) under a parent route whose path was `/app/*`. React Router rejects this and the whole router initialised with:

```
Error: Absolute route path "/app/triage" nested under path "/app/*" is not valid.
```

Because the router failed, the nested bundle never mounted, so the outlet never rendered — hash changed, view did not.

### Fix
- `src/App.tsx` — canonical nested-`Outlet` structure: `/app` parent route renders `<AppLayout/>` (which renders the `Outlet`), with one child `<Route>` per absolute path in the new shared route table (`src/app/routes.tsx`), plus a nested `*` → `NotFound`.
- All child paths are now **relative** (`'triage'`, `'cases/:caseId'`, …).
- Verified empirically: every one of the 21 `/app/*` URLs (incl. `case-0001` param route) resolves to exactly one route with `matchRoutes` — no match errors, no absolute-nesting throw.

### Supporting files
- `src/app/routes.tsx` — single source of truth: `APP_ROUTES` (`{path, to, title, label, roles, nav, Component}`), `CLINICAL_ROLES`, `ADMIN_ROLES`, `EVERYONE`, `navRoutesForRole`, `canAccess`, `matchAppRoute`, `RouteGuard` (toast + redirect), `RouteMeta` (document.title + focus heading on each navigation).
- `src/components/layout.tsx` — sidebar, top bar, bottom bar, More sheet, and the command palette all read from `NAV_ITEMS` (derived from `APP_ROUTES`), so nav and guards can never drift apart.
- `src/components/ErrorBoundary.tsx`, `src/pages/NotFound.tsx` — crash/404 fallbacks.

---

## P1 — Role & data correctness (fixed)

- **Greeting names.** Old code used `user.name.split(' ')[0]`, producing "Hi R.", "Hi Dr.", "Hi S.". New `src/lib/displayName.ts` `getDisplayName` strips initials + role/relational titles, keeps honorifics attached to the surname, prefers an explicit `firstName`, falls back to "there". Verified outputs: `Dr. A. Mehta → Dr. Mehta`, `R. Sharma → Sharma`, `S. Kiro → Kiro`, `Ramesh Kumar → Ramesh`.
- **Header counters.** The "N cases need your review" figure was role-blind (patients/admins saw staff numbers). `src/lib/roleData.ts` computes `roleCounts` over `visibleCasesForRole`; header subtitle uses `queueSummaryText(role, counts)`:
  - nurse → drafts to verify
  - doctor → cases awaiting approval
  - admin → `N open · M overdue`
  - patient → intake status (being reviewed / reviewed / none)
- **Patient scoping.** Patients only ever see cases they reported (`reporter.startsWith('Patient')`); staff see the whole facility registry. Role-scoped, skeleton/empty/error-aware dashboard in `src/pages/Dashboard.tsx`:
  - patient: own-intake timeline, KPIs (intakes/reviewing/reviewed/closed), next follow-up, CTA to report a concern.
  - nurse/doctor: role-appropriate KPI rows + triage pipeline + needs-attention + recent cases + quick actions.
  - admin roles: audit activity + camps.
- **Case-detail alias.** `/app/cases/:caseId` is registered as a `nav:false` route in the same table (no phantom sidebar entry).

---

## P2 — Overlays, popovers, toasts (fixed)

- **Clipping/flip.** Inline absolutely-positioned menus were clipped by `overflow-hidden` parents and never flipped near the viewport edge. New `src/components/FloatingPanel.tsx` renders via `createPortal` into `document.body`, auto-flips (bottom → top, right → left), clamps to the viewport with padding, grows an internal scroll when tall, closes on Esc / outside pointer-down / route change, and moves focus to the first item with ↑↓/Home/End roving focus.
  - Refactored onto it: sidebar "More" popover, quick-actions, search palette, profile menu, facility switcher (`src/components/facility/FacilitySwitcher.tsx`).
  - Quick/search popovers anchor to whichever trigger is visible (desktop pill vs mobile icon) via a `matchMedia`-based `useIsDesktop()` — duplicate hidden anchors returned zero-sized rects before.
- **Toasts.** `src/store/AppStore.tsx` `pushToast` now dedupes identical messages and caps the stack at 3; auto-dismiss moved into `ToastStack` (`src/components/layout.tsx`) so it can pause on hover. Container is a single `role="status"` / `aria-live="polite"` region.
- **Offline queue button label.** The queue header showed "Syncing…" whenever there was nothing failed, even when idle. Now: `Retry all` when failed items exist, `Syncing…` only while syncing, `Sync now` when items are pending, `All queued entries synced.` otherwise; button disabled when there is nothing to do. New trilingual `syncNow` copy added to `OFFLINE_SECTION_LABELS`.

---

## P3 — Responsive (verified)

- Desktop: thin dark icon rail (md+) with tooltips, profile & More popovers.
- Mobile: bottom bar (`src/components/BottomNav.tsx`) with center FAB + More sheet, collapses/slides away while the keyboard is open (`visualViewport` listener) and honours `env(safe-area-inset-bottom)`.
- More sheet (`src/components/MoreSheet.tsx`): role-filtered 3-column grid, swipe-to-dismiss, **Esc close, body scroll-lock and a focus trap**, and focus restore on close.
- Panels are `max-w`/`w-[min(…vw,…px)]` and `flex-wrap` on the header cluster.

---

## P4 — Accessibility & robustness (improved)

- `RouteMeta` sets `document.title` and moves focus to the `#app-main` heading (or main) on every hash navigation.
- Keyboard: palettes/menus are reachable and operable with arrows + Enter, Esc closes; search has `⌘/Ctrl+K`.
- One persistent, non-dismissible non-diagnostic notice in the header (`role="note"`); consent-panel disclaimers inside intake remain as required. No duplicate header/footer strips.
- Single clear sign-out: a profile menu on the rail avatar (name, role, facility, unsynced-count warning + confirm when offline writes exist); mobile uses the More sheet's Sign out. The stray logout icon in the top bar was removed.

---

## Automated tests (added & passing)

- **Unit (Vitest + RTL, jsdom)** — `npm test`, 4 files / 35 tests, none need the backend:
  - `src/lib/displayName.test.ts` — greeting-name stripping (initials, role titles, honorifics, fallbacks).
  - `src/lib/roleData.test.ts` — patient scoping, `roleCounts` stage/urgency/referral counters, `queueSummaryText` per role.
  - `src/app/routes.test.ts` — relative-only child paths (locks in the P0 fix), `to`/`path`/roles invariants, `canAccess`, `navRoutesForRole`, `matchAppRoute` (incl. `/app/cases/:caseId`).
  - `src/components/FloatingPanel.test.tsx` — portal rendering, escape/outside-pointer close, focus move.
  - Coverage: `npm run test:cov` (v8, `text`/`html` JUnit-style reports to `coverage/`).
- **E2E (Playwright + Chromium)** — `npm run test:e2e` (starts the Vite server via `webServer`; **requires the backend on `:4000`** for login):
  - Nurse signs in and walks every staff-visible route asserting a non-empty `#app-main` heading + document title; staff are bounced off `/app/users` back to the dashboard.
  - Patient sees the self-service dashboard and is redirected (with toast) off `/app/triage`.
  - Admin opens every admin-only destination.
  - Doctor signs out via the rail avatar profile menu.
  - Config: `playwright.config.ts`; spec: `e2e/auth-navigation.spec.ts`.

## Remaining / optional

- **Bundle size.** Single chunk ≈ 1.19 MB (311 kB gzip) — lazy-load routes with `React.lazy` for a meaningful reduction (recommended follow-up, not critical).
- Pre-existing oxlint warnings (`react/set-state-in-effect`, `only-export-components`) in untouched files are out of scope.
- `npm audit` shows 1 high-severity advisory in the installed dev tree (not yet triaged).

## Commands

```bash
cd frontend
npm run build      # tsc -b && vite build
npm run lint       # oxlint src
npm test           # vitest run          (unit, no backend needed)
npm run test:cov   # vitest run --coverage
npm run test:e2e   # playwright test     (needs backend on :4000 + chromium installed)
```