# Project Memory Framework — Spec Bundle

一套用于治理「spec-driven development 下项目文档堆积、失效、找不到」的框架 PRD。

核心立场（2026-10-25 决策，见 [ADR-0001](decisions/0001-spec-as-snapshot.md)）：**代码是 ground truth，测试是承重墙，文档是脚手架**。文档按需而生、按时而死。

本目录本身即该框架的目标形态：多文件、有 frontmatter、有状态、有寿命。

## 安装

一条命令，零配置：

```bash
dsh plugin add @gwenlita52299/augean
```

等价入口：DSH Web 界面的 **Plugins** 页搜索 `@gwenlita52299/augean` 点安装。离线或未发布时用打包产物：

```bash
npm run pack                                   # 产出 dist/augean-pmf-0.2.0.tgz
dsh plugin add ./dist/*.tgz
```

装完即可用，**不需要任何配置文件**。工具默认作用于**当前会话打开的项目目录**（harness 的 working directory），不需要传路径：

| 默认行为 | 值 |
| --- | --- |
| 扫描目录 | `<项目>/docs/`；也可以只有 `pmf.config.json` 指到别处 |
| 保留期模式 | `fixed`（spec 30 / design 60 / prd 60 / note 30 天） |
| 动态开关 | 关闭。`pmf_enable_dynamic` 是显式动作，且不回溯 |
| 没有 `docs/` 时 | 直接说明「没有 docs 目录，什么都没检查」，不误报通过 |

要自定义，在项目根放一个可选文件（不写就用默认值）：

```json
{ "docsRoot": "docs", "exclude": ["node_modules", "templates"] }
```

### 升级与本地开发

| 场景 | 做法 |
| --- | --- |
| 从 npm 安装（默认） | profile 依赖是 `^0.2.0`。升级：改版本号 → `npm publish` → 重新 `dsh plugin add @gwenlita52299/augean` |
| 本地联调 | `dsh plugin add ./pmf`（目录安装 = 链接，改完重启即生效，不用发版） |
| 离线 / 私有环境 | `npm run pack` → `dsh plugin add ./dist/*.tgz`（快照，升级要重新装） |

发布后 profile 里是真实目录拷贝，不是源码链接——所以**改 `pmf/**` 对已装副本无效**，要么发新版本，要么改用目录安装联调。

装完可用 `pmf` 命令冒烟：`pmf check --root .`。

> npm 新包名不允许大写字母，所以 scope 与包名都是小写（`Gwenlita52299` → `gwenlita52299`，`Augean` → `augean`）。首次发布：`cd pmf && npm publish`，需要先在 npm 上创建或确认该 scope 归你所有。

## 怎么读

| 文档 | 回答什么问题 | 读者 |
| --- | --- | --- |
| [prd/00-prd.md](prd/00-prd.md) | 要解决什么、做到什么算成功、不做什么、已定哪些决策 | 所有人，先读这份 |
| [notes/2026-10-research-memory-frameworks.md](notes/2026-10-research-memory-frameworks.md) | 三个开源仓库怎么处理 memory/spec，能借什么、不借什么 | 设计者 |
| [prd/02-design.md](prd/02-design.md) | 目录契约、文档类型学、记忆分层、A→C 迁移缝 | 实现者 |
| [prd/03-lifecycle.md](prd/03-lifecycle.md) | 文档怎么生、怎么退役、保留期怎么算、怎么删 | 维护者 |
| [prd/04-spec-contract.md](prd/04-spec-contract.md) | 一份 spec 的字段模板与 AC→测试契约；explainer 契约 | 写 spec 的人 |
| [prd/05-tooling.md](prd/05-tooling.md) | 七个命令分别做什么，哪些规则被强制 | 实现者 |
| [prd/06-rollout.md](prd/06-rollout.md) | 怎么在存量项目上落地、怎么度量、会怎么失败 | 落地负责人 |
| [prd/07-open-questions.md](prd/07-open-questions.md) | 还没定的 8 个问题 | 所有人 |
| [decisions/0001-spec-as-snapshot.md](decisions/0001-spec-as-snapshot.md) | 为什么 spec 是可弃快照（改变全局形态的那个决定） | 所有人 |
| [GLOSSARY.md](GLOSSARY.md) | 术语定义与禁用同义词 | 写文档时查 |

## 状态

- **版本**：v0.4
- **阶段**：PRD + 可运行插件（P0 / P1 / P2 已实现，含四个 skill）
- **形态**：先做 DSH 插件（A），核心与 harness 解耦，为后续迁 CLI（C）留缝
- **保留期**：开关默认 `fixed`（spec 30 / design 60 / note 30 天），显式开启 `dynamic` 后只统计开启之后的数据，不回溯
- **未决**：见 [07](prd/07-open-questions.md)，其中「保留期参数校准」阻塞 `dynamic` 模式上线（`fixed` 模式可用）

## 实现

代码在 [`pmf/`](pmf/)，既是 DSH 插件包（`@local/pmf`），也能独立当 CLI 用——这层分离是 [02 §7](prd/02-design.md) 要求的迁移缝。

| 入口 | 位置 | 说明 |
| --- | --- | --- |
| 检查核心 | [`pmf/lib/`](pmf/lib/) | 只依赖 fs + git，不 import 任何 harness 模块 |
| CLI | [`pmf/bin/pmf.mjs`](pmf/bin/pmf.mjs) | `check` / `index` / `retention` / `expire` / `evidence` / `enable-dynamic` |
| 插件 | [`pmf/index.js`](pmf/index.js) | 5 个工具：`pmf_check`、`pmf_evidence`、`pmf_retention`、`pmf_expire`、`pmf_enable_dynamic` |
| 技能 | [`pmf/skills/`](pmf/skills/) | 4 个：`spec-write`、`spec-close`、`spec-sync`、`spec-gc` |
| 讲解产物 | [`explainers/pmf-overview.html`](explainers/pmf-overview.html) | 项目说明页，`R=0`，源一变即失效，重建：`node explainers/build-pmf-overview.mjs` |
| 测试 | [`pmf/test/`](pmf/test/) | 29 项，`cd pmf && node --test test/*.test.mjs` |

实现与 spec 的六处偏差记在 [05 §6.1](prd/05-tooling.md)。

## 约定

- 除根目录入口文件（`README.md`、`AGENTS.md`、`CLAUDE.md`）外，每份文档必须有 frontmatter：`doc_kind`、`id`、`status`、`created`、`updated`、`owner`。
- 状态只有 `draft / active / retired`。没有 `superseded`、`deprecated`、`archived`——退役就是退役，等删。
- 术语以 [GLOSSARY.md](GLOSSARY.md) 为准，不得另造同义词。
- 文档间引用一律用相对路径 Markdown 链接，禁止「见上文」这类无锚点指代。
- 本 bundle 的文档都是 `draft`/`active`，尚无 `retired`；一旦本框架被采纳，`notes/` 与 `prd/` 会按 [03](prd/03-lifecycle.md) 的公式进入退役队列。
