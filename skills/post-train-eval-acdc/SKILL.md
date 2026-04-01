---
name: post-train-eval-acdc
description: Automate post-training evaluation for ACDC experiments. Use when training is done and you need to pull W&B val metrics, run single-seed best/avg5 test, or do 3-seed ensemble. Triggered by phrases like "evaluate", "run test", "pull results", "do inference", "ensemble", or "post-training pipeline".
---

# Post-Training Evaluation Pipeline for ACDC

## When to Use
After any training run finishes, the user will provide one or more W&B run names (= EXP names) and ask to evaluate them. The user must explicitly specify which EXP(s) to evaluate; this skill does not auto-discover runs.

## The Pipeline Script
`scripts/post_train_eval_acdc.py` automates the entire flow:

1. Pull `val/model1_mean_dice` (best + last) from W&B
2. Run single-seed `best` test
3. Run single-seed `avg5` test
4. If 3 matched seeds are provided, run `ens3_best` and `ens3_avg5` ensemble

## Quick Reference

### Single seed (most common)
```bash
python scripts/post_train_eval_acdc.py --exp "YOUR_EXP_NAME"
```

### Multiple seeds with auto-ensemble
```bash
python scripts/post_train_eval_acdc.py \
  --exp "..._s1337_..._sdfdetach" \
  --exp "..._s2024_..._sdfdetach" \
  --exp "..._s3407_..._sdfdetach"
```

### Dry run (print commands without executing)
```bash
python scripts/post_train_eval_acdc.py --exp "YOUR_EXP" --dry-run
```

### Only pull W&B val metrics
```bash
python scripts/post_train_eval_acdc.py --exp "YOUR_EXP" --val-only
```

## How It Works

### Seed detection
The script extracts seed from `_s{SEED}_` in the EXP name. If 3 exps share the same template (differing only in seed), it auto-groups them for ensemble.

### Ensemble naming
The script strips the seed portion and inserts `ens3_best` or `ens3_avg5` to form the `ENSEMBLE_NAME`.

### GSPO selector matching
If `gspo_sample_selector_best.pth` exists in each exp dir, the script automatically passes `--gspo_sample_selector_paths` and `--strict_gspo_match`.

### What it calls internally
- `scripts/eval_single_exp_acdc.py` for single-seed best/avg5
- `scripts/ensemble_test_acdc.py` for 3-seed ensemble

Both scripts auto-detect training args from `log.txt` in the exp directory.

## Key Flags

| Flag | Effect |
|------|--------|
| `--val-only` | Only pull W&B val, skip test inference |
| `--ensemble-only` | Skip single-seed, only ensemble |
| `--skip-best` | Skip single-seed best eval |
| `--skip-avg5` | Skip single-seed avg5 eval |
| `--skip-ensemble` | Skip ensemble even if 3 seeds |
| `--dry-run` | Print commands without executing |

## How to Determine EXP from W&B

The W&B training run name IS the EXP name. The script uses this to find:
- Output directory: `$ABD_OUTPUT_DIR/model/Cross_Teaching/ACDC_{EXP}_7_labeled/`
- Training args: parsed from `log.txt` in that directory
- Checkpoints: `sam2_best_model.pth`, `model1_iter_*_dice_*.pth`, `sam2_avg_top5.pth`
- Selector: `gspo_sample_selector_best.pth`

## Typical Workflow

1. Training finishes -> user provides the W&B run name(s) (= EXP name(s))
2. Run: `python scripts/post_train_eval_acdc.py --exp "EXP_NAME"`
3. Check output for val best/last + test best/avg5
4. When all 3 seeds done, user provides all 3 EXP names, re-run with all 3 `--exp` flags
5. Compare ensemble results against baseline

## Current Baseline: GSPO-per-sample (pure, no PINN)

When the user says "compare with baseline" or "compare with current baseline", use the following reference results.

### Baseline training run names
- `r3_30k_2d_minmax_supwt_conf_c05_r100_m1strong_bs8_s1337_gsposamp_b6_gs1024_hd128_lr0003_clip01_ent0_convlora_r3_e8_C_unf4ln_lr005_moe0`
- `r3_30k_2d_minmax_supwt_conf_c05_r100_m1strong_bs8_s2024_gsposamp_b6_gs1024_hd128_lr0003_clip01_ent0_convlora_r3_e8_C_unf4ln_lr005_moe0`
- `r3_30k_2d_minmax_supwt_conf_c05_r100_m1strong_bs8_s3407_gsposamp_b6_gs1024_hd128_lr0003_clip01_ent0_convlora_r3_e8_C_unf4ln_lr005_moe0`

### Training val/model1_mean_dice

| seed | best val | last val |
|------|----------|----------|
| 1337 | (check W&B) | 0.887121 |
| 2024 | 0.890779 | 0.887270 |
| 3407 | 0.887551 | 0.881936 |

### Single-seed test results

