---
name: experiment-debug
description: >
  解决训练/推理过程中的异常（错误退出、崩溃等），在对应主机和代码分支下分析和修复 bug，
  确保修改符合原有实验设计意图，修复后重新启动失败的实验。
  触发关键词：实验崩溃、训练失败、debug experiment、fix crash、
  运行出错、异常退出、experiment failed、训练报错
tags: [Experiment, Debug, Fix, Error, Remote]
version: 0.1.0
---

# Skill D：解决实验异常，修改 Bug

## 概述

当训练或推理过程中检测到异常（通过 W&B 监测、日志检查、或其他 skill 的报告），本 skill 负责：
1. 定位异常的根本原因
2. 在对应分支下修复 bug
3. 确保修复符合原有实验设计意图
4. 重新启动失败的实验

## 输入

本 skill 通常由 **Skill A（experiment-launcher）** 或 **Skill B（experiment-monitor-eval）** 在检测到异常时调用，传入：
- 失败实验的 W&B run 名（= EXP 名）
- 所属方向（分支名）
- 对应的计算节点和工作目录
- 已知的错误信息（如有）

## 执行步骤

### Step 1：收集错误信息

1. **获取远程日志**：
   ```bash
   ssh {HOST} bash -s << 'REMOTE_EOF'
   cd {工作目录}
   EXP="{EXP_NAME}"
   echo "=== Last 50 lines of training log ==="
   tail -50 "logs/${EXP}.log" 2>/dev/null || echo "Log file not found"
   echo "=== Check if process still running ==="
   ps aux | grep "${EXP}" | grep -v grep || echo "Process not running"
   REMOTE_EOF
   ```

2. **查询 W&B 状态和错误**：
   - 检查 W&B run 的状态（crashed / failed）
   - 查看 W&B run 的 system metrics（是否 OOM、磁盘满等系统级问题）
   - 检查 W&B run 的最后几条 log

3. **检查系统资源**：
   ```bash
   ssh {HOST} bash -s << 'REMOTE_EOF'
   echo "=== GPU memory ==="
   nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader
   echo "=== Disk space ==="
   df -h /root/autodl-tmp
   echo "=== Running training processes ==="
   ps aux | grep 'python code/train_ACDC' | grep -v grep | grep -oP '(?<=--exp )\S+' | sort -u
   REMOTE_EOF
   ```

### Step 2：分类错误类型

根据收集到的信息，将错误分类：

| 错误类型 | 典型表现 | 处理方式 |
|---|---|---|
| **OOM（显存不足）** | `CUDA out of memory`、`RuntimeError: CUDA error` | 检查并发训练数是否超限；降低 batch size 或减少并发 |
| **磁盘满** | `OSError: No space left on device`、`IOError` | 清理缓存、旧 checkpoint；检查 `--clear_cache_every` 和 `--ckpt_keep_top_k` 参数 |
| **代码 Bug** | `TypeError`、`KeyError`、`AttributeError`、`ValueError` | 定位到具体代码行，分析和修复 |
| **参数错误** | `argparse` 相关错误、`unrecognized arguments` | 检查命令行参数拼写，与 experiment-plan.md 中的模板对照 |
| **Import 错误** | `ModuleNotFoundError`、`ImportError` | 检查 Python 环境和依赖 |
| **NaN/Inf 爆炸** | `loss is NaN`、`RuntimeWarning: invalid value` | 检查学习率、梯度裁剪、损失权重配置 |
| **网络/W&B 错误** | `wandb.errors`、`ConnectionError` | 通常可重试；检查 W&B 网络连接 |

### Step 3：查阅实验设计文档

**在修复任何 bug 之前**，必须先查阅该实验的设计文档，确保理解原有设计意图：

1. 读取 `worktrees/<suffix>/docs/gspo-pinn-<suffix>/experiment-plan.md`，找到该实验对应的章节。
2. 读取 `worktrees/<suffix>/docs/gspo-pinn-<suffix>/design.md`，理解该实验的算法设计。
3. 读取 `worktrees/<suffix>/docs/gspo-pinn-<suffix>/implementation.md`，了解实现细节。
4. 重点关注：
   - 该实验修改了哪些参数/代码？
   - 该实验的命令行模板是什么？
   - 该实验依赖哪些新增/修改的代码模块？

### Step 4：定位和修复 Bug

#### 对于代码 Bug：

