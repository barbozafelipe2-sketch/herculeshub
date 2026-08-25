# Hercules Hub

Operational dashboard for Hercules Hub.

## Live architecture

- `index.html` — interactive GitHub Pages dashboard shell.
- `data/state.js` — current synced Hercules state from the approved LIVE feeder.
- `data/history/index.json` — list of archived dashboard dates used by day navigation.
- `data/history/YYYY-MM-DD.json` — immutable daily snapshots.
- `.github/workflows/reconstruct-dashboard.yml` — validation workflow. It no longer reconstructs the old static dashboard.
- `.source_parts/` — legacy reconstruction source retained only for historical reference; it is not the live dashboard source.

## Daily sync

The scheduled Hercules workflow reads the approved LIVE Google Doc at 10:00 AM America/New_York, updates current state/history only when new information exists, preserves task/post/insight continuity, and keeps sensitive client data minimized on the public surface.

## Task completion behavior

The live page lets Felipe check tasks as done. Checkbox state is stored in browser `localStorage`, keyed by the stable task ID, so refreshes on the same browser/device preserve completion. This is not cross-device synchronization and the scheduled server-side sync cannot read browser-local state.
