# Publishing isokit (Obsidian plugin)

How to release a new version and verify it landed correctly in the Obsidian community directory. This is the single source of truth for the release process — for humans and AI assistants alike. If anything here disagrees with reality, reality wins: fix this doc in the same change (see "Keeping this doc current" at the bottom). Sibling reference: `obsidian-boardwalk/docs/publishing.md` documents the same process for Boardwalk and may have fresher directory-mechanics notes.

## How a release works

Releases are fully automated from a tag push. The `Release` GitHub Action (`.github/workflows/release.yml`) runs the full test suite, builds the plugin bundle, attests build provenance, and creates a **draft** release with `obsidian/main.js`, `manifest.json` (repo root — the directory validator requires it there), and `obsidian/styles.css` attached. A human then publishes the draft in the browser. The Obsidian directory distributes whatever published release's tag exactly matches the version in `manifest.json`.

## Release steps

1. Bump the version in `manifest.json` (repo root), `versions.json` (repo root; new entry mapping version → `minAppVersion`), and `package.json`. All three must agree BEFORE tagging.
2. Draft release notes: everything since the previous tag (`git log <prev-tag>..HEAD --oneline`), user-facing changes first. Note whether rendered output changed (which goldens regenerated, why) — for a renderer whose promise is deliberate, byte-stable output, that belongs in every release.
3. Commit and push **first**, then tag and push the tag:

   ```bash
   git push origin main
   git tag 0.1.1
   git push origin 0.1.1
   ```

   The tag is the bare version — `0.1.1`, **never** `v0.1.1` (the directory matches tag to manifest version character-for-character). Order matters: the Action runs from the tagged commit's tree, so the workflow file and every release change must already be in the commit you tag. Tagged the wrong commit? See Troubleshooting.
4. Wait for the `Release` workflow to succeed (`gh run list`). It creates a draft release.
5. In the browser, open the draft on the GitHub releases page, paste in the release notes, and **Publish release**. Never use "Draft a new release" by hand — that creates an assetless release the directory can't distribute.
6. Run the post-publish verification below.

## Verification checklist

Run every one of these — don't assume any step went right.

Before tagging:

1. `manifest.json`, `versions.json`, and `package.json` versions match exactly; `versions.json` has the new entry.
2. No `v` prefix on the planned tag.
3. Release notes drafted.
4. Tests pass and the build is clean locally (`npm run typecheck && npm test && npm run build:obsidian`).

After publishing:

1. Workflow succeeded for the tag: `gh run list --repo zeiosmb/isokit`. If it ran more than once for the same tag (e.g. the tag was deleted and re-pushed), duplicate drafts may exist — check the releases page in the browser and delete extras.
2. A **published, non-draft** release exists whose `tag_name` equals the manifest version exactly: `gh api repos/zeiosmb/isokit/releases --jq '.[] | {tag_name, draft}'`. A tag with no published release is exactly the directory dashboard's "No release matches your manifest version" error.
3. The release carries all three assets: `main.js`, `manifest.json`, `styles.css`.
4. The `manifest.json` asset **attached to the release** has the same version as the tag — download and diff it; a stale build can attach an old manifest even when the tag is right.
5. Assets verify against their provenance attestation: `gh attestation verify main.js --repo zeiosmb/isokit` (and `styles.css`).
6. Release notes are on the published release, not stranded in a deleted duplicate draft.
7. The developer dashboard (below) shows no errors, and in a real vault, Settings → Community plugins → "Check for updates" offers the new version.

## Directory mechanics (as of 2026-09)

