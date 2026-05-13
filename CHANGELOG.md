# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog][],
and this project adheres to [Semantic Versioning][].

<!--
## Unreleased

### Added
### Changed
### Removed
-->

## [0.2.0][] - 2026-05-13

### Added

* Smart sort mode ranks tag keys by frequency then by average rendered width.
* `goStructTags.alignColumnThreshold` setting (default `0.5`).

### Changed

* `goStructTags.sortMode` now `smart` by default.

### Fixed

* Syntax highlighting: `=` characters inside plain tag values
  were incorrectly highlighted as option separators.

[0.2.0]: https://github.com/WoozyMasta/go-struct-tags-manager/compare/0.1.0...0.2.0

## [0.1.0][] - 2026-05-12

### Added

* First public release

[0.1.0]: https://github.com/WoozyMasta/go-struct-tags-manager/tree/0.1.0

<!--links-->
[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[Semantic Versioning]: https://semver.org/spec/2.0.0.html
