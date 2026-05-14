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

## [0.3.1][] - 2026-05-15

### Fixed

* Tag values containing escaped quotes (`\"`) were silently truncated at the
  first backslash — subsequent tags on the same field were lost entirely.
* Edit range could extend into a backtick inside a trailing inline comment,
  overwriting text outside the struct tag.

[0.3.1]: https://github.com/WoozyMasta/go-struct-tags-manager/compare/0.3.0...0.3.1

## [0.3.0][] - 2026-05-14

### Added

* `goStructTags.alignMaxColumnGap` setting (default `16`):
  caps the blank space produced by empty column slots between two tag values.

[0.3.0]: https://github.com/WoozyMasta/go-struct-tags-manager/compare/0.2.0...0.3.0

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
