# Contributing

## Setup

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size
```

## Commits

Format: `type: <emoji> short description`. A hook checks it.

| Type | Emoji | Use |
|---|---|---|
| `feat` | 🚀 | New feature (minor release) |
| `fix` | 🐛 | Bug fix (patch release) |
| `refactor` | 🔄 | Restructuring without behavior change |
| `docs` | 📚 | Documentation only |
| `style` | 🎨 | Formatting and visual changes |
| `test`, `ci`, `build`, `chore` | 🧪 | Tooling and maintenance |
| `revert` | ↩️ | Reverting a previous commit |

Breaking changes: add `!` after the type (`feat!: 🚀 ...`). Only `feat`, `fix` and breaking changes trigger a release.

## Showcase

1. Copy `showcase/_template` to `showcase/your-project`.
2. Fill in the front matter of `index.md` and add a `cover.jpg`.
3. Open a pull request. CI validates the fields.
