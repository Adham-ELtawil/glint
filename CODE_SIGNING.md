# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## Status

Glint is applying to the SignPath Foundation's free open-source program. **Current releases are not Authenticode-signed.** Until a signed release is published, Microsoft Defender SmartScreen may still show "Windows protected your PC" the first time you run the installer. That warning is expected for an unsigned app; it is not a sign that the file is unsafe.

This policy is about Windows Authenticode signing of the installer. It is separate from the update signatures Glint already uses: from 0.1.6 on, in-app updates are signed with Glint's release key, and Glint refuses a download that does not match.

## What will be signed

When signing is in place, only artifacts built by the public [Release workflow](.github/workflows/release.yml) on `v*` tags will be submitted to SignPath. That workflow builds the Windows NSIS installer (`Glint_<version>_x64-setup.exe`), which contains `Glint.exe` and the bundled FFmpeg helper programs.

- Local builds, developer machines, and CI test installers are **never** submitted for signing.
- The private signing key is held by SignPath (HSM-backed). This project does not store it.
- Each signing request will be approved manually in SignPath before the signed installer is published.

The installer also contains `ffmpeg.exe` and `ffprobe.exe`, an unmodified [LGPL 2.1+](src-tauri/licenses/FFmpeg-LGPL-2.1.txt) build of [FFmpeg](https://ffmpeg.org) 9.0.2. Those are upstream binaries, included as separate programs (Glint does not link to them). SignPath's terms allow unsigned upstream open-source binaries inside a signed package. We will not re-sign the FFmpeg executables with this project's SignPath certificate. Source, the configure line, and the build script are in [FFmpeg-BUILD.txt](src-tauri/licenses/FFmpeg-BUILD.txt) and in the [`ffmpeg-9.0.2-glint2`](https://github.com/Adham-ELtawil/glint/releases/tag/ffmpeg-9.0.2-glint2) release.

## How releases are built

- Source repository: [Adham-ELtawil/glint](https://github.com/Adham-ELtawil/glint)
- Workflow: [`.github/workflows/release.yml`](.github/workflows/release.yml), triggered by an annotated `v*` tag
- The bundled FFmpeg build is downloaded in CI and checked against published SHA-256 sums (`scripts/fetch-ffmpeg.sh`)
- Published files for each version: the NSIS installer, its SHA-256, the updater signature, and `latest.json`

## Team roles

Glint is maintained by one person, [@Adham-ELtawil](https://github.com/Adham-ELtawil), who holds all three roles required by SignPath:

- **Authors** (trusted to change the repository without extra reviews): [@Adham-ELtawil](https://github.com/Adham-ELtawil)
- **Reviewers** (review changes proposed by others, such as pull requests, before merge): [@Adham-ELtawil](https://github.com/Adham-ELtawil)
- **Approvers** (approve each signing request): [@Adham-ELtawil](https://github.com/Adham-ELtawil)

Everyone with repository or SignPath access uses multi-factor authentication.

## Privacy

See the [privacy policy](PRIVACY.md).
