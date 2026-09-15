# The Claude Code cloud environment

[Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) runs a session in
a fresh, throwaway Linux container that clones this repository at session start. The container's
base image is not this project's toolchain, so a session that starts cold cannot build, test or
regenerate the packs. This page defines the environment the add-ons are developed in: what the
repository provisions for itself, and the few settings that have to be chosen in the web UI when
the environment is created.

Nothing here changes a local checkout. On your own machine you install the toolchain once, the way
[README.md](../README.md) describes; the setup below only runs in the cloud.

## What the base image gives you, and what this project needs

| | Base image | This project | Provisioned by |
|---|---|---|---|
| Node.js | 20, 21, 22 (22 on `PATH`) | **24** (`.nvmrc`, `engines` in `package.json`) | the hook, through `nvm` |
| npm packages | none | `package-lock.json` | the hook, `npm install` |
| Python | 3.11 (3.12 and 3.13 on disk, not selected) | **3.12** (`tools/codegen/pets/pyproject.toml` pins `>=3.12,<3.13`) | the hook, `uv python install` |
| Pillow, numpy | none | pinned in `tools/codegen/pets/uv.lock` | the hook, `uv sync --frozen` |
| uv | preinstalled | any recent version | already there |
| git, curl | preinstalled | | already there |

Two of those are hard failures rather than warnings, which is why the environment is provisioned
rather than left to chance:

- Node 22 is older than the `>=24` in `package.json`, so `npm install`, the build and the tests all
  run on a version the project does not support.
- The Pets compiler refuses to run outside Python 3.12, and its PNG references are hash-locked to
  Pillow 11.0.0, so `npm run codegen` fails on the image's 3.11 and would produce different bytes
  on a different Pillow.

## The SessionStart hook

`.claude/settings.json` registers `.claude/hooks/session-start.sh`, which Claude Code runs at the
start of every cloud session. The script:

1. Exits immediately unless `CLAUDE_CODE_REMOTE=true`, so local sessions are untouched.
2. Reads the major version from `.nvmrc`, installs it with `nvm`, and puts its `bin` directory in
   front of the image's Node. The new `PATH` is written to `$CLAUDE_ENV_FILE` so it survives for
   the whole session, not just the hook.
3. Runs `npm install` (not `npm ci`: the container snapshots `node_modules` after the hook
   finishes, so later sessions reuse it).
4. Reads `.python-version`, installs that Python with `uv`, and runs
   `uv sync --frozen --project tools/codegen/pets` for the pinned Pillow and numpy.
5. Prints the versions it settled on.

Every step is idempotent and the whole thing takes a few seconds once the container is warm, so it
is safe on `resume`, `clear` and `compact` as well as `startup`.

The hook is **synchronous**: the session does not start until it finishes. That trades a slower
cold start for the guarantee that `npm test` works the first time it is run, rather than racing a
background install. To switch it, make the first line of output
`echo '{"async": true, "asyncTimeout": 300000}'`.

When the hook is done a session can run everything CI runs:

```bash
npm run check      # tsc --noEmit and biome
npm test           # vitest: core, every feature, and a real build of the packs
npm run build
npm run package
npm run codegen    # the Pets/Rbow compiler and its 244 Python tests
```

## Settings to choose in the web UI

Environments are configured when they are created, outside this repository. For this project:

- **Repository** — `spoon16/ellee67-mcaddons`.
- **Network access** — the hook downloads at session start, so the environment cannot be set to
  no-network. The hosts it needs are:

  | Host | Needed for |
  |---|---|
  | `nodejs.org` | the Node 24 tarball and its checksums (`nvm install`) |
  | `registry.npmjs.org` | `npm install` |
  | `github.com`, `objects.githubusercontent.com` | the standalone CPython build `uv python install` fetches |
  | `pypi.org`, `files.pythonhosted.org` | the Pillow and numpy wheels `uv sync` fetches |

  If the environment uses a "trusted hosts only" policy rather than open egress, those four rows
  are the allowlist. `github.com` is already reachable for the clone itself.
- **Environment variables** — none. The project needs no API keys, tokens or registry credentials;
  everything it installs is public.
- **Setup script** — leave empty. The hook in this repository is the setup script, so it stays
  version-controlled and reviewed with the rest of the code instead of living in the UI.

## Checking it yourself

Run the hook the way a cloud session does:

```bash
CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR="$PWD" ./.claude/hooks/session-start.sh
```

On a local machine, drop `CLAUDE_CODE_REMOTE` and the script exits without touching anything.

## When something goes wrong

- **`npm install` reports an unsupported engine, or the build behaves oddly.** The Node 24 step did
  not take. Check `node --version`; if it is 22, `nvm` was missing from `/opt/nvm` and the hook
  logged a warning instead of failing. Run `. /opt/nvm/nvm.sh && nvm install 24` by hand.
- **`npm run codegen` cannot find Python 3.12.** `uv python install` was blocked. Confirm
  `github.com` and `objects.githubusercontent.com` are reachable from the environment.
- **`npm run codegen` runs but changes committed files.** That is a real code difference, not an
  environment problem, and it is what the `codegen-check` job in CI is there to catch. See
  [docs/CODEGEN.md](CODEGEN.md).
- **The container runs out of disk.** Writable space is a fixed per-session allowance. Delete
  `dist/` and `.codegen-work/` before assuming the container is broken.

Changes to the hook only reach future sessions once they are merged into `main`.
