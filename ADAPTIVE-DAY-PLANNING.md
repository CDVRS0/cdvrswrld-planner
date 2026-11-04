# Adaptive day planning

The Planner home now starts with **My day has changed**. Describe a shift, late
start, travel or reduced energy and optionally set planning hours. CEED asks for
clarification when timing or location requirements are ambiguous. Weekly OS
items are considered only when opted in (up to 80 candidates per request).

One existing medium-complexity routing call returns a proposed full day:
available hours, work/travel intervals, up to three priorities, timed sessions,
breaks, and every unselected candidate with a reason. Task descriptions, chosen
priorities, due dates, Nature state, incoming context and weekly OS notes inform
planning. No new model/provider, schema or background loop is introduced.

The proposal is read-only. Times can be edited; approval is required to replace
flexible blocks. Calendar events, typed commitments and explicitly locked blocks
are fixed. Shared validation rejects overlaps, invalid or overnight sessions,
past sessions today, invented/omitted/duplicated tasks, and widened availability.
A changed task/schedule/request invalidates the review. Existing cloud version
checks and field-conflict handling remain in force.

Approval updates a single daily plan inside the existing cloud weekly snapshot.
It saves the timeline, circumstances and decisions together; task dates,
completion state, Weekly OS items, calendars and OS prompts are not rewritten.
"Left unscheduled" means no session allocated today, not task deletion or a
promise to move it to a new date. Home labels those actions accordingly. Undo
restores the preceding schedule and priority selection through the same cloud
sync. Check the existing Saved to cloud indicator before leaving.

This implements user-triggered adaptive **day** planning. Automatic monitoring,
recurring shift templates, full-week optimisation, task date transfers, routine
learning, cross-app activity inference and calendar writes remain future scope.

Verification: shared constraint tests, authenticated route tests, existing
Planner regression tests; isolated browser approval/reload/mobile/undo test and
Preview live AI/cloud smoke test. Unrelated repository-wide lint issues and
FFmpeg-dependent test prerequisites should be reported separately.
