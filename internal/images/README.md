# Internal help centre images

Reference copies of the three images uploaded to the internal help centre theme in Guide admin. They are **not part of the theme build**: nothing in `scripts/build.mjs` reads this folder, and the build output is unchanged by it. They are here so a fresh import of the theme can be set up again without hunting for the originals.

Each file was checked byte for byte against the file served by the live internal help centre (SHA-256 matches), on 2026-10-02.

| File | Where to set it in Guide admin (Customize design, on the theme) | Notes |
|---|---|---|
| `logo.svg` | Brand, Logo | An SVG is accepted by the Logo setting. |
| `favicon.png` | Brand, Favicon | |
| `homepage-hero.jpg` | Images, Homepage background image | 2400x1000. The tinted band on every inner page uses this same setting, so there is no separate image to upload for those pages. |

Uploaded settings survive a theme update, so none of this is needed for a normal `zcli themes:update`. It matters only for a fresh `zcli themes:import`, which starts with Copenhagen's stock images.
