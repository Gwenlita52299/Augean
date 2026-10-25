---
name: spec-write
description: 把一个需求写成可关闭的 spec。含防重复立项、ID 选取、Outcome/真源矩阵/不变量/AC 的写法约束。开新工作项或用户说「写个 spec / 立个项」时用。
when_to_use: 用户提出一个新需求、要开新工作项、或现有 spec 已不适用需要新的一份时。
---

# spec-write

目标：产出一份**能关闭**的 spec——不是写得漂亮，而是每条 AC 都能在关闭时被测试接住。

前置检查：`pmf_check` 能跑（否则先装 `@local/pmf` 或直接用 `node pmf/bin/pmf.mjs check`）。本 skill 只写文档，不改代码。

## 1. 先搜，再立

不搜就立项，是 P4（重复造轮）的成因。

1. 在 `docs/` 里搜关键词：`grep -ril "<关键词>" docs/`。
2. 看有没有已存在的 spec：`docs/specs/<ID>/spec.md`。
3. 看墓碑，确认这个 ID 没被用过：`grep -i "<ID>" docs/TOMBSTONES.tsv`。**ID 永不复用**，用过就得换。
4. 判断：
   - 已有 spec 覆盖 → **改造它**，不要新建。
   - 已有 ADR 说明「不做」→ 停。把这次的事实记进该 ADR 的 `重新考虑的条件`，不要新开 spec。
   - 都没有 → 继续。

## 2. 定 ID 与位置

| 情况 | 目录名 | 例 |
| --- | --- | --- |
| 有工作项编号 | 工作项 ID | `docs/specs/F033/spec.md` |
| 无编号 | 稳定大写 SLUG | `docs/specs/PMF-SPEC-002/spec.md` |

目录名必须等于 frontmatter 的 `id`（`pmf_check` 会校验）。

## 3. 从模板开始

复制 `templates/spec.md`，**不要手打骨架**。骨架的节序是有意义的：检查器与后续 skill 都按它定位。

## 4. 四节怎么写

### Outcome

一段话写完，然后补一句否定：

```markdown
**本工作不引入**：<明确不做的东西>
```

否定句是范围共识的落点。只写正面描述，等于把「不做什么」留给下次开会争。

### Truth-source matrix

每个事实一行。**找不到唯一 owner 的事实，说明还没想清，不要写进 spec。**

| Fact | Canonical owner | Consumer | Failure behavior |
| --- | --- | --- | --- |
| 内置候选列表 | Host 打包快照 | 列表页 | 无需远端即可见 |

一个事实出现两个 owner，就是 drift 的源头。

### Invariants / Existing behavior protection

两列的表头是 **`Test`**，不是 `Evidence`。直接写测试路径：

```markdown
| 同一会话只有一个活跃节点 | `test/session-store.test.js::one active node` |
```

写不出测试的那一行，**不是 invariant**——删掉它，或把它降级成 AC 再判断。

### Acceptance criteria

- 一条只写一个可观察行为。
- 每条带稳定 ID：`AC-1`、`AC-2`，不要重排。
- 已能写测试的，直接挂引用：

```markdown
- [x] AC-1: 同一会话二次调用不新建节点
      test: test/session-store.test.js::one active node
```

> 提示：`[x]` 只表示「现在已成立」。开工前大部分应是 `[ ]`。

## 5. 写不出来的 AC 怎么办

两条合法出口，**没有第三条**：

1. **拆细**：把「体验流畅」拆成可断言的子条（响应 p95、无阻塞请求、首屏无空白）。
2. **转 ADR**：承认不可测，把取舍写进 `docs/decisions/NNNN-*.md`，AC 标 `[-]` 并写 ADR ID：

```markdown
- [-] AC-3: 视觉层次感 — removed: 2026-10-25 主观判断，取舍见 ADR-0007
```

不要为了关闭而把 `[ ]` 直接改成 `[x]`。

## 6. 不要写进 spec 的东西

| 不要写 | 写去哪 |
| --- | --- |
| 「我们决定采用 X」 | ADR |
| 测试代码或断言细节 | 测试文件，spec 只留路径 |
| 实现步骤的详细命令 | 代码注释或提交信息 |
| 历史讨论过程 | 不写。结论进 spec，取舍进 ADR |

## 7. 收尾

1. `pmf_check`：必须 0 error。`[-]` 的 warn 可以留。
2. `pmf_evidence --spec <ID>`：报 `open` 是正常的（还没开工），报 `met without test` 是错的。
3. 回报三件事：文件路径、AC 总数、哪些 AC 还是 open。

## 硬规则

- 一个工作项**恰好一份** spec。多份即冲突，先合并再继续。
- ID 不复用；目录名 = id。
- `[x]` 必须有 `test:`；`[-]` 必须有 ADR。
- 不写「我们决定」。那是 ADR 的活。
