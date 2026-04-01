---
name: experiment-monitor-eval
description: >
  监控训练实验进度，完成后自动执行测试集推理评估，更新实验进展文档。
  触发关键词：检查实验进度、监控训练、训练完了吗、做推理评估、evaluate、
  pull results、check training status、实验完成了做评估
tags: [Experiment, Monitoring, Evaluation, Inference, W&B]
version: 0.1.0
---

# Skill B：训练实验进度监控与完成推理评估

## 概述

检查当前所有正在进行的实验的训练状态。对已完成训练的实验，自动执行对应的测试集推理评估，更新实验进展文档和演进历史，并触发实验计划迭代。

## 前置条件

- `Experiment/ongoing_experiments.md` 中有正在进行的实验记录
- W&B CLI 已登录
- SSH 到各计算节点可达

## 执行步骤

### Step 1：获取当前进行中的实验列表

1. 读取 `Experiment/ongoing_experiments.md`，提取所有正在进行的实验条目（W&B run 名 × 计算节点 + 工作目录）。
2. 如果表格为空，报告"当前没有正在进行的实验"并终止。

### Step 2：逐个检查训练状态

对每个进行中的实验：

1. **查询 W&B 状态**：通过 W&B API 或 CLI 查询 run 的当前状态（running / finished / crashed / failed）。
   ```bash
   wandb api runs godspeed1024-re/OurABD --filter '{"display_name": "{RUN_NAME}"}' --fields state
   ```
   或者 SSH 到主机检查进程：
   ```bash
   ssh {HOST} "ps aux | grep '{EXP_NAME}' | grep -v grep"
   ```

2. **状态判断**：
   - **running**：训练仍在进行中。
     - 可选：从 W&B 拉取当前的 `val/model1_mean_dice` 最新值和 iteration 进度，输出简要进度报告。
     - 跳过此实验，继续检查下一个。
   - **finished**：训练已完成。
      - 从 `Experiment/ongoing_experiments.md` 中删除该条目。
      - 在`Experiment/analysis/branch_unfinished_experiments.md` 中更新该实验的状态为"已完成"。
      → 进入 Step 3。
   - **crashed / failed**：训练异常退出。
     - 从 `Experiment/ongoing_experiments.md` 中删除该条目。
     - 在`Experiment/analysis/branch_unfinished_experiments.md` 中恢复该实验的状态为"未完成"。
     - 调用 **Skill D（experiment-debug）** 处理错误。
     - 继续检查下一个实验。

### Step 3：确定需要执行的推理评估

训练完成后，确定该实验**还缺哪些评估口径**。评估口径的完整集合为：单 seed best、单 seed avg5、（若 3 seed 齐全）ens3_best、ens3_avg5。

#### 3a. 确定实验所属方向

从 W&B run 名或 `Experiment/branches.md` 推断所属分支。

#### 3b. 在 W&B 上搜索已有的 eval runs（不依赖文档）

以训练 run 名 `{RUN_NAME}` 为基准，在 W&B 项目 `godspeed1024-re/OurABD` 中搜索所有匹配的 eval runs：
- `eval_{RUN_NAME}_best`
- `eval_{RUN_NAME}_avg5`

如果该 run 属于一个 3-seed family（即同一 EXP 模板的 s1337/s2024/s3407 三个 seed），还要搜索：
- `eval_{FAMILY_NAME}_ens3_best`
- `eval_{FAMILY_NAME}_ens3_avg5`

其中 `{FAMILY_NAME}` 是去掉 seed 部分后的 EXP 名称模板（如 `topk_critic_no_entropy` 对应 `topk_critic_no_entropy_s1337/s2024/s3407`）。

**关键**：搜索范围是 W&B **全量历史**（不限于近 N 天），因为 eval 可能在训练完成后的任何时间执行过。

#### 3c. 检查 3-seed 齐全性

对于同一 family，检查 s1337、s2024、s3407 三个训练 run 是否都已 `finished`：
- 在 W&B 上查询这三个 run 的状态。
- 只有三个 seed 都 finished，才触发 ens3 评估。

#### 3d. 生成待执行评估清单

对比"完整口径集合"与"已有 eval runs"，差集即为待执行清单：

| 条件 | 待执行的评估 |
|---|---|
| `eval_{RUN}_best` 不存在 | single-seed best |
| `eval_{RUN}_avg5` 不存在 | single-seed avg5 |
| 3 seed 齐全 且 `eval_{FAMILY}_ens3_best` 不存在 | ens3_best |
| 3 seed 齐全 且 `eval_{FAMILY}_ens3_avg5` 不存在 | ens3_avg5 |

