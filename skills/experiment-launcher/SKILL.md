---
name: experiment-launcher
description: >
  挑选新的可执行实验并分配到计算节点上运行。遍历所有方向下尚未执行的训练实验，
  按优先级排序，检查对应主机余量，自动启动训练并通过 W&B 监测启动状态。
  触发关键词：启动实验、跑实验、launch experiments、dispatch training、
  挑选实验、分配训练、开新训练
tags: [Experiment, Training, Dispatch, GPU, Remote]
version: 0.1.0
---

# Skill A：挑选新的可执行实验来运行

## 概述

自动化实验分配流程：扫描所有方向的未完成实验清单，按优先级逐一尝试分配到有余量的计算节点上执行，启动后通过 W&B 监测 2 分钟确认运行状态。

## 前置条件

- 已配置 SSH 到各计算节点的免密登录
- W&B CLI 已登录（`wandb login`）
- 项目 `Experiment/COMPUTE_NODES.md` 中的主机信息是最新的

## 执行步骤

### Step 1：收集待执行实验清单

1. 读取 `Experiment/analysis/branch_unfinished_experiments.md`，提取所有状态为"未开始"或"未完成"的实验条目。
2. **在 W&B 上验证**（不仅依赖文档）：对每个候选实验的 EXP 名称模板（替换 `${SEED}` 后），在 W&B 项目 `godspeed1024-re/OurABD` 中搜索是否存在同名的 `finished` 训练 run。若已存在则该实验不需要再启动训练，从待执行清单中移除。
3. **排除**该文档"补充说明 → 当前最不建议继续扩的未完成项"中列出的条目（除非用户明确指定要执行）。
4. 将剩余实验按照以下优先级排序：
   - **最高**：实验计划中标注为高优先级的、或属于当前最值得扩 3-seed 的 family（参见 `branch_progress_detailed.md` 末尾的优先级排序表）
   - **次高**：计划中的下一个顺序实验
   - **中等**：已有部分种子完成，从训练时val model1_mean_dice指标来看并没有比基线有明显regression（即明显可以抛弃的子方向），但缺少其他种子来做多seed ensemble的实验（例如已有 s2024 结果，缺 s1337/s3407）
   - **次低**：探索性/高风险实验
   - **最低**：其他剩余实验，比如单seed从val model1_mean_dice来看有明显regression的实验（但不排除多seed ensemble后有提升，只是概率较低），或者计划中优先级较低的实验

### Step 2：获取各计算节点当前负载

1. 读取 `Experiment/COMPUTE_NODES.md`，建立 `{分支名 → (主机, 工作目录, 最大并发数)}` 映射。
2. 读取 `Experiment/ongoing_experiments.md`，统计每个主机当前正在运行的训练数。
3. 计算每个主机的 **剩余余量** = 最大并发数 − 当前运行数。
4. **可选验证**：SSH 到主机执行以下命令实际确认（推荐但非必须）：
   ```bash
   ps aux | grep 'python code/train_ACDC' | grep -v grep | grep -oP '(?<=--exp )\S+' | sort -u | wc -l
   ```

### Step 3：逐个分配实验

按优先级从高到低遍历 Step 1 的实验列表。对每个实验：

1. **确定目标主机**：根据实验所属分支，通过 `COMPUTE_NODES.md` 找到对应的主机和工作目录。
2. **检查余量**：该主机的剩余余量是否 > 0？
   - 若 **无余量**：跳过此实验，继续下一个。
   - 若 **有余量**：继续。
3. **检查主机可达性**：尝试 SSH 连接目标主机。
   - 若 **不可达**（主机未开机）：
     - 如果配置了 IM 接口，发送通知：`"需要开机：{主机名}，待执行实验：{实验名}"`
     - 跳过此实验，继续下一个。
   - 若 **可达**：继续。
