# Vendor: OpenAI Slides Skill

- **Source**: https://github.com/openai/skills/tree/codex/fax-machine-skill/skills/.curated/slides
- **Branch**: `codex/fax-machine-skill`
- **Commit**: 7b54889398822db28c72aeec8e95be7c20418d1a
- **Copied**: 2025-05-03

## Contents

- `assets/pptxgenjs_helpers/` — PptxGenJS helper library (text sizing, image layout, overlap detection, etc.)
- `scripts/` — Python scripts for rendering, montage, font detection, overflow testing
- `SKILL.md` — Original skill prompt
- `references/` — Helper API documentation
- `agents/` — Agent configuration
- `LICENSE.txt` — License

## Usage

Referenced by `@agentra/presentation-author` at runtime via:
```
vendor/openai-slides/assets/pptxgenjs_helpers/ → copied into workspace as helpers/pptxgenjs_helpers/
vendor/openai-slides/scripts/                  → copied into workspace as scripts/
```

## Update procedure

```bash
cd /tmp && rm -rf openai-skills-vendor
git clone --depth 1 --branch codex/fax-machine-skill --single-branch https://github.com/openai/skills.git openai-skills-vendor
rm -rf vendor/openai-slides
cp -R /tmp/openai-skills-vendor/skills/.curated/slides vendor/openai-slides
# Re-create this VENDOR.md with updated commit hash
```
