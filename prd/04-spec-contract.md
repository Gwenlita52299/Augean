---
doc_kind: spec
id: PMF-SPEC-004
status: draft
created: 2026-10-25
updated: 2026-10-25
owner: fairy
related: [PMF-SPEC-003, PMF-SPEC-005, ADR-0001]
---

# Spec 契约

定义一份 spec 的**字段**、**章节**、**验收标准格式**、**证据清单**，以及**生成物（explainer）的契约**。

一句话目标：让「spec 是否已经变成现实」成为可机器核对的问题，核对通过之后 spec 就可以删了。

## 1. Frontmatter

```yaml
---
doc_kind: spec              # 必填，枚举见 02 §2
id: PMF-SPEC-004            # 必填，全库唯一，永不复用
status: draft               # 必填，draft | active | retired
created: 2026-10-25         # 必填，首次创建日期，不随修改变化
updated: 2026-10-25         # 必填，最后一次实质修改日期
owner: fairy                # 必填，唯一责任人
work_items: [F033]          # 可选，关联工作项 ID
related: [PMF-PRD-000]      # 可选，相关文档 ID，仅用于建图
supersedes: []              # 可选，本文件取代了谁
superseded_by: []           # 可选，本文件被谁取代
verified_at: null           # 可选，最后一次确认「描述仍成立」的 git sha
retired_at: null            # 必填当 status=retired，退役日期
---
```

**硬规则**

1. `id` 全库唯一且**永不复用**。删除后 ID 成为墓碑，不得再分配。
2. `status` 只能取 `draft / active / retired`。**没有** `superseded`、`deprecated`、`archived`、`已废弃`、`✅` 这些变体——退役就是退役，等删。
3. 必填字段缺失 → 报错（不是警告）。
4. `updated` 只在实质修改时更新，纯格式化不算。
5. `specs/` 下目录名必须等于 `id`。
6. `verified_at` 回答的是「检查通过 ≠ 描述正确」：代码动过而没复核的文档应被标 stale。
7. `retired` 且过了保留期 → 直接删除，不设第二个中间态。

## 2. Spec 正文骨架

顺序固定。缺章节要显式写 `无`，不允许静默省略——静默省略是腐烂的起点。

```markdown
# <标题>

## Outcome
一段话说清：做完之后外部可观察到的变化是什么。
必须显式写「本工作**不**引入什么」。

## Truth-source matrix
| Fact | Canonical owner | Consumer | Failure behavior |

## Invariants
| Invariant | Test |

## Existing behavior protection
| Existing behavior | Test |

## Implementation units
1. 可独立验证的实现步骤

## Out of scope
- 明确不做的事
```

**为什么是这几节**

- `Outcome` 的否定句解决 S1（需求未对齐没人落盘）——范围共识写在 spec 里，不写在对话里。
- `Truth-source matrix` 解决 S3 与 drift：一个事实若出现两个 canonical owner，检查器即可报警。
- `Invariants` / `Existing behavior protection` 两列的标题是 **`Test` 而不是 `Evidence`**：强制作者直接写测试路径，而不是先写一段话再补引用。这是 D4 在模板层面的体现。
- `Out of scope` 是删减功能点时的护栏（S2）。

## 3. 验收标准与证据

AC 必须有稳定 ID，且只能通过三种方式收口：

```markdown
- [x] AC-1: <可观察的行为描述>
      test: test/session-strategy.test.ts::creates one node
- [ ] AC-2: <描述>            # 未完成
- [-] AC-3: <描述>            # 已删除，见 ADR-0007
```

| 收口方式 | 含义 | 检查器行为 |
| --- | --- | --- |
| `test:` | 有承接它的测试用例 | 校验文件存在，且用例名可匹配 |
| 保持 `[ ]` | 未完成 | 计入未完成数，阻塞 close |
| `[-]` + ADR | 主动删除 | 必须给出 ADR ID，否则报错 |

### 3.1 只有测试算证据

| 证据类型 | spec 的 AC | 说明 |
| --- | --- | --- |
| `test:<path>::<case>` | **要求** | 默认且唯一合格形态 |
| `cmd:<命令>` | 例外，需 ADR | 只能证明「能跑」，不能证明「行为对」 |
| `code:<path>` | 例外，需 ADR | 指向实现本身，是最弱证据 |
| 自然语言、截图、口头确认 | **不接受** | 检查器直接报错 |

理由：spec 的终点是被删除。删除之后，AC 唯一能存活的地方就是测试。若 AC 只挂在代码路径或一段话上，删除 spec 就是删除知识。

### 3.2 AC 落不成测试时（重要出口）

