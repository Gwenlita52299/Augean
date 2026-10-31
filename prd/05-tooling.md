---
doc_kind: spec
id: PMF-SPEC-005
status: draft
created: 2026-10-25
updated: 2026-10-31
owner: fairy
related: [PMF-SPEC-003, PMF-SPEC-004]
---

# 工具与工作流

约束必须**分层**：能机器判定的交给检查器（不可绕过），需要判断力的交给工作流（提示，不阻断）。混在一起，要么检查器太吵被关掉，要么工作流太软没人遵守。

## 1. 分层原则

| 层 | 机制 | 强度 | 适用 |
| --- | --- | --- | --- |
| L1 结构 | frontmatter、ID 唯一、链接可达 | **硬阻断** | 机械可判定 |
| L2 关系 | 索引一致性、取代回填、墓碑完整 | **硬阻断**（仅改动文件） | 可解析但有传递性 |
| L3 寿命 | 保留期计算、到期删除、生成物 stale | **硬阻断 + 自动执行** | 纯计算 |
| L4 语义 | AC 是否真被测试覆盖、drift | 提示 → 人工 | 需判断力（D6） |

> 核心取舍：**宁可少检查，不可假检查**。误报率高的检查器会在两周内进忽略列表。

## 2. 命令

| 命令 | 作用 | 产物 / 副作用 |
| --- | --- | --- |
| `build-index` | 扫描 frontmatter，建关系图 | `docs/.doc-index.json` |
| `check-docs` | 结构与链接校验 | 终端 / JSON |
| `check-index` | 索引与文件集合一致、生成文件未被手改 | 终端 |
| `check-evidence` | AC→测试核对、证据有效性 | 终端 |
| `retention` | 计算 λ 与每份退役文档的到期日 | `docs/RETENTION.md` |
| `expire` | **执行**到期删除并追加墓碑 | 删文件 + `TOMBSTONES.tsv` |
| `docs-debt` | 孤儿、stale、无 owner 汇总 | `docs/DEBT.md` |

### 2.1 `retention`：把 03 §4 的公式变成数字

```
λ = 近 8 周「新增 + 实质修改」的文档数 ÷ 8
R = clamp((N_target ÷ λ) × m_kind × w(C), 3, 90)
```

| 规则 | 说明 |
| --- | --- |
| λ 用 git 历史算 | `git log --diff-filter=AM --since=...`，不读人工统计；**git 不可用时 λ 记 unavailable，一律留在 fixed** |
| **R 在退役那一刻冻结** | 写进 `.pmf-state.json` 的 `retire_r`（**不**放生成视图：索引每次重建，冻结值会被洗掉）；之后 λ 变化不改已定的到期日 |
| 参数从配置读 | `pmf.config.json` 或 `docs/pmf.config.json`；文档只解释公式，不给数字 |
| 输出可审计 | `RETENTION.md` 每行：ID、退役日、R、到期日、剩余天数 |

#### 2.1.1 开关：默认关，开启后只往前算

`mode: fixed`（默认）时 `retention` **不算 λ**，直接读固定值。只有 `mode: dynamic` 且过了冷却期才算公式（[03 §4.6](03-lifecycle.md)）。

| 规则 | 说明 |
| --- | --- |
| `retention --enable-dynamic` | 写入 `enabled_at = now()`；带日期参数一律报错，防止回填 |
| λ 只取开启之后 | `git log --since=<enabled_at>`，开启前的历史不参与 |
| 冷却期 | 不满 `warmup_weeks` 或样本数 < `min_samples` → 仍用 fixed，`RETENTION.md` 标注 `mode: fixed (warmup)` |
| 除零保护 | λ 下限 0.25；低于则 R 取 clamp 上限 |
| **不回溯** | 只对新退役文档写 `retire_r`；已有记录一律不改，切回 fixed 也不改 |
| 审计列 | `RETENTION.md` 增列 `mode` / `enabled_at` / `samples` |

**`expire` 不感知模式**：它只读 `retired_at + retire_r`，无论这个 R 来自 fixed 还是 dynamic。模式切换因此不会让已定的删除动作发生位移。

### 2.2 `expire`：到期就删

| 步骤 | 行为 |
| --- | --- |
| 1 | 找 `status: retired` 且 `retired_at + retire_r ≤ today` |
| 2 | 跑删除门（[03 §5](03-lifecycle.md)）：spec 的 AC 是否已全部落成测试 |
| 3 | 检查入链：若有引用，改指 `successor`（测试路径 / ADR），改不了则延长一个 `R` 并记账 |
| 4 | 删文件，追加墓碑行 |
| 5 | 重建索引 |

