# Planner Phase 2

Built on the unmerged Phase 1 feature branch. The owner has approved the tested foundation release to Production. Full adaptive planning is tracked separately in ADAPTIVE-PLANNING.md.

## Saves and multiple devices

Ordinary weekly edits call `save_planner_week_v2`, a SECURITY INVOKER function
that saves the full OS snapshot, task indexes and Nature indexes in one database
transaction. A failed index write rolls back the snapshot. Ownership comes from
`auth.uid()`; anonymous execution is revoked. Existing Planner RLS remains.
Duplicate request retries return the committed version. Version mismatches stop
stale saves. The additive migration has been applied to the existing project;
the legacy clients and schema remain compatible.

Owner-filtered Realtime subscriptions watch Planner snapshots, tasks and
projects. Focus, online reconnection and a visible-page 60-second fallback also
refresh changes. Snapshot sync checks small version records first and downloads
only changed weeks. Task/project reads are paginated instead of truncating at
2,000 rows. The safety bound is 50,000 loaded records; exceeding it raises an
explicit error rather than silently discarding data.

Three-way merging uses the last shared week as its base. Independent fields and
checkbox edits merge. Overlapping edits show the local and cloud values; download
a backup, select each value and approve **Save chosen values**. Remote deletion
also requires a choice. In-flight edits are drained after the current transaction;
network failures retain the browser copy and retry on reconnect. Existing initial
backup import remains the Phase 1 additive, retryable import; it never overwrites
cloud conflicts and is not described as one cross-week transaction.

## Google Calendar used in Apple Calendar

The user's Apple Calendar displays their Google calendar, so one Google
authorization covers the source account. No iCloud password is needed.

`VITE_GOOGLE_CALENDAR_CLIENT_ID` is public configuration. Use a Google OAuth web
client, with the stable Preview origin in Authorized JavaScript origins:

`https://cdvrswrld-planner-git-feature-planner-phase-2-cdvrs-s-projects.vercel.app`

Enable Google Calendar API, configure Branding/Audience, add the user's Google
email as a test user while in Testing, and add
`https://www.googleapis.com/auth/calendar.readonly` in Data Access. This client
uses ordinary Google Identity Services popup authorization, so no redirect URI,
client secret or Google MCP agent designation is needed.

The user must finish Google's account selection/consent in the Preview. Access
tokens stay in memory for that browser session; they are not put in localStorage,
Supabase or AI requests. A token expiry requires the user's reconnect action.
Calendar lists and expanded weekly events are read directly from Google's API
with complete pagination. The user reviews the returned occurrences, downloads
a Planner backup, and approves importing them into the cloud. Refresh is explicit;
this does not silently run a permanent background calendar sync.

Google calendar changes appear in Apple Calendar through the user's existing
Google account configuration. For schedule additions, **Review in Google Calendar**
opens an event draft; the user saves it in Google. The app has read-only API access
and never writes directly to the external calendar.

## Calendar files

Google and Apple `.ics` exports can be previewed for the selected week. Only event
titles, dates/times, UID and source metadata are retained; attendees, attachments
and alarm actions are not imported. Nothing is saved before backup and approval.
Recurring events, EXDATE, exceptions, time zones, all-day and multi-day occurrences
are supported by pinned ICAL.js. UTC/VTIMEZONE data is honored; ambiguous or
nonexistent floating times stop with an explicit clock-change message. Event IDs
are stable across reimports and Google API/file sources. Google refresh can propose
removing previously imported connected-calendar occurrences that disappeared;
these removals also require import approval.

Approved Planner time blocks export to `.ics`, alongside manual commitments
(30-minute default duration for legacy lines without an end time). Existing
imported calendar events are excluded from export to avoid recreating them.
The parser is dynamically loaded when import/export is used.

## AI time blocks

The existing authenticated AI endpoint now proposes `kind: time_block` with a
selected date, start/end, optional existing block ID and explanation. Date/order/
ownership validation rejects malformed actions. Busy windows include imported
calendar events, manual commitments and approved blocks. Conflicting proposals
are marked and cannot be approved. The client rechecks the latest busy windows
before applying a proposal. New blocks and edits are saved only after approval,
then use the same transactional cloud save and conflict review. No additional
model call, automatic rescheduling or provider-routing change is introduced.

## Verification

`npm test`, `npm run lint`, `npm run build`; AI additionally runs TypeScript.
`supabase/tests/atomic_week_save.sql` runs transaction rollback tests for atomicity,
idempotency, stale versions, foreign owner fields and foreign task identifiers.
`verification/phase2-test.cjs` uses two isolated browser contexts and a temporary
fixture account for realtime changes, concurrent merge, explicit conflicts,
offline retry, calendar approval and (when enabled) real AI time-block approval
and export. It never creates events in the user's real Google calendar.

Live Google authorization must be completed by the user; API boundary tests use
synthetic responses and are not proof of successful account consent.

## Approved carry-forward and CDVRS AI handoff

