---
doc_kind: spec
id: PMF-SPEC-008
status: draft
created: 2026-10-31
updated: 2026-10-31
owner: fairy
work_items: []
related: [PMF-SPEC-002, PMF-SPEC-005, PMF-SPEC-007, ADR-0002]
supersedes: []
superseded_by: []
verified_at: null
retired_at: null
---

# 多端文档治理：一个核心，三份契约，多个薄适配器

## Outcome

同一套检查核心（`pmf/lib/`）可以从五类端调用：DSH、MCP 客户端（Claude Code / Cursor / Codex 等）、只读 AGENTS.md 的 agent、本地 git 钩子、CI。任何一个端判定的结果都和其他端一致；会改动治理状态的操作只在 CI 上发生（[ADR-0002](../decisions/0002-write-authority-in-ci.md)）。这是 [07 §6](07-open-questions.md) A→C 迁移的执行方案：触发条件「出现第一个非 DSH 的使用者」视为已满足。

**本工作不引入**：服务端或数据库（git 就是同步通道）；新的 `doc_kind`；对 L4 语义检查的自动化（D6 仍靠人工）。

## 1. 三份契约

| 契约 | 内容 | 违反时 |
| --- | --- | --- |
| 数据 | 所有端只消费核心的 JSON 输出。每个 `--json` 载荷都是对象，带 `schema_version`、`core_version`、`command` | 端看到不认识的 `schema_version` → 拒绝解读，不猜 |
| 版本 | `pmf.config.json` 可声明 `requires`（`x.y.z` 或 `^x.y`）；核心不满足时 `check` 报 `CORE_VERSION` error | 两个端核心版本不同、结论不同 → 被这条规则挡住 |
| 写权 | 只读操作任何端可跑；改动 `.pmf-state.json` / `TOMBSTONES.tsv` / 配置的操作只在 CI，以 PR 落地 | 见 [ADR-0002](../decisions/0002-write-authority-in-ci.md) |

## 2. 端与职责

每个适配器只做三件事：**找根目录、决定何时跑、怎么呈现**。检查逻辑一行都不许进适配器（[02 §7](02-design.md) 铁律）。

| 端 | 适配器 | 承担的层（[05 §1](05-tooling.md)） | 写权 |
| --- | --- | --- | --- |
| DSH | `pmf/index.js`（已有） | L4 提示 + L1–L3 只读 | 无（AC-8） |
| MCP 客户端 | `pmf mcp`（stdio），与 DSH 共用一份工具清单 | 同上 | 无 |
| 纯指令 agent | `pmf init --target <claude\|codex\|cursor>` 导出 skill / AGENTS.md 片段，指向 `pmf … --json` | L4 | 无 |
| 本地 | CLI + `pmf hooks install`：pre-commit `check --changed-only`，pre-push `check` | L1–L2 硬阻断 | 无（AC-7） |
| CI | GitHub Action：PR 上全量 `check` + `evidence`；每周 `expire --apply` 开删除 PR | L1–L3 强制 | **唯一** |
| 人 | 生成视图（INDEX / RETENTION / DEBT）与 explainer | 只看 | 无 |

适配器代码放 `pmf/adapters/`，与 `pmf/lib/` 分开；`lib/` 不得 import `adapters/`。

## 3. skill 去端化

`pmf/skills/*.md` 里现有 18 处直接写 DSH 工具名 `pmf_*`。改为抽象动作（`check`、`evidence(spec)`、`retention`、`expire(dry)`），由各端在注册或导出时映射成自己的调用：DSH 工具、MCP 工具，或 `pmf <cmd> --json`。skill 正文的判断逻辑不变。

## Truth-source matrix

