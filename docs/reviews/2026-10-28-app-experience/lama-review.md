# Lama 独立评审：Anicca 的 app 体验与 UI/UX

> 评审日期：2026-10-28。本文为审阅交付，不包含产品修改、提交、推送或发布。

## 版本、方法与独立性

- 源码：`8995c52917ebcb2aee7a345eb0883da928f95c33`。
- 公网页面：[aitoshuu.me/Anicca](https://aitoshuu.me/Anicca)、[tongye.me/Anicca](https://tongye.me/Anicca)。[本轮部署核对](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/deployment-current.json) 指向 `/opt/anicca/releases/20261028-selection-intent`，build ID 为 `g1H9dsn-sTPdvQCvkB7Ww`，源码版本与上项一致。
- 技能：先读 [Lama 路由技能](/Users/aitoshuu/.codex/skills/lama/SKILL.md)，再读 [Appllama App Design Skill](/Users/aitoshuu/.cc-switch/skills/appllama-app-design-skill/SKILL.md)。仅采用导航、状态完整性、触摸可达性、层级与内容连续性方面的标准。项目是 mobile web，Expo、React Native、原生控件、MMKV 等实现规定不作为网页缺陷；没有扩展到外部竞品研究。
- 先读 [Graph Report 的 God Nodes 与社区](/Users/aitoshuu/Documents/GitHub/Anicca/graphify-out/GRAPH_REPORT.md:381)，据社区 1/4/5/9/14/15/17 定位交互、状态、阅读与空间模块，再核对当前源码。该图谱生成于 10 月 25 日，只作为导航，不作为当前行为证据。
- 本报告独立形成结论：未阅读上一轮 Lama/Emil 独立评审，也未阅读本轮另一份独立报告。共享主线程采集的客观浏览器证据；没有自行启动浏览器、子 agent 或工作树。
- 保留既定方向：无卡片、低饱和软糯舞台、桌面 TSL 自动与移动原版、手动切换和回退。不以增加新面板或整体重设计作为修复方向。

## 证据来源与能力边界

已审阅同版 [public-targets.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/public-targets.json)、[public-controlled.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/public-controlled.json)、[public-live.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/public-live.json)、[guide-layout.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/guide-layout.json)，以及部署/源码一致性记录。这些记录区分受控回复与真实生成：两站均有桌面和移动视口的真实生成路径；恢复、迟到响应、拖动与渲染回退主要来自受控检查。

本轮另读主线程共享的 [app-flows.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/app-flows.json) 及 [采集脚本](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/capture.mjs.txt)。它在公网版的隔离 Chromium 上，以合成社区花园数据运行桌面 1440×900、触摸 390×844、触摸横屏 844×390、暗色触摸 360×780 的 13 个状态，四组均完成且没有 pageerror；502 失败由脚本故意注入，用于查看恢复，不是发现公网服务故障。浏览器 Back/Forward 使用同源拦截的静态来源夹具，只证明该浏览器导航操作的结果。

另读 [responsive-boundary.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/responsive-boundary.json) 的七组宽度/高度测量、触摸滑动和临时样式归因，以及 [history-recheck.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/history-recheck.json) 的 UTF-8 来源夹具复测。历史返回结论以这次复测为准；初次来源夹具的乱码不是产品问题。临时样式只影响一个隔离浏览器上下文，没有修改产品。

本人通过 `view_image` 实际查看了桌面、320px 窄屏、暗色移动、横屏、拖选前后、移动合流及继续展开等多张原始截图，包括：

- [桌面舞台](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/guide-desktop.png)、[320px 窄屏](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/guide-mobile-320.png)、[暗色移动](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/guide-mobile-dark.png)。
- [桌面阅读/拖选中](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/aitoshuu.me-drag-before-release.png)、[松开后的选句操作](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/aitoshuu.me-drag-after-release.png)。
- [移动合流](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/mobile-live-synthesis.png)、[合后继续展开](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/mobile-live-continued.png)、[桌面继续展开](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/desktop-live-continued.png)。
- 本轮 [横屏初始状态](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-landscape-entry.png)、[横屏阅读](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-landscape-reading-middle.png)、[横屏聚焦后的恢复状态](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-landscape-error-recovery.png)、[暗色失败恢复](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-dark-error-recovery.png)、[暗色思考空间](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-dark-perspective.png)，以及下文两组 Esc 前后图和全景返回图。

浏览器移动视口和触摸事件仿真不能证明真实单手舒适度、iOS/Android 系统返回、软键盘动画、安全区实际表现或低端设备帧率。静态截图只支持布局与可见状态判断，不能证明心理心流或认知负担已被消除；生成节点数也不能证明洞见质量。本文不宣称完成这些真机研究或性能测量。

## 总体判断：核心路径已经连贯，中等宽度入口与返回层级仍需校准

这版已能形成明确的使用循环：点种子阅读，围绕原句追问，选择推演正反或从极性两端观察，让想法相遇，再从合流结果继续。已查看的竖屏手机与宽桌面布局把输入保持在底部，阅读直接发生在舞台上，低频管理操作退到“更多”，与既定安静、无卡片的方向一致。它的 app 感主要来自状态连续性与可恢复性；没有必要为了形式上的原生外观重做布局。

但不能给出无条件通过：本轮中等宽度布局的输入整体落在视口外，横屏聚焦后又把顶部工具带出屏幕；Esc 在“更多”和极性选择中还会多退一层。前者阻断该布局下直接写入，后者打断已打开的阅读上下文。它们是可复现的操作问题，不是原生外观偏好。

| 核心路径 | 已有支持 | 判断边界 |
|---|---|---|
| 打开种子 → 阅读 → 回到舞台 | 阅读时舞台淡出，显式“返回种子”、点击外部和 Esc 可退出；关闭后恢复种子焦点 | Esc 在嵌套操作中会越级关闭阅读，见 LAMA-02 |
| 阅读 → 选句 → 追问 | 原句附近出现动作和输入，保留引用来源；正文滚动位置有独立记录 | 已有动态证据支持拖选结束前稳定；没有真机原生选区手柄证据 |
| 等待 → 继续写 → 取消/失败重试 | 输入在等待时可编辑；提供时间、取消和重试；草稿与请求版本分离 | 受控检查支持恢复正确性，不等于真实服务耗时或键盘体验达标 |
| 正反/极性 → 合流 → 再展开 | 结果上下文标明来源与继续入口；合后能沿新理解继续 | 两套概念是否被新用户准确理解，仍需任务研究，不能凭截图认定混乱 |
| 移动触摸与窄屏 | 球体定义了 44px 命中区域下限；文本组合入口使合流不必依赖精准拖动；320px 舞台与底部输入可见 | 中等宽度输入不可见已确认；单手舒适度与真实大字/键盘仍未验证 |

源码依据：[阅读外部退出与舞台隔离](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedReadingContent.tsx:63)、[关闭后焦点恢复](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:832)、[阅读记录](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useReadingJournal.ts:29)、[等待/取消/错误入口](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueComposer.tsx:99)、[球体命中区域](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3930)。

## 确认问题

### LAMA-01 · P1：中等宽度布局把核心输入放到可视区域之外

**触发与影响：** 已有工作区在 681–980 CSS px 这一媒体组合范围内加载时，底部“写下一个想法/生成”主入口整体落到可视区域外。横屏手机、平板竖屏和中等桌面窗口均有实测命中；普通触摸滑动只移动舞台，不能把输入滚出来。通过程序聚焦可以绕到输入，却会滚走顶部工具。它使一个完整布局段无法直接开始主任务，故定为 P1；不是要求横屏完全复制竖屏，也没有把仿真当作所有真实设备的证明。

**复现：** 用浏览器设置下表任一失败视口，进入公网已有工作区，不聚焦输入。检查屏幕底部无输入；844×390 时在舞台空白处向上滑动，输入仍不可见。可与 680、981 两侧尺寸直接比较。

| Chromium 视口 | 实际 shell 高度 | 输入纵向位置 | 输入可见高度 |
|---|---:|---:|---:|
| 680×700，触摸 | 700 | 628–672 | 44px |
| 681×700，触摸 | 876 | 804–848 | 0px |
| 768×1024，触摸平板 | 1200 | 1128–1172 | 0px |
| 844×700，鼠标窗口 | 876 | 804–848 | 0px |
| 980×700，触摸 | 876 | 804–848 | 0px |
| 981×700，触摸 | 700 | 628–672 | 44px |
| 844×390，触摸横屏 | 566 | 494–538 | 0px |

**证据与归因：** [边界测量](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/responsive-boundary.json) 同时记录 `boxSizing=content-box`、`paddingBottom=176px`、`bodyOverflow=hidden`。844×390 的空白滑动后 `scrollY=0`，只有舞台 pan 改变；在该隔离上下文仅临时设 `padding-bottom:0` 后，shell 从 566 回到 390，输入从 y=494 回到 y=318，完整露出 44px。这一受控诊断支持遗留占位导致盒子增高，不能把诊断截图当成已经修复上线。

本人已查看 [平板初始状态](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/tablet-768-initial.png)、[680px 正常对照](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/boundary-680-initial.png)、[981px 正常对照](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/boundary-981-initial.png)、[横屏失败状态](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/landscape-844-initial.png) 和 [临时去占位诊断](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/landscape-844-temporary-padding-zero.png)。主流程记录还显示输入聚焦后 `shell.y=-176`，对应 [顶部被滚走的恢复图](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-landscape-error-recovery.png)。

**准确源码位置：** [≤980px 的 shell 遗留底部占位](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:1918) 使用 [176px reserve](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:21)，但 [≤680px 才清零](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2304)；[最终 shell 高度](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2998) 和 [overflow clip](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3879) 没有清除这段 padding。输入所在 [绝对定位 workspace](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3122) 因而跟随更高的壳；[composer 的底部定位](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3975) 本身并不知道它已超出可视视口。

**修复方向与验收：** 在最终舞台布局中处理遗留占位和盒模型，保证 shell 实际高度等于可视视口。回归 680/681、980/981 边界、768×1024、844×700 和 844×390，初始状态就能看到并点到输入与生成；聚焦、退出输入以及阅读滚动后顶部工具仍在视口内。无需增加新面板或改变风格。**置信度：高**，边界对照、几何数据、诊断干预与源码一致；尚未覆盖 Safari/Android 真机。

### LAMA-02 · P2：Esc 在嵌套操作中越级关闭阅读

**触发与影响：** 阅读中打开“更多”，原意只收起菜单的一次 Esc 同时关闭阅读；打开“看极性两端”后，在自动获得焦点的标题上直接按 Esc，也从极性选择直接退到种子舞台，而不是回到阅读。相同返回动作取决于当前焦点落在标题还是 radio 上，用户必须重新打开种子才能继续。未发现内容丢失，影响主要是操作可预测性与上下文连续性，定为 P2。

**复现：**

1. 打开一颗长文种子并滚至中段，打开“更多”，按一次 Esc。实际 `menuOpen=false` 且 `readingOpen=false`；应只关闭菜单并保留阅读位置。
2. 打开种子，点“看极性两端”，不再切焦点，直接按 Esc。实际自动聚焦 `H2#conversation-panel-heading` 后关闭整个阅读；显式“返回阅读”和 radio 内 Esc 则只回到正文。

**证据：** 四种本轮视口均复现，见 [app-flows.json 的 reading-more / after-more-escape、polarity-title-focus / after-polarity-title-escape](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/app-flows.json)。本人已查看 [菜单打开](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-390-reading-more.png) → [一次 Esc 后阅读也关闭](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-390-after-more-escape.png)，以及 [极性标题焦点状态](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-390-polarity-title-focus.png) → [一次 Esc 后舞台](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-390-after-polarity-title-escape.png)。

**源码定位：** [Shell 的全局 Esc](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:863) 不检查 `event.defaultPrevented` 或当前内部步骤；[菜单 Esc](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:127) 只 `preventDefault`，事件仍能到 Shell；[极性打开后聚焦标题](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:67)，但 [极性 Esc 拦截](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:123) 只位于标题之外的 fieldset。已有测试也只覆盖 [radio 获焦路径](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.test.tsx:95)。

**修复方向与验收：** 让当前最内层操作先消费 Esc，一次只退一层。菜单关闭后正文与 scrollTop 保留并回焦“更多”；极性选择无论标题、按钮还是 radio 获焦，都先回正文、恢复阅读位置并回焦“看极性两端”；再按 Esc 才回舞台。保持角度对话框和全景已经正确的返回行为，无需增加新面板。**置信度：高**，动态状态与源码相互支持。

对照结果：同一套新证据中，思考空间和演化全景 Esc 关闭后均保留阅读 `scrollTop=650` 并回到各自触发按钮；全景内连续 10 次 Tab 均留在全景。故本项不泛化为“所有返回都坏了”。[全景](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-390-panorama.png) → [正确回到阅读](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/mobile-390-after-panorama-escape.png)。

## 设计取舍与启发式建议

1. **保留网页自己的返回约定，先定义层级再决定是否接入 history。** 本轮浏览器 Back 的夹具复测实际离开 app，Forward 后恢复阅读及 `scrollTop=650`；不是逐层关闭阅读。该行为与本地状态设计一致。没有 PWA 安装入口、浏览器 Back 不逐层关闭本地覆盖层，本身不足以构成高严重度问题。若要改变浏览器 Back，需要先约定“关闭当前层”和“离开站点”的边界，不能机械套用原生导航栈。该结果不外推为 iOS 边缘滑动或 Android 系统键已经真机验证。[返回复测](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/evidence/history-recheck.json)、[入口](/Users/aitoshuu/Documents/GitHub/Anicca/src/app/page.tsx:1)、[阅读持久化](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useReadingJournal.ts:41)、[草稿离开时保存](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:654)。
2. **单手体验先验证高频任务，不必移动所有顶部工具。** 底部输入、正文中的组合入口和点击外部收起，已经提供易到达的主路径。可让用户单手完成“读一颗 → 追问 → 回去 → 合后继续”，观察是否反复被迫改握，再决定是否调整现有入口。没有手持观察证据，不把顶部“换个角度/全景/更多”直接判成缺陷。
3. **两种展开方式已有解释，认知成本仍是研究假设。** “推演正反/推进判断，检验前提”和“看极性两端/换观察位置，看见两端”已在动作旁分开说明。建议用任务问用户在生成前能否说清下一步会得到什么、合后从哪里继续；根据真实误解微调既有文案，不加新的教程面板。[展开动作](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:107)、[极性选择说明](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:123)。
4. **少量次级文字入口低于技能的 44px 目标，作为触摸优化候选。** “选一句追问”的入口高度为 36px；角度提示切换和若干 details 为 32px；低高度媒体查询还会将底部种子动作降到 32px。可在现有文字外扩透明命中区域，不必改变无卡片视觉。没有误触或无法操作的动态证据，故不单独制造 P2。[选句入口](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.module.css:3)、[角度切换](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4047)、[横屏动作](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4132)。
5. **真机验证重点放在软键盘、文字放大与横屏。** 主输入为 16px，页面按 visualViewport 更新高度，inline 追问会把当前表单滚入可见处；这些是合理防护，但不能替代真机。思考维度编辑输入仍为 14px，应在 iOS 真机检查聚焦后的浏览器缩放与键盘遮挡，连同 Android Back 收键盘后能否保留阅读位置一起验证。[主输入](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3988)、[视口处理](/Users/aitoshuu/Documents/GitHub/Anicca/src/features/dialectic/platform.ts:14)、[inline 输入可见性](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:668)、[维度编辑输入](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/PerspectivePanel.module.css:48)。
6. **手机 Enter 是提交还是换行，需按写作任务确认。** 已确认触摸仿真视口中，普通 Enter 触发受控 POST，草稿没有新增换行；[源码](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueComposer.tsx:103) 对所有设备采用 Enter 提交、Shift+Enter 换行。它可能符合短句输入习惯，但长段想法在手机上的换行需求值得验证。当前没有手机回车必须换行的既定验收，也没有真实软键盘证据，因此不把这一行为直接列为 P2 或声称所有手机都会误提交。

## 上轮三项修复的核实

- **拖选结束前正文和控件稳定：** `SeedPassage` 在 pointer/Shift 选择尚未结束时不会提交切分后的选句状态；同版动态记录覆盖拖动中多次延长、缩短选区，原正文保持不变。此次不重复报错。[源码](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:35)、[动态记录](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/public-targets.json)。
- **显式退出后迟到追问只保存：** 退出增加 attention version，回复写入后只有版本仍相同才切阅读焦点；两站桌面/触摸视口的受控记录均显示退出后未重新打开阅读，刷新后仍能读到回应。[源码](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:560)、[回复提交与焦点门槛](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1863)、[退出后截图](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/aitoshuu.me-mobile-after-reply.png)。
- **首次帮助与舞台共用 coarse pointer 语义：** 帮助使用同一 hook 和 `stageGestureHint`；同版布局记录包含桌面、320px、暗色移动和横屏的相符文案。[帮助](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedGuide.tsx:27)、[语义来源](/Users/aitoshuu/Documents/GitHub/Anicca/src/features/dialectic/platform.ts:8)、[视口记录](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-lama-emil-postfix/verification/guide-layout.json)。

## 交付状态

本轮仅写本报告，确认两项：P1 输入入口在中等宽度布局不可见；P2 Esc 越级关闭阅读。其余建议保持为设计取舍或研究假设，上轮三项修复没有重复误报。源码只读；未新增测试、未重跑完整测试套件。动态与生成结果均明确按共享记录引用，不冒称本人执行。真实软键盘、系统手势、大字、安全区与帧率验证仍未完成，本文不以这些未验证项宣称产品通过或给出额外缺陷定级。
