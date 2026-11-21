# Privacy policy

Glint does not collect personal data, does not have accounts, and does not include ads, analytics, or telemetry. Your videos, watch history, tags, thumbnails, and settings stay on your PC.

## Network use

The only network request Glint makes on its own is an update check. About five seconds after the app starts, and whenever you choose **Help → Check for updates…**, Glint requests this project's update manifest from GitHub Releases:

`https://github.com/Adham-ELtawil/glint/releases/latest/download/latest.json`

Glint does not send your name, your files, your history, or your settings. GitHub will see ordinary web-request metadata such as an IP address and user-agent. That request is covered by [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

If a new version is available, Glint offers it in the app. The installer is downloaded from GitHub Releases only after you choose **Update**. That download is also checked against Glint's release signing key, and a file that does not match is refused.

There is currently no setting to turn the automatic update check off.

Glint does not contact any other internet service while you watch videos. Playback uses a local server on `127.0.0.1` only. The bundled FFmpeg tools are built with networking disabled and run as local helper programs.

## During installation

Glint installs for your user account and can be uninstalled from **Settings → Apps → Installed apps**. If Microsoft Edge WebView2 is missing, the installer downloads it from Microsoft so Glint can draw its window. That component is Microsoft's software and is covered by [Microsoft's privacy statement](https://www.microsoft.com/privacy).

## What stays on your PC

- Saved positions, volume, mute, speed, watch history, and the tags you add (in Glint's WebView2 storage)
- The list of home-screen folders, in `%APPDATA%\app.glint.player\library.json`
- A thumbnail cache, in `%LOCALAPPDATA%\app.glint.player\thumbnails`

**View → Clear watch history** removes history and saved positions. It keeps your tags and does not delete your video files.

## Third-party services

- [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) — the update check, and the update download if you choose **Update**
- [Microsoft](https://www.microsoft.com/privacy) — WebView2, if the installer needs to fetch it; the WebView2 runtime is a Microsoft component

No other third-party service receives data from Glint.
