# 修复上线后的 Lama × Emil 独立复审

日期：2026-10-28。范围：当前前端的 UI/UX、概念一致性、心流与沉浸感；仅审阅和保存证据，没有修改产品或重新发布。

后续实施：R01–R03 已按用户批准修复并更新公网；修复和验收状态见 [三项修复记录](fix-verification.md)。下文保留原审阅时的版本、问题与独立定级。

## 测试、同步与版本

**上一轮六项修复已经测试、同步腾讯云并提交推送。** 当前本地、远程 main 和 CI 的版本均为 `ebd4d402df6f294323c23e9b0f47d0b2db66e0a1`。腾讯当前 release 为 `/opt/anicca/releases/20261028-six-fixes-final`，Build ID 为 `gYvsXfhsH4WQe87NjnYgQ`；服务 active/running，重启次数 0。[本轮源站核对](evidence/deployment-current.json)

- [aitoshuu.me/Anicca](https://aitoshuu.me/Anicca)、[tongye.me/Anicca](https://tongye.me/Anicca) 都指向这次发布，保留各自域名和子路径。入口反代仍经既有公网服务器，腾讯云是共享应用源站。
- [同提交 CI](https://github.com/astroleno/Anicca/actions/runs/40560960787) 的 **Lint, types, tests, build** 与 **Production dialogue smoke** 均已成功；680 项测试、生产构建和完整浏览器验收通过。[CI 原始状态](evidence/ci-status.json)
- 同版本既有公网完整流程覆盖：选句追问 → 极性两端 → 正反 → 拖拽/选择合成 → 刷新 → 合后继续正反与极性。双域名、双端共24次真实接口请求成功；另有受控失败、取消、迟到结果及原版/TSL切换和自动回退检查。[完整验收与限制](../2026-10-28-lama-emil-frontend/fix-verification.md)
- **本轮又重跑六项专项**，双域名×桌面/移动四个上下文均通过；再补十个视觉上下文，涵盖320px、暗色、横屏，共72张原始截图，没有页面/控制台错误、静态资源失败或文档横向溢出。[专项结果](evidence/six-fixes-recheck.json)、[视觉结果](evidence/visual-matrix.json)

这里的移动验收是 Chromium 触摸视口模拟。本轮没有新增 iPhone/Android 真机性能、原生选区手柄或真实软键盘测试；没有改变桌面默认 TSL 自动、移动默认原版、手动切换或原版回退。

## 两份独立报告

| 评审 | 使用技能与重点 | 报告 |
| --- | --- | --- |
| Lama | Lama router → Appllama app design 的适用原则；移动可达性、状态闭环、阅读层级、概念与探索连续性 | [独立报告](lama-review.md) |
| Emil | Emil router → emil-design-eng；输入方式、频繁动作、可打断与可逆性、注意力成本 | [独立报告](emil-review.md) |

两位评审各自阅读当前源码、动态原始记录并实际查看截图，不读取对方报告或上一轮独立结论。主线程统一操作浏览器并补可复现证据，不能把两份报告描述为两次独立的真机测试。技能中的原生 Expo/RN 重写、竞品调研和自动修复流程不在本轮范围。

## 复核结论与优先级

**原六项修复在其验收范围内闭环；新增确认问题为两项 P2、一项 P3。** 以下是主线程去重和复现后的处理优先级。两位评审对慢追问的严重度有分歧，保留各自判断，没有要求改成一致分数。

| 编号 | 优先级 | 确认的问题与影响 | 实证与建议方向 |
| --- | --- | --- | --- |
| R01 | P2 | 桌面原生拖选刚达到两字，正文就被改成前文/引用/后文；用户尚未松手继续拖动，引用却停在“区花”，浏览器选区还混入操作按钮。精准自由选句的核心入口受影响；按句按钮路径仍可用。 | 实际鼠标按下、六步前后拖动、松开均有记录；仅确认桌面 Chromium，不推断 iOS。[过程与截图](evidence/README.md)。选择形成期间应保持原文 DOM 和位置稳定，再确认进入行内追问。 |
| R02 | P2（汇总判断） | 追问等待时主动返回种子，响应完成后仍自动打开回应并把焦点移回阅读标题，覆盖退出意图。 | 双域名×桌面/移动四次均复现，且已等待120ms退场结束、读层从DOM移除再释放响应；不是数据丢失或请求取消失败。[动态记录](evidence/interaction-probes.json)。Lama 评 P3，理由是可再关闭且没有数据损失；Emil 评 P2。主线程按 P2 排序，因为核心探索中的明确退出与注意力选择被异步结果覆盖，且四个上下文均稳定出现。应把主动退出纳入已有注意力版本保护。 |
| R03 | P3 | 桌面顶部提示“拖动空白，转动视角”，首次帮助却写“拖空白平移，双指转动与缩放”，同屏指导矛盾。 | [桌面截图](evidence/desktop-dark-entry.png)；鼠标实际旋转、触摸实际平移。按输入方式复用真实手势语义即可，无需新增控件或卡片。 |

R01 的实现路径见 [SeedPassage:31](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:31) 的 `selectionchange` 和 [60行](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedPassage.tsx:60) 的正文替换。R02 对应 [关闭回调:831](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:831)、[点空白关闭:560](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:560) 与 [追问回包:1870](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:1870)；关闭没有使该回包的自动关注条件失效。R03 对应 [SeedGuide:9](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedGuide.tsx:9) 与 [BubbleStage:832](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/BubbleStage.tsx:832)。更完整的复现和置信度见两份独立报告。

## 原六项闭环

| 原项目 | 本轮结论 |
| --- | --- |
| F01 维度草稿 | 观察往返、关闭、刷新、工作区切换保留，Save/Cancel 明确；建议去重和24维容量由源码及同版本回归支持。 |
| F02 移动视角复位 | 入口可达；平移960后复位，布局和维度不变；320px 需要滚动，不误称入口缺失。 |
| F03 阅读日志 | 四上下文650→650刷新恢复；换宽按原文字锚接回，误差小于0.3px；主动关闭后刷新不再打开。 |
| F04 错误与重试 | 说明面向使用者；重试原请求，保留之后新写的草稿和原图。 |
| F05 搜索空态 | 无匹配与没有候选区分；清空恢复两候选，无生成请求。 |
| F06 阅读动效 | 键盘/恢复的读层即时，指针160/120ms，旧退出回调不会误卸载重开读层。该项不等于所有异步请求都尊重退出；R02是新发现的追问回包路径。 |

## 尚未证实为缺陷的体验建议

- **长文中段返回的可发现性：**显式“返回种子”随标题滚出，但点空白实测可退出，键盘也有退出方式。可研究把现有返回文字留在可见位置；没有证据把它写成阅读无法退出或必然破坏心流。
- **鼠标单击阅读的等待取舍：**单击为既有双击裂变预留260ms，因此端到端时间不止读层的160ms。需要结合快捷方式使用情况再决定，不能擅自取消已确认的双击交互。
- **启发度：**真实流程样本有合后正反被标记为 `novelty=revisit`，UI已有“与此前相近”及原文对照。流程成功、节点增加不等于持续洞见，也不能凭一例重复判整体无启发度。需要实际内容样本与用户研究；本轮不将其包装成前端缺陷。

低饱和软糯舞台、无卡片阅读、暗色层级和极性/正反的概念区分保持一致。乔哈里相关入口保留“待确认假设”、由用户确认的语气边界；本轮没有用真实乔哈里多轮模型输出证明所有生成都满足合同。

证据、采集方法、脚本纠错说明与真机限制集中在 [证据索引](evidence/README.md)。本轮交付为这份汇总、两份独立报告与可复核证据；R01–R03 尚未修复，线上继续运行前述已提交版本。
