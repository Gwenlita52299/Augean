# @gwenlita52299/augean

DSH 插件：**项目文档的寿命管理**。让文档按需而生、按时而死——活着的能被找到，死掉的能被删掉，行为由测试承载而不是由文档描述。

零配置：装上即作用于当前会话打开的项目，不需要任何配置文件。

## 安装

```bash
dsh plugin add @gwenlita52299/augean
```

也可以在 DSH Web 界面的 **Plugins** 页搜索 `@gwenlita52299/augean` 点安装。离线安装：

```bash
npm pack .            # 产出 gwenlita52299-augean-x.y.z.tgz
dsh plugin add ./gwenlita52299-augean-x.y.z.tgz
```

## 工具

| 工具 | 做什么 |
| --- | --- |
| `pmf_check` | 结构检查：frontmatter 必填、枚举、日期、ID 唯一、断链、禁用文件名 |
| `pmf_evidence` | 验收标准 → 测试的核对，close gate |
| `pmf_retention` | 保留期模式、λ、每份退役文档的到期日 |
| `pmf_expire` | 到期删除（默认 dry run），写墓碑 |
| `pmf_enable_dynamic` | 显式开启动态保留期，不回溯 |

工具默认作用于**当前会话的项目目录**；需要指定别的项目时传 `root`。

## 技能

| 技能 | 干什么 |
| --- | --- |
| `spec-write` | 把一个需求写成**能关闭**的 spec |
| `spec-close` | 核对 AC → 测试，把不可测的转成 ADR，然后退役 |
| `spec-sync` | 代码改动后找出哪些 spec 开始撒谎了 |
| `spec-gc` | 周期性清理：dry run → 申请 → 删除 |

## 零配置的默认行为

| 项 | 默认 |
| --- | --- |
| 扫描目录 | `<项目>/docs/` |
| 保留期模式 | `fixed`：spec 30 / design 60 / prd 60 / note 30 天 |
| 动态保留期 | 关闭。开启后只统计 `enabled_at` 之后的数据，已冻结的天数永不重算 |
| 生成物（explainer） | 有 `regen:` 即可重建 → 保留期 `0`，源一变就该重建 |
| 没有 `docs/` 时 | 明确报「没有 docs 目录，什么都没检查」，不误报通过 |

自定义（可选，不写就用默认值）：项目根放 `pmf.config.json`。

```json
{ "docsRoot": "docs", "exclude": ["node_modules", "templates"] }
```

## CLI

包内同时提供 CLI，不依赖 DSH：

```bash
pmf check --root .        # 结构检查
pmf evidence --spec F033  # close gate
pmf retention             # 保留期与到期日
pmf expire --apply        # 执行删除（不加 --apply 即 dry run）
pmf enable-dynamic        # 开启动态保留期
pmf index                 # 重建 INDEX.md 与 .doc-index.json
```

检查核心只依赖文件系统与 git，不 import 任何 harness 模块——所以它既能在 DSH 里用，也能当独立 CLI 用。

## 许可证

MIT
