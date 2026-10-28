# Lama · 当前上线版 App 体验复审

审阅日期：2026-10-28。对象为 `https://aitoshuu.me/Anicca`、`https://tongye.me/Anicca`，版本 `55a99f976807ecb2c7a72fb90a15e6b8395a4614`，生产 build `G0tgHltanXgUhENX7R9J8`。版本依据：[current-release.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/current-release.json)。

## 结论

当前界面已经具有连续工作空间的基本体验：种子舞台、原地阅读、极性展开、合流及继续推演共享同一套视觉与操作语言；正文不被卡片切碎，阅读与草稿可以跨中断保留。桌面 TSL 与移动原版的材料感也符合低饱和、软糯的既定方向。

本轮确认 **2 个新增 P2**：等待选句追问时，继续滚动阅读原文仍会在回应到达后被自动切走；未提交的工作区改名表单会跨到新工作区，并把旧草稿保存到新对象。另有 **1 个 P3 返回入口可发现性问题**。未发现新增 P1；681–980px 输入越界、更多/极性 Escape 级联退出均未重现。

这支持“具备适合沉浸思考的界面条件”，尚不能证明真实用户进入了心流。特别是异步结果打断正在进行的阅读，与这项目标存在直接冲突。

## 方法与证据边界

- 使用 [Lama 路由](/Users/aitoshuu/.codex/skills/lama/SKILL.md) 和 [Appllama App Design Skill](/Users/aitoshuu/.cc-switch/skills/appllama-app-design-skill/SKILL.md)，只采用网页适用的导航语义、状态连续性、触摸可达性、视觉层级原则；未转成 Expo 重写、竞品研究或模拟器流程。
- 先阅读 [GRAPH_REPORT.md](/Users/aitoshuu/Documents/GitHub/Anicca/graphify-out/GRAPH_REPORT.md:381) 的 God Nodes 与社区结构，再沿 Community 5/6 的舞台与控制器、Community 14/15 的持久化与阅读入口检查源码。
- 独立判断，未阅读其他本轮或此前主观评审。浏览器操作由主线程执行；本报告亲自通过 `view_image` 查看了桌面/移动的合流、继续展开、长文顶部/中段/底部、极性、菜单、小屏边界、追问前后及暗色阅读等多张截图，并核对对应 JSON。浏览器证据是共享事实，不是本审阅者另行独立操作的录制。
- 本轮 [review-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/review-probes.json) 为公网当前版本的合成阅读/草稿状态，无模型请求；[attention-return-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/attention-return-probes.json) 将追问响应受控延迟，以区分等待、滚动和改草稿的行为。移动为 Chromium 触摸模拟，非真机。
- 补用 [static-workspace-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/static-workspace-probes.json) 检查未退出阅读时的工作区恢复、静止后的浅/暗色全景；[rename-dark-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/rename-dark-probes.json) 确认改名实际保存的目标，以及暗色舞台静止后的标签。均为独立测试上下文中的本地状态，无模型请求。
- 同版本 [public-live.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/public-live.json) 已覆盖两域名 × 桌面/移动的长文选句→追问→正反/极性→合流→继续展开→刷新，24 次真实接口均返回 200。复用的 [checks.txt](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/checks.txt) 记录 692 测试通过、lint 零错误、类型检查通过；未把这些测试称为本审阅者重新运行。

## 确认问题

### L-01 · P2 · 追问等待期间继续阅读，完成结果仍抢走当前正文

**复现与影响。** 打开长文种子，选句并发出追问；保持请求等待，继续滚动读原文。桌面滚轮后原文 `scrollTop=650`，移动触摸滑动后为 `307`；响应到达时两者都改为“协商的余地”的回应正文、`scrollTop=0`，并将焦点移到 `conversation-panel-heading`。用户正在读的段落突然被替换，需要重新寻找原文才能继续思考。证据未显示原文被删除，问题是当前阅读任务被中断。

**证据与状态。** [attention-return-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/attention-return-probes.json) 中 `desktop-pending-scroll`、`mobile-pending-scroll` 的 `reader-moved-while-pending` → `response-arrived`。移动前后截图：[等待时继续读原文](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-pending-scroll-reader-moved-while-pending.png)、[回应到达后切换正文](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-pending-scroll-response-arrived.png)。同文件的 idle 对照正常自动进入回应；edit 对照则保留原文、输入焦点和新草稿。因此问题可定位到“继续阅读”没有被视为新的注意力意图。**置信度：高**，桌面与触摸模拟均复现，使用受控接口而非额外真实模型调用。

