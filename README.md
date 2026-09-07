# ControlPlane-ZD-theme

Zendesk theme source for the External and Internal help centres. These are two separate Zendesk Guide installs, each getting its own theme package, sharing a common base stylesheet with per-centre overrides.

## Structure

- `copenhagen_theme` — a submodule reference to the upstream
- `shared` — changes that are applied to all help centre themes
- `external` — changes that are only applied external
- `internal` — changes that are only applied internal

### Modifications

`shared`, `external`, and `internal` can modify the base theme in the following ways:

- `build.include` — specifies the files to copy or ignore from the base theme
- `additions/` — matches the same paths as the base theme, any content will be attached to the end of the matching file
  - `additions/translations/*.json` are handled in a special way for convenience, any items will be attached to the original theme translation JSON file. `original` -> `shared` -> `<folder>`. You can not currently replace existing keys in the original, only add new ones. You can overwrite keys added in `shared` inside `<folder>` but there will be a warning
- `replacements/` — matches the same paths as the base theme, any content will fully replace the matching file
- `*.patch.json` — a simple method to adjust JSON in place based on [RFC 6902 JSON Patches](https://jsonpatch.com/)
  - mostly focused on adjusting `manifest.json`
  - to build these out:
    - copy the `.json` file you're targeting
      - you may need to template out `copenhagen_theme/<target>.json` with `<folder>/<target>.patch.json` for making your adjustments
        - `./scripts/apply-json-patch.json copenhagen_theme/<target>.json <folder>/<target>.patch.json > <modified_target>.json`
        - or copy out of the `<folder>/build` dir but if the `<folder>` is a centre, it could also be affected by `shared`, the modifications should be centre specific.
    - make your adjustments
    - run `./scripts/gen-json-patch.json copenhagen_theme/<target>.json <modified_target>.json > <folder>/<target>.patch.json`
    - make sure you clean up `<modified_target>.json` and don't commit it
- `*.patch` — standard unified diff/git diff style patches to make more targeted adjustments to source code
  - name in the format `NNNN-simple-explanation.patch` to help understand what the file does
    - detailed rules:
      - for numbering `shared` patches they should typically prefix `0000` incrementing up by 1
      - in the very unlikely event a patch needs to apply after a centre specific patch it should be prefixed `2000` incrementing up by 1
      - for numbering centre specific patches they should typically prefix `3000` incrementing up by 1
      - in the very unlikely event a centre specific patch needs to apply before a `shared` patch it should be prefixed `1000` incrementing up by 1
    - TL;DR
      - `shared/0001-some-shared-change.patch`
      - `shared/2001-some-shared-change-after-centres.patch` - it's not completely after but is after the `1000` range centres can use
      - `shared/1001-some-pre-centre-change.patch` - it's not completely before but is before the `3000` range `shared` can use
      - `shared/3001-some-external-centre-change.patch`
      - `shared/3001-some-internal-centre-change.patch`

## Building

Run `./scripts/build.mjs` after making modifications according to the [guidance above](#modifications), ready for `zcli themes:preview` / `zcli themes:import`.

## License

Apache License 2.0 — see [LICENSE](/LICENSE).