纯视觉、主观体验、探索性改动的 AC 无法落成测试。此时**不允许**把它标成 `[x]` 蒙混，只有两条合法路径：

1. 拆细：把一个主观 AC 拆成若干可断言的子 AC（大部分情况适用）。
2. 转成 ADR：承认这条不可测，把「我们决定这样取舍」写进 ADR，AC 标 `[-]` 并指向该 ADR。

> `[-]` 的比例是健康度信号：长期高于 20% 说明测试设计有问题，而不是 AC 太多。

## 4. 删减功能点的标准动作（对应 S2）

删一个功能点不是删几行字，而是一次有记录的变更：

1. 对应 AC 从 `[x]` 改为 `[-]`，追加 `— removed: <日期> <原因>`。
2. 写一条 ADR：为什么删、替代方案是什么、什么条件下会重新考虑。
3. 若该功能有独立 design / explainer，标记 `retired`（走删除门）。
4. 运行检查器，确认无断链、无悬挂 ID。

禁止：直接删 AC 行、直接删文档、把 `[x]` 改回 `[ ]`。

**关键点**：删除功能后，spec 本身仍会随工作项关闭而被删除。真正的长期记录是**第 2 步的 ADR**——这是快照派能成立的前提。

## 5. 证据清单（D3：超过 8 条 AC 时）

AC ≤ 8 条写正文；> 8 条拆成 `specs/<ID>/evidence.yml`，避免测试明细淹没 spec。

```yaml
report:
  spec_id: PMF-SPEC-004
  head_sha: <git sha>
  report_date: 2026-10-25
  stage: pre_merge        # pre_merge | pre_release
ac_matrix:
  - ac_id: AC-1
    status: met           # met | unmet | deleted
    evidence:
      - kind: test
        ref: test/session-strategy.test.ts::creates one node
        description: "这条测试证明了什么"
    resolution: null      # 非 met 时必填：立刻做 / 删除 / 拒绝
summary:
  met: 0
  unmet: 0
  deleted: 0
contract_drift_check:
  - contract: "<Invariant 原文>"
    consumers_checked: []
    result: ""
```

**unmet 只有三个出口**：立刻做、标 deleted、明确拒绝。`follow-up`、`deferred`、`next phase` 不是合法出口（[06 §5](06-rollout.md)）。

## 6. Explainer 契约（对应 S4）

生成的讲解产物不以「长期文档」身份存在。它必须能重建，否则不该存在。

```yaml
---
doc_kind: explainer
id: EXPLAINER-session-flow
status: active
created: 2026-10-25
updated: 2026-10-25
owner: fairy
source_sha: 3a30676      # 生成时所依据的代码 sha
regen: npm run explain:session-flow   # 一条命令重建；缺失即视为不可重建
cost: cheap              # cheap | medium | expensive
---
```

| 规则 | 判定 |
| --- | --- |
| 有 `regen:` 且执行成功过 | 保留期 `R = 0`，`source_sha` 落后即删除 |
| 无 `regen:`，人工撰写 | 按 `design` 的公式处理，`cost` 取 medium/expensive |
| `source_sha` 与声明的 `source_paths` 重算结果不一致 | 报 `EXPLAINER_STALE` → 重建或删除，二选一 |
| 正文被手工编辑过（与 `regen` 输出不一致） | 报错：生成物不得手改 |

HTML 产物没有 YAML 头，同一段 frontmatter 放在文件开头的注释里，位置必须在 `<!DOCTYPE>` 之前：

```html
<!--
---
doc_kind: explainer
id: EXPLAINER-pmf-overview
source_sha: 3f13e0388ffb
regen: node explainers/build-pmf-overview.mjs
cost: cheap
---
-->
<!DOCTYPE html>
```

扫描器会先剥离这层注释再按同一套规则校验，所以 explainer 与 markdown 走同一条检查与保留期路径。

`source_sha` 取所描述源文件的**内容指纹**（无 git 也能算），而非提交号——它只需要回答「源变了没有」。为此 explainer 必须同时声明 `source_paths`（目录或文件列表）：检查器按同一算法重算，不一致即报 `EXPLAINER_STALE`。**没有 `source_paths` 的 explainer 无法被判定是否过期**，M6 也就无法度量。

**这条规则的目的**：把「要不要维护这份 HTML」变成「要不要跑那条命令」。不跑，它就自己消失。

## 7. 模板

- spec：`templates/spec.md`
- ADR：`templates/adr.md`
- 证据清单：`templates/evidence.yml`

模板是唯一权威，`templates/` 之外不得存副本。
