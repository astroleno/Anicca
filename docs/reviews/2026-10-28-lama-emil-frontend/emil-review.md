# Anicca 前端独立审阅 · Emil

日期：2026-10-28。基线：`4c0ee909fb6702a1e92bfe8ddfbe9eacddcc05d6`，公网入口 `https://aitoshuu.me/Anicca`。

本报告由独立子 agent 使用 `emil` → `emil-design-eng` 路线完成。审阅重点是反复使用时的响应、阅读稳定性、注意力与空间连续性，以及操作是否服务思考；未读取另一位审阅者的判断或历史 review findings。只写审阅文档，未修改产品代码。

## 独立总评

当前界面的方向成立，建议继续打磨现有阅读与种子舞台，不需要再增加卡片或换一套视觉。浅灰紫底、低饱和的柔软形体、较安静的文学字体与无卡片阅读形成了一致气质。进入阅读后降低舞台存在感，也比始终让球体与正文争夺注意力更适合持续思考。

概念结构比单纯的「正反回答生成器」更清楚：界面把「推演正反」解释为推进判断、检验前提；把「看极性两端」解释为换观察位置，而且明确两端仍能各自推演正反。「合」保留来源，并提供继续展开的入口；乔哈里维度带有待确认的假设边界。这些应保留。

主要问题出现在思考过程中暂时离开当前状态的瞬间：编辑一个维度、刷新长文、搜索旧想法、生成失败。系统保留了不少内容，却没有始终保留用户刚才的工作位置与可执行下一步。下列四项 P2 是具体可重现的 UX 问题；一项 P3 是高频阅读的动效调整建议。未发现足以建议暂停使用或重新设计架构的 P1。

## 应保留的设计与行为