**为什么可以自动删**：git 保留了全文，删除可逆；仓库内只留一行墓碑。需要人审批的删除，最终都不会发生（P1 的成因）。**自动删除是唯一能真正解决 P1 的机制。**

### 2.3 `check-evidence`：AC 与测试

- `test:` 路径存在；`::case` 能在文件里匹配到用例名（启发式，允许手工豁免）。
- 测试未被整体 `skip` / `describe.skip`。
- AC 标 `[-]` 但无 ADR ID → error。
- 未完成 AC 出现 `follow-up` / `deferred` / `后续迭代` 等措辞 → error。
- close 时：全部 `met`（或 `deleted` 且有 ADR）→ 允许退役；否则阻塞。

### 2.4 `check-docs` 其余检查项

| 检查项 | 级别 |
| --- | --- |
| 必填字段齐全（含 `retired_at` 当 status=retired） | error |
| `doc_kind` / `status` 在枚举内 | error |
| `id` 全库唯一（含墓碑，防止复用） | error |
| `created ≤ updated`，格式 `YYYY-MM-DD` | error |
| Markdown 相对链接可达 | error |
| `related` / `supersedes` 中的 ID 存在 | error |
| 生成文件被手改（内容 hash 与生成结果不符） | error |
| 正文出现 `TODO` / `待补` | warn |
| 文件名命中禁用词表（`final`/`v2`/`tmp`…） | warn |

## 3. 工作流（L4，给 agent 用）

| Skill | 触发 | 输入 | 输出 |
| --- | --- | --- | --- |
| `spec-write` | 开新工作项 | 一句话需求 | 按 04 骨架生成 spec，AC 带 ID |
| `spec-sync` | 代码改动后 | diff | 受影响的 spec/AC 清单，提示「这条 AC 现在还是真的吗」 |
| `spec-close` | 工作项完成 | spec ID | 跑 close gate → 生成 evidence → 退役 → 记墓碑 |
| `spec-gc` | 周期性 | 无 | 跑 `retention` + `expire`（dry → 申请 → apply），报告删了什么 |

**`spec-sync` 是解决 S1 的抓手**：它不生成文档，只把 diff 映射到受影响的 AC，强迫做一次「这条 AC 还是真的吗」的判断。

**`spec-close` 是整套框架的收口动作**：AC→测试核对、退役、墓碑。它没跑通，前面的机制都是装饰。

## 4. Git 集成

| 钩子 | 动作 | 失败策略 |
| --- | --- | --- |
| pre-commit | `check-docs --changed-only` | 阻断 |
| pre-push | `check-docs && check-index` | 阻断 |
| CI | 全部检查器 + `retention`（只算不删） | 阻断 |
| 每周任务 | `expire` | 提交删除 PR（可 review、可回滚） |

**删除走 PR 而不是直接推**：一周一次的删除 PR 天然形成 review 点，既不需要人工审批每一条，也不至于无人知晓。

**baseline**：存量项目首次全量扫描后写 `docs-baseline.json`，此后只对**新增**违规阻断。否则第一天几千条报错，工具直接死。

### 4.1 豁免必须过期

任何例外都是一次**带到期日的借贷**。`docs/.pmf-ignore`：

```json
{ "entries": [
  { "path": "legacy/", "owner": "fairy", "reason": "历史文档，待归档",
    "expiresAt": "2027-01-31", "ticket": "F120" }
] }
```

五个字段缺一报错；最长 180 天；到期即 error（不是 warn）；只能删或续期，不自动失效。

## 5. 不做什么

- 不做语义相似度查重（误报太高）。
- 不做「文档覆盖率」这类可以造假的指标。
- **不自动判断 AC 是否真被测试覆盖**（L4，D6 靠人工）；工具只核对「测试文件与用例名存在」。
- 不要求 `adr` / `glossary` 参与证据检查。

## 6. 实现顺序

| 阶段 | 内容 | 为什么这个顺序 |
| --- | --- | --- |
| P0 | `check-docs` 的 frontmatter + ID 唯一 + 链接 | 没有 frontmatter 就没有后面一切 |
| P1 | `build-index` + `check-index` + `spec-write` / `spec-close` | 让「关闭时落成测试」成为默认路径 |
| P2 | `retention` + `expire` + 墓碑 | **真正的清理能力，缺了它框架只是加了约束** |
| P3 | `check-evidence` 细校 + baseline + CI 定时删除 PR | 打磨 |