1. **定位**：根据 traceback 找到出错的源文件和行号。
2. **在对应 worktree 中检查代码**：
   ```bash
   # 在本地 worktree 中查看对应文件
   cat worktrees/<suffix>/code/<path_to_file>
   ```
3. **理解上下文**：结合实验设计文档，理解该代码段的预期行为。
4. **编写修复**：
   - 在本地 worktree 中修改代码。
   - 确保修改**仅修复 bug**，不改变原有实验设计意图。
   - 如果发现实验设计本身有问题（而非代码实现问题），标注出来但不擅自修改设计。
5. **同步到远程**：
   ```bash
   # 在 worktree 中提交
   cd worktrees/<suffix>
   git add <modified_files>
   git commit -m "fix: {简要描述 bug 和修复}"
   git push

   # 在远程主机上拉取
   ssh {HOST} "cd {工作目录} && git pull"
   ```

#### 对于参数/命令行错误：

1. 对照 `experiment-plan.md` 中的命令行模板。
2. 修正参数。
3. 如果 `experiment-plan.md` 中的模板本身有误，**更新文档**并提交。

#### 对于系统级问题（OOM/磁盘满）：

1. 不修改代码，而是调整运行条件：
   - OOM → 减少并发训练数或调整 batch size
   - 磁盘满 → 清理并确保 `--clear_cache_every` 和 `--ckpt_keep_top_k` 参数正确
2. 如果调整涉及命令行参数的变化，更新 `experiment-plan.md` 中的对应命令。

### Step 5：更新文档（如修改涉及命令行变化）

如果修复导致了命令行参数或实验配置的变化：

1. 更新 `worktrees/<suffix>/docs/gspo-pinn-<suffix>/experiment-plan.md` 中的对应命令行模板。
2. 在 git commit message 中明确说明参数变化。
3. 同步更新 `Experiment/changelogs.md`。

### Step 6：重新启动失败的实验

1. 使用修复后的代码和/或修正后的参数，在对应主机上重新启动实验：
   ```bash
   ssh {HOST} bash -s << 'REMOTE_EOF'
   cd {工作目录}
   # 确保代码是最新的
   git pull
   EXP="{EXP_NAME}"
   nohup /root/autodl-tmp/envs/ABD/bin/python code/train_ACDC_Cross_Teaching.py \
     {修正后的完整参数列表} \
     > "logs/${EXP}.log" 2>&1 &
   PID=$!
   echo "Relaunched PID: $PID"
   sleep 5
   if ps -p $PID > /dev/null 2>&1; then
     echo "RELAUNCH_OK"
     tail -5 "logs/${EXP}.log"
   else
     echo "RELAUNCH_FAILED"
     tail -20 "logs/${EXP}.log"
   fi
   REMOTE_EOF
   ```

2. **检查重启结果**：
   - `RELAUNCH_OK` → 更新 `Experiment/ongoing_experiments.md`，添加该实验条目。
   - `RELAUNCH_FAILED` → 如果是同一个错误，说明修复不完整；如果是新错误，从 Step 1 重新开始。**限制最多重试 3 次**，超过则报告给用户并暂停。

### Step 7：验证修复（2 分钟监测）

与 Skill A 的 Step 5 相同，通过 W&B 监测 2 分钟确认运行正常。

## 输出

修复完成后，输出一份 debug 报告：

```
## Debug 报告

### 失败实验: {EXP_NAME}
### 方向: {分支名}
### 计算节点: {主机名}

### 错误分析
- 错误类型: {OOM / 代码Bug / 参数错误 / ...}
- 根本原因: {简要描述}
- Traceback 关键信息: {关键行}

### 修复内容
- 修改文件: {文件列表}
- 修改摘要: {做了什么}
- 是否涉及命令行变化: [是/否]
- Git commit: {commit hash}（在 {分支名} 分支上）

### 重启状态
- [成功运行 / 仍然失败（已报告用户）]
```

## 约束

- **修复必须最小化**：只修复 bug，不顺手重构或添加功能。
- **不得偏离实验设计**：修复后的行为必须与 design.md 中描述的一致。如果发现设计本身有问题，报告给用户而不是擅自修改。
- **重试限制**：同一错误最多重试 3 次。超过限制必须报告给用户。
- **远程操作安全**：不要在远程主机上做不可逆的操作（如 `rm -rf`、`git reset --hard`），除非明确必要且已确认。
