# Emil 独立复审：Anicca 的 app 般体验

2026-10-28 · 只读评审 · **确认 2 个新增 P2，未发现新增 P1。** 阅读、选句、追问、正反、合流和继续展开已经形成连贯的操作路径；剩余问题集中在「用户已经转移注意力或工作区后，旧操作仍改变当前界面」。这两项会削弱持续使用时的可预期性，优先于增加装饰动画。

采用 [Emil 入口 skill](/Users/aitoshuu/.codex/skills/emil/SKILL.md) 路由至 [emil-design-eng](/Users/aitoshuu/.cc-switch/skills/emil-design-eng/SKILL.md)，侧重高频操作、打断与恢复、焦点、键盘、触摸反馈和视觉一致性。以下 After 均为修正建议，本轮没有修改产品代码。

**版本与独立性**

- 审阅源码：`55a99f976807ecb2c7a72fb90a15e6b8395a4614`。当前部署为 `/opt/anicca/releases/20261028-app-experience`，build `G0tgHltanXgUhENX7R9J8`；见 [current-release.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/current-release.json)。
- 先读知识图谱的 God Nodes 与社区结构，再沿 `BranchGraphStore`、对话壳、阅读状态、视角面板、舞台手势相关模块审阅。未阅读此前主观评审或本轮另一位评审的报告。
- 浏览器由主线程统一操作；本评审独立阅读源码、客观探测 JSON，并通过 `view_image` 实际查看桌面、移动、平板、横屏、明暗主题及异常前后多张截图。视觉判断遵守无卡片主体、低饱和软糯材质、桌面 TSL 自动与移动原版及回退的既定设计。
- 本轮资料来自公开站点 `aitoshuu.me/Anicca` 与 `tongye.me/Anicca` 的隔离 Chromium 上下文。移动为触摸视口与 CDP 手势模拟；不是物理手机、系统软键盘或 IME 测试。未将旧版本 `evidence/` 中的材料作为本版本证据。

**已确认问题 E1：追问等待期间继续滚动阅读，回应抵达会抢走原文和焦点（P2）**

复现：打开长文 → 选一句 → 发起追问 → 在回应尚未返回时继续滚动原文，不修改草稿、不切换种子 → 让回应返回。用户刚刚选择继续阅读的内容被新回应替换，当前滚动位置变为回应顶部，键盘焦点移到新回应标题。阅读记录仍可保留，不涉及正文丢失；直接影响是正在进行的阅读被打断，用户需主动找回原文。

| Before | After（建议） | Why |
| --- | --- | --- |
| 发起追问后，主动滚轮或触摸滑动没有更新注意力版本；回应返回仍自动切换阅读对象并聚焦标题。 | 将等待期间用户主动产生的阅读活动纳入注意力保护。保存回应并提供可主动打开的到达提示；保留当前原文、位置和焦点。无后续活动时继续保留现有自动打开行为。 | 当前已经保护「等待时继续写」及显式离开阅读的意图，继续阅读应遵守同一原则；否则用户无法预期哪类操作能保护当前任务。 |

证据来自 [attention-return-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/attention-return-probes.json)。这是刻意持有并释放的受控 `/api/inquiry` 响应，用于隔离 UI 时序；六个等待场景各一次受控回应，没有调用真实模型。

| 场景与状态 | 回应前 | 回应后 | 结论 |
| --- | --- | --- | --- |
| `desktop-pending-scroll`：`reader-moved-while-pending` → `response-arrived`，1440×900，aitoshuu.me | 原文 `root`，主动滚轮至 `scrollTop=650` | 阅读对象变为「协商的余地」，`scrollTop=0`，焦点为 `conversation-panel-heading` | 复现 |
| `mobile-pending-scroll`：同名状态，390×844，tongye.me | 原文 `root`，模拟触摸滑动至 `scrollTop=307` | 同样变为「协商的余地」、顶部、标题焦点 | 复现；仅触摸模拟 |
| 桌面及移动 `pending-idle` 对照 | 提交后无后续活动 | 自动打开回应 | 正常默认行为 |
| 桌面及移动 `pending-edit` 对照 | 等待时修改草稿并聚焦输入 | 保持原文、更新后的草稿及 textarea 焦点 | 现有注意力保护有效 |

已实际查看对应 [桌面滚动中](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-pending-scroll-reader-moved-while-pending.png)、[桌面回应后](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-pending-scroll-response-arrived.png)、[移动滚动中](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-pending-scroll-reader-moved-while-pending.png) 和 [移动回应后](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-pending-scroll-response-arrived.png) 截图。

