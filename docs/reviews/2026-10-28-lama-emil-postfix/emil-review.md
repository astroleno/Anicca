# Emil 独立复审：阅读连续性与交互手感

日期：2026-10-28。仅审阅；本报告内的 After 均为提案，没有实施产品修改、提交、推送或发布。

六项定向修复在各自验收场景中闭环。本轮另确认 **2 项 P2**：原生拖选被提前截断、主动退出后追问回包重新打开阅读并抢走焦点；另有 **1 项 P3** 桌面帮助文案矛盾。长文返回入口与鼠标单击等待列为启发式建议，未混入确认缺陷。

## 审阅依据与限制

- 使用 [Emil router](/Users/aitoshuu/.codex/skills/emil/SKILL.md)，只选择 [emil-design-eng](/Users/aitoshuu/.cc-switch/skills/emil-design-eng/SKILL.md)。重点是频繁操作的注意力成本、输入方式差异、阅读位置、可打断与可逆操作，没有机械要求所有按钮缩放、所有内容错峰入场或新增装饰动画。
- 按要求，搜索源码前先读 [Graph Report](/Users/aitoshuu/Documents/GitHub/Anicca/graphify-out/GRAPH_REPORT.md) 的 God Nodes 与社区结构：`BranchGraphStore` 为主要业务枢纽；社区 3/4/5、14/15/17 指向舞台、布局、持久化、选句与视图投影。图生成于 10 月 25 日，只用于导航，结论以当前源码为准。
- 本地 HEAD：`ebd4d402df6f294323c23e9b0f47d0b2db66e0a1`。公开入口：[aitoshuu.me/Anicca](https://aitoshuu.me/Anicca)、[tongye.me/Anicca](https://tongye.me/Anicca)。[部署记录](evidence/deployment-current.json) 给出的当前 release 是 `/opt/anicca/releases/20261028-six-fixes-final`，build 为 `gYvsXfhsH4WQe87NjnYgQ`；服务 active，两个入口均为 200。[同 HEAD 的 CI](https://github.com/astroleno/Anicca/actions/runs/40560960787) 两项工作均成功，原始结果见 [ci-status.json](evidence/ci-status.json)。
- 数据来源为当前前端源码、[本轮六项重验](evidence/six-fixes-recheck.json)、[本轮视觉矩阵](evidence/visual-matrix.json)、[本轮六个动态探针](evidence/interaction-probes.json)，以及同一部署版本的[既有受控流程](../2026-10-28-lama-emil-frontend/verification/controlled-flow.json)、[真实接口流程](../2026-10-28-lama-emil-frontend/verification/live-flow.json)与修复验收记录。没有读取上一轮 Lama/Emil 审阅结论或另一位本轮评审的报告。
- 实际使用 `view_image` 看过多张桌面、移动、暗色、320px 窄屏与 844×390 横屏截图，包括两个域名的样本；逐条读取动态交互证据并对照源码。本子 agent 未另开浏览器；运行时操作由主线程在隔离 Chromium 上统一采集，独立性指结论独立形成，并非另一次独立浏览器操作。
- 新视觉矩阵的 10 个上下文通过，无横向溢出、控制台错误或静态资源失败；这些是指定夹具和视口的结论。移动为触摸视口模拟，未新增 iPhone/Android 真机、iOS 原生选区手柄、真实软键盘或持续 GPU 性能测试。截图不能证明动作手感或心理心流，节点数量也不能证明启发度。

## 六项修复闭环

本轮重验覆盖双域名、桌面与移动四个上下文。以下结论只对应原六项的验收边界，不把新发现混入旧项，也不把受控故障当成真实服务故障。

| 项目 | 判断 | 复核依据 |
| --- | --- | --- |
| F01 每空间维度草稿 | 在指定场景闭环 | [PerspectiveControls:26](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/PerspectiveControls.tsx:26) 按空间恢复草稿，输入即独立保存；[PerspectivePanel:70](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/PerspectivePanel.tsx:70) 保存才应用，取消丢弃；观察切换、关闭不丢草稿。AI 建议以草稿已有轴去重，采用与手动添加均受 24 维限制（38、65、100、125 行）。重验记录的观察往返、关闭、刷新、空间隔离、Save/Cancel 均通过。 |
| F02 移动复位 | 在指定场景闭环 | [PerspectivePanel:122](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/PerspectivePanel.tsx:122) 明确区分「复位视角与缩放」与「按已有角度归位」；[BubbleStage:460](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:460) 只复位 orbit/pan/zoom。重验从 panX=960 回到初始视角，布局与维度保持。320px 面板需要滚动，但入口可达；不误判为按钮缺失。 |
| F03 独立阅读日志 | 在指定场景闭环 | [useReadingJournal:29](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useReadingJournal.ts:29) 分空间保存当前实例与位置，滚动不重写完整图。[readingPosition:18](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/readingPosition.ts:18) 记录原文字符锚。四上下文刷新 scrollTop 650→650；换宽后同字符垂直误差小于 0.3px；主动关闭后刷新保持关闭。分身当前实例路径有源码与既有 hook/存储回归支持，不冒称新增真机实测。 |
| F04 可操作错误与重试 | 在指定场景闭环 | [DialogueComposer:125](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueComposer.tsx:125) 显示恢复说明与「重试上次」；[DialogueShell:1274](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1274) 保存原请求参数，1326 行按草稿版本决定是否清空。四上下文验证重发旧请求、保留失败后新输入与原图。[移动错误截图](../2026-10-28-lama-emil-frontend/verification/mobile-retry.png) 的下一步明确。 |
| F05 合成候选无匹配与清空 | 在指定场景闭环 | [SeedInspector:165](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:165) 区分没有候选与搜索无匹配，提供就地清空。重验清空恢复两个原候选，没有发出生成请求，也没有改组合来源；[截图](../2026-10-28-lama-emil-frontend/verification/mobile-query-no-match.png) 与行为一致。 |
| F06 读层即时/短过渡与旧退出保护 | 在指定场景闭环 | [DialogueShell:623](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:623) 区分键盘/辅助激活与指针，恢复路径强制 instant；[SeedReadingContent:27](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedReadingContent.tsx:27) 跳过即时/减弱动态场景的读层动画，指针 160/120ms，旧退出完成受取消标志保护。既有组件回归与同 HEAD CI 支持该闭环；这不等于鼠标端到端只需 160ms，也不等于所有快速反转都已证明连续。 |

## 独立确认的问题

### E01 · P2：原生拖选尚未结束，正文就被重排，最后追问的片段偏离选择意图

- **触发条件：**桌面用鼠标在种子正文中按住拖选，移动超过两个字后继续扩大或反向调整选区。
- **实测：**在未松手的 `targetOffset=3` 已出现行内操作，原正文 DOM 改变，只捕获「区花」。继续移至 8、15、21，再反向回到 15、8，应用内 quote 仍为「区花」；原生 Selection 却已包含「追问前提」「找反例」「收起」等按钮文字。松手后也没有恢复目标原句。
- **影响：**用户正在形成的问题被提前截断；若点击追问，系统会沿两字片段继续，而不是沿刚才拖选的原句继续。它影响精准选句这一核心入口；「选一句追问」按句按钮可替代，所以不定为 P1，也不从桌面推断 iOS 手柄必然同样失败。
- **复现：**打开长文种子 → 在正文第一句中按下鼠标 → 向右分步拖选 20 字左右，保持按下 → 反向拖回 → 松手 → 对照原生选区与行内引用。本次实际复现于 `aitoshuu.me` 桌面 Chromium。
- **源码：**[SeedPassage:31](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:31) 每次 `selectionchange` 都读选区，40–42 行在长度达到 2 字时立即提交状态；[60 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:60) 随即把整段原文替换成前文/引用/后文，并插入按钮。[SeedInspector:184](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:184) 同时移除上方展开控件，进一步移动阅读坐标。
- **证据：**[动态探针](evidence/interaction-probes.json) 中 `native-drag-selection` 六步原始记录；[松手前截图](evidence/desktop-native-drag-before-release.png)、[松手后截图](evidence/desktop-native-drag-after-release.png)。本评审已逐条读记录并实际查看两图。置信度：**高**。

### E02 · P2：主动退出阅读后，慢追问回包仍重开阅读并抢走焦点

- **触发条件：**提交选句追问，响应未回时点击「返回种子」，随后没有再选择其他节点或继续输入，原追问成功返回。
- **实测：**两个域名、桌面与移动四个上下文均记录 `closedBeforeReply=true`；受控响应返回后均为 `readingReopened=true`，焦点变成 `conversation-panel-heading`，图中有原节点、追问问题和回应共 3 个节点。结果正常保存，但主动退出的界面意图没有保留。
- **影响：**用户已经结束本次阅读，异步成功却把他们重新拉回正文并改变键盘焦点；这会中断浏览舞台或暂时离开问题的节奏。它不是结果丢失或图损坏，因此不定为 P1。
- **复现：**阅读种子 → 选一句并提交追问 → 在响应延迟期间点击返回种子 → 保持当前舞台 → 让原响应成功返回 → 检查阅读状态与焦点。四个上下文均为有效脚本复现，未使用真实模型调用。
- **源码：**[DialogueShell:560](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:560) 与 [831 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:831) 的关闭路径没有更新注意力版本；[1851 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1851) 捕获请求时版本，[1870–1871 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1870) 在版本与原焦点仍匹配时直接重新打开阅读；[858 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:858) 随后把焦点交给标题。关闭不改变原节点焦点，所以该保护没有覆盖主动退出。
- **证据：**[动态探针](evidence/interaction-probes.json) 前四个 `slow-inquiry-dismiss`；[移动回包后](evidence/aitoshuu.me-mobile-slow-inquiry-after-reply.png)、[桌面回包后](evidence/aitoshuu.me-desktop-slow-inquiry-after-reply.png)。v3 的[关闭状态截图](evidence/aitoshuu.me-mobile-slow-inquiry-closed.png) 已确认正文完全退出；四个上下文均先等整个阅读层完成退出并从 DOM 移除，记录 `fullyExitedBeforeReply=true` 后才释放响应，仍全部重开并抢焦点。本评审已读有效记录并实际查看三图，其中关闭图按 v3 更新后重新查看。置信度：**高**。
- **边界：**这与 F06 的「旧退出动画完成不能卸载后来重开的阅读」是两类竞争。F03 的「主动关闭后立即刷新保持关闭」也仍通过；本项新增的是关闭与异步成功之间的交叉场景。

### E03 · P3：桌面首次帮助把鼠标空白拖动说成平移

- **触发条件：**细指针桌面首次进入有种子的工作区，或重新打开操作提示。
- **影响与实测：**[桌面截图](evidence/desktop-dark-entry.png) 同屏显示「拖动空白，转动视角」与「拖空白平移，双指转动与缩放」。用户依据后者操作鼠标，会得到旋转而非平移。这是两处指导彼此矛盾，不是对既有手势设计的偏好判断。
- **复现：**桌面重置该隔离上下文的操作提示状态，打开含种子的页面，同时阅读舞台工具提示和左上帮助；拖空白核对实际结果。
- **源码：**[SeedGuide:9](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedGuide.tsx:9) 使用全设备固定文案；[BubbleStage:832](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:832) 明确 touch→pan、其他指针→orbit；[937 行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:937) 顶部提示已按指针模式区分。证据为上图和视觉矩阵的 `desktop-dark` 上下文。置信度：**高**。

## 启发式建议与仍需验证的取舍

### H01 · P3 建议：长文中段保留一个可发现的返回位置

**已确认行为：**[移动中段截图](evidence/mobile-320-reading-reading-middle.png)、[横屏中段截图](evidence/mobile-landscape-reading-middle.png) 中，返回按钮随标题离开可视区域。[动态探针](evidence/interaction-probes.json) 的 `middle-reading-exit` 测得按钮 top=-538、bottom=-494，而阅读区域 top=112、bottom=696；触摸空白 `(8,400)` 确实能关闭。键盘仍可 Escape，不能写成阅读无法退出。

**推断与提案：**触摸用户是否知道要点空白、是否因此回顶，是待用户验证的可发现性问题。可以尝试把现有文字返回入口放在不随正文滚走的位置，保持无卡片与轻量布局。源码是 [SeedInspector:144](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:144) 和 [CSS:4013](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4013)。对「按钮不可见、空白可退出」置信度高；对它导致放弃或破坏心流的判断置信度中，需观察用户。

### H02 · P3 研究建议：区分鼠标双击快捷操作的收益与单击阅读的等待

[BubbleStage:890](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:890) 为鼠标保留双击裂变，将单击阅读延迟 260ms；触摸及 `detail=0` 激活即时。读层的 160ms 从挂载后开始，不能把 F06 解释为单击后 160ms 已完成阅读转场。

这是已确认的实现取舍，尚无证据证明它令目标用户更慢或更困惑。建议用反复点读任务比较鼠标与键盘，并同时观察双击快捷键的实际使用；不应只因技能强调快就取消已有快捷方式。复现：同一节点分别鼠标单击、Enter 激活，对照点击到正文出现的时间；源码对延迟值的置信度高，体验影响待验证。

## Before / After / Why

所有 After 是待批准的方向；本轮没有实施这些改动。

| Before | After（提案） | Why |
| --- | --- | --- |
| E01：拖选刚达到 2 字就重写原文 DOM，尚在拖动时插入引用与操作按钮。 | 原生选择形成期间保持原文 DOM 和位置稳定；确认选择后再进入行内追问。继续支持键盘和按句按钮路径。 | 让用户先完成自己的选句意图，避免 UI 抢先替他们截断问题。 |
| E02：显式关闭没有记录新的注意力意图，慢追问成功会重开正文并聚焦标题。 | 显式退出后仍保存成功结果，以可主动打开的轻量反馈承接；未得到新的阅读意图时保持舞台与焦点。 | 接受结果与接管用户注意力应分开，尊重已经做出的退出动作。 |
| E03：所有设备统一提示「拖空白平移，双指转动与缩放」。 | 帮助与舞台共用输入方式对应的动作语义：鼠标说明旋转，触摸说明平移/双指；键盘提示按真实支持能力提供。 | 消除同屏矛盾，减少试错成本。 |
| H01：标题、返回与正文同处滚动区域，长文中段只剩隐含空白退出。 | 试验保留现有文字返回入口的固定可见位置；先验证可发现性收益。 | 返回是可逆阅读的重要线索，无需新增卡片或装饰。 |
| H02：鼠标单击为双击预留 260ms，但只讨论读层 160ms 容易低估总等待。 | 把单击等待与读层转场分开测量，再根据实际快捷键使用决定是否调整。 | 优化频繁操作要有端到端依据，同时保留已确认交互的价值。 |

## 概念一致性与沉浸感判断

当前低饱和软糯舞台、无独立卡片的正文、暗色下相同阅读层级仍一致。窄屏需要更多纵向滚动，但现有截图没有证明必须增加卡片、装饰动画或改变种子材质。320px 首屏与横屏中的控件占比值得观察，不能仅凭正文首屏较短就断言无法阅读。

「推演正反」与「看极性两端」的操作名、说明和结果语义保持区分；极性是观察位置，正反是对同一观察框架的推进/检验。[SeedInspector:109](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:109) 针对追问、极性、合提供不同的继续提示；极性选择明示其他观察入口是否保持。合后也保留继续推演与展开来源，既有真实接口流程证明这条链可执行。

可执行不等于持续产生新理解。既有 `live-flow.json` 中，`aitoshuu.me` 移动样本合后的第 5 次请求已携带合正文与 6 个 comparison seeds，但两份结果都被标为 `novelty=revisit`：一份回指当前合，另一份回指先前反。[UnderstandingChange:13](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedMeaning.tsx:13) 会显示「与此前相近」、原文对照和换角度入口，说明产品有诚实识别重复的机制；不能把该样本的 12 个节点当作 12 次洞见，也不能据一例判定整体无启发度。这是后续内容质量/用户研究边界，不列成前端 P2。

乔哈里模板的轴是 `self-report`，[选择器说明](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/PerspectivePanel.tsx:107) 要求用户按了解选择，阅读/极性界面标记「待确认的假设」。[model:157](/Users/aitoshuu/Documents/GitHub/Anicca/src/features/perspectives/model.ts:157)、[polarityGeneration:71](/Users/aitoshuu/Documents/GitHub/Anicca/src/features/perspectives/polarityGeneration.ts:71) 明确禁止臆测谁知道什么，新增情境须前置假设语气。本轮视觉夹具不是乔哈里真实多轮输出，因此只能确认前端与提示合同的边界，不能担保每次模型生成都遵守。

手势源码已有指针捕获、取消回原位、双指接管后抑制剩余单指误触以及 Home/菜单复位；既有受控拖拽、松手合成、取消迟到结果与渲染器回退通过。桌面自动 TSL、移动原版的默认选择仍在 [useLiquidRenderer:6](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useLiquidRenderer.ts:6)，手动选择与故障回退保留。真实触摸惯性、选区手柄、持续帧稳定性仍待真机验证。

## 交付与剩余验证边界

本轮已读取新增窄屏/暗色/横屏证据、四个有效慢追问探针、一次完整原生拖选探针与一次中段空白退出探针。没有把首版脚本的节点数断言错误当作产品失败，也没有把没有继续测试的快速入场反转列为已确认缺陷；F06 的旧退出保护与视觉轨迹是否连续须分开理解。

两项 P2 与一项 P3 为本轮确认、尚未修改的问题。H01/H02 是待用户研究验证的改进方向，真机选区手柄、软键盘、持续性能和真实长期心流仍未验证。这里只交付审阅文档；后续修改需要在独立授权范围内完成设计与验收。