> P0 只做一件事就能拿到大部分收益：**没有 frontmatter 的文档不让合**。

### 6.1 实现现状（v0.1，`pmf/`）

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| P0 | **已实现** | `check`：frontmatter 必填、枚举、日期、ID 唯一、断链、related 解析、禁用词 |
| P1 | **已实现** | `index`（`INDEX.md` + `.doc-index.json`）+ 四个 skill（`spec-write` / `spec-close` / `spec-sync` / `spec-gc`） |
| P2 | **已实现** | `retention` / `expire` / 墓碑 / 开关 |
| P3 | 部分 | `check --changed-only` 与 `pmf hooks install` 已实现（§4 的 pre-commit / pre-push）；证据细校、baseline、CI 定时删除 PR 未开始。多端方案见 [08](08-multi-surface.md) |

**九个实现偏差**（代码是事实，文档已按此校正）

1. 冻结值存 `.pmf-state.json`，不进索引——索引是派生视图，重建会抹掉状态。
2. `RETENTION.md` 未单独生成，`retention` 直接输出到终端与工具结果；何时落盘待定（[07](07-open-questions.md)）。
3. λ 在无 git 仓库时**不报错**：记 `unavailable`，模式留 fixed。示例：本 bundle 自身就不是 git 仓库。
4. `enable-dynamic` 只 patch 原始配置里的两个字段，**不落盘合并后的默认值**——否则会冻结默认值、并冲掉用户自设的 `docsRoot`/`exclude`。
5. 新增第 5 个工具 `pmf_enable_dynamic`（原设计只有 4 个）。
6. `explainer` 的 `R = 0` 在 fixed 模式下同样生效——它依据「能否重建」，不是统计值。
7. 四个 skill 以 markdown + frontmatter 存放于 `pmf/skills/`，运行时由 `skills.js` 解析后注册为 `source: 'runtime'`；skill 内容因此可以脱离代码编辑。
8. skill 注册走可选注入：profile 没有 `skills` 服务时插件仍激活，只是没有 skill 可调用。
9. `docs-debt` 未实现，`spec-gc` 里如实标为未实现，且明确「孤儿不在本 skill 删除范围内」——不做拿不到的承诺。
10. 扫描器识别 `.html`：开头的注释 frontmatter 会被剥离后走同一套校验，`href` 也纳入断链检查。这样 explainer 能被检查、能进保留期，而不是游离在机制之外。
11. `source_sha` 不用提交号，用**源文件内容指纹**（`lib/sourcehash.js`），并要求 explainer 声明 `source_paths`；检查器重算比对，不一致报 `EXPLAINER_STALE`。这样 M6 在无 git 的项目上也可度量——否则它只是句口号。
12. 零配置靠 root 解析顺序：显式参数 → 插件配置 → **会话 `workingDirectory`** → 进程 cwd。因此不传 `root` 也能作用于用户当前打开的项目，无需任何配置文件。
13. 发布形态为 npm 包 `@gwenlita52299/augean`（`files` 白名单 22 项，含 `skills/`、`locale/`、`icon.svg`），安装入口是 `dsh plugin add` 或 Web 的 Plugins 页；离线走 `dist/*.tgz`。包内不含测试与文档，测试在 `prepublishOnly` 里跑。
14. 目标目录没有 `docs/` 时不静默通过：明确报「没有 docs 目录，什么都没检查」。空集通过是假检查的典型形态。
15. `--changed-only` 只收窄**报告**、不收窄扫描：ID 唯一、`related` 解析需要全集才能判定。删除文件导致的他处断链不在 staged 集里，由 pre-push 的全量检查兜底。

**一个被实现推翻的检查规则**

`PLACEHOLDER_TEXT`（正文出现 `TODO`/`待补`）最初直接扫原文，结果**把描述该规则的文档本身判成违规**（2 处误报）。修法：先剥掉围栏代码块与行内代码再匹配。教训写回 §1 的「宁可少检查，不可假检查」——假报的成本由所有读者承担。

## 7. A→C 迁移约束（D1）

检查核心（解析、校验、保留期、删除）**只允许依赖文件系统和 git**。`spec-*` skill 只负责「什么时候调用 + 怎么解释结果」。

验收方式：把核心代码搬到独立 CLI 包，不修改任何 import 即可跑通——做不到就说明耦合了。
