---
doc_kind: spec
id: PMF-SPEC-002
status: draft
created: 2026-10-25
updated: 2026-10-25
owner: fairy
related: [PMF-PRD-000, PMF-SPEC-003, ADR-0001]
---

# 框架设计：目录契约与记忆分层

## 1. 目录契约

```
<project-root>/
├── GLOSSARY.md                    # 唯一术语表（永久）
└── docs/
    ├── README.md                  # 文档地图：唯一的人写入口
    ├── INDEX.md                   # 活文档索引（生成，按 kind/status 分组）
    ├── RETENTION.md               # 退役队列与到期日（生成）
    ├── TOMBSTONES.tsv             # 已删文档墓碑（生成，append-only）
    ├── DEBT.md                    # 文档债清单（生成，按 owner 分组）
    ├── .doc-index.json            # 关系图（生成，机器用）
    ├── docs-baseline.json         # 存量违规基线（生成，迁移期用）
    ├── prd/                       # 每项目 1 份
    │   └── 00-prd.md
    ├── specs/                     # 每工作项 1 个目录
    │   └── F033/
    │       ├── spec.md
    │       └── evidence.yml
    ├── designs/                   # 每模块 1 份当前有效设计
    ├── explainers/                # 生成的讲解产物（带 regen + source_sha）
    ├── decisions/                 # ADR，只增不改，永不删除
    │   └── 0001-spec-as-snapshot.md
    └── notes/                     # 调研、实验、一次性分析
```

**没有 `archive/`。** 退役文档留在原地、标记 `retired`、到期删除（[03](03-lifecycle.md)）。归档区只是把垃圾挪到看不见的地方，不解决问题。

**三条硬规则**

