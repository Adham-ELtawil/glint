# Security policy

## Supported versions

Only the [latest release](https://github.com/Adham-ELtawil/glint/releases/latest) gets security fixes. Please update before reporting.

## Reporting a vulnerability

Please **don't** open a public issue for a security problem.

Report it privately through GitHub instead: go to the [Security tab](https://github.com/Adham-ELtawil/glint/security) and choose **Report a vulnerability**, or open a [new security advisory](https://github.com/Adham-ELtawil/glint/security/advisories/new) directly.

Please include:

- What the problem is and what an attacker could do with it
- Steps or a file that reproduces it
- The Glint and Windows versions you tested

You should get a reply within 7 days. Once the problem is confirmed, a fix is released as soon as possible and you are credited in the advisory unless you'd rather not be.

## Scope

Glint is a local video player. Things that are especially relevant:

- The local media server Glint runs on `127.0.0.1` to stream files to the player
- Opening crafted video, subtitle (`.srt`, `.vtt`), or chapter files
- The installer and what it registers in Windows

Bugs in Microsoft Edge WebView2 itself should go to Microsoft.