- Submission and per-plugin management live at community.obsidian.md (listing: `/plugins/isokit`, developer dashboard: `/account/plugins/isokit` once accepted). The old `obsidianmd/obsidian-releases` PR flow is dead (PRs disabled there); docs describing it are outdated.
- The submission validator requires `manifest.json` at the **repository root** (this is why it moved out of `obsidian/` on 2026-09-01), and a published release whose tag matches the manifest version.
- **First-time submission needs human review; updates do not.** Once accepted, a new matching release propagates to users typically within the hour; users' installs pull assets directly from the GitHub release.
- The official per-version review scan runs automatically when a new version propagates and can take up to 24 hours. It updates the listing's public rating/health but gates nothing about distribution. The dashboard's **"Review branch"** runs a preview scan against any ref (bare ref name like `0.1.1`, not a URL) without affecting the public rating — use one right after publishing.
- The website's search index and the **app's** plugin browser are separate: the app still reads `community-plugins.json` in `obsidianmd/obsidian-releases`, mirrored hourly. Check the app feed directly: `curl -s https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json | grep -c isokit`. The app also caches the list — restart Obsidian or reopen the Community plugins browser after the feed updates.
- Directory `short_desc` limit is 200 characters (the manifest's own description limit is 250).
- Scan findings fixed in 0.1.1, kept for context: no `innerHTML` anywhere (SVG arrives via `DOMParser` + `appendChild`, error blocks via Obsidian's `createEl` — enforced by a `tests/obsidian.ts` assertion on the bundle); controls built with `createDiv`/`createEl` instead of `document.createElement`; `src/isokit.ts`'s `Kw` kwargs type is a typed interface instead of `Record<string, any>` (cleared ~250 `no-unsafe-*` warnings); unused `BEND` const and `person` import removed.
- Known accepted warnings — defend if questioned, don't "fix": `node:` imports and console output in `src/cli.ts` and `src/io.ts` are the Node CLI shell, **not part of the plugin bundle** — `tests/obsidian.ts` asserts the built `main.js` contains no `node:` requires, and the scanner only flags them because it lints the whole repo. The `NodeJS.ErrnoException` assertion in `src/io.ts` is required under `tsc` (`spawnSync`'s `error` is typed plain `Error`); the scanner's lint environment resolves the types differently.

## Troubleshooting

- **Tagged the wrong commit** (e.g. tagged before committing/pushing the release changes): delete the tag remotely and locally, re-tag the right commit, push again —

  ```bash
  git push --delete origin 0.1.1   # remove the remote tag
  git tag -d 0.1.1                 # remove the local tag
  git tag 0.1.1                    # re-tag (current HEAD, or name a commit)
  git push origin 0.1.1
  ```

  If the first tag already triggered the workflow, delete its draft release on the GitHub releases page before re-pushing — otherwise you'll have duplicate drafts (see post-publish check 1).
- **"Could not find or validate a manifest (manifest.json) in the repository"** on submission: `manifest.json` isn't at the repo root of the default branch on GitHub — push it there and resubmit.
- **"No release matches your manifest version"** on the dashboard: the release for the manifest's version is missing, still a draft, or tagged with a `v` prefix. Publish the draft (or fix the tag) and re-check.
- **Release exists but users don't get the update**: check the release isn't a draft/prerelease and has all three assets; then allow up to an hour for propagation.
- **Visible on the website but not in the app's plugin browser**: the app's catalog is the hourly-mirrored `community-plugins.json` (see Directory mechanics). Wait for the next mirror run, then restart Obsidian to bust the app's cached list. If it's still missing after several runs, check the dashboard for an incomplete or failed version scan — distribution waits on it.
- **Scan failures**: run a preview scan on the fix branch before tagging the next version, so the fix is confirmed before it ships.

## Keeping this doc current

Obsidian's plugin platform is actively changing (the submission system was replaced wholesale in ~2026). Whoever touches the release process — human or AI — should:

- Re-verify this doc against the current official docs whenever a release behaves unexpectedly or the dashboard UI looks different: https://docs.obsidian.md (Plugins → Releasing) and the dashboard itself are authoritative; this doc is a snapshot.
- Watch scan findings on each release — new review requirements (API deprecations, new lint rules) show up there first. Record newly-required fixes in "Directory mechanics" with the version that addressed them.
- Update the "(as of YYYY-MM)" marker on the Directory mechanics heading whenever that section is re-verified or changed, so staleness is visible at a glance.
- Keep this doc public-safe: process and commands only. Account-specific or credential details don't belong here.
