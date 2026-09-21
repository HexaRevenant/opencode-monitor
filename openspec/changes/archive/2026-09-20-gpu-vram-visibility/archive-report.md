# Archive Report: GPU VRAM Visibility

## Final State

- **Change**: `gpu-vram-visibility`
- **Artifact store**: hybrid (openspec canonical files + Engram mirror)
- **Requirements**: 1 added to `documentation-verification-parity` (main spec now 4 total; 3 pre-existing preserved)
- **Tasks**: 12/12 complete, 0 pending (per persisted tasks artifact observation at archive time)
- **Implementation**: landed in commits d31bb21, 5f0cee7, 291fec3 on main (3 commits ahead of origin/main; NO push performed or authorized)
- **Tests (at close)**: `npm test` — 73 pass / 9 suites / 0 fail
- **Typecheck**: clean
- **Build**: OK with linuxbrew bun (`PATH=/home/linuxbrew/.linuxbrew/bin:$PATH`); the default `~/.local/bin/bun` is a broken shim pointing at missing `~/.bun/bin/bun` — the default build failure is NOT a regression
- **Runtime (close)**: `readMetrics()` returns live GPU/VRAM plus `gpuSource: "amd-sysfs"` on this AMD machine
- **Verification**: NOT RUN — `verify-report` was never launched (verification is optional); no stale snapshot exists to reconcile. Recorded factually; not an admission failure.
- **Apply progress**: `apply-progress` was never persisted; no stale snapshot exists.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| documentation-verification-parity | Updated (composition) | 1 ADDED requirement "GPU platform matrix is documented and parity-checked" (2 scenarios); 3 existing requirements preserved byte-for-byte via native `gentle-ai sdd-archive-compose` (exit 0, #4119). Total: 4 requirements. |
| gpu-metrics | Untouched | Main spec exists; this change carried no delta for this domain. |

## Archive Contents (all observed present, byte-verified)

- proposal.md — present
- exploration.md — present
- design.md — present
- specs/documentation-verification-parity/spec.md — present
- tasks.md — present, 12/12 complete, 0 pending
- verify-report.md — MISSING (verification never launched)

## Archive Verification

- Main spec updated correctly (composition proof: zero exit; verified requirement count 4/4).
- Change folder moved: `openspec/changes/gpu-vram-visibility/` → `openspec/changes/archive/2026-09-20-gpu-vram-visibility/` (git mv, all 5 tracked files, staged renames).
- Active changes directory no longer contains this change.
- Byte identity proven twice: in-transaction `diff -r` of the pre-move recursive snapshot vs. archived tree (empty, exit 0), and post-move `diff -r` of the git HEAD pre-move tree vs. archived tree (empty, exit 0).

### Verbatim `diff -r` output: spec sync

```text
```
(composition proof: `gentle-ai sdd-archive-compose` exit 0; NO manual Read/Edit merge was used)

### Verbatim `diff -r` output: archive move

```text
```
(empty output above is the byte-identity readback between the pre-move recursive snapshot and the archived folder; the second readback against the git HEAD pre-move tree also produced empty output, diff_exit=0)

## Engram Mirror Status

- Recorded observation IDs: none — the change's artifacts were never persisted to Engram (all prior `mem_save` attempts this session were rejected: "could not confirm Engram session registration"); file-side artifacts are authoritative.
- This archive report was mirrored to Engram once via `mem_save` (topic_key `sdd/gpu-vram-visibility/archive-report`) and the attempt FAILED with the identical environmental error ("could not confirm Engram session registration"). Per the archive contract the mirror was attempted exactly once; the Engram topic `sdd/gpu-vram-visibility/archive-report` remains OUTSTANDING.

## Archive Location

`openspec/changes/archive/2026-09-20-gpu-vram-visibility/`

## Unfinished Work / Unresolved Findings

- None observed in the implementation. All 12 tasks checked `[x]`; no verify report was produced (optional verification never launched); no apply-progress snapshot exists to reconcile.
- Unresolved environmental finding: the Engram mirror for this cycle (and every earlier SDD topic this session) is outstanding due to session-registration rejection; the openspec filesystem artifacts are complete and authoritative.
- Pre-existing repository state left untouched per scope: `src/`, `test/`, `README.md`, `opencode.json`, `.gentle-ai-default-agent.json` were NOT modified. No commit, push, or PR was performed.