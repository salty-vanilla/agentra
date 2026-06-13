# Vendored: SDPM Skill (Layer 1)

- **Upstream:** https://github.com/aws-samples/sample-spec-driven-presentation-maker
- **License:** MIT-0 (MIT No Attribution) — Copyright Amazon.com, Inc. or its affiliates (see `LICENSE`).
- **Pinned commit:** `de5b13fadf9ed0f527e211a2117d886a0984d5b1`
- **Skill version:** `0.3.8` (`sdpm/__init__.py`)
- **Vendored subset:** `sdpm/` (engine), `scripts/pptx_builder.py` (CLI entry), `templates/` (blank-dark/light), `pyproject.toml`, `LICENSE`.
- **Excluded:** `references/` (LLM design guides, optional), `assets/` (downloaded icons), and everything outside `skill/` (Remote MCP, Web UI, CDK).

## Why pinned copy (not submodule/subtree)

The runtime Docker build copies `packages/presentation-author/vendor/` wholesale,
so a plain pinned copy needs no submodule init and keeps the build simple. See
`docs/spikes/sdpm-skill-engine-spike.md` (#444) for the comparison.

## How it is used

The `sdpm-skill` Presentation Author Engine (#442 / #448) invokes
`scripts/pptx_builder.py generate <workspace> -o <pptx>` via subprocess. The
runtime points `SDPM_SKILL_DIR` at this directory. Python dependencies
(`python-pptx`, `lxml`, `Pillow`, `qrcode`, `pygments`, `defusedxml`) are
installed from `packages/presentation-author/python/requirements.txt`.

## Updating

Run `scripts/vendor/sync-sdpm-skill.sh` (re-clones upstream, rsyncs the subset,
rewrites the pinned commit here). Review the diff before committing.
