---
doc_kind: adr
id: ADR-0002
status: active
created: 2026-10-31
updated: 2026-10-31
owner: fairy
related: [ADR-0001, PMF-SPEC-005, PMF-SPEC-008]
supersedes: []
superseded_by: []
---

# ADR-0002：多端之下，只有 CI 拥有写权

- **状态**：已接受
- **日期**：2026-10-31
- **决策者**：fairy

## 背景

框架要从单端（DSH 插件）扩到多端：DSH、MCP 客户端、只读 AGENTS.md 的 agent、本地 git 钩子、CI（[PMF-SPEC-008](../prd/08-multi-surface.md)）。各端共享的唯一状态是仓库里的文件：`.pmf-state.json`、`TOMBSTONES.tsv`、`pmf.config.json`，以及被删除的文档本身。

目前 `expire --apply` 与 `enable-dynamic` 在 CLI 和 DSH 工具里都能执行。单端时这没问题；多端时，两个端可以在不同分支上各删一批、各写一份冻结的 `retire_r`，合并时 `.pmf-state.json` 冲突，墓碑出现重复或缺行。保留期的承诺（R 一旦冻结就不再移动）会被并发写悄悄打破。

## 决定

我们选择**单写者：只有 CI 执行会改动治理状态的操作**（`expire --apply`、`enable-dynamic`，以及将来任何写 `.pmf-state.json` / `TOMBSTONES.tsv` 的命令），并且一律以 PR 形式落地。其余各端只做只读检查和 dry-run；而不是让每个端都能写，再靠锁或合并规则调和。

## 理由

- **单写者天然没有冲突**：状态文件只在一条串行的流水线上变化，不需要锁，也不需要合并策略。git 已经是同步通道，不再加一层。
- **删除本来就该走 PR**（[05 §4](../prd/05-tooling.md)）：这条决定只是把「谁有权发起」从惯例变成约束。
- **放弃的选项好在哪**：「每端都能写 + 文件锁」可以让 agent 在会话里当场清理，反馈更快。但锁在分支模型下不成立：两个分支各自持锁，合并时照样冲突；锁文件本身也会成为新的冲突源。「只有人能写」最安全，但需要人工审批的删除最终都不会发生（P1 的成因），等于放弃自动清理。
- **代价可控**：agent 端失去的只是「当场删除」，dry-run 仍能告诉用户哪些到期、为什么被拦。

## 后果

- 变得容易：状态文件不会因多端并发而损坏；`retire_r` 的不回溯承诺有了执行者；审计只看一条流水线。
- 变得困难：没有 CI 的项目无法自动删除，只能由人手动跑一次（视同 CI）；本地想立刻清理要多走一步。
- 需要后续跟进：[PMF-SPEC-008](../prd/08-multi-surface.md) AC-7（CLI 写操作在非 CI 环境默认拒绝）、AC-8（DSH 工具 `pmf_expire` 的 `apply` 收紧为 dry-run）、AC-9（每周删除 PR 的 GitHub Action）。

## 重新考虑的条件

- 状态改成按文档拆分（每份退役文档一个状态文件），使并发写不再冲突。
- 出现大量没有 CI 的使用者，并且他们的退役区持续膨胀。
- 单写流水线成为瓶颈：删除 PR 积压超过两周无人合并。
