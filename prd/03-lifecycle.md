---
doc_kind: spec
id: PMF-SPEC-003
status: draft
created: 2026-10-25
updated: 2026-10-25
owner: fairy
related: [PMF-SPEC-004, ADR-0001]
---

# 文档生命周期

核心命题：**文档的死必须和它的生一样有据可查**，而「什么时候死」不应该由人记得，应该由工具算出来。

依据 [ADR-0001](../decisions/0001-spec-as-snapshot.md)：代码是 ground truth，文档是脚手架，默认结局是删除。

## 1. 状态机

```
draft ──► active ──► retired ──► deleted
            ▲           │          （追加墓碑）
            └───────────┘
             复活（仅一次）
```

| 状态 | 含义 | 参与主索引 | 可改正文 | 有到期日 |
| --- | --- | --- | --- | --- |
| `draft` | 尚未定稿，不构成约束 | 是（灰显） | 是 | 否 |
| `active` | 当前有效 | 是 | 是（见 §3） | 否 |
| `retired` | 已退役，冻结等删 | 否 | **否** | **是**（§4 算出） |
| `deleted` | 已从仓库移除 | 否 | — | — |

**不变式**

1. 进入 `retired` 后正文冻结。想改内容，造新文档——否则历史全丢。
2. 只有 `retired` 有到期日。活跃文档不设寿命，靠「无入链 + 长期未改」作为债务信号（§6）。
3. `adr` 与 `glossary` 永不进入 `retired`：ADR 只能被新 ADR 取代，术语表就地更新。

## 2. 状态转移

| 转移 | 触发条件 | 必须同时发生 |
| --- | --- | --- |
| `draft → active` | 工作项启动，或 spec 评审通过 | 填 `owner`、`work_items` |
| `active → retired` | 工作项关闭且通过删除门（§5） | 把入链改指 successor（测试或 ADR） |
| `active → retired` | 被新文档取代 | 新文档 `supersedes` 指向它 |
| `active → retired` | 生成物 `source_sha` 落后于 HEAD | 或直接重建（`regen`），重建即刷新 sha |
| `retired → deleted` | 到期日已过 | 追加墓碑（§7） |
| `retired → active` | 宽限期内被再次需要 | 记 `revived_at`，**每份文档只允许复活一次** |

## 3. active 文档的修改规则

| 修改性质 | 允许就地改？ | 处理方式 |
| --- | --- | --- |
| 错别字、链接修正 | 是 | 直接改，`updated` 不变 |
| 补充示例、澄清措辞（不改变语义） | 是 | 直接改，`updated` 更新 |
| 新增 AC | 是 | 追加 AC 并给新 ID |
| 删除 AC | 否 | 标 `[-]` + reason（见 04 §4） |
| 改变 Outcome / 范围 | **否** | 造新 spec，旧的退役 |
| 推翻设计结论 | **否** | 造新 design 或新 ADR |

> 一句话：**加是改，减是造**。

## 4. 保留期：随开发频率动态计算

这是本框架唯一「会自己变」的参数。固定保留期在两个方向上都会出错：开发快时它让退役区积压，开发慢时它把还有用的文档删早了。

### 4.1 公式

```
# 仅在 retention.mode = dynamic 且已过冷却期时生效
λ   = 近 8 周内「新增 + 实质修改」的文档数 ÷ 8          （docs/week）
R   = clamp( (N_target ÷ λ) × m_kind × w(C), 3, 90 )   （天）

N_target = 30    # 退役区目标容量（份）
m_kind   = spec 1 · design 2 · prd 2 · note 1
w(C)     = cheap 0.25 · medium 1 · expensive 2
clamp    = 最短 3 天，最长 90 天
explainer：凡有 regen: 且执行成功过 → R = 0（退役即删）
```

### 4.2 为什么是反比

退役区存量近似 `N_r ≈ λ × R`。若 `R ∝ 1/λ`，则 `N_r ≈ N_target × m × w` 是与时间无关的常数。

所以「开发越快、保留越短」不是拍脑袋：它让**退役队列的容量恒定**，而不是让仓库随开发速度膨胀。这正是要解决的 P1。

### 4.3 算出来的样子（仅 dynamic 模式，且已过冷却期）

| λ（docs/week） | 场景 | spec | design | note | prd |
| --- | --- | --- | --- | --- | --- |
| 0.25 | 每月一份 | 90 | 90 | 90 | 90 |
| 1 | 每周一份 | 30 | 60 | 30 | 60 |
| 5 | 每天一份 | 6 | 12 | 6 | 12 |
| 15 | 每天三份 | 3 | 4 | 3 | 4 |
| 40 | 批量生成 | 3 | 3 | 3 | 3 |

对照两个典型场景：**每天都在新增 → 保留期从 30 天压到 6 天；每月才一份 → 放宽到 90 天上限**。曲线连续，不需要人插手。

### 4.4 重构成本的作用（对应 S4）

`w(C)` 让「便宜的东西死得快」：

| 成本 | w | 典型 | 含义 |
| --- | --- | --- | --- |
| cheap | 0.25 | 一条命令能重建的讲解、脚本产物 | 重建比维护便宜，删了再生成 |
| medium | 1 | 手写 spec、设计稿 | 重建要花时间，但不是不可能 |
| expensive | 2 | 调研、外部访谈、踩坑记录 | 重建成本高，值得留久一点 |