**源码定位。** [DialogueShell.tsx:1854](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1854) 捕获 `attentionVersion`，[DialogueShell.tsx:1873](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1873) 在该值未变时自动切换回应；[SeedInspector.tsx:148](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:148) 的滚动处理只记阅读位置，没有表达“用户仍在读原文”。改草稿则在 [DialogueShell.tsx:903](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:903) 更新了注意力版本。

**修正方向。** 请求开始后发生明确的人工阅读滚动时，保留当前正文与阅读位置，保存完成结果并提供轻量的进入入口；空闲等待仍可沿用现有自动进入行为。区分人工滚动与布局/恢复位置造成的程序滚动，避免首次定位误判。验收至少覆盖桌面滚轮、移动触摸滑动、键盘滚读，以及 idle、改草稿、主动退出这些已有行为。

### L-02 · P2 · 工作区改名草稿跨对象保留，保存会改到新工作区

**复现与影响。** 在工作区 A 打开“重命名工作区”，输入“尚未提交的原工作区标题”但不保存；通过更多菜单新建工作区 B。B 已是新的 ID、标题为“未命名工作区”，原改名表单却仍打开并保留 A 的待提交文字。此时点击“保存工作区名称”，B 被改成该旧草稿标题，而最近工作区列表中的 A 仍保持原名。一个操作表单在无明确提示的情况下改变了编辑对象，用户会误以为正在完成先前的改名；这也是比单纯留住草稿更严重的状态归属问题。

**证据与状态。** [rename-dark-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/rename-dark-probes.json) 的桌面与移动结果中，`rename-original-draft` → `rename-new-workspace-still-open` → `rename-save-after-switch` 的工作区 ID、标题及 `rename` 值，以及 `recentWorkspaceTitles`，共同确认保存目标确实变成 B。截图：[A 的未提交改名](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-rename-original-draft.png)、[新建 B 后旧表单仍开着](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-rename-new-workspace-still-open.png)、[在 B 保存后成功提示](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-rename-save-after-switch.png)。**置信度：高**，两端均复现，非仅从表单外观推断。

**源码定位。** [WorkspaceBar.tsx:34](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:34) 的 `renaming` / `draftTitle` 为组件本地状态；[WorkspaceBar.tsx:43](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:43) 仅在未改名时同步 `currentTitle`，未按 `currentWorkspaceId` 隔离编辑会话；[WorkspaceBar.tsx:56](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:56) 提交现存草稿。最终 [DialogueShell.tsx:1159](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1159) 使用当前工作区 ID 保存，因此旧表单会写入 B。

**修正方向。** 将改名会话绑定到打开时的工作区。创建/切换工作区后关闭该表单，或明确按工作区保留并仅在返回原工作区时恢复；提交时再次校验目标归属，避免静默写入新工作区。不必让所有导航都弹确认。验收至少覆盖 A 改名未保存→新建 B、A→已有 B、再返回 A，以及各自保存后的标题归属。

### L-03 · P3 · 长文中后段没有可见的“返回种子”入口

**复现与影响。** 移动 390×844 打开长文后读至 `650` 或底部 `1780`，标题内“返回种子”随内容滚出屏幕。屏上仍有全景/更多和底部写作区，但没有明显的结束阅读动作。知道外侧空白可关闭的用户不受阻；首次使用者可能回滚整篇寻找返回入口。这降低退出动作的可发现性，尚不构成退路失效。

**证据与状态。** [mobile-reading-middle.png](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-reading-middle.png)、[mobile-reading-bottom.png](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-reading-bottom.png)，对应 [review-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/review-probes.json) 的移动 `reading-middle` / `reading-bottom`。补查 `mobile-return-dark` 已用外侧 `x=3,y=400` 的模拟轻点关闭，再开仍恢复 `650`；桌面外侧单击也有效，见 [attention-return-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/attention-return-probes.json)。**置信度：高（入口不在屏上）；中（首次用户困惑程度未经用户测试）。**