Start and **07 Handoff** now offer an explicit review for the following calendar
day. Reminders are preselected; unfinished actions are opt-in. Approval adds
selected entries to `record.handoff.incoming` on the target day, including across
Sunday/Monday and year boundaries. The existing atomic week save persists this
map; existing next-day records remain intact. Stable source IDs prevent repeated
imports from duplicating entries or resetting completion. The original day and
calendar are unchanged. Existing cloud tasks are referenced by ID, preserving
their dates; completing a referenced task updates the original with an ownership
and version check. Other carried actions have independent completion checkboxes.
The daily AI request already includes this saved incoming context.

**Review handoff to CDVRS AI** shows an editable exact message containing selected
actions, energy, intention, objective, handoff notes and calendar commitments.
A separate approval creates a saved conversation and message in the existing
CDVRS AI tables. No model call occurs until the user continues that conversation.
Only a conversation identifier goes in the link; no notes or auth tokens are in
its URL. Sign in to CDVRS AI with the same account. Owner-scoped deterministic IDs
make retries idempotent. The two additive writes are not a transaction: if a
message write fails an empty conversation may remain, and retrying the same
preview completes it. Changed retry text is rejected instead of overwriting.

Source changes invalidate a review. Saves/merge conflicts must finish before
preparing or approving a handoff. Account changes unmount private review state.
`verification/handoff-test.cjs` checks approval gates, Sunday/Monday, refresh,
completion, repeated carry-forward, mobile width and optional live handoff save
using a disposable test account. Google Calendar authorization and daily AI
planning were subsequently confirmed working by the user in Preview.

## Embedded section and Handoff conversations

Each guided section now has a real CDVRS AI chat with cloud-saved messages and
streamed replies. Existing `ask` fields seed the input and still autosave drafts.
A selected date and section map to a stable owner-scoped conversation ID, so
opening another section/day cannot mix histories. Opening/reloading a section
loads its latest 40 messages without running a model. The server reads fresh
owner-filtered weekly records and relevant dated/category cloud tasks on send;
client-supplied record snapshots and owner IDs are ignored. It includes section
notes/checklists with completion state, energy, intention, objective, carried
items and commitments. Other sections' detailed notes/checklists are excluded.
An exact weekly version check rejects sends racing a cloud edit.

07 Handoff has an editable exact-context review and consent checkbox before
chatting in the Planner. Only that approved context is used for Handoff chat;
it is also saved with the user message. Changes to the source context invalidate
the review. The existing optional external handoff workflow remains available.

The chat endpoint reuses the existing provider router, streaming protocol and
conversation/message tables, with no schema change or normal-chat route change.
There are no Planner write tools: advice cannot silently create tasks, move time
blocks or approve changes. Messages save before generation and completed replies
save before the UI reports cloud confirmation. Duplicate request IDs return the
saved reply or a pending warning without another model call. Failed generation
keeps the question and records a failure marker when possible. Reload after an
interrupted reply before resending. Generation context is bounded to the latest
12 turns / 16,000 history characters plus the current authorised section, without
additional embedding, memory-extraction or agent orchestration calls.

`verification/section-chat-test.cjs` uses a disposable account and two live model
calls to check real section grounding, cloud draft/reply persistence, history
isolation, Handoff approval, reviewed context and mobile width.

## Final acceptance fixes

The UI shares the GYM/CDVRS AI charcoal-and-blue visual language, compact brand
header, clearer metric cards and mobile touch targets while retaining both themes
and every existing OS workflow. Nature chat now offers **Generate AI reflection**;
a reply can be edited and reviewed before separate approval saves it to Nature's
reflection notes. Existing reflection notes remain unchanged until approval, and
a changed destination field stops a stale replacement.

Weekly **OS Notes** now go to owner-scoped section context and daily planning.
Handoff packets include OS Notes in the exact text reviewed before sending.
AI context is bounded to the first 4,000 note characters; all notes remain saved,
and the UI warns when notes exceed that context bound. Links are not fetched.

The carried-forward box now renders approved incoming items with source dates.
Previous-day summaries are offered as carry-forward notes. A current-day review
can bring missing previous-day items into today without navigating back, including
across week boundaries. Previous context is visible for review, but becomes part
of today's AI context only after approval. Existing destination notes are retained.

Production remains separate from Preview: configure Planner's Production
Supabase/public Google settings and an authenticated Production AI connection,
register its final origin with Google, merge only after owner sign-off and test
the deployed Production flow. The Preview service-access token is deployment
scoped and temporary; it is not a Production credential.

## Production service identity

Production Planner calls CDVRS AI with a fresh Vercel OIDC token on each request.
The approved Trusted Sources entry grants Planner Production → AI Production and
Planner Preview → AI Preview only; default self-access is preserved. Production
never uses the temporary Preview share secret. The official server-only helper
is pinned to @vercel/oidc 3.5.0; the shipped dependency audit reports no production
vulnerabilities. The Google web client also authorises the Production Planner
origin while retaining its Preview origin and read-only Calendar scope.
