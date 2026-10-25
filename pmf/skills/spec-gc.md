---
name: spec-gc
description: 周期性清理文档：看保留期状态、列出到期项、分诊被拦的项、并在用户确认后执行删除。每周清理、用户说「清理文档」、或退役队列变长时用。
when_to_use: 定期维护时，或退役文档已经过保留期需要处理时。
---

# spec-gc

目标：让删除真的发生。清理不是大扫除，是**按到期日执行**的常规动作。

本 skill 会删文件。**执行删除前必须拿到用户明确同意。**

## 1. 看状态

```
pmf_retention
```

读四件事：

| 字段 | 怎么读 |
| --- | --- |
| `mode` | `fixed` 或 `dynamic`。出现 `(warmup …)` 说明还在冷却期，此时一律用固定值 |
| `lambda` | 文档产出频率。`unavailable` 表示没有 git，只影响 dynamic |
| `WAIT` | 未到期。注意 `days` 与 `mode`，确认它是固定值还是算出来的 |
| `DUE` | 已到期，待删 |
| `BLOCK` | 已到期但被删除门拦住 |

## 2. 到期项先 dry run

```
pmf_expire            # 不带 apply，永远是 dry run
```

逐条检查 `DUE` 行的 `successor` 字段：

- 指向测试 → 可以删，行为已有承接。
- `-` → **先停**。说明这份文档删除后什么都不剩，回头补 successor（测试或 ADR）再删。

## 3. 分诊 BLOCK

被拦说明删除门在工作，不是故障。三类处理：

| 原因 | 处理 |
| --- | --- |
| `close gate: n AC not backed by tests` | 这份 spec 其实没完成。退回 `active`，走 `spec-close` 补齐；**不要**为了删而删 |
| `deleted without ADR id` | 补 ADR，把 `[-]` 指向它 |
| `no ADR cited`（design/prd） | 补 ADR 记录方向变更 |

被拦的项**不允许**用 `--force` 之类的方式绕过——框架里没有这个开关，也不该加。

## 4. 申请删除

把清单摊给用户，一次说清：

```
将删除 3 份（已过保留期，git 历史仍可恢复）：
1. F033 spec  到期 2026-11-02  r=30d  承接：test/session-strategy.test.ts
2. NOTE-…    到期 2026-11-14  r=30d  承接：-
3. DESIGN-…  到期 2026-11-20  r=60d  承接：ADR-0008
确认删除？（第 2 条无承接，建议再留一轮）
```

没有明确同意，就只报告不删。

## 5. 执行与验证

```
pmf_expire apply=true
pmf_check              # 删除后必须重跑：查断链
```

然后确认：

- `docs/TOMBSTONES.tsv` 增加了对应行，`successor` 不为 `-`（除非确认无承接）。
- 没有其他文档的链接指向被删的路径（`pmf_check` 的 `LINK_BROKEN` 为 0）。

若出现断链，说明删除前的引用改写漏了——修引用，不要回滚删除（git 里有原文，重建成本低于维持断链）。

## 6. 收尾报告

```
mode: fixed（lambda 不可用）
退役队列: 5 → 删除 3 → 剩 2
被拦: 1（F902 close gate 未过，已退回 active）
新增墓碑: 3 行，其中 1 行 successor 为 -
下次到期: 2026-11-28（F041）
```

`successor` 为 `-` 的比例持续上升，说明删除门在放水——这是唯一需要人工介入的指标。

## 硬规则

- 先 dry run，再申请，最后删除。顺序不能跳。
- 删除必须有用户明确同意。
- 被删除门拦住的，一律回去修，不绕过。
- 删除后必须重跑 `pmf_check`。

## 边界

`DEBT.md`（孤儿文档周报）尚未实现，当前孤儿检测只能靠 `pmf_check` 的 warn 与人工判断。发现孤儿（无入链、无 owner、长期未改）时，报告给用户，不要自行删除——孤儿不在本 skill 的删除范围内。