**源码定位。** [SeedInspector.tsx:149](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:149) 将返回按钮放在正文滚动容器的 header 内；[DialogueShell.module.css:4015](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4015) 使整个 inspector 滚动；[DialogueShell.module.css:4019](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4019) 按 header 定位返回按钮。外侧退出来自 [SeedReadingContent.tsx:68](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedReadingContent.tsx:68)。

**修正方向。** 在保留无卡片正文和外侧手势的前提下，让长文中后段也能看到一个轻量、至少 44px 命中区的返回入口；可只在标题离屏后出现。不要为了固定整块标题而持续占用阅读高度。此项属于体验完善，不应描述成内容丢失或无法关闭。

## 已有设计表现与排除项

| 维度 | 本轮判断及证据 |
| --- | --- |
| 同一空间中的视觉连续性 | [桌面合流](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/desktop-live-synthesis.png)、[移动继续展开](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/mobile-live-continued.png) 保留种子、来源和本轮展开语境；无须引入卡片或常驻侧栏。 |
| 阅读层级 | 本轮 [移动阅读顶部](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-reading-top.png) 的标题、续想动作、正文层级清楚；16px 移动正文、独立留白与淡化背景使阅读对象突出。暗色阅读截图也能辨认正文与输入层级，未做正式全页面对比度认证。 |
| 中断后回到原处 | `review-probes.json` 的桌面/移动全景与换角度返回均保持 `scrollTop=650`；此前同版本 `aitoshuu.me-targets.json` / `tongye.me-targets.json` 的菜单与极性 Escape 回归也保持 `650`。本轮 click 极性按钮先将其滚入视野到 `0`，不能把这组返回 `0` 误报为丢位。 |
| 草稿与工作区 | 正常新建→选择原工作区→刷新后保留原草稿与已保存标题。原 `review-probes.json` 在新建前主动关闭阅读，返回 `reading=false` 为预期；补查 `static-workspace-probes.json` 在不主动关闭阅读的前提下切换并返回，两端均自动恢复阅读及 `650`，排除阅读开关丢失。改名未提交状态的例外见 L-02。 |
| 主要触控目标 | 本轮测得全景/更多/换角度、生成/先记下及阅读底部组合/继续写等主要动作高度为 44px；不推断所有辅助控件、所有横屏或真机命中区均合格。 |
| 已修问题 | 同版本边界回归每域名 37 状态通过；已看 320×568、844×390 等截图，未重现输入屏外。菜单/极性先退出当前子层，后续 Escape 才退出阅读，不重复报告已修项。 |
| 接口与等待恢复 | 同版本真实链路、受控取消/重试、等待时可编辑、重试保留新草稿等证据支持完整状态周期；L-01 是其余“仍在阅读”状态没有被覆盖的具体缺口。 |

浏览器 Back 不管理子层、Enter 发送/Shift+Enter 换行及鼠标选择延迟未作为必须修改的问题；本轮没有新的失败证据推翻这些现有取舍。全景及暗色舞台早期截图有过渡期间的淡化，静置 1100ms 后的截图与 computed opacity=1 已排除稳定低对比的猜测；暗色标签最终为 `rgb(252,251,255)`。参见 [稳定桌面浅色全景](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-overview-light-settled.png)、[稳定移动暗色全景](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-overview-dark-settled.png)、[稳定桌面暗色舞台](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-dark-stage-settled.png)。这不是对全部动画中间帧的逐帧审计。

## 未实测，单列验证建议

1. 真机 Safari/Chrome 的软键盘、中文 IME、选句手柄与浏览器工具栏伸缩：检查输入及选句追问是否保持可见。代码已使用 `visualViewport`，这不等于系统键盘已经验证。
2. 真机安全区、横屏、系统大字及读屏操作：当前固定尺寸触摸模拟无法覆盖这些条件；尤其短高度样式会把部分阅读动作降为 32px（[DialogueShell.module.css:4134](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4134)），应实际确认易用性后决定是否保留。
3. 长时间使用、慢设备及 GPU 热机的运动/耗电表现：本轮没有发布设备上的持续帧率与温升证据，不宣称 60fps、原生级触感或长会话性能已经合格。

以上为只读评审；未修改应用源码、部署、提交或安装工具。
