# Microsoft Store package

Glint is listed in the Microsoft Store as **Glint Video Player** (Store ID
`9NM597MGMVJD`). The Store gets an MSIX package, built by
[`.github/workflows/store-msix.yml`](../../.github/workflows/store-msix.yml);
Tauri itself only makes NSIS and MSI installers.

- `AppxManifest.xml`: the package manifest. Its identity must match Partner
  Center's **Product identity** page exactly. The workflow fills in
  `{{VERSION}}` (`tauri.conf.json` version plus `.0`).
- `Assets/`: the logos, drawn from `src-tauri/icons/source` by
  `scripts/store-assets.py`.

## How the Store build differs

The Store installs updates itself, so the Store build has no updater:

- **Rust:** built with `--no-default-features`, which drops the `self-update`
  feature: no `tauri-plugin-updater`, no `check_update`/`install_update`
  commands. `build.rs` refuses `GLINT_STORE=1` with the updater still in.
- **Frontend:** built with `GLINT_STORE=1` (`src/distribution.ts`): no startup
  check, no **Help → Check for updates…**, no update card. The What's new card
  after an update and the star prompt work as usual.

The regular GitHub build is unchanged.

## Build it

Push to a `store/**` branch, or run the workflow by hand once it is on the
default branch. Download the `glint-store-msix` artifact and upload the
`.msix` in Partner Center. It is unsigned on purpose: the Store signs it.

Locally on Windows (Windows SDK installed):

```sh
bash scripts/fetch-ffmpeg.sh
GLINT_STORE=1 npx tauri build --no-bundle -- --no-default-features
```

then follow the workflow's staging, MakePri and MakeAppx steps.
