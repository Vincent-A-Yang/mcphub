# 1Panel Deployment Notes

## Goal

Run your maintained fork instead of the upstream `samanhappy/mcphub` image so custom fixes survive redeploys and upgrades.

## Recommended approach

Use one of these deployment models.

### Option 1: Build your own image from the fork

Recommended for long-term stability.

Basic flow:

1. build an image from your fork `main` branch
2. publish it to a registry you control
3. point 1Panel to your image instead of `samanhappy/mcphub`

Example image naming:

- `ghcr.io/vincent-a-yang/mcphub:main`
- `ghcr.io/vincent-a-yang/mcphub:stable`

### Option 2: Build locally in 1Panel from source

If 1Panel supports source-based app deployment or custom compose builds, point it at your forked repository and build from branch `main`.

## Important rule

Do not keep using the upstream prebuilt image if you want these fixes to persist.

If 1Panel redeploys from the upstream image, your runtime hotfixes will be lost.

## Safe upgrade workflow

1. upstream changes land in `upstream-sync`
2. GitHub opens a PR into your `main`
3. CI runs regression tests
4. you review and merge
5. your image rebuilds from `main`
6. 1Panel upgrades to the new image

This keeps updates flowing without silently discarding custom fixes.
