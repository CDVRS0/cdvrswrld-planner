# CEED interface refresh

Display names: CEED, CEED PLANNER, CEED GYM. Repository names, hosting projects,
authentication, cloud tables and existing storage keys remain unchanged.

The shared interface uses warm glass surfaces, a soft lavender/peach glow,
quiet mono wordmarks and a conversational layout. The arrow logo is removed.
Contrast is defined separately for light and dark mode; backdrop blur is limited
to navigation/composer surfaces. Reduced-motion preferences are respected.

Auto · London is the default. Pinned SunCalc 2.1.1 calculates sunrise/sunset
locally for London (51.5074, -0.1278) using the London calendar date. Absolute
instants handle British Summer Time and seasonal variation. Timers re-check at
boundaries and after focus/visibility changes. No GPS, external location service,
model call or recurring server work is used. Light/Dark override Auto until Auto
is selected again. Appearance preference is stored per browser/app; business,
Planner and training records continue using existing cloud sync.

This work is on an isolated feature branch and is presented in Preview first.

The follow-up layout pass moves connection and calendar controls into one expandable area with an always-visible cloud status, removes duplicate mobile navigation, simplifies the weekday strip, and places the CEED planning composer above the task and schedule panels. Daily OS navigation and approval flows remain available.

The shared lavender character launcher opens the selected day's existing cloud-saved Handoff conversation. Context review and approval gates remain in place. The launcher can be dragged, moved with Shift+Arrow keys, reset with Home and closed with Escape. The panel stays mounted when closed so replies can finish saving. Voice is not activated in this phase.