| Fact | Canonical owner | Consumer | Failure behavior |
| --- | --- | --- | --- |
| 检查结论 | `pmf/lib/` | 所有端 | 端自行判定 → 视为缺陷 |
| JSON 形状 | `SCHEMA_VERSION`（`pmf/lib/version.js`） | MCP、CI、页面 | 版本不认识即拒绝 |
| 核心版本要求 | `pmf.config.json` 的 `requires` | `check` | `CORE_VERSION` error |
| 哪些文件「改动过」 | git（staged 集，或 `<since>...HEAD`） | `check --changed-only` | 无 git → 报错，不当作空集 |
| 治理状态 | `.pmf-state.json`、`TOMBSTONES.tsv` | `retention`、`expire` | 只有 CI 写 |
| 工具清单 | 待定：从 `pmf/index.js` 抽出（AC-5） | DSH、MCP | — |

## Invariants

| Invariant | Test |
| --- | --- |
| `--changed-only` 只收窄报告，不收窄扫描：ID 唯一等全集规则仍生效 | `pmf/test/surfaces.test.mjs::changed-only keeps whole-set rules: a staged duplicate id is still caught` |
| 无 git 时 `--changed-only` 失败，不静默通过 | `pmf/test/surfaces.test.mjs::changed-only outside git fails loudly instead of passing an empty set` |
| 钩子不覆盖别人写的钩子 | `pmf/test/surfaces.test.mjs::hooks install never overwrites a foreign hook without force; uninstall removes only its own` |

## Existing behavior protection

| Existing behavior | Test |
| --- | --- |
| 不带 `--changed-only` 的 `check` 结论不变 | `pmf/test/integration.test.mjs::check reports structural defects and passes a clean set` |

## Implementation units

1. 数据与版本契约、`--changed-only`、git 钩子（本次完成：AC-1 至 AC-4）。
2. MCP 适配器，与 DSH 共用工具清单（AC-5）。
3. skill 去端化与 `init` 导出（AC-6）。
4. 写权收口与 CI（AC-7 至 AC-9）。
5. 多根 / 联邦：仍按 [07 §7](07-open-questions.md)，出现跨项目 spec 时再开。

## Acceptance criteria

- [x] AC-1: 每个 `--json` 载荷都是对象，带 `schema_version`、`core_version`、`command`；出错时同样输出带 `error` 字段的对象
      test: pmf/test/surfaces.test.mjs::every --json payload is an object with schema_version
- [x] AC-2: `pmf.config.json` 的 `requires` 不被核心版本满足时，`check` 报 `CORE_VERSION` error；caret 语义与 npm 一致（0.x 以 minor 为界）
      test: pmf/test/surfaces.test.mjs::requires: a core version outside the range is an error, inside passes
- [x] AC-3: `check --changed-only` 只报告 staged 文件里的违规；加 `--since <ref>` 时改为比较 `<ref>...HEAD`
      test: pmf/test/surfaces.test.mjs::changed-only reports only staged files, full check still sees everything
- [x] AC-4: `pmf hooks install` 写入带标记的 pre-commit / pre-push，可执行，遵守 `core.hooksPath`，子目录项目指向自身；`uninstall` 只删自己写的
      test: pmf/test/surfaces.test.mjs::hooks install writes executable marked hooks and the pre-commit hook blocks a bad staged doc
- [ ] AC-5: `pmf mcp` 以 stdio 提供与 DSH 相同的工具集，两者从同一份清单注册
- [ ] AC-6: skill 正文不出现任何端专属工具名；`pmf init --target claude` 导出到 `.claude/skills/`
- [ ] AC-7: CLI 的 `expire --apply` / `enable-dynamic` 在非 CI 环境默认拒绝，需显式 `--as-ci` 才执行（ADR-0002）
- [ ] AC-8: DSH 工具 `pmf_expire` 不再接受 `apply=true`，只做 dry-run（ADR-0002）
- [ ] AC-9: GitHub Action：PR 上跑 `check` + `evidence` 并评论；每周定时 `expire --apply` 开删除 PR

## Out of scope

- 跨仓库共享 ADR 与 ID 命名空间（[07 §7](07-open-questions.md)）。
- 实时同步、通知推送等需要常驻服务的能力。
- 为每个端单独定制检查规则：规则只有一份，端只决定何时跑。
