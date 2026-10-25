# CDVRSWRLD Planner — Phase 1

This upgrades the existing Vite/React Planner. Daily OS stages, every existing
record field, Weekly OS sections, checklists, notes, theme and week navigation
remain. No database schema changes are required.

## Daily use

Sign in with the same Supabase account as CDVRS AI. Confirm the initial cloud
connection or import. After connecting, edits save automatically with a 650 ms
debounce. Check **Saved to cloud** before closing. Browser storage is retained
as recovery cache, not the primary save destination. Unsaved changes show an
error and a retry button. Signed-out records are readable; sign in to edit.

The daily overview shows priorities, unfinished actions, active project count,
and a visual schedule. Enter commitments as one `HH:MM Name` line each. These
are included in AI context. Cloud tasks can be created and completed from the
overview. Earlier guided-flow actions remain editable in their original day.

## Existing browser data

Preview and Production addresses have separate browser storage. The Preview
cannot read the old Production browser's records directly.

1. Open the original Planner in the browser holding the records.
2. Use the read-only download snippet in `scripts/export-browser-backup.js`
   in that page's developer console. It downloads the original JSON without
   changing localStorage or uploading anything.
3. Open the Phase 1 Preview and sign in. Select the downloaded JSON under
   **Import a Planner backup**. If this Preview already holds browser records,
   download its backup too.
4. Review the account and import information. Check the confirmation box, then
   choose **Import missing browser records & connect**.

Existing cloud weeks win on conflicts; they are skipped rather than overwritten.
Legacy v5 British Summer Time date keys are corrected during the confirmed
import only. The raw backup stays unchanged; ambiguous week collisions stop
for review instead of dropping either week's records.
Task IDs are deterministic and scoped to account/source location, making retries
safe. Nature and weekly records use existing unique keys with ignore-duplicates
during import. Import reports processed/skipped week counts. A partial failure
leaves the browser backup intact; retry finishes identical source weeks safely.
Never clear your old browser records until you have verified the cloud result.

All OS fields (including Social, reading, Bible, handoff and weekly checklists)
are preserved in an identified JSON snapshot in `planner_reflections.notes` for
the weekly period. Tasks are also indexed in `planner_tasks`, and Nature fields
are mirrored into `planner_nature_entries`. Existing unrelated reflection notes
are never treated as Planner snapshots or replaced during import. Cloud project
records are read from `planner_projects` for the overview and AI context.

Normal saves compare `updated_at` before replacing a weekly snapshot. A conflict
requires backup and reconnect. Only changed task and Nature rows are written.
The snapshot and indexes are separate writes: a partial index failure is shown
as **Not fully saved** and can be retried. Full cross-table atomic saves are a
Phase 2 improvement.

## AI approval and performance

The Planner's same-origin `/api/organise` proxy forwards the verified user's
bearer token to CDVRS AI's `/api/planner/organise` endpoint. Provider keys remain
in CDVRS AI. The endpoint reads only the verified user's tasks and projects,
uses bounded context and one model request, and has no write tools. It returns
at most six validated proposals. Unknown task IDs and guided-flow task moves
are rejected. The existing chat streaming, memory and provider defaults remain.
The new fixed-purpose request uses the balanced tier rather than classifying
large task lists as complex reasoning requests.

Each proposal requires **Approve & save**. Dismiss does not write. New proposals
have stable UUIDs for that response to prevent duplicate insert retries. Task
moves compare the original version to avoid overwriting another device's edit.
Pending proposals are intentionally not persisted across reloads in Phase 1.

## Preview configuration

Use `.env.example`; never commit `.env.local`. Required client settings:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. The server-only
`CDVRS_AI_URL` points to the exact tested AI Preview. The proxy forwards a
short-lived Vercel OIDC token through the standard Trusted Sources header;
provider keys and platform identity never reach the browser. The target AI
project must approve this one access rule: Planner project `preview` to AI
project `preview`. Production access is excluded. See `PREVIEW-ACCESS.json`
for the prepared rule. The access-control change is pending explicit approval.
Share links are used only for opening the Planner review page, not as service
credentials. Supabase ownership checks still protect all user data.

## Validation

Run `npm test`, `npm run lint`, `npm run build`. Browser verification scripts
under `verification/` use an isolated temporary fixture account; that fixture
is removed after acceptance. They cover sign-in, cloud reload, Nature/Social/
Weekly OS, mobile overflow, backup/consent, import fidelity, save failure/retry
and concurrent-device conflict handling. The scripts require the bundled
Playwright runtime or an adjusted import path and a locally running Vite server.

## Phase 2

Calendar integration, AI time-block edits, advanced rescheduling, project
editing UI, persisted proposal inbox, realtime cross-device updates, per-field
conflict resolution, atomic snapshot/index writes, and a dedicated structured
store for the remaining OS records are deferred. Date-based task scheduling
and manually entered timed commitments are working in Phase 1. Full task
history pagination beyond the current 2,000-row dashboard bound is also deferred;
the AI deliberately reads a bounded set of 150 open tasks and 40 active projects.

Release is Preview only. Merge and Production deployment require approval.
