# Anicca · Lama 独立复审

日期：2026-10-28。范围：当前部署前端的 UI/UX、概念一致性、可逆状态、移动阅读与探索连续性。仅审阅，没有修改产品代码。

六项既定修复在当前证据范围内闭环。独立复审另确认 **1 项 P2、1 项 P3**；另有 1 项 P3 启发式建议。P2 是桌面原生拖选被提前重建正文 DOM 打断，影响精确选句；没有确认持久数据丢失。

## 方法、版本与证据边界

- 使用 [Lama router](/Users/aitoshuu/.codex/skills/lama/SKILL.md)，仅选择 [Appllama App Design](/Users/aitoshuu/.cc-switch/skills/appllama-app-design-skill/SKILL.md) 的阅读层级、导航语义、完整状态循环、触摸与主题检查。产品是 mobile web；没有把 Expo、React Native、原生导航器、SF Symbols 或 MMKV 等实现要求套成网页缺陷。按授权没有做外部竞品调研、重新设计或新增依赖。
- 已先读 `graphify-out/GRAPH_REPORT.md` 的 God Nodes 与社区结构，再查源文件；以 `BranchGraphStore`、社区 9 的手势、社区 14–15 的实例/阅读/草稿为导航。图报告日期为 2026-10-25，仅作导航，最终结论均回到当前源码与运行证据。
- 本地只读核对 HEAD：`ebd4d402df6f294323c23e9b0f47d0b2db66e0a1`。同版 [release.json](../2026-10-28-lama-emil-frontend/verification/release.json) 与本轮 [部署核对](evidence/deployment-current.json) 的 Build ID 为 `gYvsXfhsH4WQe87NjnYgQ`；共享源站 current 为 `/opt/anicca/releases/20261028-six-fixes-final`。部署核对由主线程只读取得，本审阅读取其证据，没有另行登录源站。
- 入口：[aitoshuu.me/Anicca](https://aitoshuu.me/Anicca)、[tongye.me/Anicca](https://tongye.me/Anicca)。使用同版 [六项专项 JSON](../2026-10-28-lama-emil-frontend/verification/six-fixes.json)、[受控流程](../2026-10-28-lama-emil-frontend/verification/controlled-flow.json)、[真实接口流程](../2026-10-28-lama-emil-frontend/verification/live-flow.json)、[协议检查](../2026-10-28-lama-emil-frontend/verification/protocol.json)，以及本轮 [双域名六项复测](evidence/six-fixes-recheck.json)、[10 上下文视觉矩阵](evidence/visual-matrix.json)、[6 项交互探针](evidence/interaction-probes.json)。没有读取旧 Lama/Emil 结论或另一位本轮报告。
- 已用 `view_image` 实际查看原目录全部 10 张代表图，包括两端的阅读恢复/换宽、移动维度、复位、重试、无匹配、移动合成与桌面继续展开；又查看本轮 20 张补充图：320px 阅读/选句/极性/中段/观察/编辑/菜单，360px 暗色阅读/选句/极性/观察/编辑，桌面暗色阅读/选句/极性/中段，以及 844×390 横屏阅读/选句/极性/中段。
- 交互补证另实际查看 6 张图：桌面原生拖选松手前/后、移动慢追问完全关闭后/回包后、桌面回包后、移动长文中段。交互证据采用更新后的 v3；四个慢追问上下文都等阅读完成退出并从 DOM 移除后才放行回应，且已重新查看同名完全关闭截图。正文拖选是实际 `mouse down → 多步 move → 反向 move → up`，不是瞬间注入一个已经完成的 Range。部分布局原图在 `/tmp/anicca-postfix-visual-v2-20261028/aitoshuu.me/`，精选与确认问题截图已归档在本目录 `evidence/`。
- 本轮浏览器由主线程统一运行，本审阅没有另启浏览器。移动证据是 Chromium 触摸视口，不是真机 Safari/Android；没有 iOS/Android 原生选择手柄、软键盘、屏幕阅读器或持续帧率实测。静态截图只能支持布局与层级判断，JSON 能支持动作结果；两者均不能证明触摸手感、心理心流或持续 60 fps。既有测试日志为 93 文件、680 测试通过，本轮 [CI 状态](evidence/ci-status.json) 的质量检查与生产 smoke 均成功；本审阅没有重跑全仓检查。

## 六项修复闭环

| 项目 | 独立核对结果 | 关键源码与证据 | 结论 |
| --- | --- | --- | --- |
| F01 · 每空间维度草稿 | 草稿由工作区 id 隔离；观察/编辑切换、关闭与重新打开不销毁草稿，刷新可读回；只有「取消编辑」明确丢弃，「保存维度」应用且保留最新观察选择。AI 建议以草稿去重，采用及请求建议都受 24 维容量限制。 | `PerspectiveControls.tsx:24–41`；`PerspectivePanel.tsx:38,65–74,84–103,125–129`；`perspectiveDraft.ts:6–31`；`model.ts:125–135`。双域名、双视口专项均通过；对应组件测试覆盖连续采用与未保存容量。 | 已闭环。存储可写是现有浏览器验证前提；未声称异常配额下仍能跨刷新保存。 |
| F02 · 移动视角复位 | 观察页提供独立「复位视角与缩放」；与「按已有角度归位」明确分开，前者走 camera reset，后者才走布局归位。 | `PerspectivePanel.tsx:120–123`；`DialogueShell.tsx:2147–2149`。专项中移动 pan 从 960 复位，`layoutUnchanged:true`；已查看 `mobile-camera-reset.png`。 | 已闭环。没有发现复位改写种子位置或思考维度。 |
| F03 · 独立阅读日志 | 阅读单独保存活动实例与正文字符锚；工作区切换隔离，旧清理回调不覆盖新空间；主动关闭保存为关闭。实例 id 用于接回对象，正文位置以共享概念 id 保存。 | `useReadingJournal.ts:16–59`；`readingState.ts:8–30`；`SeedInspector.tsx:42–75`；`readingPosition.ts:18–49`；`DialogueShell.tsx:613–620`。两域名同宽 650→650；跨宽重新打开的同字符位置误差均小于 0.3px，主动关闭后刷新保持关闭。 | 已闭环。证据是换宽后重新打开/恢复，并非对任意实时缩放或旋转的连续锚定承诺。 |
| F04 · 可操作错误与重试 | 生成错误解释保留状态并给下一步；按钮明确是「重试上次」。重试闭包保存原文本、对象与视角；后写草稿由版本比较保护。 | `DialogueComposer.tsx:119–130`；`DialogueShell.tsx:1257–1274,1326,1353–1356,1846–1878`。专项确认重发原请求、保留后写草稿和原图；已查看 `mobile-retry.png`。 | 已闭环。没有把失败文案恢复为要求网页用户修改服务端配置。 |
| F05 · 合成候选搜索 | 根据全部候选和筛选候选区分「还没有」与「没匹配」；清空只改变本地 query。 | `SeedInspector.tsx:100–103,150–167`。无匹配后清空恢复原有两个候选且请求数不增加；已查看 `mobile-query-no-match.png`。 | 已闭环。 |
| F06 · 阅读呈现与迟到退出 | 键盘/辅助激活与恢复使用 instant；指针入场 160ms、退出 120ms；退出完成回调受取消标志保护，关闭即 inert。 | `DialogueShell.tsx:618,623–628`；`SeedReadingContent.tsx:18–61`。专项脚本检查键盘与刷新恢复无入场动画、焦点在标题；组件测试覆盖旧退出完成后重新打开。 | 已闭环，限逻辑与受控动作验证。不能据此宣称真机动画手感已通过。 |

源码路径均相对于仓库：`src/components/dialogue/` 下同名文件；`perspectiveDraft.ts` 与 `readingState.ts` 位于 `src/lib/persist/`，`model.ts` 位于 `src/features/perspectives/`。

## 核心体验与概念判断

选句入口仍贴着正文：选句后以原句块承载「追问前提 / 找反例」，正文偏移能分辨重复句中的第二处。阅读里的「推演正反」说明为「推进判断，检验前提」，「看极性两端」说明为「换观察位置，看见两端」；极性选择又明确两端都能继续推演正反。这比单靠颜色区分更可靠。对应 `SeedPassage.tsx:31–71`、`SeedInspector.tsx:107–136`；320px、暗色、横屏图均保留了这些文字层级。

乔哈里模板没有把 AI 的判断伪装成他人的知晓事实。模板两轴标为 `self-report`，观察页说明未知部分留作问题，极性选择和来源标注都保留待确认语气；提示词也要求新增情境先写「如果/假如」或问题。对应 `model.ts:39–43,85–87,157`、`PerspectivePanel.tsx:107–111`、`SeedInspector.tsx:133,175–176`、`polarityGeneration.ts:71`。这是源码防线核实；本轮没有专门运行乔哈里真实接口样本，不能据此保证每次模型输出都守约。

合成后仍有「继续展开 / 展开来源」，前者回到同一阅读与推演入口，后者保留合与来源并临时展开；没有把“合”呈现成思考终点。对应 `DialogueShell.tsx:1020–1036,2234–2239`，并有已查看的移动真实合成与桌面合后继续极性图，以及双域名完整流程结果支持。24 次真实请求和每上下文 12 个节点，只说明该路径运行成功，不代表产生了更好的思想。

视觉继续符合低饱和软糯方向。主体文字、次级说明与动作层级在浅/暗色截图中可区分；阅读时种子退到背景，未加新的卡片层。桌面默认 TSL、移动默认原版，仍能手动切换并保留选择；受控上下文丢失回退原版的运行证据存在。依据 `useLiquidRenderer.ts:6–28`、`DialogueShell.module.css:4025–4027,4153–4197` 与 `controlled-flow.json`。本审阅不由截图推断材质动态或设备性能。

## 已确认的独立问题

### L01 · P2：连续原生拖选被提前重建 DOM 打断，选句卡在两字

- 触发：Chromium 桌面用鼠标在阅读正文中按下并连续拖选一个自定义短语，尚未松手时选区第一次达到两字。
- 影响：用户原本要选的范围尚未确定，正文已经切成前文、选句块、动作和后文；之后继续拖动或回拖，应用内选句仍是最初两字。这个路径阻断精确自由选句，可能把错误片段交给追问。内置「选一句追问」可选整句，但不能替代任意片段。P2 依据是核心精确选句动作受阻，**不是源文本被持久改坏或用户数据丢失**。
- 复现：打开「社区花园是否应该保留不预设用途的角落？」正文；从开头按下鼠标，分步拖到字符偏移 3、8、15、21，再回拖至 15、8，最后松手。记录在第一个偏移 3 时 `pointerStillDown:true`、`quote:"区花"`、`originalTextUnchanged:false`；接下来各步和松手后 quote 都仍为「区花」，原生选区反而包含「追问前提 / 找反例 / 收起」动作文字。
- 原因与准确位置：[SeedPassage.tsx:31](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:31) 的 `selectionchange` 监听在每次变化时检查并立即 `setSelectedQuote`（第 39–42 行），没有区分正在拖选与已确认；[第 60–71 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:60) 随即把原连续文本 DOM 替换成分段正文和按钮。浏览器仍在使用原选区推进拖动，已无法稳定对齐新 DOM。
- 证据：[interaction-probes.json](evidence/interaction-probes.json) 的 `native-drag-selection` 六步和 `afterRelease`；已实际查看 [松手前](evidence/desktop-native-drag-before-release.png) 与 [松手后](evidence/desktop-native-drag-after-release.png)。两图都显示选中的两字与混入选区的按钮，动作用 JSON 补足。重放步骤保存在 [interaction-probes.mjs.txt](evidence/interaction-probes.mjs.txt)。
- 修正方向：保留连续正文与原生选区，待用户完成选择后再呈现行内追问；回拖和取消都不应锁死先前片段。这里只给编辑建议，没有实施修复。
- 置信度：高，限 `aitoshuu.me` 的 Chromium 桌面实证；源码原因共用，但尚未据此宣称 iOS/Android 手柄或另一域名的原生拖选已实测失败。

### L02 · P3：慢追问回包会重新打开用户刚关闭的阅读并抢回焦点

- 触发：发出选句追问，请求仍在等待时主动点「返回种子」收起阅读；未再编辑或选取其他节点，随后正常收到该请求的回应。
- 影响：已选择回到种子舞台的用户被重新带入回应阅读，焦点跳到新标题。用户可以再次关闭，回应也正常保存；未见数据丢失，所以定为 P3 的状态与注意力连续性问题。
- 复现：受控延迟 `/api/inquiry`；发送「保留开放角落需要哪些共同条件？」后关闭阅读，等待整个 `#dialogue-reading-drawer` 完成退出且从 DOM 移除，确认 `closedBeforeReply:true`、`fullyExitedBeforeReply:true`，再放行回应。两个域名 × 桌面/移动共四个上下文均满足这个完全退出前提，随后仍记录 `readingReopened:true`、`activeElement:"conversation-panel-heading"`；节点数正常为 3。该结果排除了“截图只拍到尚未结束的退出动画”这一解释。
- 原因与准确位置：[DialogueShell.tsx:560](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:560) 的 `dismissSeedReading` 与 [第 831–841 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:831) 的 `closeSeedPanel` 仅关闭局部状态，没有递增注意力版本。追问在 [第 1851 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1851) 捕获版本，回包后 [第 1870–1871 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1870) 仍认为用户在等待，自动设置焦点节点并打开阅读；[第 493–496 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:493) 的焦点快照判断也不包含显式关闭状态。
- 证据：v3 [interaction-probes.json](evidence/interaction-probes.json) 四条 `slow-inquiry-dismiss`；已实际查看同名更新后的 [移动完全关闭后](evidence/aitoshuu.me-mobile-slow-inquiry-closed.png)，图中已回到种子舞台；另已查看 [移动回包后](evidence/aitoshuu.me-mobile-slow-inquiry-after-reply.png)、[桌面回包后](evidence/aitoshuu.me-desktop-slow-inquiry-after-reply.png)。动作先后和 DOM 移除由四条 JSON 记录与 [重放脚本](evidence/interaction-probes.mjs.txt) 支持。
- 修正方向：正常保存仍有效的回应，同时尊重请求发出后的主动关闭；仅当用户仍在原等待情境时自动展开。此问题与 F06 已保护的「旧退出动画完成回调」不同，没有推翻 F06 的动效闭环。
- 置信度：高，四个运行上下文与源码原因一致。

## 启发式建议与待验证项

### H01 · P3 建议：长文中段缺少仍可见的返回入口

- 触发：打开长文并滚到正文中段，尤其是 320px 竖屏或横屏。
- 观察：显式「返回种子」位于随内容滚动的 header；中段截图只剩正文和底部写作入口。`SeedInspector.tsx:144–148` 将返回按钮放进 header，`DialogueShell.module.css:4004,4013,4017` 使 header 相对定位、整篇 inspector 滚动；没有常驻返回控件。
- 影响：首次使用者可能需要滚回顶部才能找到确定的退路。点击阅读区外留白已有关闭逻辑（`SeedReadingContent.tsx:68–72`），本轮移动触摸探针已确认点击 `(8,400)` 可退出，所以这里不是“无法关闭”或数据安全问题。
- 复现：在长文将 inspector 滚至约 650px，观察是否仍能看见返回按钮；再用普通触摸点击留白测试是否容易发现并命中。
- 证据：原有 [移动阅读恢复](../2026-10-28-lama-emil-frontend/verification/mobile-reading-restored.png)、[桌面阅读恢复](../2026-10-28-lama-emil-frontend/verification/desktop-reading-restored.png)；本轮 [320px 中段](evidence/mobile-320-reading-reading-middle.png)、[横屏中段](evidence/mobile-landscape-reading-middle.png) 均已实际查看。`interaction-probes.json` 的 `middle-reading-exit` 测得返回按钮 top=-538、阅读区 top=112，`visibleInsideReader:false`，并记录 `blankTapDismisses:true`。
- 建议：先验证用户能否自然找到已有退路；如确实经常回滚寻找，再考虑让同一返回动作在阅读中保持可见，保留当前无卡片阅读与留白。不要为此另加工具面板。
- 置信度：高（滚动后按钮不在可见区）；中（对真实任务中发现性与沉浸感的影响）。这是启发式建议，不列为新的 P2 修复义务。

仍需真机或用户研究：软键盘与浏览器栏变化、原生选择手柄拖动、连续触摸/双指操作、长时间阅读的舒适性及真实低性能设备帧率。短横屏首屏主要显示标题与展开动作，需要滚动读正文，这一点已从图中看见；没有证据显示滚动无法到达，因此未升级成阻断问题。心理心流需要用户完成真实思考任务后的观察，不能由截图或节点数代替。

## 本轮交付

只新增本报告；未修改代码、提交、推送或发布。六项既定修复闭环；L01、L02 是本轮仍未修复的确认问题，H01 是启发式建议，真机与用户研究限制如上。没有把这些项标成延期或宣称产品已无缺陷。
