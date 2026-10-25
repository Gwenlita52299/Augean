#!/usr/bin/env node
/**
 * Generates explainers/pmf-overview.html.
 *
 * The page is a derived artifact: content lives here, output is disposable.
 * `source_hash` fingerprints every source it describes, so a stale page is
 * detectable without git and the page can be deleted and rebuilt at any time.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceHash } from '../pmf/lib/sourcehash.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const OUT = join(here, 'pmf-overview.html')

const SOURCE_PATHS = ['prd', 'decisions', 'pmf/lib', 'pmf/skills', 'README.md', 'GLOSSARY.md', 'pmf/index.js']

function firstCreated(stamp) {
  if (!existsSync(OUT)) return stamp
  const existing = readFileSync(OUT, 'utf8')
  const match = /^created:\s*(\d{4}-\d{2}-\d{2})/m.exec(existing)
  return match ? match[1] : stamp
}

const hash = sourceHash(root, SOURCE_PATHS)
const today = new Date().toISOString().slice(0, 10)
const created = firstCreated(today)

const html = `<!--
---
doc_kind: explainer
id: EXPLAINER-pmf-overview
status: active
created: ${created}
updated: ${today}
owner: fairy
source_sha: ${hash}
source_paths: [${SOURCE_PATHS.join(', ')}]
regen: node explainers/build-pmf-overview.mjs
cost: cheap
---
-->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Project Memory Framework — 是什么、为什么、怎么做</title>
<meta name="description" content="Project Memory Framework：让项目文档按需而生、按时而死的治理框架说明。">
<style>
  :root {
    --bg: #fbfbfa; --fg: #1f2328; --muted: #5b6470; --line: #e3e5e8;
    --card: #ffffff; --accent: #2f6f4f; --accent-soft: #e8f2ec;
    --warn: #8a4b16; --warn-soft: #fdf3e7; --code: #f3f4f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181a; --fg: #e7e9ec; --muted: #9aa4b0; --line: #2c3034;
      --card: #1d2023; --accent: #6cc294; --accent-soft: #1e2b25;
      --warn: #e0a468; --warn-soft: #2b2419; --code: #22262a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 56px 24px 96px; }
  nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 40px; }
  nav a {
    font-size: 13px; text-decoration: none; color: var(--muted);
    border: 1px solid var(--line); border-radius: 999px; padding: 5px 13px;
  }
  nav a:hover { color: var(--accent); border-color: var(--accent); }
  h1 { font-size: 34px; line-height: 1.25; margin: 0 0 14px; letter-spacing: -0.02em; }
  .lede { font-size: 18px; color: var(--muted); margin: 0 0 24px; }
  h2 {
    font-size: 22px; margin: 56px 0 16px; padding-bottom: 10px;
    border-bottom: 1px solid var(--line); letter-spacing: -0.01em;
  }
  h3 { font-size: 16px; margin: 28px 0 10px; }
  p { margin: 0 0 14px; }
  ul, ol { margin: 0 0 16px; padding-left: 22px; }
  li { margin: 6px 0; }
  code {
    background: var(--code); border-radius: 5px; padding: 1px 5px;
    font: 13.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre {
    background: var(--code); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px 18px; overflow-x: auto; margin: 0 0 16px;
    font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  pre code { background: none; padding: 0; font-size: inherit; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 14.5px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
  tbody tr:hover { background: var(--accent-soft); }
  .chips { display: flex; gap: 10px; flex-wrap: wrap; margin: 0 0 8px; }
  .chip {
    font-size: 13px; background: var(--accent-soft); color: var(--accent);
    border-radius: 8px; padding: 6px 12px; font-weight: 600;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: 0 0 18px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; }
  .card h4 { margin: 0 0 6px; font-size: 14px; }
  .card p { margin: 0; font-size: 13.5px; color: var(--muted); }
  blockquote {
    margin: 0 0 18px; padding: 14px 18px; border-left: 3px solid var(--accent);
    background: var(--accent-soft); border-radius: 0 10px 10px 0; color: var(--fg);
  }
  blockquote p:last-child { margin: 0; }
  .flow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 8px; }
  .state {
    border: 1px solid var(--line); background: var(--card); border-radius: 9px;
    padding: 7px 14px; font: 13px ui-monospace, Menlo, monospace;
  }
  .state.on { border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .arrow { color: var(--muted); }
  .note { font-size: 13.5px; color: var(--muted); }
  .calc { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px 22px; margin: 0 0 18px; }
  .calc input[type=range] { width: 100%; accent-color: var(--accent); margin: 10px 0 4px; }
  .calc .row { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); }
  .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 16px; }
  .result { background: var(--bg); border: 1px solid var(--line); border-radius: 9px; padding: 12px 14px; }
  .result .k { font-size: 12px; color: var(--muted); }
  .result .v { font-size: 24px; font-weight: 650; letter-spacing: -0.02em; }
  .result .v small { font-size: 12px; font-weight: 400; color: var(--muted); }
  .warnbox { background: var(--warn-soft); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); border-radius: 12px; padding: 16px 20px; margin: 0 0 18px; }
  .warnbox h4 { margin: 0 0 8px; color: var(--warn); font-size: 14px; }
  .warnbox p, .warnbox ul { margin: 0; font-size: 14px; }
  .warnbox ul { padding-left: 20px; margin-top: 8px; }
  footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">

<nav>
  <a href="#what">是什么</a>
  <a href="#why">为什么</a>
  <a href="#how">怎么做</a>
  <a href="#expect">预期结果</a>
  <a href="#self">这份文档自己</a>
</nav>

<h1>Project Memory Framework</h1>
<p class="lede">让项目目录下的文档<strong>按需而生、按时而死</strong>：活着的能被找到，死掉的能被删掉，行为由测试承载而不是由文档描述。</p>

<div class="chips">
  <span class="chip">代码是 ground truth</span>
  <span class="chip">文档是脚手架</span>
  <span class="chip">删除留墓碑</span>
</div>

<pre><code>dsh plugin add @gwenlita52299/augean   # 一条命令，零配置</code></pre>

<p class="note">装上即用：默认作用于当前会话打开的项目，不需要配置文件。保留期默认固定值，动态模式需显式开启且不回溯。</p>

<h2 id="what">一、这是什么</h2>

<p>它不是又一个文档系统，而是<strong>文档的寿命管理</strong>。四件事：</p>

<div class="grid">
  <div class="card"><h4>结构检查</h4><p>frontmatter、ID 唯一、链接可达、命名规范。机械可判定的，一律硬阻断。</p></div>
  <div class="card"><h4>证据核对</h4><p>每条验收标准必须指向一个真实存在的测试。关闭时核对不过，不许退场。</p></div>
  <div class="card"><h4>保留期</h4><p>退役文档的寿命由产出频率与重构成本算出，不由人记得。</p></div>
  <div class="card"><h4>清理</h4><p>到期自动删除，只留一行墓碑。git 保留全文，所以删除可逆。</p></div>
</div>

<p>它管七类文档，每类有固定的目录、模板和寿命：</p>

<table>
  <thead><tr><th>类型</th><th>职责</th><th>寿命</th></tr></thead>
  <tbody>
    <tr><td><code>prd</code></td><td>为什么做、做到什么程度、不做什么</td><td>工作项周期</td></tr>
    <tr><td><code>spec</code></td><td>系统应当如何，含验收标准</td><td><strong>快照</strong>：关闭后落成测试即删</td></tr>
    <tr><td><code>design</code></td><td>模块当前的技术形状</td><td>模块存续期</td></tr>
    <tr><td><code>explainer</code></td><td>面向人的讲解产物（就是本页）</td><td><strong>可重建即 R=0</strong></td></tr>
    <tr><td><code>note</code></td><td>调研、实验、一次性分析</td><td>按频率公式</td></tr>
    <tr><td><code>adr</code></td><td>不可逆决策及理由</td><td><strong>永久</strong>，只增不改</td></tr>
    <tr><td><code>glossary</code></td><td>术语定义</td><td><strong>永久</strong>，就地更新</td></tr>
  </tbody>
</table>

<p class="note">没有第八类。参考实现里的 <code>doc_kind</code> 曾涨到 27 种，都是从「这次比较特殊」开始的。</p>

<h2 id="why">二、为什么</h2>

<h3>问题不是文档写不好，而是没人负责让它死</h3>

<table>
  <thead><tr><th>现状</th><th>本质</th></tr></thead>
  <tbody>
    <tr><td>review 完的结论只存在于对话里</td><td>决策无载体，下次重新辩论</td></tr>
    <tr><td>功能点删减后，文档不跟着改</td><td>文档无失效机制</td></tr>
    <tr><td>初期设计被推翻，旧文档既不删也不标记</td><td>文档无版本语义</td></tr>
    <tr><td>为让人看懂实现而生成 HTML 讲解，但它不随实现更新</td><td>生成物的<strong>生产成本低、维护成本被忽略</strong></td></tr>
  </tbody>
</table>

<p>最后一条是关键。它的教训不是「HTML 不该生成」，而是：<strong>重构成本低的产物，寿命必须短</strong>。一份能一键重建的讲解，合理处置是「重建或删除」，而不是「保留并逐渐失真」。</p>

<blockquote>
  <p>文档与代码不一致时，唯一可信的是可执行的东西。选择记忆载体时，应优先选那个「不改就会失败」的——测试不会撒谎，文档一定会。</p>
</blockquote>

<h3>为什么选「快照派」而不是「资产派」</h3>

<p>三个参考实现分成两派。clowder-ai 把 spec 长期入库，配 close gate 与归档；pstack 与 mattpocock/skills 认为 spec 是过程产物，落地即弃。本框架选了后者。</p>

<table>
  <thead><tr><th></th><th>资产派</th><th>快照派（本框架）</th></tr></thead>
  <tbody>
    <tr><td>长期记忆</td><td>spec + ADR + 术语</td><td><strong>ADR + 术语 + 测试</strong></td></tr>
    <tr><td>治理机制</td><td>状态机 + 取代链 + 归档区 + 孤儿巡检</td><td>关闭门 + 到期删除</td></tr>
    <tr><td>成本随项目时长</td><td>线性增长</td><td>被保留期锁成常数</td></tr>
    <tr><td>能读回「当时怎么想」</td><td>能</td><td>部分不能（这是代价）</td></tr>
  </tbody>
</table>

<p>放弃的好处是真实的，所以它被写进了「被接受的代价」而不是被藏起来。</p>

<h2 id="how">三、怎么做</h2>

<h3>1. 目录契约</h3>

<pre><code>&lt;project-root&gt;/
├── GLOSSARY.md                唯一术语表（永久）
└── docs/
    ├── README.md              人写的导航，唯一入口
    ├── INDEX.md               活文档索引        （生成）
    ├── TOMBSTONES.tsv         墓碑，append-only （生成）
    ├── specs/&lt;ID&gt;/spec.md     一份 spec 一个目录
    ├── designs/               每模块一份当前有效
    ├── explainers/            本页所在
    ├── decisions/NNNN-*.md    ADR，只增不改
    └── notes/                 调研与实验

没有 archive/。退役就是走向删除。</code></pre>

<h3>2. 状态机</h3>

<div class="flow">
  <span class="state">draft</span><span class="arrow">→</span>
  <span class="state on">active</span><span class="arrow">→</span>
  <span class="state">retired</span><span class="arrow">→</span>
  <span class="state">deleted</span><span class="arrow">＋ 墓碑</span>
</div>

<ul>
  <li>只有 <code>retired</code> 有到期日。活跃文档没有寿命，靠「无入链 + 长期未改」作为债务信号。</li>
  <li>进入 <code>retired</code> 后正文冻结——想改内容就造新文档，否则历史全丢。</li>
  <li>没有 <code>superseded</code>、<code>deprecated</code>、<code>archived</code> 这些中间态。退役就是退役，等删。</li>
</ul>

<h3>3. 保留期：唯一会自己变的参数</h3>

<p>固定保留期在两个方向都会出错：开发快时它让退役区积压，开发慢时它把还有用的文档删早了。所以它随产出频率浮动。</p>

<pre><code>λ = 近 8 周「新增 + 实质修改」的文档数 ÷ 8        （docs/week）
R = clamp( (30 ÷ λ) × m_kind × w(C), 3, 90 )      （天）

m_kind = spec 1 · design 2 · prd 2 · note 1
w(C)   = cheap 0.25 · medium 1 · expensive 2</code></pre>

<p>反比的道理：退役区存量 <code>N ≈ λ × R</code>。若 <code>R ∝ 1/λ</code>，则 <code>N</code> 是与时间无关的常数。<strong>开发越快、保留越短，是为了让退役队列容量恒定，而不是让仓库随速度膨胀。</strong></p>

<div class="calc">
  <div class="row"><span>试一下：拖动 λ</span><span id="lamLabel">λ = 5.00 docs/week</span></div>
  <input id="lam" type="range" min="0.25" max="40" step="0.25" value="5">
  <div class="row"><span>每月一份</span><span>每天一份</span><span>批量生成</span></div>
  <div class="results">
    <div class="result"><div class="k">spec</div><div class="v"><span id="rSpec">6</span> <small>天</small></div></div>
    <div class="result"><div class="k">design</div><div class="v"><span id="rDesign">12</span> <small>天</small></div></div>
    <div class="result"><div class="k">prd</div><div class="v"><span id="rPrd">12</span> <small>天</small></div></div>
    <div class="result"><div class="k">note</div><div class="v"><span id="rNote">6</span> <small>天</small></div></div>
  </div>
</div>

<p><strong>重构成本</strong>让便宜的东西死得更快。生成式讲解属于 <code>cheap</code>，且通常带 <code>regen:</code>——直接 <code>R = 0</code>。它的正确寿命不是「维护到它过时」，而是「不重建就消失」。</p>

<h3>4. 两个开关，一条原则</h3>

<pre><code>retention.mode = fixed   默认。spec 30 / design 60 / prd 60 / note 30 天
retention.mode = dynamic 显式开启。只统计 enabled_at 之后的数据</code></pre>

<ul>
  <li><code>enabled_at</code> 由工具写入，<strong>传历史日期直接报错</strong>——堵掉回填。</li>
  <li>冷却期内（4 周 / 8 个样本）继续用固定值，不拿噪声决定删期。</li>
  <li><strong>不回溯</strong>：已冻结的 R 永不重算，切回 fixed 也不改。参数变更只影响未来。</li>
</ul>

<h3>5. 工具与技能</h3>

<table>
  <thead><tr><th>工具</th><th>做什么</th></tr></thead>
  <tbody>
    <tr><td><code>pmf_check</code></td><td>结构与链接检查，机械可判定的全部硬阻断</td></tr>
    <tr><td><code>pmf_evidence</code></td><td>验收标准 → 测试的核对，close gate</td></tr>
    <tr><td><code>pmf_retention</code></td><td>模式、λ、每份退役文档的到期日</td></tr>
    <tr><td><code>pmf_expire</code></td><td>dry run 或执行删除并写墓碑</td></tr>
    <tr><td><code>pmf_enable_dynamic</code></td><td>开启动态保留期</td></tr>
  </tbody>
</table>

<table>
  <thead><tr><th>技能</th><th>干什么</th><th>硬规则</th></tr></thead>
  <tbody>
    <tr><td><code>spec-write</code></td><td>把需求写成能关闭的 spec</td><td>先搜再立；写不出测试的那行不是 invariant</td></tr>
    <tr><td><code>spec-close</code></td><td>让 spec 不撒谎地退场</td><td>close gate 不 PASS 就不许退役</td></tr>
    <tr><td><code>spec-sync</code></td><td>找出哪些 spec 开始撒谎了</td><td>不判断就不改</td></tr>
    <tr><td><code>spec-gc</code></td><td>让删除真的发生</td><td>dry → 申请 → apply，顺序不可跳</td></tr>
  </tbody>
</table>

<p>检查核心只依赖文件系统与 git，不 import 任何 harness 模块。所以它现在是 DSH 插件，将来可以是任何工具里的 CLI——换掉的只是触发层。</p>

<h2 id="expect">四、预期结果</h2>

<table>
  <thead><tr><th>指标</th><th>定义</th><th>目标</th></tr></thead>
  <tbody>
    <tr><td>M1 定位步数</td><td>从需求/模块到当前 spec 或承接测试</td><td>≤ 3</td></tr>
    <tr><td>M2 到期未删率</td><td>过了保留期仍未删除的占比</td><td>&lt; 5%</td></tr>
    <tr><td>M3 测试承载率</td><td>关闭时 AC 有对应测试的比例</td><td>≥ 90%</td></tr>
    <tr><td>M4 重复造轮率</td><td>同类实验脚本重复实现次数</td><td>连续 2 月为 0</td></tr>
    <tr><td>M5 文档净增</td><td>每月新增 − 删除</td><td>≤ 0</td></tr>
    <tr><td>M6 生成物新鲜度</td><td>source hash 落后天数</td><td>≤ 其保留期</td></tr>
  </tbody>
</table>

<p>健康的形状不是一个数字，而是一条曲线：<strong>退役区存量在目标值上下波动，而不是单向增长</strong>。文档净增趋零，而不是「涨得更整齐」。</p>

<div class="warnbox">
  <h4>被接受的代价（不是缺陷）</h4>
  <ul>
    <li><strong>失去叙述回溯</strong>：spec 删除后，「当时怎么想的」只能靠 ADR 与 git。ADR 只记不可逆决策。</li>
    <li><strong>依赖测试</strong>：不愿写测试的项目上，快照派的前提不成立，整套机制会退化成流程税。</li>
    <li><strong>删除改变仓库</strong>：git 可恢复，但恢复需要知道去哪找——所以有墓碑。</li>
  </ul>
</div>

<h2 id="self">五、这份文档自己</h2>

<p>本页就是它自己描述的那个问题：<strong>生成的讲解不随实现更新</strong>。所以它按自己的规矩活着。</p>

<table>
  <thead><tr><th>字段</th><th>值</th><th>含义</th></tr></thead>
  <tbody>
    <tr><td><code>cost</code></td><td>cheap</td><td>重建成本低</td></tr>
    <tr><td><code>regen</code></td><td><code>node explainers/build-pmf-overview.mjs</code></td><td>一条命令重建</td></tr>
    <tr><td><code>source_sha</code></td><td><code>${hash}</code></td><td>源文件指纹，变了即失效</td></tr>
    <tr><td>保留期</td><td><strong>R = 0</strong></td><td>源一变就该重建；不重建就删</td></tr>
  </tbody>
</table>

<p>换句话说：<strong>这页的正确结局是被删掉或被重新生成，而不是被小心翼翼地维护。</strong> 如果它开始和代码不一致，那不是文档事故，那是它在按设计执行。</p>

<footer>
  <p>生成于 ${today} · source <code>${hash}</code> · 重建：<code>node explainers/build-pmf-overview.mjs</code></p>
  <p>本页由 <code>explainers/build-pmf-overview.mjs</code> 生成，请勿手改。框架说明见 <a href="../README.md">README</a>，生命周期见 <a href="../prd/03-lifecycle.md">03-lifecycle.md</a>。</p>
</footer>

</div>
<script>
  var N = 30, lo = 3, hi = 90
  var input = document.getElementById('lam')
  var label = document.getElementById('lamLabel')
  var nodes = {
    spec: document.getElementById('rSpec'),
    design: document.getElementById('rDesign'),
    prd: document.getElementById('rPrd'),
    note: document.getElementById('rNote')
  }
  var m = { spec: 1, design: 2, prd: 2, note: 1 }
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b) }
  function render() {
    var lam = Math.max(Number(input.value), 0.25)
    label.textContent = 'λ = ' + lam.toFixed(2) + ' docs/week'
    Object.keys(m).forEach(function (kind) {
      nodes[kind].textContent = Math.round(clamp((N / lam) * m[kind], lo, hi))
    })
  }
  input.addEventListener('input', render)
  render()
</script>
</body>
</html>
`

writeFileSync(OUT, html)
console.log(`wrote ${relative(root, OUT)}  source=${hash}  created=${created}  updated=${today}`)