若待执行清单为空（所有口径都已评测完），则该实验无需再处理，直接从 `Experiment/ongoing_experiments.md` 删除，进入 Step 6 做分析更新。

#### 3e. 查阅方向实验计划（补充判断）

读取 `worktrees/<suffix>/docs/gspo-pinn-<suffix>/experiment-plan.md`，确认：
- 该实验是否设计为 val-only（某些探索性实验只需训练指标，不做 test 推理） → 若是，则跳过推理，仅拉 W&B val 指标。
- 是否有特殊的评估要求。

### Step 4：执行推理评估

按照 `.cursor/skills/post-train-eval-acdc/SKILL.md` 的流程，在对应计算节点上执行评估：

1. **单 seed 评估**：
   ```bash
   ssh {HOST} bash -s << 'REMOTE_EOF'
   cd {工作目录}
   /root/autodl-tmp/envs/ABD/bin/python scripts/post_train_eval_acdc.py \
     --exp "{EXP_NAME}"
   REMOTE_EOF
   ```

2. **多 seed ensemble 评估**（若适用）：
   ```bash
   ssh {HOST} bash -s << 'REMOTE_EOF'
   cd {工作目录}
   /root/autodl-tmp/envs/ABD/bin/python scripts/post_train_eval_acdc.py \
     --exp "{EXP_s1337}" \
     --exp "{EXP_s2024}" \
     --exp "{EXP_s3407}"
   REMOTE_EOF
   ```

3. **收集评估结果**：从命令输出中提取：
   - `val/model1_mean_dice`（best 和 last）
   - `test/model1_mean_dice`（best 和 avg5，含 per-class RV/MYO/LV）
   - `ens3_best` 和 `ens3_avg5`（若做了 ensemble）

4. **评估失败处理**：若推理过程出错，记录错误信息，调用 **Skill D（experiment-debug）**。

### Step 5：从"正在进行的实验"中删除

评估成功完成后，从 `Experiment/ongoing_experiments.md` 中删除该实验条目。

### Step 6：深入分析实验结果

1. **查找实验设计上下文**：按照 `post-train-eval-acdc/SKILL.md` 的"Experiment Design Context Lookup"章节，搜索该实验的原始设计意图。

2. **与基线对比**：
   - 计算与统一参考基线的 delta（train val best、test best、test avg5、ens3 best）。
   - 按 per-class 分析（RV/MYO/LV），标注是否有以牺牲某类为代价改善另一类的情况。

3. **假设验证**：
   - 该实验的原始假设是否被支持？
   - 结果是否符合预期？有无意外发现？

4. **目标检查**：判断任何一个评估指标是否达到了最终目标（mean Dice > 0.9）。
   - 若达到 → **记录并立即报告**："目标达成！{实验名} 在 {评估模式} 下达到 mean Dice = {值}"。
   - 若未达到 → 继续正常流程。

### Step 7：更新实验进展文档

1. **更新 `Experiment/analysis/branch_progress_detailed.md`**：
   - 在对应方向的表格中，更新该实验的 test best / test avg5 / ens3 best / ens3 avg5 列。
   - 计算并填入 delta 列。
   - 更新状态列（已训练 → 已评测）。

2. **更新 `Experiment/analysis/experiment-history.md`**：
   - 在总结表中添加或更新该实验的行。
   - 在演进图中确保该实验节点存在并标注了最新的 test 指标。
   - 如有新的关键发现，添加到"关键实验发现"章节。

3. **按 Version Control 规则提交**：
   - 主分支文档变更 → 在主分支提交。
   - 子方向文档变更 → 在对应 worktree 分支提交。
   - 同步更新 `Experiment/changelogs.md`。

### Step 8：调用 Skill C

所有上述步骤完成后，调用 **Skill C（experiment-plan-iterate）**，传入：
- 本次完成实验的名称和所属方向
- 实验结果数据（所有指标）
- 分析结论

## 输出格式

对每个完成评估的实验，输出结构化报告：

```
## {实验名} 评估报告

### 基本信息
- 方向: {分支名}
- 种子: {seed}
- W&B run: {run_name}

### 指标结果
| 指标 | 值 | 基线 | Delta |
|------|-----|------|-------|
| train val best | ... | ... | ... |
| test best | ... | ... | ... |
| test avg5 | ... | ... | ... |
| ens3 best | ... | ... | ... |

### Per-Class Dice
| Class | best | avg5 | 基线 best | 基线 avg5 |
|-------|------|------|-----------|-----------|
| RV | ... | ... | ... | ... |
| MYO | ... | ... | ... | ... |
| LV | ... | ... | ... | ... |

### 分析结论
- 假设验证: ...
- 关键发现: ...
- 后续建议: ...
```
