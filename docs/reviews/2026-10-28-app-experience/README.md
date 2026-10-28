# Anicca app 体验与 UI/UX：Lama / Emil 独立复审

日期：2026-10-28。审阅版本 `8995c52917ebcb2aee7a345eb0883da928f95c33`，公网 release 为 `/opt/anicca/releases/20261028-selection-intent`，Build ID `g1H9dsn-sTPdvQCvkB7Ww`。

本文保留两份独立审阅和主线程汇总时的版本、定级与修复前证据。**后续A01、A02已修复并同步两个公网入口**，692项测试、Linux生产构建、双端受控与真实完整流程通过，见[修复与验收记录](fix-verification.md)。下文的修复方向属于当时审阅提案，不改写历史判断。

后续已完成[主线程第二轮复核](recheck.md)：在两个公网入口的全新空白工作区、窗口缩放/刷新和不同 Escape 焦点路径中重新验证。两项均成立，维持下述主线程 P1 / P2 顺序；Lama、Emil 的独立原文和定级保留。

## 结论

当前页面的 app 感主要来自阅读位置、草稿、焦点和生成状态能接续。舞台、原句追问、正反/极性展开、合流与继续展开已有连贯路径；无卡片、低饱和软糯的视觉语言宜继续保持。本轮没有发现需要整体重设计、原生重写或增加操作面板的证据。

独立审阅合并后有 **2 类确认问题**：中等宽度下主输入落到屏幕外，以及嵌套操作的 Escape 关闭层级不一致。上一轮三项修复仍成立，没有重复列入缺陷。真实软键盘、系统返回手势、大字模式、单手舒适度和持续 GPU 性能不在本轮已验证结论中。

| 合并项 | 影响与复现 | 独立定级 | 主线程处理优先级 |
| --- | --- | --- | --- |
| A01 · 中等宽度主输入屏外 | 681×700、768×1024 平板、844×700 桌面窗口、980×700 均看不到主输入；844×390 横屏同样受影响。680/981px 对照正常。 | Lama P1；Emil P2 | **P1**：普通平板与桌面窗口也受影响，核心写作入口不能直接发现、触达，应先修。没有数据丢失证据。 |
| A02 · Escape 越级关闭阅读 | 阅读→更多→Escape 同时关闭菜单和阅读；阅读→看极性两端→默认标题焦点→Escape 直接退出阅读。两条复现合并为同一层级问题。 | Lama P2；Emil P2 | **P2**：一次撤销应只处理最高层；正文、滚动位置和触发按钮焦点应保留。 |

严重度分歧保留在各自报告中。两位审阅者对 A01 的复现与机制一致；分歧是其影响应归为优先修复的核心入口阻断，还是有改变窗口/方向、键盘聚焦等替代方式的局部可用性问题。上表 P1 为主线程的排序判断，不冒称两份报告一致定级。

## A01 的边界与机制

[响应尺寸记录](evidence/responsive-boundary.json)包含初始状态、计算样式、几何尺寸与可见高度：

| 视口 | 输入可见高度 | 壳外盒高度 | 底部 padding |
| --- | ---: | ---: | ---: |
| 680×700 触摸 | 44px | 700px | 0px |
| 681×700 触摸 | 0px | 876px | 176px |
| 768×1024 触摸平板 | 0px | 1200px | 176px |
| 844×700 鼠标桌面窗口 | 0px | 876px | 176px |
| 980×700 触摸 | 0px | 876px | 176px |
| 981×700 触摸对照 | 44px | 700px | 0px |
| 844×390 触摸横屏 | 0px | 566px | 176px |

当前壳使用 `content-box`。旧 ≤980px 规则给壳保留了 176px 输入空间，而 ≤680px 才清零；后续规则改为实际视口高度和 `overflow: clip`，没有清掉中间宽度的 padding。CSS 对应范围为 `680px < width ≤ 980px`，整数宽度即 681–980px；上表为离散实测，不宣称逐个宽度或所有浏览器均已测试。

来源：[旧预留](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:21)、[≤980px 规则](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:1912)、[≤680px 清零](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2303)、[当前视口高度壳](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2998)、[裁剪](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:3879)。

