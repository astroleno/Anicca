# Anicca：Emil 独立 app 体验评审

日期：2026-10-28。范围为当前网页的 UI/UX、输入响应和状态连续性；本轮仅审阅，未修改产品、提交、推送或发布。以下 After 均为待实施提案。

## 版本、技能与证据边界

- 源码 HEAD：`8995c52917ebcb2aee7a345eb0883da928f95c33`。公网入口为 [aitoshuu.me/Anicca](https://aitoshuu.me/Anicca) 与 [tongye.me/Anicca](https://tongye.me/Anicca)；[发布状态](evidence/deployment-current.json)记录 release `/opt/anicca/releases/20261028-selection-intent`、Build ID `g1H9dsn-sTPdvQCvkB7Ww`。
- 使用 [Emil 路由](/Users/aitoshuu/.codex/skills/emil/SKILL.md)，选择最相关的 [emil-design-eng](/Users/aitoshuu/.cc-switch/skills/emil-design-eng/SKILL.md)。重点是操作被准确接住、关闭只作用于当前层、输入方式差异与状态连续性；没有把动画参数清单机械套入已有产品。
- 按要求先读图谱 God Nodes 和社区。社区 9 指向手势，社区 15 指向正文/追问，社区 14 指向本地状态；再检查相应源码。图谱生成于 10 月 25 日，只作导航，没有把节点数或推断边当作体验结论。
- 独立性：没有读取上一轮 Lama/Emil 独立报告或本轮 Lama 报告。只读取前轮三项修复的状态说明、同版验证数据及截图。新浏览器操作由主线程统一采集；本评审独立读取[主采集脚本](evidence/capture.mjs.txt)、[补充脚本](evidence/capture-supplement.mjs.txt)、[状态记录](evidence/app-flows.json)、[宽度边界](evidence/responsive-boundary.json)、[历史复核](evidence/history-recheck.json)、多张原图，并与源码对应。
- 新证据为隔离 Chromium 公网上下文：1440×900 桌面、390×844 触摸、360×780 暗色触摸、844×390 横屏触摸，各 13 个状态；另补7组中间宽度、平板、鼠标窗口及横屏归因，均无 `pageerror`。这些新采样使用aitoshuu入口，历史复核使用tongye入口，双域名完整生成流程来自下述同版既有数据。使用合成花园内容；4 次 POST 为受控 502，用于验证等待/错误表现，不代表线上接口发生 502。历史返回的来源页也是同源拦截夹具，以修正UTF-8后的历史复核为准；诊断时仅在隔离页面临时清零一次padding，未修改产品。
- 同版既有证据：[专项](../2026-10-28-lama-emil-postfix/verification/public-targets.json)、[受控流程](../2026-10-28-lama-emil-postfix/verification/public-controlled.json)、[真实接口流程](../2026-10-28-lama-emil-postfix/verification/public-live.json)、[帮助布局](../2026-10-28-lama-emil-postfix/verification/guide-layout.json)。真实接口记录为双域名×桌面/移动、24 次请求成功；本轮没有重新生成这些请求。
- 已通过 `view_image` 实际查看新证据中的桌面菜单前后、移动极性选择前后、移动全景及返回、暗色设置和错误、横屏入口与阅读、768平板、680/981宽度对照、清零padding诊断及历史来源页；另看同版桌面、390 移动合成、360 暗色帮助、320 窄屏帮助、横屏帮助、拖选前后及迟到回应等图片。截图用于核对布局，动态行为以状态序列及脚本为依据。
- 未验：iPhone Safari/Chrome、Android 真机、真实软键盘、系统选区手柄、系统边缘返回手势、系统大字、持续 GPU 帧率/耗电和辅助技术实机。触摸视口加键盘事件不能替代这些验证。

## 总体判断

当前页面已经具备较完整的 app 式工作状态：舞台与阅读相互转换，草稿和阅读位置能接续，等待可以取消，错误可以重试，手势有明确的接管与取消路径。无卡片的阅读、低饱和软糯种子与克制的操作文字是一致的；没有证据支持通过新增面板、装饰动画或原生重写来改善它。

主要缺口是两处具体的不连续：681–980px中间宽度的主输入离开可视范围，以及部分 Escape 操作一次退出了超过当前层的状态。它们比增加动效更直接地影响“界面听懂了我这次操作”的感觉。本轮确认 **2 项 P2，未发现 P0/P1**。

## 已确认的问题

| 项目 | Before | After（待实施提案） | Why |
| --- | --- | --- | --- |
| E01 · P2 · 中间宽度主输入屏外 | 681–980px范围的已测平板、横屏和鼠标窗口均因额外176px预留使输入完全屏外；844×390空白触摸滑动只平移舞台，输入仍不可见。 | 在当前舞台布局中消除遗留移动输入预留对壳外盒高度的影响，让舞台、输入和顶部工具共同按实际可视高度布局；回归680/681、980/981边界及短高度。 | 写下想法是主入口；正常触摸无法通过页面滚动找到它，键盘聚焦补偿又会把顶部工具滚走。 |
| E02 · P2 · Escape 关闭层级不一致 | 阅读中打开“更多”后一次 Escape 同时关闭菜单与阅读；打开极性选择后，默认标题焦点上的 Escape 也直接退出整个阅读。 | Escape 每次只撤销当前最高层状态：菜单→阅读，极性选择→原文阅读，再次 Escape 才返回舞台；被内层消费的按键不能继续触发外层关闭。 | 用户是在取消刚打开的选择或菜单；应保留其下的阅读语境，并与现有“返回阅读”及角度/全景的关闭行为一致。 |

### E01 · 中间宽度的主输入完全离开可视范围

**触发与复现：**以681×700、768×1024触摸平板、844×700鼠标窗口、980×700或844×390横屏打开当前公网入口，停留在初始舞台，输入均完全屏外（`visibleHeight=0`）。例如768平板壳高1200，输入y=1128；844横屏壳高566，输入y=494。680×700与981×700对照中，壳高等于700，输入完整44px可见；媒体查询边界与实测吻合，不是横屏特有问题。

844×390的空白触摸滑动后，`scrollY`仍为0，舞台平移-96px，输入仍屏外；主采样通过脚本聚焦输入才让页面滚176px，顶部工具随后离屏。补充诊断仅在隔离页面把壳 `paddingBottom` 临时改为0：壳566→390、输入y=494→318、可见高度0→44px。该诊断支持归因，不是已实施的修复。

**影响：**受影响的触摸与鼠标窗口无法直接发现或触达最常用的写作入口；键盘聚焦补偿又移动整个工作场景。问题在常见平板宽度也出现，因此按P2处理。当前证据证明的是页面布局问题，未借真实软键盘作解释，也未声称输入永久不可用。

**源码定位：**[DialogueShell.module.css:21](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:21) 定义176px旧预留；[同文件:1912](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:1912)在≤980px将它加到壳 `padding-bottom`，但仅[同文件:2303](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2303)的≤680px将其清零。后续[同文件:2998](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2998)改成可视高度壳、[同文件:3879](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3879)改为 `overflow: clip`，没有清除这段padding；content-box外盒因此比可视高度多176px，输入仍按[同文件:3980](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3980)的底部定位。[layout.tsx:9](/Users/aitoshuu/Documents/GitHub/Anicca/src/app/layout.tsx:9)的body禁止普通页面滚动；舞台的[触摸接管](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3860)也使滑空白成为平移。

**证据与置信度：**[768平板首屏](evidence/tablet-768-initial.png)、[680正常对照](evidence/boundary-680-initial.png)、[981正常对照](evidence/boundary-981-initial.png)、[横屏首屏](evidence/landscape-844-initial.png)、[临时清零padding诊断](evidence/landscape-844-temporary-padding-zero.png)、[七组边界数据](evidence/responsive-boundary.json)、[主采样状态](evidence/app-flows.json)；**高**。样本点为681/768/844/980px，连续681–980px范围由同一媒体查询和两侧边界共同支持。

### E02 · 一次 Escape 撤销了两个交互层级

**路径 A：**打开种子阅读，滚至 `scrollTop=650`，打开“更多”，按一次 Escape。四个视口均从 `readingOpen=true, menuOpen=true` 变为两者均 false，焦点回到种子。预期只关菜单，保留阅读；这里没有证据证明草稿或阅读位置被删除，问题是被迫退出阅读并重新进入。

**路径 B：**阅读中打开“看极性两端”，等待默认焦点进入“沿极性展开”标题，不移动焦点，按 Escape。四个视口均直接回舞台，而不是执行同屏“返回阅读”的行为。若按键来自选择框内部，源码又有局部返回处理，因此结果还取决于当前焦点位置。

**源码定位：**路径 A 的内层 [WorkspaceBar.tsx:127](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:127) / [同文件:153](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:153) 只 `preventDefault()`；外层 [DialogueShell.tsx:861](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:861) 仍处理已经被消费的 Escape。路径 B 在 [SeedInspector.tsx:64](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:64) 把焦点放到标题，但 Escape 返回仅注册于 [同文件:123](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:123) 的 fieldset；标题不是其子元素，按键进入外层关闭路径。两种表现合并为一项关闭层级问题，实施时两条路径都需覆盖。

**证据与置信度：**[桌面菜单与原文](evidence/desktop-reading-more.png) → [一次 Escape 后](evidence/desktop-after-more-escape.png)；[移动极性标题焦点](evidence/mobile-390-polarity-title-focus.png) → [一次 Escape 后](evidence/mobile-390-after-polarity-title-escape.png)；[动态状态](evidence/app-flows.json)中的四个上下文；**高**。关闭后的截图处于舞台透明度过渡中，不用该瞬间的浅淡标签评价最终对比度。

## 已具备的连续性与三项修复核实

| 检查面 | 观察及源码依据 | 判断边界 |
| --- | --- | --- |
| 阅读与覆盖层 | 新采样中，“换个角度”与全景关闭后均保留原文 `scrollTop=650`，焦点分别回触发按钮；全景连续10次 Tab 均位于内部。[阅读返回图](evidence/mobile-390-after-panorama-escape.png)。[字符锚点恢复](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/readingPosition.ts:18)、[阅读 journal](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useReadingJournal.ts:29)、[全景焦点管理](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/EvolutionOverview.tsx:90)相互对应。 | 不把程序设定滚动位置当真人阅读实验；这里只验证位置和焦点连续性。 |
| 等待、取消、错误 | 输入中有已用秒数与分阶段文案，可以继续写、取消和重试；受控502后当前文本仍在，暗色错误及重试按钮可见。[错误图](evidence/mobile-dark-error-recovery.png)、[等待/错误实现](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueComposer.tsx:111)、[取消实现](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1432)。同版受控记录还覆盖取消迟到结果与重试保留新草稿。 | 未将受控502记成线上可靠性缺陷；真实服务耗时以既有真实接口记录为准。 |
| 原生拖选 | 同版专项记录在指针按住、前拖及回拖时正文未变、引用未提前出现，松手后才提交最终范围；已实际看[按住图](../2026-10-28-lama-emil-postfix/verification/aitoshuu.me-drag-before-release.png)与[松手图](../2026-10-28-lama-emil-postfix/verification/aitoshuu.me-drag-after-release.png)。[SeedPassage.tsx:35](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:35)在选择手势完成前不重组正文。 | 前轮修复成立，不重复提报。系统选区手柄仍未验。 |
| 退出后的迟到回应 | 同版双域名×双端专项均在阅读完全退出后释放回应，阅读保持关闭，刷新后回应仍可主动打开；[注意力版本保护](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1863)与[退出版本更新](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:560)一致。 | 前轮修复成立，不把“回应保存”误判为抢焦点。 |
| 输入方式与帮助 | 帮助与舞台共用 [coarse-pointer 检测](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useCoarsePointer.ts:5)和[同一手势文案](/Users/aitoshuu/Documents/GitHub/Anicca/src/features/dialectic/platform.ts:8)。已看320窄屏、暗色、桌面与横屏帮助图；帮助本身没有横向溢出。 | 前轮修复成立；帮助布局通过不代表 E01 的整个壳布局通过。 |
| 单/双指接管与取消 | [useStageTouchNavigation.ts:135](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useStageTouchNavigation.ts:135)在第二指进入时接管视角，余指不接着拖种子；[BubbleStage.tsx:675](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:675)处理 capture、取消、失焦、离开页面及停留后移开失效。同版受控流程已覆盖直接拖拽、停留松手、取消与迟到结果。 | 本轮没有新增真机双指测试；不把源码保护直接等同于所有硬件手势均已验证。 |
| 动效与默认渲染 | [阅读动效](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedReadingContent.tsx:24)为指针160ms进入/120ms退出，键盘及减少动态效果路径即时处理；[设备默认值](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useLiquidRenderer.ts:6)保留桌面TSL自动、移动原版，同版受控数据包含手动切换、刷新保留与故障回退。 | 不建议新增错峰或弹簧装饰；快速反转动效的逐帧连续性和真机性能本轮未量测。 |

## 设计取舍与启发式观察（不计为确认缺陷）

| 主题 | 已知行为 | 评审意见 |
| --- | --- | --- |
| 浏览器/系统返回 | 源码没有将阅读状态压入浏览器 history；[UTF-8历史复核](evidence/history-recheck.json)中 Back 离开app到同源来源页，Forward恢复阅读及 `scrollTop=650`；[本地阅读恢复](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useReadingJournal.ts:29)。 | 当前遵循网页历史，不是阅读层级返回。是否映射为“先关覆盖层”需要产品决定；现有可见返回入口和本地保存存在，不能仅因与原生app不同记高严重度。系统侧滑/Android返回手势未验。来源夹具初版乱码不属于产品问题。 |
| 鼠标单击等待 | [BubbleStage.tsx:859](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:859)为区分双击推演，鼠标单击阅读设置260ms定时；触摸与键盘选择直接执行。 | 这是高频阅读与双击快捷动作的明确取舍。可以评估保留即时按下反馈或调整双击策略，但本轮没有真实操作延迟分布或用户失败证据，不把260ms直接升级为新的P2。 |
| Enter 与换行 | [DialogueComposer.tsx:103](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueComposer.tsx:103)统一采用非组合态Enter提交、Shift+Enter换行。新触摸视口键盘事件也触发POST，未插入换行。 | 长文字输入值得明确移动换行政策，但实际软键盘、中文IME、换行键表现均未在真机验证。保留为输入设计决策；不能声称已复现“手机软键盘无法换行”。 |
| 滚动与空间惯性 | 正文保留浏览器滚动，使用 `overscroll-behavior: contain`；舞台采用受控平移/旋转，不是可滚动长页。 | 不强加原生抽屉橡皮筋、甩动关闭或地图惯性；先保证现有手势的可取消与接管。真实阅读滚动惯性/边缘返回冲突仍需真机观察。 |
| 视觉与平台形态 | 桌面、竖屏、暗色和窄屏证据维持同一软糯、低饱和语言；主要阅读没有卡片壳。 | 保留当前设计。缺少PWA安装入口本身不构成缺陷；不要求换原生库或新增操作面板。 |

## 收口

本轮交付为审阅结果及待实施方向。E01、E02 尚未修复；其余表中有证据边界的事项未被伪装为通过或缺陷。建议先处理可视范围与关闭层级，再决定鼠标双击和移动输入政策；三项前轮修复不重复进入问题清单。