4. **获取实验执行命令**：
   - 从实验所属方向的文档中查找该实验的命令行模板：`worktrees/<suffix>/docs/gspo-pinn-<suffix>/experiment-plan.md`
   - 替换模板中的 `${SEED}` 等变量为实际值。
   - 确保包含必要参数（参照 `EXPERIMENT_PLAYBOOK.zh-CN.md`）：`--clear_cache_every 1000`、`--ckpt_keep_top_k 5` 等。
5. **远程启动训练**：
   ```bash
   ssh {HOST} bash -s << 'REMOTE_EOF'
   cd {工作目录}
   EXP="{实验名}"
   nohup /root/autodl-tmp/envs/ABD/bin/python code/train_ACDC_Cross_Teaching.py \
     {完整参数列表} \
     > "logs/${EXP}.log" 2>&1 &
   PID=$!
   echo "Launched PID: $PID"
   sleep 5
   if ps -p $PID > /dev/null 2>&1; then
     echo "LAUNCH_OK"
     tail -5 "logs/${EXP}.log"
   else
     echo "LAUNCH_FAILED"
     tail -20 "logs/${EXP}.log"
   fi
   REMOTE_EOF
   ```
6. **检查启动结果**：
   - 若输出包含 `LAUNCH_OK`：启动成功，继续 Step 4。
   - 若输出包含 `LAUNCH_FAILED`：启动失败，记录错误信息，调用 **Skill D（experiment-debug）** 处理。

### Step 4：更新"正在进行的实验"

在 `Experiment/ongoing_experiments.md` 中添加一行：

```
| {W&B run 名} | {主机名} + {工作目录} |
```

此外也要在`Experiment/analysis/branch_unfinished_experiments.md` 中更新该实验的状态为"正在进行"，并记录启动时间。

### Step 5：通过 W&B 监测启动状态（2 分钟）

1. 等待约 30 秒后，检查 W&B 项目 `godspeed1024-re/OurABD` 中是否出现了对应的 run。
2. 在接下来的 2 分钟内，每 30 秒检查一次该 run 的状态：
   - **状态 = running**：正常，继续监测直到 2 分钟结束。
   - **状态 = crashed / failed**：
     a. 从 W&B 或远程日志获取错误信息。
     b. 如果配置了 IM 接口，发送异常通知。否则记录到错误日志。
     c. 从 `Experiment/ongoing_experiments.md` 中删除该条目。
     d. 把该实验标记回 `Experiment/analysis/branch_unfinished_experiments.md` 的"未完成"状态。
     e. 调用 **Skill D（experiment-debug）** 处理错误。
   - **未出现 run**（2 分钟后仍未在 W&B 上出现）：
     a. SSH 到主机检查进程和日志。
     b. 根据检查结果决定是否调用 Skill D。
3. 2 分钟监测通过 → 该实验已确认成功启动。

### Step 6：继续遍历

将该主机的剩余余量减 1，回到 Step 3 继续处理下一个实验。

### Step 7：遍历结束

当满足以下任一条件时，遍历结束：
- 所有待执行实验都已分配或跳过。
- 所有主机的剩余余量都为 0，或者剩余显存已无法再加入更多实验了（根据实际训练数和显存占用情况来估计）。

输出本次分配的总结：
```
已启动: {N} 个实验
  - {实验名1} → {主机1}
  - {实验名2} → {主机2}
跳过（无余量）: {M} 个实验
跳过（主机不可达）: {K} 个实验
启动失败（已转 Skill D）: {J} 个实验
```

## 注意事项

- 远程 SSH 执行必须使用 heredoc 方式（参见 `COMPUTE_NODES.md` §4.2）。
- Python 路径固定为 `/root/autodl-tmp/envs/ABD/bin/python`（参见 `COMPUTE_NODES.md` §4.1）。
- 统计主机训练数时排除 DataLoader worker（参见 `COMPUTE_NODES.md` §4.4）。
- 启动后必须 `sleep 5` 再检查进程存活（参见 `COMPUTE_NODES.md` §4.3）。
