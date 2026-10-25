# Planner Phase 2

Built on the unmerged Phase 1 feature branch. Production is not deployed by this work.

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
