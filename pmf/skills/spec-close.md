---
name: spec-close
description: 关闭一个工作项的 spec：核对每条 AC 是否被测试接住，把不可测的转成 ADR，然后退役。实现完成、要收尾、或用户说「这个做完了」时用。
when_to_use: 工作项实现已完成且测试通过，准备把 spec 标记退役时。
---

# spec-close

目标：让 spec 在**不撒谎**的前提下退场。关闭之后它会被保留期删掉，所以关闭时漏掉的信息就是永久丢失。

前提：实现已完成、测试已通过。本 skill 不写实现代码。

## 1. 先看现状

```
pmf_evidence --spec <ID>
```

输出三种 AC：

| 状态 | 含义 | 能否直接退役 |
| --- | --- | --- |
| `met` + 测试存在 | 有可执行证据 | 可以 |
| `open` | 未完成 | **不能** |
| `deleted` + ADR | 主动不做，有据可查 | 可以 |

## 2. 处理每一条 open

按顺序试，**没有第四种做法**：

1. **补测试**：写测试 → AC 挂上 `test:` → 改 `[x]`。
2. **拆细**：把这条拆成能测的子条，各给新 ID。
3. **转 ADR**：承认做不到，写 `docs/decisions/NNNN-*.md` 记录为什么放弃 / 取舍是什么，AC 改 `[-]` 并写 ADR ID。

不允许的做法：

- 把 `[ ]` 直接改成 `[x]`（这是「检查通过但描述是假的」的来源）。
- 写 `follow-up`、`deferred`、`下一阶段`、`后续迭代`——延期不是出口。
- 把 AC 整行删掉（删除动作必须留痕）。

## 3. 大 spec 补证据清单

AC 超过 8 条时，把证据从正文挪到 `docs/specs/<ID>/evidence.yml`（模板 `templates/evidence.yml`），正文 AC 行改成 `evidence: -> evidence.yml#AC-n`。

`unmet` 字段只有三个合法值：立刻做 / `deleted` / 明确拒绝。写 `follow-up` 会被 `pmf_check` 报错。

## 4. 关闭前的两项检查

```
pmf_check              # 结构必须 0 error
pmf_evidence --spec <ID>   # close gate 必须 PASS
```

close gate 不 PASS 就不许退役。若卡住，说明这个工作项其实没完成——退回实现，不要伪造证据。

## 5. 退役

1. frontmatter：`status: retired`，`retired_at: <今天 YYYY-MM-DD>`。
2. 更新 `updated`。
3. 把代码里的锚点指向承接的测试：

```ts
// spec: F033 → test/session-strategy.test.ts
```

锚点改指测试，不是删掉——spec 被删之后，这一行是唯一还知道「这段代码原始意图在哪」的东西。

## 6. 该写 ADR 的情况

关闭时以下三类必须留 ADR，否则删掉 spec 就等于删掉记忆：

| 情况 | 为什么必须 |
| --- | --- |
| 删掉了某个功能点 | 否则下次有人重新提，从零辩论 |
| 改变了边界或方向 | 否则没人知道当初为什么不那样做 |
| 有不可测的取舍 | 否则 `[-]` 看起来像偷懒 |

ADR 里必须写 `重新考虑的条件`。没有这一节，说明它还不够重要，不该写成 ADR。

## 7. 回报

```
- close gate: PASS / BLOCKED（阻塞项 n 条）
- AC: n met / n deleted / n open
- ADR: 新增 <ID> 或「无」
- 后续：spec 将在保留期后由 pmf_expire 删除（当前 fixed 30 天 / dynamic 按 λ）
```

明确告诉用户：**这份 spec 不会长期存在**，要看原文请从 git 历史取。

## 硬规则

- close gate 不 PASS → 不退役。
- `[x]` 必须有 `test:`，`[-]` 必须有 ADR。
- 不写延期话术。
- 退役前把锚点改指测试。
