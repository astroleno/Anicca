# 第二轮复核：排除夹具影响与确认交互层级

日期：2026-10-28。复核提交 `8995c52917ebcb2aee7a345eb0883da928f95c33`。本轮由主线程针对前轮两类 finding 做反例与对照检查，没有新增独立审阅者，也未改写 Lama、Emil 的独立定级。

后续实施已完成，两项修复及公网验收见[修复记录](fix-verification.md)；下文保留修复前复核结果。

**结论：两项均成立，维持主线程 A01 P1、A02 P2 的处理顺序。** 新证据将 A01 从已有内容工作区扩展到没有注入数据的空白首访；A02 则确认只在特定焦点与事件路径出错，并非所有返回都失效。本轮没有新增第三项必须修复的问题。

## 复核环境与方法

- [aitoshuu.me/Anicca](https://aitoshuu.me/Anicca)、[tongye.me/Anicca](https://tongye.me/Anicca) 均返回 200，保持自身域名与路径，响应中均含当前已发布 Build ID `g1H9dsn-sTPdvQCvkB7Ww`。本地源码 HEAD 未变。
- 使用项目已有 Chromium / Playwright 进行必要的视觉和交互复核；Browser plugin not available。继续采用前轮已读的 ego-browser 与 frontend-testing-debugging 路径，安装版 ego 指南未变化；未新建 Ego 验收空间、工作树或安装工具。
- 主采样 4 个独立上下文：两个域名各一个 768×1024 触摸仿真空白首访；aitoshuu 桌面 1440×900 与 tongye 390×844 触摸仿真的有内容工作区。后两者仅注入一颗长文种子，未注入模型结果。
- 主采样共 47 个状态；另在两个域名各做一次关闭帮助后的空白舞台触摸入口对照。没有真实生成请求，也没有修改服务或用户已有工作区。
- 原始记录：[主采样](evidence/recheck/recheck.json)、[主采样脚本](evidence/recheck/capture.mjs.txt)、[空白入口触摸](evidence/recheck/empty-touch.json)、[触摸脚本](evidence/recheck/capture-empty-touch.mjs.txt)。截图与 JSON 已实际查看、交叉核对。

## A01 · P1：输入屏外不是旧工作区夹具引起的

先前疑点是：是否只有注入长文种子的工作区才触发；空白页面已有“写下想法”提示，是否可以自然绕过布局问题。

| 对照 | 实际结果 |
| --- | --- |
| 两个公网入口，全新隔离上下文，不注入 localStorage | 均为 `emptyStart=true`、0颗种子。768×1024 下壳高1200，输入 y=1128–1172，可见高度0，中心点无法命中。 |
| 同一空白页面改宽至680、981，再回768 | 680/981的输入完整44px可见且可命中；回768立即隐藏。支持媒体组合边界，无需重新载入测试数据。 |
| 点可见的首访“写下想法”提示 | 输入获得焦点，但 `scrollY=0`，输入仍位于屏外，不是可用的可见绕行路径。 |
| 关闭帮助后刷新 | 空白输入依然屏外，排除帮助浮层遮挡造成假阳性。 |
| 对页面中央“点此输入一个想法”做坐标触摸 | 提示本身完整可见且可命中，触摸后输入获焦，但输入可见高度仍为0。两站一致。 |
| 桌面已有内容窗口1440→768→981→680→768，并在768刷新 | 故障跟随中间宽度进入/退出，刷新后仍存在。不是仅初次挂载或触摸输入方式的问题。 |

以上点击与触摸使用可见目标的屏幕坐标，不让 locator 自动滚动屏外输入后再宣称“可操作”。主输入获得焦点不等于它已显示。

源码与实测一致：旧移动 padding 仍影响 content-box 壳；[focusComposerSoon](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:890) 使用 `focus({ preventScroll: true })`，仅 inline 追问会额外滚入可视区域。首访帮助和中央提示均调用这一入口，因此可见提示没有消除当前的屏外布局。

**定级复核：保持 P1。** 这是正常平板和中等桌面窗口的核心输入入口问题，空白首访和已有内容均受影响。可改变窗口宽度、旋转设备或借特殊聚焦行为绕行，不足以将此视为正常使用路径。没有数据丢失证据，也不将仿真结论外推为全部真实手机软键盘表现。

截图：[空白首访](evidence/recheck/empty-aitoshuu-fresh-entry.png)、[提示点击后仍无输入](evidence/recheck/empty-aitoshuu-after-visible-start-hint.png)、[无帮助刷新](evidence/recheck/empty-aitoshuu-refresh-without-guide.png)、[另一域名首访](evidence/recheck/empty-tongye-fresh-entry.png)、[中央提示触摸后](evidence/recheck/aitoshuu.me-empty-after-center-prompt-touch.png)、[桌面缩窄并刷新](evidence/recheck/populated-desktop-populated-refresh-768.png)。

## A02 · P2：错误发生在“内层按键未被正确消费”的路径

桌面与390px触摸仿真上下文均得到以下结果。触摸视口的 Escape 由键盘事件触发，不声称验证了真实手机系统返回键。

| 操作 | 阅读结果 | 焦点/位置 |
| --- | --- | --- |
| 阅读中打开更多，等待“重命名工作区”自动获焦，再按Escape | 菜单和阅读一起关闭，复现缺陷 | 焦点回种子 |
| 重新打开刚被关闭的种子 | 阅读正常恢复 | 原 `scrollTop=650` 仍在，排除数据/阅读记录丢失 |
| 阅读中打开更多，再点更多关闭 | 只关菜单，阅读保留，正常对照 | 焦点回更多，阅读仍650 |
| 极性选择自动标题焦点→Escape | 整个阅读关闭，复现缺陷 | 焦点回种子 |
| 极性选择顶部“返回阅读”按钮获焦→Escape | 整个阅读关闭，复现缺陷 | 焦点回种子 |
| 极性选择radio获焦→Escape | 只退出选择，正文保留，正常对照 | 焦点回“看极性两端” |
| 点击顶部“返回阅读”按钮 | 只退出选择，正常对照 | 焦点回“看极性两端” |
| 普通正文状态→Escape | 回到种子，符合该层的退出规则 | 不列为缺陷 |

这证明“按钮点击能正确返回”不能推翻键盘焦点路径的问题。默认标题和顶部返回按钮都在 fieldset 外；radio 在 fieldset 内，已有 `stopPropagation()` 使其正常。菜单局部处理虽 `preventDefault()`，Shell 全局处理仍继续关闭阅读。

**定级复核：保持 P2。** 主要影响是一次按键撤销超过用户刚打开的层级、打断阅读；重开后650位置仍保存，不应将它升级为阅读状态丢失。两条触发仍合并为一个层级问题，不重复计数。

本轮极性入口按钮位于正文顶部，自动点击该可见操作前浏览器会把按钮滚入视口。因此极性对照返回时的 `scrollTop=0` 不构成独立的“丢失650位置”证据；650恢复结论来自菜单路径的直接前后记录。

截图：[更多打开](evidence/recheck/populated-desktop-menu-before-escape.png) → [一次Escape后](evidence/recheck/populated-desktop-menu-after-escape.png)；[radio Escape正常返回](evidence/recheck/populated-touch-polarity-radio-after-escape.png)、[显式返回正常](evidence/recheck/populated-touch-polarity-explicit-return-control.png)。

## 为什么既有检查没有排除这两项

- [WorkspaceBar 的 Escape 测试](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.test.tsx:139)只渲染独立组件，未同时运行 Shell 的全局 Escape 处理；局部测试通过与集成路径错误可以同时成立。
- [SeedInspector 的 Escape 测试](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.test.tsx:95)把按键发给 radio，覆盖了正常路径，没有覆盖自动标题焦点或顶部返回按钮。
- [现有视觉矩阵的平板](/Users/aitoshuu/Documents/GitHub/Anicca/scripts/visual-smoke/dialogue.mjs:156)为1024px，位于本问题区间之外。部分流程还先 [fill输入](/Users/aitoshuu/Documents/GitHub/Anicca/scripts/visual-smoke/seeds.mjs:106)，再测输入边界；自动聚焦/滚动后的可见性不能替代用户未操作前的首屏断言。
- 因此修复验收需要首屏几何与命中测试、中间宽度边界、Shell集成层级和实际默认焦点；不靠重复跑相同覆盖面的测试来否认动态证据。

## 检查状态与限制

| 检查 | 结果 |
| --- | --- |
| 页面身份、响应与build token | 四个主上下文均通过 |
| 有内容、非空白页、无框架错误覆盖层 | 通过；两空白工作区是预期空状态，不是白屏 |
| Runtime / console error | 主采样无pageerror或console error；补充触摸无pageerror |
| Console warning | 桌面记录2次 `Multiple instances of Three.js being imported`（含重新载入）。记录为工程提示，没有观察到对应交互失败，也未据此新增UI/UX缺陷或断言性能损失。 |
| 原始问题复现与正常路径对照 | A01、A02均成立；有明确反例，避免过度泛化 |
| 产品修改、提交、推送、部署 | 本轮均未执行 |
| 整仓测试/CI | 本轮未改代码、未重复跑整仓。读取的[CI快照](evidence/recheck/ci-status.json)仍为质量与构建成功、production visual smoke运行中，不宣称整条CI通过。 |

未新增真实iPhone/Android、软键盘/IME、系统大字/辅助技术、后台恢复或持续性能测试；也未重新调用模型验证完整生成链。前轮同版流程证据仍按原边界引用。本轮追加的只是两项finding的事实与严重度复核。
