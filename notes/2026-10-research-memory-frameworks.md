---
doc_kind: note
id: NOTE-RESEARCH-001
status: active
created: 2026-10-25
updated: 2026-10-25
owner: fairy
related: [PMF-PRD-000, PMF-SPEC-002]
---

# 调研：三个仓库如何处理 memory / 文档 / spec

调研对象（本地克隆实读，非摘要）：

| 仓库 | 定位 | 规模（实测） |
| --- | --- | --- |
| [cursor/plugins · pstack](https://github.com/cursor/plugins/tree/main/pstack) | 严谨的 agent 工作流与原则库 | 139 md / 61 skill / 0 ADR |
| [mattpocock/skills](https://github.com/mattpocock/skills) | 个人常用 skill 集合，带范围治理 | 133 md / 38 skill / 2 ADR |
| [zts212653/clowder-ai](https://github.com/zts212653/clowder-ai) | 完整的 multi-agent 产品，文档治理最重 | 853 md / 59 skill / 10 ADR |

三者体量差 6 倍，但**在同一个地方失败**（见 §4），这比它们各自的成功做法更有信息量。

---

## 1. pstack：文档是失败选项

核心立场在 `skills/correct` 里排得很直白——修正措施按优先级排列，**「写成文档」排第 4**，理由是 "Nothing fails when an agent skips a rule, so this comes last."。配套原则 `principle-encode-lessons-in-structure`："Encode the rule as a lint, metadata flag, runtime check, or script instead of more text"，以及"If the fix is structural, only use the structural fix. The instruction is the symptom."

| 机制 | 做法 |
| --- | --- |
| 位置即语义 | 无日期、无编号、无状态前缀。用户级 `~/.cursor/rules/`，项目级 `.cursor/skills/` |
| 特性图 | README 索引 + 每特性一个 kebab 文件 + 四个固定 H2（Sub-features / How to get to it / Driving it / Gotchas），子特性带短 ID |
| 模板即校验器 | `check-plan.mjs` 校验计划文件的节序 |
| 证据纪律 | "Check a box only when its evidence exists: a file, a log line, a screenshot, a test run, or a SHA" |
| 状态机 | decision log 的 `result: reverted / open / INCONCLUSIVE`；recall 的 `[merged #N]` `[reverted #N]` |
| 追加式历史 | "A wrong call gets a new row that supersedes it. Never edit or delete history." |
| 清理 | "Delete it when the work lands"；"When a reference has no novel content, delete it rather than leaving a stub" |

**关键洞察**：`/maintain-verification-skill` 的 sync commit 记录了 "the check can keep passing while it describes code that no longer exists" —— **检查通过 ≠ 描述正确**。这直接推出本框架的 `verified_at: <sha>` 字段设计（见 04 §1）。

**局限**：除计划脚本外无 schema 校验、无链接校验、无过期告警；`decisions.tsv` 默认不入 git；特性图新鲜度靠人记得跑（原文承认 "ideally from a scheduled automation so nobody has to remember"）；**完全回避需求对齐**——假设 spec 即代码，对「这个需求该不该存在」几乎没有工件。

---

## 2. mattpocock/skills：用门槛而非模板抑制堆积

最值得学的是**准入门槛**，而不是它的文档结构。

| 机制 | 做法 |
| --- | --- |
| SCOPE 双条件 | 一个提案只有同时满足「Observed failure（真实会话里出过什么错）」和「Fits the philosophy」才留下。假设性的 "it would be better if…" 不算 |
| 拒绝库 | `.out-of-scope/*.md`，一概念一文件，含 `## Why this is out of scope` + `## Prior requests` 账本（记录历史上被拒的 issue 号） |
| 理由的质量要求 | 拒绝理由必须 durable，禁止"我们最近太忙"——那是 deferral，不是 rejection |
| ADR 三道闸门 | hard to reverse / surprising without context / real trade-off，缺一不写；模板只有 1-3 句 |
| 生命周期 | `in-progress/` → promoted → `deprecated/`。退役就**删**，不留坟场 |
| spec 观 | spec 是**可弃快照**："Treat it as disposable after the work ships."，不入版本库 |
| 写作规范 | 固定帧 What it does / When to reach for it / Common questions / It's working if / Where it fits；"The page is not the skill and not a copy of SKILL.md" |

**关键洞察 1**：门槛比模板更能防堆积。模板只会让垃圾文档长得更整齐。

**关键洞察 2**：把「不做什么」提升为一等工件。`.out-of-scope/` 解决的正是本项目痛点 S2（删减功能点）——被砍的功能转成一份「为什么不做 + 历史请求账本」的永久文件，重复提案直接引用，不必重新辩论。

**关键洞察 3（反面实证）**：`.out-of-scope/` 实际有 **9 个**文件，`SCOPE.md` 的「Already decided」只列了 **8 个**，漏掉 `lazy-load-writing-for-agents.md`。人工维护的索引在单人、38 个 skill、无自动化的条件下，**已经漂移了**。这是本框架坚持「索引必须生成」的直接证据。

---

## 3. clowder-ai：把验收对账做成了机器可读

这是三者中文档治理最完整的一个，也是**过度设计风险最高**的一个。

| 机制 | 做法 |
| --- | --- |
| Close Gate Report | `feature-specs/<日期>-<slug>-close-gate.yaml`：`feature_id / spec_path / canonical_feature_path / head_sha / ac_matrix[] / summary / verification / fresh_context_review / dogfood / contract_drift_check / advisory_warnings` |
| AC 三出口 | 每条 AC 是 `status: met/unmet/deleted` + `evidence[{kind, ref, description}]` + `resolution`。unmet 只有三条合法出路：立刻做 / 删掉 / 签字例外，**"没有第四选项"**——`follow-up`、`deferred`、`next phase` 不是合法路径 |
| 真源矩阵 | spec 内 `Truth-source matrix`：Fact / Canonical owner / Consumer / Failure behavior |
| 不变量表 | `Invariants` 每行右侧直接挂可执行证据 |
| 生成式索引 | 每目录 `index.md` 带 `generated: true`，由 `scripts/docs-discovery/generate-index.mjs` 生成；"派生 index 由生成器独占维护，不随手工 doc commit 顺手刷" |
| 最小 frontmatter + strict-delta | 只强制 `doc_kind` + `created`（+ `feature_ids/topics`），`--strict-delta` 明确 "legacy debt is allowed" |
| 过期豁免台账 | `.dir-exceptions.json` 每条 `path / owner / reason / expiresAt / ticket`；到期由脚本报错 |
| 检索三入口 | `graph_resolve(anchor)` / `search_evidence(query)` / `list_recent(scope)`；low-hit 时自动提示换入口 |
| 规则分级 | `sop-definitions/*.yaml` 每条 hard_rule 显式标注 `manual_only` 还是机器谓词 |
| 活跃层唯一清单 | ROADMAP 只放活跃项，done 后移除；正文永久保留 |

**关键洞察**：最硬的「失效检测」不是查文档内容，而是查**豁免到期**（`.dir-exceptions.json` 的 `expiresAt`）。这条比任何语义查重都便宜且不可绕过——本框架采纳（见 05 §7）。

**关键洞察 2**：`unmet` 只有三个出口、且用脚本检查「follow-up 尾巴」（`check-followup-tails.mjs`），是把「无限延期」这个行为模式当作缺陷来治。

**局限（重要，避免照搬）**：

- 332 份 feature 文档 + 87 份架构 + 10 余个治理 skill + 275 行 SOP。**治理本身成了项目**。
- `doc_kind` 契约与实现漂移：ADR 只定义 7 种，实际出现 **27 种**值。
- spec 有**三个家**（根 `feature-specs/`、`docs/feature-specs/`、`docs/plans/`）且格式不一——它自己没解决「找不到 spec」。
- `docs/README.md` 只有 657 字节，不承担地图职责；目录边界靠 skill 里的散文约定。
- 强耦合自有运行时（MCP 记忆服务、Redis session chain），纯 Git 项目不能直搬。

---

## 4. 三方共同的失效点（本框架设计的直接依据）

| 共同失效 | 证据 | 本框架的对策 |
| --- | --- | --- |
| **人工索引必然漂移** | mp-skills 漏列 1/9；clowder `doc_kind` 27 种；pstack 特性图靠人记得跑 | 索引一律生成、文件头标 `<!-- generated -->`、禁止手改（02 §1） |
| **「一份事实两处描述」普遍存在** | clowder 的 spec 三个家；mp-skills 技能约定 `docs/adr/` 但自己用 `.agents/adr/` | 单一真源 + Truth-source matrix（04 §3） |
| **检查通过 ≠ 描述正确** | pstack "the check can keep passing while it describes code that no longer exists" | `verified_at: <sha>` 字段 + stale 检测（04） |
| **延期以「话术」形式合法化** | clowder 需要 `check-followup-tails.mjs` 专门查这件事 | unmet 三出口（06 §5） |
| **文档写成第二优先，行动是第一** | pstack 把写文档排第 4；mp-skills 用门槛而非模板 | 写入门槛 + 分层（02 §4、§8） |

## 5. 三方分歧（必须选边的地方）

| 议题 | pstack | mp-skills | clowder | 本框架取（2026-10-25 决策） |
| --- | --- | --- | --- | --- |
| spec 寿命 | 计划完成后删 | **可弃快照**，不入库 | 长期入库 + close gate | **快照派**：落成测试即删（[ADR-0001](../decisions/0001-spec-as-snapshot.md)） |
| 命名 | 无 ID，位置即语义 | ADR 编号 | 日期前缀 | **ID 优先，日期进 frontmatter**（D2） |
| 强制手段 | 脚本/lint 优先 | 散文 + 人工 | 脚本 + CI | **分层：结构硬阻断，语义只提示**（[05 §1](../prd/05-tooling.md)） |
| 归档 | 直接删 | 删除 | 无统一归档，靠 ROADMAP 移除 | **退役即删，无归档**（D5） |

> 注：本文初稿曾主张「资产派」，10-25 决策推翻为快照派，理由记录在 [ADR-0001](../decisions/0001-spec-as-snapshot.md)。保留这条修订痕迹，是因为「为什么改主意」比「改成了什么」更值得留。

## 6. 明确不采纳的做法

| 不采纳 | 来源 | 理由 |
| --- | --- | --- |
| 332 份 feature 文档的分层（features/plans/review/census/...） | clowder | 目录种类超过 6 类后，选择成本超过收益 |
| 收尾需独立 reviewer + operator 签字 + 跨族 review | clowder | 单人/小团队会变成流程税 |
| 27 种 doc_kind | clowder（漂移结果） | 封闭 6 类，新增需 ADR |
| spec 放在 issue tracker 而非仓库 | mp-skills | 虽是快照派，但 spec 需与 evidence 同仓共置，才能被 CI 校验、被 `spec-sync` 关联 diff |
| 日期前缀命名 | clowder | 重命名时日期漂移或撒谎（07 D2） |
| 语义相似度查重 | 无（均未做） | 误报率高，两周内被忽略 |

## 7. 调研没能回答的问题

1. **语义 drift 如何自动发现**：三家都放弃了，本框架也只能降级为「降低发现成本」（07 D6）。
2. **多人协作时 owner 如何轮换**：三家都是单人/小团队或强流程，没有轻量答案。
3. **文档与 issue tracker 的双向同步**：clowder 靠 `feature_id` 手工对齐，没有可靠方案。
