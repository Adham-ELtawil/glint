# Third-party notices

Glint is [MIT](LICENSE) licensed. The Windows app and installer also include the third-party software listed here, under its own licenses. The only LGPL component is FFmpeg, which Glint runs as a separate program; nothing is GPL.

This list was generated on 2026-10-25 for Glint 0.1.6 from the lockfiles, not written by hand:

```bash
# Rust crates compiled into glint.exe for Windows (no dev or build-only dependencies)
cargo license --avoid-dev-deps --avoid-build-deps --filter-platform x86_64-pc-windows-msvc

# npm packages bundled into the UI (production dependencies only)
npx license-checker-rseidelsohn --production --excludePrivatePackages
```

Run the same commands to refresh it when dependencies change. Each package's full license text is in its source repository, linked below.

## FFmpeg

Since 0.2.0 the Windows installer includes `ffmpeg.exe` and `ffprobe.exe`, an unmodified build of [FFmpeg](https://ffmpeg.org) 9.0.2 with only LGPL components enabled (no `--enable-gpl` or `--enable-nonfree`). FFmpeg is licensed under the **GNU Lesser General Public License, version 2.1 or later**. Glint starts these programs as separate processes and does not link to FFmpeg's libraries, so you can replace them with any other FFmpeg build in Glint's install folder.

- License text: [`src-tauri/licenses/FFmpeg-LGPL-2.1.txt`](src-tauri/licenses/FFmpeg-LGPL-2.1.txt), installed as `licenses\FFmpeg-LGPL-2.1.txt` next to Glint.
- Source and exact configure line: [`src-tauri/licenses/FFmpeg-BUILD.txt`](src-tauri/licenses/FFmpeg-BUILD.txt), installed beside it. The unmodified source tarball (with FFmpeg's signature), the build script, and the binaries are published together in the [`ffmpeg-9.0.2-glint1` release](https://github.com/Adham-ELtawil/glint/releases/tag/ffmpeg-9.0.2-glint1); the source is also at <https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz>.
- FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project.

## Roboto font

Glint's interface uses **Roboto** (regular, medium, and bold), bundled through [`@fontsource/roboto`](https://github.com/fontsource/font-files). Roboto is licensed under the **SIL Open Font License 1.1**, reproduced in full below as the license requires.

<details>
<summary>SIL Open Font License 1.1 (Roboto)</summary>

```text
Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic) Roboto-Italic[wdth,wght].ttf: Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

</details>

## npm packages in the UI

| Package                     | Version | License           | Source                                          |
| --------------------------- | ------- | ----------------- | ----------------------------------------------- |
| `@fontsource/roboto`        | 5.3.0   | OFL-1.1           | https://github.com/fontsource/font-files        |
| `@tauri-apps/api`           | 2.12.4  | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri             |
| `@tauri-apps/plugin-dialog` | 2.8.3   | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |

## Rust crates in the app

`glint.exe` links **284 crates**, mostly from the Tauri, Tokio, Axum, Serde, and windows-rs ecosystems. By license:

| License                             | Crates |
| ----------------------------------- | ------ |
| Apache-2.0 OR MIT                   | 171    |
| MIT                                 | 56     |
| Unicode-3.0                         | 18     |
| MIT OR Unlicense                    | 10     |
| MPL-2.0                             | 5      |
| Apache-2.0 OR MIT OR Zlib           | 4      |
| BSD-3-Clause                        | 3      |
| BSD-3-Clause AND MIT                | 2      |
| Zlib                                | 2      |
| Apache-2.0 OR ISC OR MIT            | 2      |
| ISC                                 | 2      |
| Apache-2.0                          | 2      |
| 0BSD OR Apache-2.0 OR MIT           | 1      |
| BSD-3-Clause OR MIT                 | 1      |
| Apache-2.0 AND MIT                  | 1      |
| Apache-2.0 OR CC0-1.0 OR MIT-0      | 1      |
| Apache-2.0 AND ISC                  | 1      |
| Apache-2.0 OR BSL-1.0               | 1      |
| (Apache-2.0 OR MIT) AND Unicode-3.0 | 1      |

Notes on the licenses that aren't MIT or Apache-2.0:

- **MPL-2.0** (`cssparser`, `cssparser-macros`, `selectors`, `dtoa-short`, `option-ext`): file-level copyleft. Glint uses these crates unmodified, and their source is linked below.
- **Unicode-3.0** (the ICU4X crates, e.g. `icu_normalizer`, `zerovec`): a permissive license for Unicode data and code.
- **BSD-3-Clause** (`alloc-no-stdlib`, `alloc-stdlib`, `subtle`, and with MIT `brotli`, `matchit`), **Zlib** (`foldhash`, `zlib-rs`), and **BSL-1.0** (`ryu`, as an alternative to Apache-2.0): permissive.
- **ISC** (`rustls-webpki`, `untrusted`, and as an option for `rustls` and `hyper-rustls`) and **Apache-2.0 AND ISC** (`ring`, the cryptography behind the updater's HTTPS connection): permissive.

<details>
<summary>All Rust crates</summary>

| Crate                          | Version          | License                             | Source                                                        |
| ------------------------------ | ---------------- | ----------------------------------- | ------------------------------------------------------------- |
| `adler2`                       | 2.0.1            | 0BSD OR Apache-2.0 OR MIT           | https://github.com/oyvindln/adler2                            |
| `aho-corasick`                 | 1.1.5            | MIT OR Unlicense                    | https://github.com/BurntSushi/aho-corasick                    |
| `alloc-no-stdlib`              | 3.0.0            | BSD-3-Clause                        | https://github.com/dropbox/rust-alloc-no-stdlib               |
| `alloc-stdlib`                 | 0.3.0            | BSD-3-Clause                        | https://github.com/dropbox/rust-alloc-no-stdlib               |
| `anyhow`                       | 1.0.104          | Apache-2.0 OR MIT                   | https://github.com/dtolnay/anyhow                             |
| `atomic-waker`                 | 1.1.2            | Apache-2.0 OR MIT                   | https://github.com/smol-rs/atomic-waker                       |
| `axum`                         | 0.8.9            | MIT                                 | https://github.com/tokio-rs/axum                              |
| `axum-core`                    | 0.5.6            | MIT                                 | https://github.com/tokio-rs/axum                              |
| `base64`                       | 0.21.7           | Apache-2.0 OR MIT                   | https://github.com/marshallpierce/rust-base64                 |
| `base64`                       | 0.22.1           | Apache-2.0 OR MIT                   | https://github.com/marshallpierce/rust-base64                 |
| `base64`                       | 0.23.1           | Apache-2.0 OR MIT                   | https://github.com/marshallpierce/rust-base64                 |
| `bit-set`                      | 0.8.0            | Apache-2.0 OR MIT                   | https://github.com/contain-rs/bit-set                         |
| `bit-vec`                      | 0.8.0            | Apache-2.0 OR MIT                   | https://github.com/contain-rs/bit-vec                         |
| `bitflags`                     | 1.3.2            | Apache-2.0 OR MIT                   | https://github.com/bitflags/bitflags                          |
| `bitflags`                     | 2.13.2           | Apache-2.0 OR MIT                   | https://github.com/bitflags/bitflags                          |
| `block-buffer`                 | 0.10.4           | Apache-2.0 OR MIT                   | https://github.com/RustCrypto/utils                           |
| `brotli`                       | 9.0.0            | BSD-3-Clause AND MIT                | https://github.com/dropbox/rust-brotli                        |
| `brotli-decompressor`          | 6.0.1            | BSD-3-Clause OR MIT                 | https://github.com/dropbox/rust-brotli-decompressor           |
| `bs58`                         | 0.5.1            | Apache-2.0 OR MIT                   | https://github.com/Nullus157/bs58-rs                          |
| `byteorder`                    | 1.5.0            | MIT OR Unlicense                    | https://github.com/BurntSushi/byteorder                       |
| `bytes`                        | 1.12.1           | MIT                                 | https://github.com/tokio-rs/bytes                             |
| `camino`                       | 1.2.6            | Apache-2.0 OR MIT                   | https://github.com/camino-rs/camino                           |
| `cargo-platform`               | 0.1.9            | Apache-2.0 OR MIT                   | https://github.com/rust-lang/cargo                            |
| `cargo_metadata`               | 0.19.2           | MIT                                 | https://github.com/oli-obk/cargo_metadata                     |
| `cfb`                          | 0.14.0           | MIT                                 | https://github.com/mdsteele/rust-cfb                          |
| `cfg-if`                       | 1.0.5            | Apache-2.0 OR MIT                   | https://github.com/rust-lang/cfg-if                           |
| `chrono`                       | 0.4.45           | Apache-2.0 OR MIT                   | https://github.com/chronotope/chrono                          |
| `cookie`                       | 0.18.2           | Apache-2.0 OR MIT                   | https://github.com/SergioBenitez/cookie-rs                    |
| `cpufeatures`                  | 0.2.17           | Apache-2.0 OR MIT                   | https://github.com/RustCrypto/utils                           |
| `crc32fast`                    | 1.5.3            | Apache-2.0 OR MIT                   | https://github.com/srijs/rust-crc32fast                       |
| `crossbeam-channel`            | 0.5.17           | Apache-2.0 OR MIT                   | https://github.com/crossbeam-rs/crossbeam                     |
| `crossbeam-utils`              | 0.8.23           | Apache-2.0 OR MIT                   | https://github.com/crossbeam-rs/crossbeam                     |
| `crypto-common`                | 0.1.7            | Apache-2.0 OR MIT                   | https://github.com/RustCrypto/traits                          |
| `cssparser`                    | 0.37.0           | MPL-2.0                             | https://github.com/servo/rust-cssparser                       |
| `cssparser-macros`             | 0.7.1            | MPL-2.0                             | https://github.com/servo/rust-cssparser                       |
| `ctor`                         | 1.0.13           | Apache-2.0 OR MIT                   | https://github.com/mmastrac/linktime                          |
| `darling`                      | 0.24.1           | MIT                                 | https://github.com/TedDriggs/darling                          |
| `darling_core`                 | 0.24.1           | MIT                                 | https://github.com/TedDriggs/darling                          |
| `darling_macro`                | 0.24.1           | MIT                                 | https://github.com/TedDriggs/darling                          |
| `defmt`                        | 1.2.0            | Apache-2.0 OR MIT                   | https://github.com/knurling-rs/defmt                          |
| `defmt-macros`                 | 1.2.0            | Apache-2.0 OR MIT                   | https://github.com/knurling-rs/defmt                          |
| `defmt-parser`                 | 1.1.0            | Apache-2.0 OR MIT                   | https://github.com/knurling-rs/defmt                          |
| `deranged`                     | 0.5.9            | Apache-2.0 OR MIT                   | https://github.com/jhpratt/deranged                           |
| `derive_more`                  | 2.1.1            | MIT                                 | https://github.com/JelteF/derive_more                         |
| `derive_more-impl`             | 2.1.1            | MIT                                 | https://github.com/JelteF/derive_more                         |
| `digest`                       | 0.10.7           | Apache-2.0 OR MIT                   | https://github.com/RustCrypto/traits                          |
| `dirs`                         | 7.0.0            | Apache-2.0 OR MIT                   | https://codeberg.org/dirs/dirs-rs                             |
| `dirs-sys`                     | 0.5.0            | Apache-2.0 OR MIT                   | https://github.com/dirs-dev/dirs-sys-rs                       |
| `displaydoc`                   | 0.2.7            | Apache-2.0 OR MIT                   | https://github.com/yaahc/displaydoc                           |
| `dom_query`                    | 0.28.0           | MIT                                 | https://github.com/niklak/dom_query                           |
| `dpi`                          | 0.1.2            | Apache-2.0 AND MIT                  | https://github.com/rust-windowing/winit                       |
| `dtoa`                         | 1.0.11           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/dtoa                               |
| `dtoa-short`                   | 0.3.5            | MPL-2.0                             | https://github.com/upsuper/dtoa-short                         |
| `dunce`                        | 1.0.5            | Apache-2.0 OR CC0-1.0 OR MIT-0      | https://gitlab.com/kornelski/dunce                            |
| `dyn-clone`                    | 1.0.20           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/dyn-clone                          |
| `equivalent`                   | 1.0.3            | Apache-2.0 OR MIT                   | https://github.com/indexmap-rs/equivalent                     |
| `erased-serde`                 | 0.4.10           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/erased-serde                       |
| `fastrand`                     | 2.5.0            | Apache-2.0 OR MIT                   | https://github.com/smol-rs/fastrand                           |
| `fdeflate`                     | 0.3.7            | Apache-2.0 OR MIT                   | https://github.com/image-rs/fdeflate                          |
| `flate2`                       | 1.1.10           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/flate2-rs                        |
| `fnv`                          | 1.0.7            | Apache-2.0 OR MIT                   | https://github.com/servo/rust-fnv                             |
| `foldhash`                     | 0.2.0            | Zlib                                | https://github.com/orlp/foldhash                              |
| `form_urlencoded`              | 1.2.2            | Apache-2.0 OR MIT                   | https://github.com/servo/rust-url                             |
| `futures-channel`              | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `futures-core`                 | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `futures-io`                   | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `futures-macro`                | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `futures-sink`                 | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `futures-task`                 | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `futures-util`                 | 0.3.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/futures-rs                       |
| `generic-array`                | 0.14.7           | MIT                                 | https://github.com/fizyk20/generic-array.git                  |
| `getrandom`                    | 0.2.17           | Apache-2.0 OR MIT                   | https://github.com/rust-random/getrandom                      |
| `getrandom`                    | 0.3.4            | Apache-2.0 OR MIT                   | https://github.com/rust-random/getrandom                      |
| `getrandom`                    | 0.4.3            | Apache-2.0 OR MIT                   | https://github.com/rust-random/getrandom                      |
| `glob`                         | 0.3.4            | Apache-2.0 OR MIT                   | https://github.com/rust-lang/glob                             |
| `hashbrown`                    | 0.12.3           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/hashbrown                        |
| `hashbrown`                    | 0.17.1           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/hashbrown                        |
| `heck`                         | 0.5.0            | Apache-2.0 OR MIT                   | https://github.com/withoutboats/heck                          |
| `hex`                          | 0.4.3            | Apache-2.0 OR MIT                   | https://github.com/KokaKiwi/rust-hex                          |
| `html5ever`                    | 0.39.0           | Apache-2.0 OR MIT                   | https://github.com/servo/html5ever                            |
| `http`                         | 1.5.0            | Apache-2.0 OR MIT                   | https://github.com/hyperium/http                              |
| `http-body`                    | 1.1.0            | MIT                                 | https://github.com/hyperium/http-body                         |
| `http-body-util`               | 0.1.5            | MIT                                 | https://github.com/hyperium/http-body                         |
| `httparse`                     | 1.10.1           | Apache-2.0 OR MIT                   | https://github.com/seanmonstar/httparse                       |
| `httpdate`                     | 1.0.3            | Apache-2.0 OR MIT                   | https://github.com/pyfisch/httpdate                           |
| `hyper`                        | 1.12.0           | MIT                                 | https://github.com/hyperium/hyper                             |
| `hyper-rustls`                 | 0.27.10          | Apache-2.0 OR ISC OR MIT            | https://github.com/rustls/hyper-rustls                        |
| `hyper-util`                   | 0.1.21           | MIT                                 | https://github.com/hyperium/hyper-util                        |
| `ico`                          | 0.6.0            | MIT                                 | https://github.com/mdsteele/rust-ico                          |
| `icu_collections`              | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `icu_locale_core`              | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `icu_normalizer`               | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `icu_normalizer_data`          | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `icu_properties`               | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `icu_properties_data`          | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `icu_provider`                 | 2.4.0            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `ident_case`                   | 1.0.1            | Apache-2.0 OR MIT                   | https://github.com/TedDriggs/ident_case                       |
| `idna`                         | 1.1.0            | Apache-2.0 OR MIT                   | https://github.com/servo/rust-url/                            |
| `idna_adapter`                 | 1.2.2            | Apache-2.0 OR MIT                   | https://github.com/hsivonen/idna_adapter                      |
| `indexmap`                     | 1.9.3            | Apache-2.0 OR MIT                   | https://github.com/bluss/indexmap                             |
| `indexmap`                     | 2.14.2           | Apache-2.0 OR MIT                   | https://github.com/indexmap-rs/indexmap                       |
| `infer`                        | 0.22.0           | MIT                                 | https://github.com/bojand/infer                               |
| `ipnet`                        | 2.12.2           | Apache-2.0 OR MIT                   | https://github.com/krisprice/ipnet                            |
| `itoa`                         | 1.0.18           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/itoa                               |
| `jiff`                         | 0.2.38           | MIT OR Unlicense                    | https://github.com/BurntSushi/jiff                            |
| `jiff-core`                    | 0.1.1            | MIT OR Unlicense                    | https://github.com/BurntSushi/jiff                            |
| `jiff-tzdb`                    | 0.1.9            | MIT OR Unlicense                    | https://github.com/BurntSushi/jiff                            |
| `jiff-tzdb-platform`           | 0.1.3            | MIT OR Unlicense                    | https://github.com/BurntSushi/jiff                            |
| `json-patch`                   | 4.2.0            | Apache-2.0 OR MIT                   | https://github.com/idubrov/json-patch                         |
| `jsonptr`                      | 0.7.1            | Apache-2.0 OR MIT                   | https://github.com/chanced/jsonptr                            |
| `keyboard-types`               | 0.8.3            | Apache-2.0 OR MIT                   | https://github.com/rust-windowing/keyboard-types              |
| `libc`                         | 0.2.191          | Apache-2.0 OR MIT                   | https://github.com/rust-lang/libc                             |
| `litemap`                      | 0.8.3            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `lock_api`                     | 0.4.14           | Apache-2.0 OR MIT                   | https://github.com/Amanieu/parking_lot                        |
| `log`                          | 0.4.34           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/log                              |
| `markup5ever`                  | 0.39.0           | Apache-2.0 OR MIT                   | https://github.com/servo/html5ever                            |
| `matchit`                      | 0.8.4            | BSD-3-Clause AND MIT                | https://github.com/ibraheemdev/matchit                        |
| `memchr`                       | 2.8.3            | MIT OR Unlicense                    | https://github.com/BurntSushi/memchr                          |
| `mime`                         | 0.3.17           | Apache-2.0 OR MIT                   | https://github.com/hyperium/mime                              |
| `minisign-verify`              | 0.3.0            | MIT                                 | https://github.com/jedisct1/rust-minisign-verify              |
| `miniz_oxide`                  | 0.8.9            | Apache-2.0 OR MIT OR Zlib           | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide |
| `miniz_oxide`                  | 0.9.1            | Apache-2.0 OR MIT OR Zlib           | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide |
| `mio`                          | 1.2.4            | MIT                                 | https://github.com/tokio-rs/mio                               |
| `muda`                         | 0.20.0           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/muda                            |
| `new_debug_unreachable`        | 1.0.6            | MIT                                 | https://github.com/mbrubeck/rust-debug-unreachable            |
| `num-conv`                     | 0.2.2            | Apache-2.0 OR MIT                   | https://github.com/jhpratt/num-conv                           |
| `num-traits`                   | 0.2.19           | Apache-2.0 OR MIT                   | https://github.com/rust-num/num-traits                        |
| `once_cell`                    | 1.21.4           | Apache-2.0 OR MIT                   | https://github.com/matklad/once_cell                          |
| `option-ext`                   | 0.2.0            | MPL-2.0                             | https://github.com/soc/option-ext.git                         |
| `parking_lot`                  | 0.12.5           | Apache-2.0 OR MIT                   | https://github.com/Amanieu/parking_lot                        |
| `parking_lot_core`             | 0.9.12           | Apache-2.0 OR MIT                   | https://github.com/Amanieu/parking_lot                        |
| `percent-encoding`             | 2.3.2            | Apache-2.0 OR MIT                   | https://github.com/servo/rust-url/                            |
| `phf`                          | 0.13.1           | MIT                                 | https://github.com/rust-phf/rust-phf                          |
| `phf_generator`                | 0.13.1           | MIT                                 | https://github.com/rust-phf/rust-phf                          |
| `phf_macros`                   | 0.13.1           | MIT                                 | https://github.com/rust-phf/rust-phf                          |
| `phf_shared`                   | 0.13.1           | MIT                                 | https://github.com/rust-phf/rust-phf                          |
| `pin-project-lite`             | 0.2.17           | Apache-2.0 OR MIT                   | https://github.com/taiki-e/pin-project-lite                   |
| `plist`                        | 1.10.3           | MIT                                 | https://github.com/ebarnard/rust-plist/                       |
| `png`                          | 0.18.1           | Apache-2.0 OR MIT                   | https://github.com/image-rs/image-png                         |
| `potential_utf`                | 0.1.6            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `powerfmt`                     | 0.2.1            | Apache-2.0 OR MIT                   | https://github.com/jhpratt/powerfmt                           |
| `precomputed-hash`             | 0.1.1            | MIT                                 | https://github.com/emilio/precomputed-hash                    |
| `proc-macro2`                  | 1.0.107          | Apache-2.0 OR MIT                   | https://github.com/dtolnay/proc-macro2                        |
| `quick-xml`                    | 0.42.0           | MIT                                 | https://github.com/tafia/quick-xml                            |
| `quote`                        | 1.0.47           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/quote                              |
| `raw-window-handle`            | 0.6.2            | Apache-2.0 OR MIT OR Zlib           | https://github.com/rust-windowing/raw-window-handle           |
| `ref-cast`                     | 1.0.27           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/ref-cast                           |
| `ref-cast-impl`                | 1.0.27           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/ref-cast                           |
| `regex`                        | 1.13.1           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/regex                            |
| `regex-automata`               | 0.4.18           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/regex                            |
| `regex-syntax`                 | 0.8.11           | Apache-2.0 OR MIT                   | https://github.com/rust-lang/regex                            |
| `reqwest`                      | 0.13.5           | Apache-2.0 OR MIT                   | https://github.com/seanmonstar/reqwest                        |
| `rfd`                          | 0.16.1           | MIT                                 | https://github.com/PolyMeilex/rfd                             |
| `ring`                         | 0.17.14          | Apache-2.0 AND ISC                  | https://github.com/briansmith/ring                            |
| `rustc-hash`                   | 2.1.3            | Apache-2.0 OR MIT                   | https://github.com/rust-lang/rustc-hash                       |
| `rustls`                       | 0.23.46          | Apache-2.0 OR ISC OR MIT            | https://github.com/rustls/rustls                              |
| `rustls-pki-types`             | 1.15.1           | Apache-2.0 OR MIT                   | https://github.com/rustls/pki-types                           |
| `rustls-platform-verifier`     | 0.7.1            | Apache-2.0 OR MIT                   | https://github.com/rustls/rustls-platform-verifier            |
| `rustls-webpki`                | 0.103.16         | ISC                                 | https://github.com/rustls/webpki                              |
| `ryu`                          | 1.0.23           | Apache-2.0 OR BSL-1.0               | https://github.com/dtolnay/ryu                                |
| `same-file`                    | 1.0.6            | MIT OR Unlicense                    | https://github.com/BurntSushi/same-file                       |
| `schemars`                     | 0.8.22           | MIT                                 | https://github.com/GREsau/schemars                            |
| `schemars`                     | 0.9.0            | MIT                                 | https://github.com/GREsau/schemars                            |
| `schemars`                     | 1.2.3            | MIT                                 | https://github.com/GREsau/schemars                            |
| `schemars_derive`              | 0.8.22           | MIT                                 | https://github.com/GREsau/schemars                            |
| `scopeguard`                   | 1.2.0            | Apache-2.0 OR MIT                   | https://github.com/bluss/scopeguard                           |
| `selectors`                    | 0.38.0           | MPL-2.0                             | https://github.com/servo/stylo                                |
| `semver`                       | 1.0.28           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/semver                             |
| `serde`                        | 1.0.229          | Apache-2.0 OR MIT                   | https://github.com/serde-rs/serde                             |
| `serde-untagged`               | 0.1.9            | Apache-2.0 OR MIT                   | https://github.com/dtolnay/serde-untagged                     |
| `serde_core`                   | 1.0.229          | Apache-2.0 OR MIT                   | https://github.com/serde-rs/serde                             |
| `serde_derive`                 | 1.0.229          | Apache-2.0 OR MIT                   | https://github.com/serde-rs/serde                             |
| `serde_derive_internals`       | 0.29.1           | Apache-2.0 OR MIT                   | https://github.com/serde-rs/serde                             |
| `serde_json`                   | 1.0.154          | Apache-2.0 OR MIT                   | https://github.com/serde-rs/json                              |
| `serde_path_to_error`          | 0.1.20           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/path-to-error                      |
| `serde_repr`                   | 0.1.21           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/serde-repr                         |
| `serde_spanned`                | 1.1.2            | Apache-2.0 OR MIT                   | https://github.com/toml-rs/toml                               |
| `serde_urlencoded`             | 0.7.1            | Apache-2.0 OR MIT                   | https://github.com/nox/serde_urlencoded                       |
| `serde_with`                   | 3.24.0           | Apache-2.0 OR MIT                   | https://github.com/jonasbb/serde_with/                        |
| `serde_with_macros`            | 3.24.0           | Apache-2.0 OR MIT                   | https://github.com/jonasbb/serde_with/                        |
| `serialize-to-javascript`      | 0.1.2            | Apache-2.0 OR MIT                   | https://github.com/chippers/serialize-to-javascript           |
| `serialize-to-javascript-impl` | 0.1.2            | Apache-2.0 OR MIT                   | https://github.com/chippers/serialize-to-javascript           |
| `servo_arc`                    | 0.4.3            | Apache-2.0 OR MIT                   | https://github.com/servo/stylo                                |
| `sha2`                         | 0.10.9           | Apache-2.0 OR MIT                   | https://github.com/RustCrypto/hashes                          |
| `simd-adler32`                 | 0.3.10           | MIT                                 | https://github.com/mcountryman/simd-adler32                   |
| `siphasher`                    | 1.0.4            | Apache-2.0 OR MIT                   | https://github.com/jedisct1/rust-siphash                      |
| `slab`                         | 0.4.12           | MIT                                 | https://github.com/tokio-rs/slab                              |
| `smallvec`                     | 1.16.4           | Apache-2.0 OR MIT                   | https://github.com/servo/rust-smallvec                        |
| `socket2`                      | 0.6.5            | Apache-2.0 OR MIT                   | https://github.com/rust-lang/socket2                          |
| `softbuffer`                   | 0.4.8            | Apache-2.0 OR MIT                   | https://github.com/rust-windowing/softbuffer                  |
| `stable_deref_trait`           | 1.2.1            | Apache-2.0 OR MIT                   | https://github.com/storyyeller/stable_deref_trait             |
| `string_cache`                 | 0.9.0            | Apache-2.0 OR MIT                   | https://github.com/servo/string-cache                         |
| `strsim`                       | 0.11.1           | MIT                                 | https://github.com/rapidfuzz/strsim-rs                        |
| `subtle`                       | 2.6.1            | BSD-3-Clause                        | https://github.com/dalek-cryptography/subtle                  |
| `syn`                          | 2.0.119          | Apache-2.0 OR MIT                   | https://github.com/dtolnay/syn                                |
| `syn`                          | 3.0.9            | Apache-2.0 OR MIT                   | https://github.com/dtolnay/syn                                |
| `sync_wrapper`                 | 1.0.2            | Apache-2.0                          | https://github.com/Actyx/sync_wrapper                         |
| `synstructure`                 | 0.14.0           | MIT                                 | https://github.com/mystor/synstructure                        |
| `tao`                          | 0.37.2           | Apache-2.0                          | https://github.com/tauri-apps/tao                             |
| `tauri`                        | 2.12.5           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri                           |
| `tauri-codegen`                | 2.7.4            | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri                           |
| `tauri-macros`                 | 2.7.4            | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri                           |
| `tauri-plugin-dialog`          | 2.8.3            | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/plugins-workspace               |
| `tauri-plugin-fs`              | 2.7.1            | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/plugins-workspace               |
| `tauri-plugin-single-instance` | 2.5.4            | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/plugins-workspace               |
| `tauri-plugin-updater`         | 2.14.0           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/plugins-workspace               |
| `tauri-runtime`                | 2.12.2           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri                           |
| `tauri-runtime-wry`            | 2.12.3           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri                           |
| `tauri-utils`                  | 2.10.2           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri                           |
| `tempfile`                     | 3.27.0           | Apache-2.0 OR MIT                   | https://github.com/Stebalien/tempfile                         |
| `tendril`                      | 0.5.1            | Apache-2.0 OR MIT                   | https://github.com/servo/html5ever                            |
| `thiserror`                    | 2.0.21           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/thiserror                          |
| `thiserror-impl`               | 2.0.21           | Apache-2.0 OR MIT                   | https://github.com/dtolnay/thiserror                          |
| `time`                         | 0.3.55           | Apache-2.0 OR MIT                   | https://github.com/time-rs/time                               |
| `time-core`                    | 0.1.9            | Apache-2.0 OR MIT                   | https://github.com/time-rs/time                               |
| `time-macros`                  | 0.2.32           | Apache-2.0 OR MIT                   | https://github.com/time-rs/time                               |
| `tinystr`                      | 0.8.5            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `tinyvec`                      | 1.13.3           | Apache-2.0 OR MIT OR Zlib           | https://github.com/Lokathor/tinyvec                           |
| `tokio`                        | 1.54.1           | MIT                                 | https://github.com/tokio-rs/tokio                             |
| `tokio-macros`                 | 2.7.2            | MIT                                 | https://github.com/tokio-rs/tokio                             |
| `tokio-rustls`                 | 0.26.6           | Apache-2.0 OR MIT                   | https://github.com/rustls/tokio-rustls                        |
| `tokio-util`                   | 0.7.20           | MIT                                 | https://github.com/tokio-rs/tokio                             |
| `toml`                         | 1.1.8+spec-1.1.0 | Apache-2.0 OR MIT                   | https://github.com/toml-rs/toml                               |
| `toml_datetime`                | 1.1.2+spec-1.1.0 | Apache-2.0 OR MIT                   | https://github.com/toml-rs/toml                               |
| `toml_parser`                  | 1.1.5+spec-1.1.0 | Apache-2.0 OR MIT                   | https://github.com/toml-rs/toml                               |
| `toml_writer`                  | 1.1.3+spec-1.1.0 | Apache-2.0 OR MIT                   | https://github.com/toml-rs/toml                               |
| `tower`                        | 0.5.3            | MIT                                 | https://github.com/tower-rs/tower                             |
| `tower-http`                   | 0.6.11           | MIT                                 | https://github.com/tower-rs/tower-http                        |
| `tower-layer`                  | 0.3.3            | MIT                                 | https://github.com/tower-rs/tower                             |
| `tower-service`                | 0.3.3            | MIT                                 | https://github.com/tower-rs/tower                             |
| `tracing`                      | 0.1.44           | MIT                                 | https://github.com/tokio-rs/tracing                           |
| `tracing-attributes`           | 0.1.31           | MIT                                 | https://github.com/tokio-rs/tracing                           |
| `tracing-core`                 | 0.1.36           | MIT                                 | https://github.com/tokio-rs/tracing                           |
| `tray-icon`                    | 0.25.1           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tray-icon                       |
| `try-lock`                     | 0.2.5            | MIT                                 | https://github.com/seanmonstar/try-lock                       |
| `typeid`                       | 1.0.3            | Apache-2.0 OR MIT                   | https://github.com/dtolnay/typeid                             |
| `typenum`                      | 1.20.1           | Apache-2.0 OR MIT                   | https://github.com/paholg/typenum                             |
| `unicode-ident`                | 1.0.27           | (Apache-2.0 OR MIT) AND Unicode-3.0 | https://github.com/dtolnay/unicode-ident                      |
| `unicode-segmentation`         | 1.13.3           | Apache-2.0 OR MIT                   | https://github.com/unicode-rs/unicode-segmentation            |
| `untrusted`                    | 0.9.0            | ISC                                 | https://github.com/briansmith/untrusted                       |
| `url`                          | 2.5.8            | Apache-2.0 OR MIT                   | https://github.com/servo/rust-url                             |
| `urlpattern`                   | 0.6.0            | MIT                                 | https://github.com/denoland/rust-urlpattern                   |
| `utf8_iter`                    | 1.0.4            | Apache-2.0 OR MIT                   | https://github.com/hsivonen/utf8_iter                         |
| `uuid`                         | 1.29.0           | Apache-2.0 OR MIT                   | https://github.com/uuid-rs/uuid                               |
| `walkdir`                      | 2.5.0            | MIT OR Unlicense                    | https://github.com/BurntSushi/walkdir                         |
| `want`                         | 0.3.2            | MIT                                 | https://github.com/seanmonstar/want                           |
| `web-time`                     | 1.1.0            | Apache-2.0 OR MIT                   | https://github.com/daxpedda/web-time                          |
| `web_atoms`                    | 0.2.6            | Apache-2.0 OR MIT                   | https://github.com/servo/html5ever                            |
| `webview2-com`                 | 0.39.1           | MIT                                 | https://github.com/wravery/webview2-rs                        |
| `webview2-com-macros`          | 0.8.1            | MIT                                 | https://github.com/wravery/webview2-rs                        |
| `webview2-com-sys`             | 0.39.1           | MIT                                 | https://github.com/wravery/webview2-rs                        |
| `winapi-util`                  | 0.1.11           | MIT OR Unlicense                    | https://github.com/BurntSushi/winapi-util                     |
| `window-vibrancy`              | 0.8.1            | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/tauri-plugin-vibrancy           |
| `windows`                      | 0.62.2           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-collections`          | 0.3.2            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-core`                 | 0.62.2           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-future`               | 0.3.2            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-implement`            | 0.60.2           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-interface`            | 0.59.3           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-link`                 | 0.2.1            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-numerics`             | 0.3.1            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-registry`             | 0.6.1            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-result`               | 0.4.1            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-strings`              | 0.5.1            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-sys`                  | 0.60.2           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-sys`                  | 0.61.2           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-targets`              | 0.53.5           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-threading`            | 0.2.1            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows-version`              | 0.1.7            | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `windows_x86_64_msvc`          | 0.53.1           | Apache-2.0 OR MIT                   | https://github.com/microsoft/windows-rs                       |
| `winnow`                       | 1.0.4            | MIT                                 | https://github.com/winnow-rs/winnow                           |
| `writeable`                    | 0.6.4            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `wry`                          | 0.57.1           | Apache-2.0 OR MIT                   | https://github.com/tauri-apps/wry                             |
| `yoke`                         | 0.8.4            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `yoke-derive`                  | 0.8.4            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `zerofrom`                     | 0.1.8            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `zerofrom-derive`              | 0.1.8            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `zeroize`                      | 1.9.1            | Apache-2.0 OR MIT                   | https://github.com/RustCrypto/utils                           |
| `zerotrie`                     | 0.2.5            | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `zerovec`                      | 0.11.9           | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `zerovec-derive`               | 0.11.7           | Unicode-3.0                         | https://github.com/unicode-org/icu4x                          |
| `zip`                          | 4.6.1            | MIT                                 | https://github.com/zip-rs/zip2.git                            |
| `zlib-rs`                      | 0.6.8            | Zlib                                | https://github.com/trifectatechfoundation/zlib-rs             |
| `zmij`                         | 1.0.23           | MIT                                 | https://github.com/dtolnay/zmij                               |

</details>

## Installer and runtime

- The installer is built with [NSIS](https://nsis.sourceforge.io), which is licensed under the [zlib/libpng license](https://nsis.sourceforge.io/License). Its output is not subject to NSIS's license.
- Glint draws its window with [Microsoft Edge WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). WebView2 is not included in the installer. If it's missing, the installer downloads Microsoft's bootstrapper, which installs the runtime under Microsoft's own terms.
- MP4 and WebM are decoded by WebView2 and Windows. Other formats are read and, where needed, converted by the bundled FFmpeg (above); its H.264 encoding uses Windows' own Media Foundation encoder.

## Glint's own assets

The Glint icon and logo (`src-tauri/icons/`), the sample clip in `public/sample/`, and the images in `docs/` are part of Glint and covered by its MIT license. The movie footage shown in `docs/home.png`, `docs/glint-promo.gif`, and `docs/social-preview.png` is from the Blender open movies _Tears of Steel_ ([mango.blender.org](https://mango.blender.org)) and _Sintel_ ([durian.blender.org](https://durian.blender.org)), © Blender Foundation, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), and _Spring_ ([studio.blender.org/films/spring](https://studio.blender.org/films/spring/)), © Blender Foundation, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
