# Fork Maintenance

## Branch strategy

- `main`: your stable branch with custom fixes and regression tests
- `upstream-sync`: a branch that mirrors `samanhappy/mcphub` automatically

## Why this structure exists

This fork intentionally does not auto-merge upstream directly into `main`.

That prevents upstream changes from silently overriding custom fixes. Instead:

1. GitHub Actions refreshes `upstream-sync` from upstream `main`
2. A PR is opened from `upstream-sync` into `main`
3. CI runs the fork's regression tests
4. You review and merge only when the result is correct

## Protected fixes in this fork

This fork currently protects these behavioral fixes with regression coverage:

1. `call_tool` nested arguments must preserve arbitrary keys
2. session auto-rebuild must recreate the MCP server instead of reconnecting an already-bound protocol

If upstream later ships a better implementation, you can merge it and then decide whether to remove or adapt the local patches.

## Deployment guidance

For self-hosted deployment, build and run from this fork's `main` branch rather than upstream.