生成式 HTML 讲解属于 cheap，且通常有 `regen:`——直接 `R = 0`。**它的正确寿命不是「维护到它过时」，而是「不重建就消失」。**

### 4.5 参数不写死在文档里

公式里的 `N_target / m / w / clamp` 是默认值，实际值由工具读取配置计算，并输出到生成的 `docs/RETENTION.md`（含每份退役文档的到期日）。文档只解释公式，不给数字——否则又会出现「文档里的数字与工具不一致」。

### 4.6 开关：默认固定，显式开启动态

`docs/pmf.config.json`：

```json
{
  "retention": {
    "mode": "fixed",
    "fixed": { "spec": 30, "design": 60, "prd": 60, "note": 30 },
    "dynamic": {
      "enabled_at": null,
      "n_target": 30,
      "lambda_window_weeks": 8,
      "warmup_weeks": 4,
      "min_samples": 8,
      "clamp": [3, 90]
    }
  }
}
```

**为什么默认 `fixed`**：动态公式一旦按历史数据算，第一次运行就会拿一套没被验证过的参数去判已经存在的退役文档，等于用新规则删旧的库。先在固定保守值上跑通「退役 → 等 → 删」这条链路本身，再让参数开始随频率变化。

**固定值（保守 = 宁可晚删）**

| doc_kind | fixed R（天） | 说明 |
| --- | --- | --- |
| `spec` | 30 | 动态在 λ=5 时只要 6 天，固定值保守约 5 倍 |
| `design` | 60 | |
| `prd` | 60 | |
| `note` | 30 | |
| `explainer`（有 `regen:`） | **0** | 与开关无关：可重建即删，不依赖统计 |
| `explainer`（无 `regen:`） | 60 | 按人工撰写处理 |
| `adr` / `glossary` | ∞ | 不可退役 |

### 4.7 开启动态：只向前统计，不回溯

| 规则 | 说明 |
| --- | --- |
| 开启时刻由工具写入 | `enabled_at = now()`。不接受人工传入日期，**传历史日期直接报错** |
| λ 只统计开启之后 | `git log --since=<enabled_at>`；开启前的变动视为不存在 |
| 冷却期 | `now - enabled_at < warmup_weeks`（默认 4 周）或样本数 `< min_samples`（默认 8）时，**继续用 fixed** |
| 已冻结的 R 永不重算 | 切换模式不影响任何已退役文档的 `retire_r`；新规则只作用于之后退役的文档 |
| 切回 fixed 也不回溯 | 降级不是「恢复默认」，只是改变后续行为 |
| 审计 | `RETENTION.md` 增列 `mode` / `enabled_at` / `samples` |

这些规则合起来是一条原则：**参数变更只影响未来，从不重写过去。** 它与 §2「R 在退役那一刻冻结」是同一条规则的两个方向——一个防参数漂移，一个防历史被追溯修改。

## 5. 删除门（进入 retired 的前置条件）

退役不是随时可以做的，必须先满足门禁，否则删掉的是知识的唯一副本。

| doc_kind | 删除门 |
| --- | --- |
| `spec` | 每条 AC 有 test evidence，或已标 `[-]` 且对应 ADR 存在 |
| `design` | 有后继 design（`supersedes`）或对应 ADR |
| `prd` | 有 ADR 记录方向变更 |
| `note` | 无 |
| `explainer` | 无（前提：`regen:` 可用，或已确认不再需要） |
| `adr` / `glossary` | **不可退役** |

## 6. 活跃文档的债务检测

活跃文档没有到期日，但会腐烂。三个信号：

| 信号 | 判定 | 处置 |
| --- | --- | --- |
| 孤儿 | 无入链 + 90 天未修改 | 列入 `DEBT.md`，由 owner 决定退役或补锚点 |
| 证据失效 | Evidence 指向的路径不存在，或测试被 skip | 警告，超 30 天转错误 |
| 语义 drift | 人工 review 时对照 `Invariants` 发现不符 | 开新工作项，旧文档退役（D6：不自动化） |

## 7. 墓碑

删除时追加一行到 `docs/TOMBSTONES.tsv`（append-only，不手改）：

```
id	kind	deleted_at	successor	title
F033	spec	2026-11-02	test/session-strategy.test.ts	Session strategy contract
NOTE-RESEARCH-001	note	2026-11-14	-	三个仓库的文档治理调研
```

| 字段 | 说明 |
| --- | --- |
| `successor` | 行为现在落在哪：测试路径、ADR ID，或 `-`（无可承接者） |

**墓碑为什么不是新的堆积**：一行 TSV，不含正文，不可编辑，只回答「这个 ID 去哪了」。`-` 占比过高，说明删除门在放水。

## 8. 度量

| 指标 | 计算 |
| --- | --- |
| 到期未删率 | 过期 `retired` 数 / `retired` 总数 |
| 退役区存量 | `retired` 数（对照 `N_target`） |
| 复活率 | 复活次数 / 退役次数（>10% 说明 `R` 太短） |
| 测试承载率 | 关闭时 AC 有 test evidence 的比例 |
| 墓碑空承接率 | `successor = -` 的比例 |
