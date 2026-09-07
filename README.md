# ControlPlane-ZD-theme

Zendesk theme source for the External and Internal help centres. These are two separate Zendesk Guide installs, each getting its own theme package, sharing a common base stylesheet with per-centre overrides.

## Structure

- `shared/base.css` — Copenhagen base styles common to both help centres (matches upstream Copenhagen `style.css` exactly), using Zendesk's `$variable` theme-settings syntax (resolved via each centre's `manifest.json`, not plain CSS — expect editor warnings here)
- `external/overrides.css` — External help centre specific styles, imports `shared/base.css` (source of truth for editing)
- `external/manifest.json` — theme settings/variables for the External package (copy of upstream Copenhagen manifest — divergence per centre still to do)
- `external/translations/` — label/description text for the manifest's settings panel, keyed by locale
- `external/templates/`, `external/script.js`, `external/assets/`, `external/settings/` — copied from upstream Copenhagen, unmodified so far
- `internal/overrides.css` — Internal help centre specific styles, imports `shared/base.css` (source of truth for editing)
- `internal/manifest.json` — theme settings/variables for the Internal package (copy of upstream Copenhagen manifest — divergence per centre still to do)
- `internal/translations/` — label/description text for the manifest's settings panel, keyed by locale
- `internal/templates/`, `internal/script.js`, `internal/assets/`, `internal/settings/` — copied from upstream Copenhagen, unmodified so far

Each help centre is a fully self-contained theme package — Zendesk doesn't resolve the `@import "../shared/base.css"` across separately installed themes, so `external/style.css` and `internal/style.css` are generated, gitignored build artifacts, not source of truth. Never hand-edit them.

## Building

Run `./scripts/build.sh` after editing `shared/base.css` or either centre's `overrides.css`. It concatenates `shared/base.css` + the centre's `overrides.css` into `external/style.css` and `internal/style.css`, ready for `zcli themes:preview` / `zcli themes:import`.

## License

Apache License 2.0 — see [LICENSE](LICENSE). This repo is a modified version of Zendesk's [Copenhagen theme](https://github.com/zendesk/copenhagen_theme) (Copyright Zendesk, Inc., Apache 2.0); see [NOTICE](NOTICE) for exactly what Control Plane Ltd changed versus what's unmodified upstream code.