- **无卡片阅读与柔软舞台。** [桌面回应](evidence/baseline/thought-flow-live-desktop-response.png)、[移动回应](evidence/baseline/thought-flow-live-mobile-390-response.png)中正文直接存在于场景中，没有再包一层内容卡片。阅读时隐藏种子标题、降低画布透明度的实现见 [DialogueShell.module.css:4025](../../../src/components/dialogue/DialogueShell.module.css#L4025)。
- **选句追问保持原文与语境。** [移动行内追问](evidence/baseline/thought-flow-live-mobile-390-inline-question.png)仍能读到选句前后文。精确引用使用原文偏移，而不是根据重复句的文本猜位置，见 [SeedPassage.tsx:36](../../../src/components/dialogue/SeedPassage.tsx#L36)、[inquiry.ts:10](../../../src/features/dialectic/inquiry.ts#L10)。
- **两类展开保持不同角色。** [极性选择](evidence/baseline/thought-flow-live-mobile-390-axis.png)明确写出观察两端与继续推演正反的关系，见 [SeedInspector.tsx:95](../../../src/components/dialogue/SeedInspector.tsx#L95)、[SeedInspector.tsx:115](../../../src/components/dialogue/SeedInspector.tsx#L115)。
- **「合」是新的起点。** [移动合流](evidence/baseline/thought-flow-live-mobile-390-synthesis.png)有「继续展开」「展开来源」，而非完成徽章或终局答案。实现见 [DialogueShell.tsx:2218](../../../src/components/dialogue/DialogueShell.tsx#L2218)、[SeedInspector.tsx:180](../../../src/components/dialogue/SeedInspector.tsx#L180)。
- **乔哈里保留认识上的克制。** [乔哈里选择](evidence/fresh/desktop-johari-blind-selection.png)说明「按你的了解选择区域；未知的部分留作问题」；极性展开及种子阅读另有假设提示。见 [PerspectivePanel.tsx:99](../../../src/components/dialogue/PerspectivePanel.tsx#L99)、[SeedInspector.tsx:117](../../../src/components/dialogue/SeedInspector.tsx#L117)、[model.ts:157](../../../src/features/perspectives/model.ts#L157)。没有证据支持把这一版本直接判为「AI 在断言用户的盲区」。
- **手势与注意力保护。** 双指动作先区分旋转或缩放，抬手前锁定模式；额外触点、失焦、后台恢复均有清理路径。见 [useStageTouchNavigation.ts:70](../../../src/components/dialogue/useStageTouchNavigation.ts#L70)、[useStageTouchNavigation.ts:99](../../../src/components/dialogue/useStageTouchNavigation.ts#L99)。等待期间用户继续写作时，结果是否自动聚焦也受注意力版本保护，见 [DialogueShell.tsx:1307](../../../src/components/dialogue/DialogueShell.tsx#L1307)。这些代码保护值得保留，但不等于本报告重新验证了真机手感或性能。

## 排序 findings

以下 Before / After 表只描述建议，并不表示已实施。

| ID / 优先级 | Before | After | Why |
| --- | --- | --- | --- |
| E-01 · P2 | 编辑维度后切到「观察」再回来，未保存的输入被静默还原 | 同一面板内切换观察与编辑时保留草稿；保存、取消各自承担明确语义 | 用户正在构造思考框架，不能把普通切页当成丢弃输入 |
| E-02 · P2 | 长文阅读中刷新后回到舞台，原段落位置消失 | 按工作区保存阅读节点与段落锚点，恢复阅读或在既有上下文提供继续阅读 | 内容还在并不等于思考位置还在 |
| E-03 · P2 | 模型失败时建议修改配置或切换模型，但网页没有相应入口 | 展示当前页面实际可做的重试、保留想法与继续写；技术诊断按需展开 | 恢复提示应把用户带回思考，而不是带去寻找不存在的设置 |
| E-04 · P2 | 搜索没有匹配项时声称「还没有可组合的种子」 | 区分没有其他种子与当前搜索无匹配，并给出清空搜索 | 不应把检索失败误导成需要重新生成内容 |
| E-05 · P3 | 键盘开读仍重放 340 ms 的空间入场 | 键盘开读直接呈现；指针开读保留更短、更轻的来源过渡 | 高频阅读切换的时间成本会累积，软糯不必表现为每次都等待 |

### E-01 · P2 · 切换观察与编辑静默丢弃维度草稿

**性质：已证实行为；UX 缺陷判断。置信度：高。**

触发：打开「换个角度」→「编辑维度」，把「尺度」改为「临时未保存名称」→点「观察」→再点「编辑维度」。桌面与移动触摸视口的共享观察均记录名称恢复为「尺度」，没有提示。界面同时存在单独的「取消编辑」和「保存维度」，因而普通页签切换不应承担相同的丢弃语义。

证据：[桌面编辑中](evidence/fresh/desktop-dimension-unsaved.png)、[桌面往返后](evidence/fresh/desktop-dimension-after-tab-roundtrip.png)、[移动编辑中](evidence/fresh/mobile-390-dimension-unsaved.png)、[移动往返后](evidence/fresh/mobile-390-dimension-after-tab-roundtrip.png)。源码在每次点回编辑时执行 `setDraft(space)`，见 [PerspectivePanel.tsx:75](../../../src/components/dialogue/PerspectivePanel.tsx#L75)；独立取消、保存入口见 [PerspectivePanel.tsx:95](../../../src/components/dialogue/PerspectivePanel.tsx#L95)。

用户影响：自定义两端名称本身就是一次思考。回去看现有框架、再回来继续编辑，会让刚刚形成的措辞消失，迫使用户重做而不是接着想。

建议：在同一次面板打开期间保留维度草稿，观察页继续显示已保存框架；明确点击保存后才影响后续生成，点击取消才重置草稿。无需新增卡片、自动应用、强制确认弹窗或编辑向导。

验收：在桌面与移动端分别修改名称、两端、空间映射，观察 / 编辑往返两次后输入全部保留；未保存时生成框架不变；取消还原，保存生效；既有种子的历史角度保持不变。

### E-02 · P2 · 刷新保留了图，却没有接回正在阅读的位置

**性质：已证实行为；阅读连续性缺口。置信度：高。**

触发：打开一颗长文种子，滚到正文中段，再刷新。主线程在独立测试上下文记录两种视口的 `scrollTop=650`；刷新后 `readingOpen=false`，原聚焦节点仍为 `root`。用户回到了种子舞台，而不是原来的阅读位置。这里没有内容丢失证据，问题是重新定位成本。

证据：[刷新前](evidence/fresh/desktop-reading-before-refresh.png)、[刷新后](evidence/fresh/desktop-reading-after-refresh.png)，数值见 [共享事实记录](evidence/fresh/observations.json)。`readingOpen` 初始为 `false`，滚动位置只放在组件内的 `Map`，见 [DialogueShell.tsx:546](../../../src/components/dialogue/DialogueShell.tsx#L546)、[DialogueShell.tsx:573](../../../src/components/dialogue/DialogueShell.tsx#L573)；同会话读位恢复已有实现，见 [SeedInspector.tsx:40](../../../src/components/dialogue/SeedInspector.tsx#L40)。

用户影响：长文读到一个关键前提时，刷新或浏览器重新加载要求用户再次找球、开读、找段落。图谱和草稿恢复通过，不能覆盖这部分心流中断。

建议：延续已有按种子记录读位的做法，按工作区保存阅读对象与段落锚点。恢复时接回阅读；若产品选择不自动展开，也应让既有上下文中的一次操作回到原段落。关闭阅读后的刷新不应擅自重新打开。

验收：桌面、390 px 移动视口在长文中段刷新，能回到同一节点、同一段落；宽度变化时优先对齐段落而非机械恢复像素；主动关闭阅读后刷新保持关闭；切换工作区不串读位；合的正文也适用，恢复后仍可继续展开。

### E-03 · P2 · 失败提示把恢复责任交给了网页用户无法操作的配置

**性质：已证实呈现；恢复路径不一致。置信度：高。**

触发：生成服务过载。受控错误截图显示「稍后重试，或临时切换到其他模型服务」，但网页的更多菜单只有外观、渲染器、帮助等操作，没有模型服务切换入口。认证、连接错误分支还直接提示检查 `OPENAI_API_KEY`、`baseURL`。这些是部署者的诊断事项。

证据：[移动错误与重试](evidence/baseline/mobile-failure-retry.png)、[更多菜单](evidence/fresh/desktop-more-menu.png)。错误映射见 [DialogueShell.tsx:211](../../../src/components/dialogue/DialogueShell.tsx#L211)、[DialogueShell.tsx:235](../../../src/components/dialogue/DialogueShell.tsx#L235)；渲染与重试按钮见 [DialogueComposer.tsx:125](../../../src/components/dialogue/DialogueComposer.tsx#L125)。

用户影响：正在思考的人会去搜索一个不存在的设置，或误以为自己需要维护服务器。移动端「重试」另有一个需要看清的语义：它重发上次请求，旁边「生成」使用当前草稿；目前这一区别主要藏在按钮 `title` 中，见 [DialogueComposer.tsx:129](../../../src/components/dialogue/DialogueComposer.tsx#L129)。

建议：主要提示围绕当前真实可做的事：保留文字、稍后重试上次请求、继续写或先记下。可把重试按钮直接写清为「重试上次」。面向部署者的诊断可以按需展开，不需要因此新增面向普通用户的模型配置区。保留现有草稿不被重试覆盖的保护。

验收：过载、限流、认证、连接失败四类状态都不指向不存在的入口；触摸用户无需 hover 就能区分重试上次与提交当前草稿；错误前后图谱和草稿不丢失；用户能在当前画面选择重试或继续思考。

### E-04 · P2 · 组合搜索无结果被误说成没有种子

**性质：已证实文案与状态分支错误。置信度：高。**

触发：已有多颗种子，进入「组合」后输入不匹配的搜索词。界面显示「还没有可组合的种子。可以先写一个想法，或裂变当前种子」。实际只是当前关键词没有匹配。

证据：[搜索空态](evidence/fresh/desktop-combine-no-search-results.png)。源码先用搜索词过滤 `candidates`，再对 `!candidates.length` 一律显示无种子文案，见 [SeedInspector.tsx:83](../../../src/components/dialogue/SeedInspector.tsx#L83)、[SeedInspector.tsx:149](../../../src/components/dialogue/SeedInspector.tsx#L149)。

用户影响：寻找一个记得不完全的旧想法时，被引导去再生成一轮，破坏「利用现有理解建立新联系」的概念，也增加不必要的等待。

建议：空查询且没有其他可用节点时，保留真正的无种子提示；有查询但无匹配时显示「没有找到匹配的想法」，在原搜索行提供清空或缩短关键词的入口。保持文本式结果，不加空态卡片。

验收：同一工作区分别覆盖有结果、无匹配、确实只有当前种子三种状态；清空查询后已有种子立即重现；这些操作不发生成请求、不改变组合来源或现有图谱。

### E-05 · P3 · 高频键盘阅读仍重放 340 ms 的空间入场

**性质：时长已证实；体验影响属于启发式风险。置信度：行为高，主观影响中。**

触发：用键盘打开阅读。共享事实记录中，焦点已正确移交给 `conversation-panel-heading`，同时仍存在 340 ms 动画。阅读入口没有区分键盘与指针，也会在阅读对象变化时重播。

证据：[键盘开读后的稳定画面](evidence/fresh/desktop-keyboard-open-reading.png)、[动画时长记录](evidence/fresh/observations.json)。动画依赖和时长见 [SeedReadingContent.tsx:48](../../../src/components/dialogue/SeedReadingContent.tsx#L48)、[SeedReadingContent.tsx:61](../../../src/components/dialogue/SeedReadingContent.tsx#L61)。桌面单击还为双击推演保留 260 ms 判断窗口，见 [BubbleStage.tsx:877](../../../src/components/dialogue/BubbleStage.tsx#L877)；这是源码中的独立阶段，不是本报告测得的全设备端到端延迟。按压时球体可能已给出反馈，不能据此断言整个界面都没有响应。

用户影响：来源过渡在第一次理解空间时有用，但连续读正、反、合及其来源时，反复移动正文的收益下降。键盘焦点已到达而文字仍在入场，也会增加视觉与操作节奏不一致的风险。

建议：键盘开读直接呈现稳定正文；指针开读保留很轻的来源关联，优先试 120–180 ms 的小幅过渡。保留减弱动态效果设置和返回对象的焦点保护，不机械给所有动作加 spring；本项也不要求取消既有双击快捷操作。

验收：键盘反复打开、关闭、切换来源时正文不做位移入场，焦点与读位仍正确；指针进入时有即时选中反馈；连续阅读十颗种子后不发生动画积压、焦点遗失或滚动重置；减少动态效果时继续使用稳定呈现。

## 待验证假设与概念边界

**本轮双端均未证实明显的选句跳位，不列为修复项。** 源码确实在全文、逐句按钮、选句与行内追问之间切换 DOM，选择时也会收起前面的展开操作，见 [SeedPassage.tsx:54](../../../src/components/dialogue/SeedPassage.tsx#L54)、[SeedInspector.tsx:166](../../../src/components/dialogue/SeedInspector.tsx#L166)。最终 DOM Range 取证中，桌面同一句的 y 从 192.67 变为 208.19 px，移动视口从 251.11 变为 266.63 px，均只移动约 15.5 px，原句仍可见。对应 `scrollTop` 分别从 650 变为 537、538，不能单独据此判为跳位。见 [桌面选句](evidence/fresh/desktop-native-selection-mid-reading.png)、[移动选句](evidence/fresh/mobile-390-native-selection-mid-reading.png)、[最终双端事实记录](evidence/fresh/observations.json)。这不是实际手指拖选；真实手机拖选、开启追问及真键盘出现后的连续体验仍未覆盖。最终记录没有取证失败、浏览器错误或被拦截的模型 POST。

**空间视角与思考入口目前已有区分，应测试理解而非先改架构。** 观察页写明「下一次生成」与「只转动视角」，见 [PerspectivePanel.tsx:97](../../../src/components/dialogue/PerspectivePanel.tsx#L97)、[PerspectivePanel.tsx:112](../../../src/components/dialogue/PerspectivePanel.tsx#L112)。选择极性还会联动镜头，见 [PerspectivePanel.tsx:32](../../../src/components/dialogue/PerspectivePanel.tsx#L32)，因此新用户是否把拖动镜头误认为改变了思考维度，仍适合用简短任务访谈验证。没有证据支持直接增加教程、维度仪表盘或更多常驻控件。

极性选择页仍保留一个底部写作框，占位文案为「补充你的想法…」，见 [移动极性选择与写作框](evidence/fresh/mobile-390-polarity-with-composer.png)。本轮只确认它们并存，没有观察到用户误提交或无法理解的证据，因此不另造一项缺陷。

## 方法与局限

先读 `graphify-out/GRAPH_REPORT.md` 的 God Nodes 与核心 Communities，再调查阅读、选句、展开、视角、合流、草稿和手势相关源码。使用的是本地 Emil skill，没有额外竞品研究或第三方审阅服务。

本审阅者未自行操作浏览器，也未向真实模型发送请求。视觉证据包括实际逐张查看的同日同提交公网流程截图，以及主线程本轮在隔离上下文采集的截图与事实记录；独立性体现在分析与裁定独立，不是重复声称进行了一遍浏览器操作。素材来源与 live / controlled / synthetic fixture 区别见 [evidence/manifest.json](evidence/manifest.json)。长文刷新、维度编辑、键盘开读与搜索状态来自合成测试数据；不能把合成长文的重复文字当成模型重复生成的问题。

移动端证据为 390 px 触摸视口模拟，不是 iPhone 或 Android 真机持续性能测量。没有测量 GPU 热机、60 fps、心理心流或启发度，也没有对乔哈里相关心理效果作有效性判断。完整流程可用与真人是否持续沉浸是不同证据层级，现有自动化通过不代替后者。
