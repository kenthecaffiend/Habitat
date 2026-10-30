# Third-party notices

Habitat's MIT license applies to its original code. It does not relicense the following third-party materials. Preserve applicable upstream notices and terms when redistributing dependencies or built images.

## Background photograph

- Work: Milky Way Galaxy wallpaper, photo ID `fUnfEz3VLv4`.
- Photographer: Graham Holtshausen.
- Source: https://unsplash.com/photos/milky-way-galaxy-wallpaper-fUnfEz3VLv4
- License: Unsplash License, https://unsplash.com/license
- Local asset: `public/images/galaxy-background.webp`, resized and re-encoded for web display.

The photograph remains subject to the Unsplash License, not Habitat's MIT license. That license permits copying, modification, distribution and commercial use, subject to its restrictions, including standalone image sales without significant modification and competing image services. Attribution is appreciated. The image is not represented as public domain or as owned by Habitat.

## JavaScript dependencies

`package-lock.json` records the exact package versions and declared licenses. No `node_modules` directory or downloaded dependency binaries are included in this source export. Direct dependencies declare MIT, Apache-2.0 or ISC terms. Important transitive exceptions include:

| Component | Declared license or obligation |
| --- | --- |
| libvips binaries used by sharp | LGPL-3.0-or-later, with additional licenses for some platform bundles |
| libheif-js used for HEIC decoding | LGPL-3.0 |
| Lightning CSS build tooling | MPL-2.0 |
| caniuse-lite browser data | CC-BY-4.0 |

These components are not converted to MIT by Habitat's source license. If distributing built JavaScript bundles, processors or Docker images, review the exact bundled components and retain their license/attribution notices and any applicable source-availability obligations. Package metadata is an inventory aid, not an exhaustive compatibility determination.

## PDF and image processors

The hash-pinned Python requirements and Dockerfiles identify the processor dependencies. They include ReportLab (BSD), Pillow (MIT-CMU), charset-normalizer (MIT), pypdf (BSD) and pypdfium2/PDFium with their own upstream and bundled third-party terms. ReportLab's Bitstream Vera font has its own license. Preserve the license files supplied in those packages, wheels, fonts and images; Habitat does not grant ownership of them or relicense them.

This bounded source review does not certify every transitive native library or future binary distribution. Review those notices before distributing built images. The source-code license does not replace dependency, asset or font terms.