源码定位：[DialogueShell.tsx:1853](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1853) 捕获提交时的注意力版本；[DialogueShell.tsx:1873](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1873) 根据版本未变而选择回应；[DialogueShell.tsx:855](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:855) 在阅读对象变化时聚焦标题；[SeedInspector.tsx:148](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:148) 的滚动处理只记录阅读位置。[DialogueShell.tsx:903](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:903) 已为草稿修改增加注意力版本。

修正时应区分用户滚动与程序恢复位置、字体布局、内联输入自动露出造成的滚动，避免简单地把所有 `scroll` 都视作新意图。验收应覆盖上述 idle、scroll、edit 三组，以及取消和显式收起阅读：主动阅读后回应保存成功，但当前节点、位置和焦点保持；用户主动查看后才进入回应。**置信度：高。**

**已确认问题 E2：A 工作区未提交的改名表单跨到 B，保存会改名 B（P2）**

复现：在工作区 A 的「更多 → 重命名工作区」中输入新标题，不保存 → 再开「更多 → 新建工作区」进入 B → 原改名表单仍打开，保留 A 的未提交文本 → 点击「保存工作区名称」。B 被改为这段旧草稿，表单没有说明操作对象已变化。用户可逆地修正名称，但这会造成工作区识别与操作对象混淆。

| Before | After（建议） | Why |
| --- | --- | --- |
| 改名的 `renaming`、`draftTitle` 跟随常驻工具栏保留；当前工作区变化后，同一旧表单调用新工作区的保存回调。 | 工作区 ID 变化时关闭并重置改名会话，或明确绑定会话 owner、拒绝向不同工作区提交。若保留未完成标题，按工作区保存并仅在原工作区恢复。 | 正文草稿与阅读已经按工作区隔离，改名操作也需要稳定的归属；切换工作区不应让一个未完成表单静默改变目标。 |

证据：[rename-dark-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/rename-dark-probes.json)，桌面 aitoshuu.me 与移动触摸模拟 tongye.me 均完成相同路径。`rename-original-draft` 记录 A；`rename-new-workspace-still-open` 中工作区 ID 已变成 B、名称为「未命名工作区」，`rename` 仍为「尚未提交的原工作区标题」；`rename-save-after-switch` 中相同 B ID 的名称已变为这段文本。这是隔离上下文内的本地工作区操作，没有修改站点代码或调用模型。

已实际查看 [桌面切换后仍打开的旧表单](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-rename-draft-after-new-workspace.png)、[移动旧表单](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-rename-draft-after-new-workspace.png)、[桌面保存后](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-rename-save-after-switch.png) 和 [移动保存后的当前工作区](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-workspace-list-after-save.png)。

源码定位：[WorkspaceBar.tsx:34](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:34) 保存改名的局部状态；[WorkspaceBar.tsx:43](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:43) 在 `renaming=true` 时不更新 `draftTitle`；[WorkspaceBar.tsx:56](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/WorkspaceBar.tsx:56) 提交旧文本；[DialogueShell.tsx:1159](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1159) 将改名应用到当前 `workspaceId`。工具栏挂载处 [DialogueShell.tsx:2083](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:2083) 也未隔离该会话。

验收应覆盖「A 改名未保存 → 新建 B」及「A 改名未保存 → 切换已有 B」：旧表单关闭或保留明确的 A 归属，B 不得接受旧会话提交；取消、同工作区保存与焦点返回仍正常。**置信度：高。**

**已经成立的体验与本次排除项**

