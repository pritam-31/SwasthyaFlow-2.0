# Bias evaluation (P2-13)

Deterministic, synthetic, offline evaluation of the eight triage-assistant layers.
Everything here is reproducible: the same seed always yields the same bytes, so the
committed dataset carries a stable checksum.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run eval:generate` | Regenerate the dataset JSONL files and `manifest.json`. |
| `npm run eval:run` | Run the full evaluation and print the report summary. |
| `npm run eval:leak` | Run the anonymiser leak test over the built-in corpus. |

Generation is **CLI-only** — the server never regenerates the dataset on boot.
Run `eval:generate` after changing the generator and commit the updated files.

## Layout

```
data/bias-eval/
  triage-en.jsonl  300 records  (triage-engine, multilingual-rules samples)
  triage-hi.jsonl  300 records
  triage-or.jsonl  300 records
  reports.jsonl    180 records  (report-parser)
  visuals.jsonl    180 records  (visual-feature-service)
  timelines.jsonl  180 records  (timeline-extractor)
  followups.jsonl  180 records  (follow-up-generator)
  anonymiser.jsonl 180 records  (anonymiser, with text + expected redactions)
  priority.jsonl   180 records  (priority-scoring)
  manifest.json                versions, seed, per-file sha256, slice counts
```

The directory is resolved from the backend process working directory, overridable
with `BIAS_DATASET_DIR` (read on every access, so tests can redirect it).

## Slices

Every record carries all five population attributes:

| Dimension | Values |
| --- | --- |
| `language` | `en`, `hi`, `or` |
| `ageBand` | `0-17`, `18-39`, `40-59`, `60+`, `Unknown` |
| `sexMarker` | `Female`, `Male`, `Other`, `Not stated` |
| `facilityType` | government-hospital, phc, health-camp, company-clinic, industrial-health-unit, campus-health-centre, other |
| `inputModality` | text, voice-transcript, report, visual, mixed |

Each layer is *reported* on its assigned dimension (`slices.ts` → `LAYER_DIMENSION`),
but the fairness pass pools every dimension so a disparity can surface even on a
dimension a layer does not primarily target.

## Metrics and flags

- Per (layer × slice): precision, recall, F1 from synthetic confusion counts.
- A zero denominator yields `0` (thin evidence — read the sample count, not the 0).
- Fairness row per dimension × metric = **max − min** of the metric across that
  dimension's slices.
- Flag thresholds: **green `< 0.05`**, **amber `0.05 – 0.10`**, **red `≥ 0.10`**.

A flag means *"review before relying on this layer for that group"* — never *"the
layer is broken"*. Reports are immutable once written; the run ledger records every
attempt including failures.

## Determinism

- Seed: `DATASET_SEED = 20261010` (mulberry32).
- `EVAL_VERSION`, `GENERATOR_VERSION`, `DATASET_VERSION` are all `1.0.0`.
- Disparities in the data are **deliberate** so the evaluator has something to find
  (e.g. weaker Odia triage detection, `sexMarker=Other` on priority scoring). Do not
  "fix" the data without updating the tests.
