# ControlPlane-ZD-theme

Zendesk theme source for the External help centre, built from the upstream Copenhagen theme plus per-centre overrides. The structure supports several help centres sharing a common base, should another be added.

## Structure

- `copenhagen_theme` — a submodule reference to the upstream
- `shared` — changes that are applied to all help centre themes
- `external` — changes that are only applied external

Additional help centres are added as a sibling folder of `external`, then listed in `releases` in `scripts/build.mjs`.

### Modifications

`shared` and each centre folder can modify the base theme in the following ways:

- `build.include` — specifies the files to copy or ignore from the base theme
- `additions/` — matches the same paths as the base theme, any content will be attached to the end of the matching file
  - `additions/translations/*.json` are handled in a special way for convenience, any items will be attached to the original theme translation JSON file. `original` -> `shared` -> `<folder>`. You can not currently replace existing keys in the original, only add new ones. You can overwrite keys added in `shared` inside `<folder>` but there will be a warning
- `replacements/` — matches the same paths as the base theme, any content will fully replace the matching file
- `*.patch.json` — a simple method to adjust JSON in place based on [RFC 6902 JSON Patches](https://jsonpatch.com/)
  - mostly focused on adjusting `manifest.json`
  - to build these out:
    - copy the `.json` file you're targeting
      - you may need to template out `copenhagen_theme/<target>.json` with `shared/<target>.patch.json` before making your adjustments
        - `./scripts/apply-json-patch.mjs copenhagen_theme/<target>.json <folder>/<target>.patch.json > <modified_target>.json`
        - or copy out of the `<folder>/build` dir but if the `<folder>` is a centre, it could also be affected by `shared`, the modifications should be centre specific.
    - make your adjustments
    - run `./scripts/gen-json-patch.mjs copenhagen_theme/<target>.json <modified_target>.json > <folder>/<target>.patch.json`
    - make sure you clean up `<modified_target>.json` and don't commit it
- `*.patch` — standard unified diff/git diff style patches to make more targeted adjustments to source code
  - applied with `git apply`, so they behave exactly as they do on the command line. Generate them with `git diff` / `git format-patch`, or `diff -u --label a/<path> --label b/<path>`
  - paths are relative to the theme root and need the `a/` `b/` prefixes `git diff` emits
  - hunks must carry context lines, and a hunk starting at line 1 is pinned to the top of the file — if upstream changes the first line, regenerate the patch
  - a chunk whose target file isn't in the build is skipped, so a `shared` patch can touch a file a centre leaves out of its `build.include`; anything else that fails to apply fails the build
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
      - `external/3001-some-external-centre-change.patch`

## Building

Ensure you have the submodules by running `git submodule update --init --recursive`

Run `./scripts/build.mjs` after making modifications according to the [guidance above](#modifications), ready for `zcli themes:preview` / `zcli themes:import`.

Build output lands in `<centre>/build` — currently just `external/build` — which is not committed.

The build tooling has its own tests: `cd scripts && npm install && npm test`.

## Updating the base Copenhagen Theme

Change into the `copenhagen_theme` submodule directory, fetch changes from remote, then switch to the new tag.

## License

Apache License 2.0 — see [LICENSE](/LICENSE).