| 方面 | 证据与判断 |
| --- | --- |
| 阅读保持在同一空间中 | 已查看本轮桌面、移动的阅读顶部、中段、底部；主体没有新增卡片式框架，正文与软糯舞台材质一致，正文阅读时背景退后。桌面约 520px 阅读宽度，移动正文字号 16px、行高 1.9；见 [DialogueShell.module.css:4014](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4014) 与 [4101](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:4101)。 |
| 临时进入子界面后可回来 | [review-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/review-probes.json) 的桌面、移动 `overview-return`、`perspective-return`、`more-return` 均保留原文 `scrollTop=650`，焦点回到对应入口；[static-workspace-probes.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/static-workspace-probes.json) 进一步证明未手动关闭阅读时切去新工作区再返回，原阅读自动恢复为打开状态及 650。 |
| 草稿不与浏览对象随意混淆 | 本轮改名后切换工作区、返回及刷新均恢复原正文草稿；受控回应对照也保留等待时的新草稿和焦点。按工作区恢复与 `pagehide`、隐藏页面刷新保存见 [DialogueShell.tsx:632](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:632)。E2 是另一个独立的改名会话缺口。 |
| 高频键盘阅读入口已有即时路径 | [DialogueShell.tsx:624](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:624) 区分键盘和指针入口；[SeedReadingContent.tsx:28](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedReadingContent.tsx:28) 对键盘与减少动态效果设置跳过位移动画。普通指针阅读使用 160ms 进入、120ms 退出。这里只确认实现分支，没有声称测得实际响应延时。 |
| 手势中断有基本保护 | [useStageTouchNavigation.ts:99](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/useStageTouchNavigation.ts:99) 处理释放与丢失捕获，并在 blur、页面隐藏时清理。双指结束后剩余一指不会立即拾起种子。这是源码确认，仍需真机验证触感。 |
| 已修的中等宽度输入与 Escape 没有重报 | 已查看同版本 768×1024、844×390 的输入截图及桌面、移动 More 关闭截图；[aitoshuu.me-targets.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/aitoshuu.me-targets.json) 和 [tongye.me-targets.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/tongye.me-targets.json) 覆盖边界宽度、More/极性多入口 Escape。未将已修的 681–980 宽输入屏外和 Escape 级联退出列为现存问题。 |
| 小屏更多菜单可达 | 已查看 320×568 和 844×390 菜单底部截图；本轮 JSON 中菜单在自身容器滚动，底部最近工作区仍可达。未因内容多于一屏就判为遮挡。 |
| 明暗主题的淡入截图误报已排除 | 初次全景截图与刚收起阅读的暗色舞台存在淡入中的浅色文字。补查静置 1100ms 后，全景 body/map/detail/h3/canvas 均为 opacity 1；舞台标签为 `rgb(252,251,255)`、祖先 opacity 1。已实际看 [桌面稳定全景](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/desktop-overview-light-settled.png)、[移动暗色稳定全景](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-overview-dark-settled.png)、[移动暗色稳定舞台](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience-postfix/evidence/mobile-dark-stage-settled.png)，不报告为持续对比度缺陷。 |

**仅供后续验证的建议，不计为已确认缺陷**

| Before（证据边界） | After（建议） | Why |
| --- | --- | --- |
| 当前没有物理手机、系统软键盘、IME、热机 GPU 或长时间持握证据。 | 用真实 iOS Safari 与 Android Chromium 验证内联追问、中文候选确认、键盘升降、旋转屏幕、切后台再回来、长按选句和双指结束。 | 视口模拟不能证明输入法候选、系统手势竞争、触觉反馈或长时间帧稳定性；源码中的保护只能作为待验证基础。 |
| 全景左右键选择走约 380ms 相机补间；见 [EvolutionOverview.tsx:164](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/EvolutionOverview.tsx:164)、[174](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/EvolutionOverview.tsx:174)、[350](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/EvolutionOverview.tsx:350)。尚无密集键盘导航录屏或误操作证据。 | 后续若连续左右键访问显示拖沓，可让键盘定位即时、保留指针选择的空间过渡。 | Emil 对高频键盘操作偏向即时反馈；此处仍有维护空间连续性的设计理由，不能只凭时长就判 P2。 |

浏览器 Back 是否管理子层、Enter 发送与 Shift+Enter 换行、鼠标单击为双击让出的约 260ms 窗口，本轮没有新的失败证据，保留为既有设计取舍，不列必须修复项。

**验证范围与未完成项**

同版本 [public-live.json](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/public-live.json) 记录两域名 × 桌面/移动的六次请求主链，共 24 次真实接口请求成功，包含合流后继续展开及刷新；本轮追加探测与上述受控时序测试补足 UI 边界。已有 [checks.txt](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/checks.txt) 记录 692 项测试通过、lint 无错误但有既存警告，另有类型检查与 [Linux 构建记录](/Users/aitoshuu/Documents/GitHub/Anicca/docs/reviews/2026-10-28-app-experience/verification/linux-build.txt)。本评审没有再次执行或声称自行跑完这些检查。

E1、E2 均仍未修正；本报告只交付审阅与修正方向。界面较少打断、能找回阅读位置，支持心理沉浸的条件，但这些观察不能证明真实用户已经进入心流；该结论仍需要用户观察或研究。
