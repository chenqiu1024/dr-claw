---
name: experiment-plan-iterate
description: >
  基于已完成实验的分析总结，评估和迭代更新实验计划。判断当前方向的实验计划完成情况，
  必要时调整计划文档，然后触发新实验的启动或进行更深层次的改进构思。
  触发关键词：更新实验计划、迭代计划、调整方向、实验做完了下一步、
  plan iteration、update experiment plan、next experiments
tags: [Experiment, Planning, Iteration, Analysis, Strategy]
version: 0.1.0
---

# Skill C：基于实验分析总结迭代更新实验计划

## 概述

在一个实验完成评估和分析之后，本 skill 负责：
1. 评判该方向实验计划的完成情况
2. 根据实验结论决定是否调整计划
3. 判断是否还有待执行实验并触发后续流程

## 输入

本 skill 通常由 **Skill B（experiment-monitor-eval）** 在完成实验评估后调用，传入：
- 完成实验的名称和所属方向（分支名）
- 实验结果数据（各维度指标）
- 分析结论（假设验证、关键发现）

## 执行步骤

### Step 1：加载方向实验计划

1. 从实验所属分支名确定 `<suffix>`（去掉 `gspo-pinn-` 前缀）。
2. 读取方向文档：
   - `worktrees/<suffix>/docs/gspo-pinn-<suffix>/experiment-plan.md` — 实验计划
   - `worktrees/<suffix>/docs/gspo-pinn-<suffix>/design.md` — 算法设计
   - `worktrees/<suffix>/docs/gspo-pinn-<suffix>/analysis-guide.md` — 分析指南
3. 读取 `Experiment/analysis/branch_unfinished_experiments.md` 中该方向的未完成实验列表。
4. 读取 `Experiment/analysis/branch_progress_detailed.md` 中该方向的所有已完成实验结果。

### Step 2：评判计划完成情况

根据加载的实验计划文档，逐一检查每个计划阶段/实验的完成状态：

1. **已完成实验**：标注为 ✅，记录关键结果。
2. **本次刚完成的实验**：重点分析其结果对后续计划的影响。
3. **未完成实验**：检查其前置依赖是否已满足。
4. **已失败/效果差的实验**：检查实验计划中是否有相关的"失败则如何处理"的条件分支。

输出一份**计划完成度报告**：
```
## {方向名} 计划完成度

### 已完成实验: {N}/{Total}
- ✅ {实验A}: {结论摘要}
- ✅ {实验B}: {结论摘要}
- ...

### 刚完成的实验
- {本次实验}: {结果是否符合预期}

### 待执行实验: {M} 个
- ⏳ {实验C}: {前置是否满足}
- ⏳ {实验D}: {前置是否满足}

### 建议跳过/取消的实验: {K} 个
- ❌ {实验E}: {取消原因}
```

### Step 3：判断是否需要调整计划

基于本次实验的分析结论，评估以下情况：

#### 情况 A：结果符合预期，计划无需调整
- 实验结论支持原假设，按计划继续即可。
- 直接进入 Step 4。

#### 情况 B：结果偏离预期，需要微调计划
示例情况：
- 某个超参数的最优值不在原计划扫描范围内 → 扩大扫描范围
- 某个组合实验的效果不如单独使用 → 调整后续组合策略
- 某类（RV/MYO/LV）出现未预期的退化 → 增加诊断实验

操作：
1. 在 `experiment-plan.md` 中添加/修改对应章节。
2. 如涉及算法变更，同步更新 `design.md`。
3. 如涉及实现变更，同步更新 `implementation.md`。
4. 在对应 worktree 分支下 git 提交变更。
5. 同步更新 `Experiment/changelogs.md`。

#### 情况 C：结果表明该方向根本性不可行
示例情况：
- 所有变体都显著低于基线
- 训练不稳定（val 暴跌）且无法通过调参修复
- 理论分析发现方法论层面的问题

操作：
1. 在 `experiment-plan.md` 中标注该阶段为"已终止"并记录原因。
2. 在 `analysis-guide.md` 中记录失败分析。
3. 不再为该方向的后续实验分配资源。
4. 提交变更。

### Step 4：检查是否还有待执行实验

查看更新后的计划，确认该方向是否还有待执行的实验：

#### 分支 a：还有待执行实验
- 确认待执行实验的前置条件已满足。
- 更新 `Experiment/analysis/branch_unfinished_experiments.md`（如 Step 3 中有调整）。
- **调用 Skill A（experiment-launcher）** 来分配和启动这些实验。

#### 分支 b：没有待执行实验，但最终目标未达成

此时需要进行更深层次的思考和改进：

1. **汇总分析**：综合该方向所有已完成实验的结果，识别瓶颈。
   - 哪些类别（RV/MYO/LV）是 Dice 提升的瓶颈？
   - 哪些超参数/设计选择影响最大？
   - 该方向的方法论有什么根本性限制？

2. **交叉方向分析**：查看其他方向的最新进展（`branch_progress_detailed.md`），寻找可借鉴的发现。

3. **构思新实验**：基于分析，提出新的改进想法。可采用的思路：
   - 结合其他方向的成功经验（如将 Top-K Critic 的 entropy=0 发现应用到本方向）
   - 从失败实验中提取启发（如 E3 失败说明训练中直接加跨种子约束不可行，但推理时的集成策略可能可以改进）
   - 文献调研中的新方法
   - 针对瓶颈类别的专项改进

4. **更新方向文档**：
   - 将新想法写入 `design.md` 的新章节。
   - 将新实验计划写入 `experiment-plan.md`，包含：
     - 实验代号和 EXP 命名模板
     - 详细的命令行参数
     - 预期效果和评估标准
     - 前置依赖和优先级
   - 如需代码实现，写入 `implementation.md`。
   - 在对应 worktree 分支下 git 提交。
   - 同步更新 `Experiment/changelogs.md`。
   - 更新 `Experiment/analysis/branch_unfinished_experiments.md`。

5. **调用 Skill A（experiment-launcher）** 来启动新计划的实验。

#### 分支 c：没有待执行实验，最终目标已达成
- 输出庆祝报告。
- 建议用户进入论文写作阶段。

### Step 5：最终输出

输出一份迭代报告，包含：
```
## 实验计划迭代报告

### 触发实验: {实验名}
### 方向: {分支名}

### 计划调整
- [有/无] 调整
- 调整内容: ...（如适用）

### 当前计划状态
- 已完成: {N}/{Total}
- 待执行: {M}
- 已取消: {K}

### 后续动作
- [调用 Skill A 启动新实验] / [方向已完成] / [进入论文写作]
```

## 约束

- **不得自行凭空发明实验**：新实验必须有数据支撑的动机（从已有结果中推导）。
- **保持方向文档的一致性**：design.md、experiment-plan.md、implementation.md 必须协同更新。
- **遵守 Version Control 规则**：所有文档修改必须 git 提交。
- **尊重方向边界**：如果改进涉及跨方向的代码修改，应明确标注并在主分支下协调。
