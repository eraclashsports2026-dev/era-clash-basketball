# EraClash Player Reference Collector

This package automates the tedious part of creating reference packs for the EraClash player pool.
It reads the authoritative roster from the EraClash repository, searches Wikimedia Commons and
Brave Image Search, downloads candidate photos, deduplicates them, optionally compares faces to a
Wikidata/Wikimedia identity anchor, ranks image quality, selects up to eight references per person,
and creates contact sheets plus provenance manifests for human verification.

## What it does

- Reads `data/art/player-portrait-roster.json` generated from the authoritative EraClash registries.
- Verifies the expected 381 cards / 323 canonical people before collection.
- Uses Wikimedia/Wikidata first for a high-confidence identity anchor and licensed metadata.
- Uses Brave Image Search for broader coverage and period-specific queries.
- Downloads 12–30 candidates per person, subject to availability.
- Rejects corrupt, tiny, duplicate, and obvious non-photo assets.
- Uses YuNet + SFace when available to rank candidate faces against the Wikimedia anchor.
- Auto-selects up to 8 identity references and up to 3 references per represented decade.
- Generates a contact sheet and `manifest.json` for every player.
- Generates `coverage.csv`, `needs-review.csv`, and a local review index.

## Important limitation

No automated image search can guarantee six to eight correct, high-quality photographs for every
historical player. The collector marks low-coverage and low-confidence people for review instead of
quietly substituting the wrong person. Brave-discovered images are tagged
`REFERENCE_ONLY_LICENSE_UNVERIFIED`; Wikimedia metadata is preserved separately.

## Installation

From the EraClash repository root:

```bash
mkdir -p scripts/reference-collector
cp /path/to/this-package/* scripts/reference-collector/
cp scripts/reference-collector/export-player-portrait-roster.mjs scripts/

python3 -m venv .venv-reference-collector
source .venv-reference-collector/bin/activate
pip install -r scripts/reference-collector/requirements.txt
```

Create a Brave Search API key and set it only in your shell:

```bash
export BRAVE_SEARCH_API_KEY='YOUR_KEY_HERE'
export WIKIMEDIA_USER_AGENT='EraClashReferenceCollector/1.0 (contact: your-email@example.com)'
```

Do not paste API keys into Claude, ChatGPT, Git, screenshots, or reports.

## Export the authoritative roster

```bash
node scripts/export-player-portrait-roster.mjs
```

This must report 381 cards and 323 canonical people.

## Pilot run

Start with one player:

```bash
python scripts/reference-collector/collect_player_references.py collect \
  --repo . \
  --person michael-jordan \
  --target 8 \
  --candidate-limit 30
```

Or a 20-player pilot:

```bash
python scripts/reference-collector/collect_player_references.py collect \
  --repo . \
  --pilot \
  --target 8 \
  --candidate-limit 30 \
  --workers 6
```

## Full collection

```bash
python scripts/reference-collector/collect_player_references.py collect \
  --repo . \
  --target 8 \
  --candidate-limit 30 \
  --workers 8 \
  --resume
```

Expected Brave query count is roughly one identity query per person plus one period query per card
decade (about 700 searches for the current roster), normally below 1,000.

## Output

```text
portrait-sources/
├── collection-manifest.json
├── coverage.csv
├── needs-review.csv
├── review/
│   └── index.html
└── <personId>/
    ├── anchor/
    │   └── wikimedia-anchor.jpg
    ├── candidates/
    │   ├── candidate-001.jpg
    │   └── ...
    ├── identity/
    │   ├── auto-01.jpg
    │   └── ... auto-08.jpg
    ├── era/
    │   └── <decade>/
    │       ├── auto-01.jpg
    │       └── ...
    ├── contact-sheet.jpg
    └── manifest.json
```

## Review

Open:

```text
portrait-sources/review/index.html
```

The auto-selected images are candidates, not final approvals. Verify the person's identity, age,
hair, facial hair, and era before sending the references to FLUX.2.

## Resume and repair

The collector is resumable. Re-running with `--resume` skips completed people. To rebuild one player:

```bash
python scripts/reference-collector/collect_player_references.py collect \
  --repo . \
  --person michael-jordan \
  --force
```

## Source policy

- Wikimedia Commons files preserve creator, license, license URL, and source-page metadata when available.
- Brave results preserve the original image URL and source-page URL but are marked license-unverified.
- The package never commits raw references automatically.
- Add `portrait-sources/` to `.gitignore`, or use external storage / Git LFS intentionally.