横屏空白区触摸滑动后 `scrollY` 仍为 0，输入仍不可见。仅在隔离浏览器 DOM 中临时将壳 padding 置零，壳高度即由 566→390，输入 y=494→318，44px 输入完整显示。这支持原因判断；该临时实验没有修改产品或发布修复。主采集脚本的自动聚焦曾使页面整体上移 176px，这也不能当成用户能自然找到输入的通过证据。

建议在现有布局中统一壳外盒与实际视口的关系，消除重复预留，并回归上述边界、短高度、阅读及输入聚焦/失焦；不要只为横屏添加一个特例。

## A02 的两条复现与对照

[动态记录](evidence/app-flows.json)中四个视口均复现：

1. 长文阅读→滚动至 650→打开更多→一次 Escape：`menuOpen` 和 `readingOpen` 同时变为 false。菜单处理调用了 `preventDefault()`，但外层仍消费同一事件。
2. 阅读→看极性两端→标题自动获焦→Escape：直接退出阅读。选择框只拦截 fieldset 内按键，默认标题位于它之外，因此关闭结果依赖焦点落点。

来源：[菜单按键](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:127)、[全局 Escape](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:861)、[极性默认焦点](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:67)、[fieldset 拦截](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:123)。

对照中，“换个角度”和演化全景关闭后均保留阅读 `scrollTop=650` 并回焦各自触发按钮；全景连续 10 次 Tab 均留在内部。因此无需重写全部覆盖层，优先让菜单和极性选择也遵循一次只退一层的规则。验收应包括标题、按钮与 radio 等不同焦点位置，并确认第二次 Escape 才回到舞台。

## 已成立的体验与待决定事项

- **连续性：** 同版既有记录支持选句→追问→正反/极性→合流→刷新→合后继续；本轮另核对覆盖层返回、长文位置、等待及失败恢复。不能从生成节点数推断实际洞见质量。
- **上轮修复：** 拖选完成前不重组正文；显式退出后的迟到追问只保存；首次帮助与舞台共用输入方式文案。两位审阅者均结合源码和同版专项证据确认，不重复报错。
- **移动 Enter：** 当前规则为 Enter 提交、Shift+Enter 换行；触摸视口中的程序键盘事件确实提交。是否为手机提供直接换行应根据写作任务决定，本轮没有真实软键盘误发证据。
- **浏览器返回：** 当前 Back 离开 app，Forward 能恢复阅读及 650px 位置，见 [UTF-8 修正后的历史夹具记录](evidence/history-recheck.json)。是否先关闭阅读层属于产品导航政策，不能只因不同于原生导航栈就列为缺陷；没有验证系统边缘返回手势。
- **其他候选：** 部分 32/36px 次级入口可考虑透明扩展命中区；鼠标单击为区分双击有 260ms 等待。这些保留为取舍/启发式建议，未制造额外 P2。

## 方法与交付

- [Lama 独立报告](lama-review.md)：使用 Lama→Appllama App Design，关注导航、状态完整性、触摸可达性与内容连续性。
- [Emil 独立报告](emil-review.md)：使用 Emil→emil-design-eng，关注输入响应、焦点、返回层级及操作连续性；包含 Before / After / Why 提案表。
- 两个独立子 agent 不互读对方报告，不读取上一轮独立结论；共享主线程采集的同一组客观证据，各自查看原图、核对源码并定级。共享证据不等于两个独立真机实验。
- 主线程以项目现有 Playwright 做必要的视觉/交互审阅。Browser plugin 不可用，未新装工具、未创建新工作树；隔离上下文只写合成 localStorage，没有读取用户工作区内容。
- 新采集为公网 Chromium：四组视口各 13 状态，另有 7 组响应尺寸和历史返回复测。四组 POST 均故意返回受控 502；没有将其当公网故障，也没有重新调用真实模型接口。
- 本轮没有改代码，因此没有重复跑整仓单元测试。已有同版质量流水线的 lint、类型、测试和构建成功；[本轮末次 CI 快照](evidence/ci-status-latest.json)中 production visual smoke 仍在运行，不能宣称整条 CI 已通过。
- [证据索引](evidence/README.md)说明截图、脚本、历史夹具修正、同版旧验收的来源和限制。

真实设备软键盘、中文 IME、系统大字、安全区、触摸选区手柄、原生返回、后台恢复及持续 GPU 性能，本轮均未新增验证。心理心流、概念理解度和思维启发度需实际任务研究，截图与工程检查只能支持界面连续性判断。