#### SEED=2024
| mode | mean_dice | RV | MYO | LV | mean_hd95 |
|------|-----------|------|------|------|-----------|
| best | 0.890246 | 0.888941 | 0.861004 | 0.920792 | 1.591078 |
| avg5 | 0.893774 | 0.894906 | 0.862734 | 0.923682 | 2.959561 |

#### SEED=3407
| mode | mean_dice | RV | MYO | LV | mean_hd95 |
|------|-----------|------|------|------|-----------|
| best | 0.893251 | 0.897048 | 0.862022 | 0.920683 | 1.244424 |
| avg5 | 0.893068 | 0.894662 | 0.860587 | 0.923956 | 2.451322 |

#### SEED=1337
| mode | mean_dice | RV | MYO | LV | mean_hd95 |
|------|-----------|------|------|------|-----------|
| best | (check W&B) | - | - | - | - |
| avg5 | (check W&B) | - | - | - | - |

### 3-seed ensemble test results

| mode | mean_dice | RV | MYO | LV | mean_hd95 |
|------|-----------|------|------|------|-----------|
| ens3_best_logits | **0.899442** | 0.903140 | 0.867421 | 0.927765 | 1.201642 |
| ens3_avg5_logits | 0.862592 | 0.847052 | 0.836143 | 0.904580 | 1.503117 |

Note: The `ens3_avg5` result appears anomalously low; the primary baseline reference for 3-seed ensemble is `ens3_best_logits = 0.899442`.

### How to compare

When comparing a new experiment against this baseline:
1. Match each metric at the same oral (seed, mode, ensemble type)
2. For single-seed: compare `best vs best`, `avg5 vs avg5`, same seed if available
3. For 3-seed ensemble: compare `ens3_best vs ens3_best`, `ens3_avg5 vs ens3_avg5`
4. Report delta for `mean_dice` and per-class (RV/MYO/LV) dice
5. Flag if improvement comes from one class at the expense of another

## Experiment Design Context Lookup

After obtaining evaluation results, you MUST proactively search for the original experiment design rationale before giving analysis. This is critical for producing useful conclusions.

### How to find experiment design context

1. Extract the "seed-stripped" EXP pattern from the run name. For example:
   - Run name: `r3_30k_2d_minmax_supwt_conf_c05_r100_m1strong_bs8_s1337_..._sdfdetach`
   - Seed-stripped: `r3_30k_2d_minmax_supwt_conf_c05_r100_m1strong_bs8_s${SEED}_..._sdfdetach`
   - Also try the method suffix alone: `sdfdetach`, `pinnlosscls1_bonly`, `unlbndrw`, etc.

2. Use Grep to search `.md` files in the workspace for the seed-stripped pattern OR the method suffix:
   - Search `docs/` and `.specstory/` directories
   - Use fuzzy matching: replace `_s1337_` / `_s2024_` / `_s3407_` with `_s` or `${SEED}` in the search pattern
   - Also search for the distinctive method suffix (e.g. `sdfdetach`, `pinnlosscls1_bonly`, `unlbndrw`, `pinnsdfLOSS0`, `gspopinnrw`)
   - Also try searching for `EXP=` followed by part of the run name

3. When a match is found, read the surrounding context (typically 50-100 lines before and after) to understand:
   - Why this experiment was designed
   - What hypothesis it was testing
   - What the expected outcome was
   - What metrics were identified as key indicators of success or failure
   - What "next step" decisions depend on this result

### What to do with the design context

After finding the experiment design rationale, your analysis MUST include:

1. **Hypothesis check**: Does the result support or contradict the original hypothesis?
2. **Per-class analysis**: If the design targeted a specific class (e.g. "help class1 without hurting class3"), check whether that actually happened.
3. **Decision guidance**: Based on the original experiment plan, what should the next step be? For example:
   - "The plan said if F-safe works, expand to multi-seed" -> did it work?
   - "The plan said if ens3 doesn't beat baseline, deprioritize this line" -> did it beat baseline?
4. **Unexpected findings**: Flag anything the result shows that was NOT anticipated in the original design.

### Example

If evaluating `..._pinnlosscls1_bonly_sdfdetach`, you should:
1. Search for `pinnlosscls1_bonly_sdfdetach` in `.md` files
2. Find the experiment design that says "AF1: class1-only boundary PINN loss + trunk decoupling, testing whether A and F synergize"
3. Check: did class1 improve? Did class3 stop degrading? Did mean dice beat baseline?
4. Conclude: "The AF1 hypothesis is [supported/not supported] because..."

## Rules from Playbook
- Inference runs in foreground (no `nohup` needed)
- `eval_single_exp_acdc.py` auto-matches training args
- For avg5 ensemble, uses `--ckpt_paths` + `--gspo_sample_selector_paths` (not `--exp_list`)
- Historical runs may lack top-k ckpts; script auto-falls back to best-only
