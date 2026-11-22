# shared-lib

Rules for `packages/shared-lib`, on top of the root [CLAUDE.md](../../CLAUDE.md). Node runs this code, so it follows the root's type-stripping rules.

- Files are imported as `shared-lib/types` and `shared-lib/utils/<name>` (no extension), mapped by `exports` in this package's `package.json`. Add new shared files under `utils/` to keep them reachable.
