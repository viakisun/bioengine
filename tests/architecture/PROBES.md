# Architecture probes — keep / archive policy

`tests/architecture/` mixes two kinds of `.spec.ts` files:

1. **Invariant specs** — contracts the codebase must respect (coordinate
   suffixes, mesh-anchor contracts, namespace whitelist, no direct
   `console.*` in production, …).  These run in every CI invocation and
   their failure blocks the PR.

2. **Probes** (`_probe-*.spec.ts`) — diagnostic harnesses written during a
   specific bug hunt or feature ramp.  Each probe is a one-off tool: it
   boots the app, drives a specific code path, dumps screenshots /
   measurements, and asserts almost nothing.

This file is the policy for probes only.

## Lifecycle

Every probe starts its life in `tests/architecture/_probe-<topic>.spec.ts`.
While it's pinned to an active investigation, it stays at the root and
runs alongside the invariant specs.

Once the investigation closes, you have three choices:

| Outcome | Action |
|---|---|
| The probe documents a still-relevant invariant of the system today (e.g. "the stream pipeline must hand at least 1 binary frame to a consumer") | Keep at the root |
| The probe was a one-off measurement that already informed a code change; the change is permanent and re-running the probe adds no signal | Move to `_archive/` |
| The probe targets code that no longer exists | Move to `_archive/` |

`_archive/` files are excluded from default runs via
`playwright.config.ts` (`testIgnore: ['**/_archive/**']`).  They stay on
disk because the historical context (what we measured, how we measured)
sometimes resurfaces in a follow-up bug hunt.

## How to run an archived probe

There's no flag — explicitly point Playwright at the file:

```bash
npx playwright test tests/architecture/_archive/_probe-screenshot-hsv.spec.ts
```

## What "kept" probes do (today)

| Probe | What it pins down |
|---|---|
| `_probe-stream-pipeline.spec.ts` | WS relay → producer/consumer roundtrip; binary frame reaches a consumer |
| `_probe-detect-flow.spec.ts` | survey → detect runs; per-frame log shape |
| `_probe-gimbal-tracking.spec.ts` | gimbal cam follows the rail traverse |
| `_probe-phenotyping.spec.ts` | crash + console scraper for phenotyping survey boot |
| `_probe-boot-*` (3 files) | boot stage progression + perf measurements |
| `_probe-render-cost.spec.ts`, `_probe-quality-tiers.spec.ts` | render quality preset behaviour |
| `_probe-leaf-*`, `_probe-stem-curve.spec.ts`, `_probe-plant-*`, `_probe-seed-42.spec.ts` | plant geometry regression fixtures |
| `_probe-mode-*`, `_probe-entry-screen.spec.ts`, `_probe-loading-screen.spec.ts`, `_probe-perfhud.spec.ts`, `_probe-selector-click.spec.ts`, `_probe-final-flow.spec.ts` | UI mode shell + entry / loading flow |

## What got archived in the Wave 1 refactor

| Probe | Why archived |
|---|---|
| `_probe-scenario-20.spec.ts` | bug-specific from a past scenario fix |
| `_probe-load-fail.spec.ts` | bug-specific |
| `_probe-screenshot-at-x.spec.ts` | superseded by `_probe-rail-x-capture.spec.ts` → eventually `_probe-stream-pipeline.spec.ts` |
| `_probe-screenshot-hsv.spec.ts` | superseded by `_probe-stream-pipeline.spec.ts` |
| `_probe-screenshot.spec.ts` | redundant; predates the gimbal pipeline |
| `_probe-hsv-detection.spec.ts` | HSV is fallback-only after ONNX + 3D filters landed |
| `_probe-hsv-tuning.spec.ts` | tuning data was applied; one-off |
| `_probe-capture-content.spec.ts` | consumed the `__capturedFrames` 60-frame dump, which Wave 1.2 gated behind `?debug=capture` |
| `_probe-viewport-sync.spec.ts` | viewport sync stabilised post-stream refactor |
| `_probe-url-compare.spec.ts` | URL-shape diff probe; the shape it pinned no longer churns |
| `_probe-rail-x-capture.spec.ts` | superseded by `_probe-stream-pipeline.spec.ts` |