1. `docs/` 之外不允许存在 `.md` 文档，根目录白名单除外：`README.md`、`AGENTS.md`、`CLAUDE.md`、`GLOSSARY.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`LICENSE`。其余位置出现 `.md` → 报警。
2. 每类视图**恰好一份**。`README.md` 人写导航，`INDEX.md` / `RETENTION.md` / `DEBT.md` / `TOMBSTONES.tsv` 机器生成。
3. 生成文件头写 `<!-- generated: do not edit -->`，禁止手改；手改会被 `check-index` 覆盖并报错。

## 2. doc_kind 枚举（封闭 7 类）

| doc_kind | 职责 | 目录 | 寿命 |
| --- | --- | --- | --- |
| `prd` | 为什么做、做到什么程度、不做什么 | `prd/` | 工作项周期，方向变更后退役 |
| `spec` | 系统应当如何，含 AC | `specs/` | **快照**：关闭即退役，落成测试后删除 |
| `design` | 模块当前的技术形状 | `designs/` | 模块存续期，被取代即退役 |
| `explainer` | 面向人的讲解产物（HTML 等） | `explainers/` | **可重建即 R=0** |
| `note` | 调研、实验、一次性分析 | `notes/` | 按 [03 §4](03-lifecycle.md) 公式 |
| `adr` | 不可逆决策及理由 | `decisions/` | **永久**，只增不改 |
| `glossary` | 术语定义 | 根目录 | **永久**，就地更新 |

> **新类型 = 新 ADR**。不允许为「这次比较特殊」临时造类型。参考实现里 `doc_kind` 涨到 27 种，就是这么开始的。

## 3. 命名规则

| 对象 | 规则 | 示例 | 禁止 |
| --- | --- | --- | --- |
| 工作项 spec | `specs/<ID>/spec.md` | `specs/F033/spec.md` | `specs/新功能.md`、`specs/2026-08-11-xxx.md` |
| 无工作项的 spec | `specs/<SLUG>/spec.md` | `specs/PMF-SPEC-003/` | 复用已删除的 SLUG |
| 设计 | `designs/<模块>-<主题>.md` | `designs/plugin-network.md` | `design-final-v2.md` |
| 讲解 | `explainers/<主题>.html` | `explainers/session-flow.html` | `讲解-最新.html` |
| ADR | `decisions/NNNN-<slug>.md`，4 位递增，永不复用 | `decisions/0007-spec-in-repo.md` | `decisions/adr-new.md` |
| 笔记 | `notes/YYYY-MM-<slug>.md` | `notes/2026-10-redis-latency.md` | `notes/临时.md` |

- 文件名一律 **kebab-case**，禁空格、禁中文、禁大写（SLUG 例外）。
- 禁用 `final`、`new`、`old`、`v2`、`tmp`、`draft`、`copy` 作为文件名成分。版本语义由 `status` + `supersedes` 表达。
- `specs/` 下目录名必须等于 frontmatter `id`。

> **为什么不用日期前缀（D2 已定）**：日期是元数据，不是身份。文件一旦重命名，日期就会漂移或撒谎。需要按时间浏览时由 `INDEX.md` 提供排序视图。

## 4. 记忆分层：按寿命分，不按话题分

不同寿命的知识混在一起，是文档腐烂的根因。

| 层 | 内容 | 载体 | 寿命 | 失效时 |
| --- | --- | --- | --- | --- |
| **承重** | 行为、边界、回归 | 测试与代码 | 与代码同寿 | 测试失败 |
| **决策** | 不可逆选择及理由 | `decisions/`（ADR） | 永久只增 | 新 ADR 取代 |
| **词汇** | 术语、禁用同义词 | `GLOSSARY.md` | 永久 | 改定义需 ADR |
| **脚手架** | spec / design / prd | `specs/` `designs/` `prd/` | 工作项周期 | 退役 → 删除 |
| **快照** | 调研、实验、讲解 | `notes/` `explainers/` | 天级 | 到期删除 |
| **墓碑** | 已删文档的去向 | `TOMBSTONES.tsv` | 永久，一行 | 不失效 |

### 判层顺序（写之前先问）

1. **能写成测试吗？** 能 → 写测试，不要写文档。这是第一判据，也是 [ADR-0001](../decisions/0001-spec-as-snapshot.md) 的直接推论。
2. 它是**不可逆决策**吗？是 → ADR。
3. 它是一个**词**的定义吗？是 → GLOSSARY。
4. 它描述**系统该怎样**吗？是 → spec / design。
5. 它只是**证明某事成立**吗？是 → evidence，不要写成文档。
6. 以上皆否 → `notes/`，并接受它会被删。

> 大多数「为了对比实现与预期」的解释文档（S4 的同类）属于第 5 类，被误写成了第 4 类——这是文档堆积的主要来源。

## 5. 可定位性

| 目标 | 路径 | 步骤 |
| --- | --- | --- |
| 活着的 spec | 工作项 ID → `specs/<ID>/spec.md` | 1 |
| 已删的 spec | `grep <ID> docs/TOMBSTONES.tsv` → successor | 1 |
| 行为（当前） | 关键词 → 测试文件 → 顶部 `spec:` 锚点 | 2-3 |
| 决策为什么这样 | `decisions/` 按主题或 ID | 1-2 |

**代码侧锚点**：在模块入口文件顶部加一行

```ts
// spec: F033  (docs/specs/F033/spec.md)
```

这不是注释文档，而是**反向索引的种子**：改这段代码时，一条 grep 就回答「该看哪份 spec」。spec 删除后，锚点改指承接的测试文件——同一行，指向新家。

## 6. 反模式

| 反模式 | 危害 | 判据 |
| --- | --- | --- |
| 保留过期文档「作参考」 | 堆积的起点 | `retired` 超期未删 |
| 建 `archive/` 目录 | 把垃圾挪到看不见的地方 | 目录存在即违规 |
| 手改生成的索引 | 必然漂移 | 文件无 `generated` 标记或与生成结果不符 |
| 把生成的 HTML 当长期文档 | 描述旧版本（S4） | explainer 无 `regen` 或 `source_sha` 落后 |
| 同一事实两处描述 | 必然 drift | Truth-source matrix 冲突 |
| 决策写在 spec 正文里 | spec 删除时决策一起消失 | spec 中出现「我们决定」 |
| 文件名带版本 | 版本语义不可解析 | 命中禁用词表 |
| 无 owner 文档 | 不会被清理 | `owner: fairy` |

## 7. 交付形态与迁移缝（D1）

**当前：A（DSH 插件）**。插件提供检查命令、close gate 入口，以及 `spec-write` / `spec-close` 这类 skill；在 DSH 内零配置可用。

**后续：C（混合）**。为让迁移成本可控，现在就必须切好这一刀：

| 层 | 依赖 | A→C 的影响 |
| --- | --- | --- |
| 检查核心（解析、校验、保留期计算、删除执行） | 只依赖文件系统与 git | **零改动**，搬到 CLI 即可 |
| 配置与参数 | 配置文件 | 零改动 |
| 触发时机（何时跑、如何阻断） | DSH 插件 / git hook / CI | 需要重写，但很薄 |
| 人机交互（解释结果、建议下一步） | skill 提示词 | 措辞重写，逻辑可复用 |

**铁律**：检查核心不得 import 任何 harness 依赖；凡是「什么时候跑」的逻辑，都不许进核心。这样 A→C 只是把触发层换掉。

## 8. 写入门槛（比模板更能抑制堆积）

模板让文档长得整齐，门槛决定文档该不该存在。

| 闸门 | 问题 | 不过则 |
| --- | --- | --- |
| G0 可执行 | 能写成测试吗？ | 写测试 |
| G1 寿命 | 一年后还有人读吗？ | 写 `notes/`，或只留在 PR 描述里 |
| G2 唯一性 | 是否已有 canonical 描述？ | 改那一份，不要新建 |
| G3 结构替代 | 能否用 lint / 脚本 / 类型表达？ | 用结构表达 |

对 ADR 再加两道（缺一不写）：

- **难撤销**：可逆的小决定不写 ADR。
- **无反直觉**：不写下来也不会让人惊讶的选择，不写。

> 推论：**一个正常迭代不应产生 ADR**。ADR 频繁出现，通常说明方向在反复推翻。

## 9. 与现有仓库的共存

- **baseline 迁移**：先在存量仓库跑一次全量检查，违规写入 `docs-baseline.json`，此后只对新增违规阻断。
- 存量文档不强制立刻改造，但**被改动时必须达标**（触碰即治理）。
- `docs/.pmf-ignore` 可排除路径，但每条必须带 `owner / reason / expiresAt / ticket`，到期报错（[05 §5.1](05-tooling.md)）。无到期日的豁免等同于永久放弃治理。
