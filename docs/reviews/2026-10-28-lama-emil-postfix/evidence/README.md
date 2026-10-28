# 本轮复审证据

采集日期：2026-10-28。目标版本 `ebd4d402df6f294323c23e9b0f47d0b2db66e0a1`；腾讯当前 build `gYvsXfhsH4WQe87NjnYgQ`。测试材料均为合成的社区花园讨论，浏览器使用独立上下文，没有访问、清空或修改用户现有工作区。

## 运行与来源

| 文件 | 方法与涵盖范围 | 结果 |
| --- | --- | --- |
| [deployment-current.json](deployment-current.json) | SSH 只读核对腾讯 current、Build ID、服务状态；从源站访问本机服务和两个公网入口 | current 为 `20261028-six-fixes-final`，active/running，重启 0 次；三个 GET 都是 200；两个公网请求各自保留域名和 `/Anicca` |
| [ci-status.json](ci-status.json) | GitHub CLI 读取同 HEAD 的完整 CI 结果；不是本轮重新执行全仓测试 | lint/types/tests/build 与 production dialogue smoke 均成功 |
| [six-fixes-recheck.json](six-fixes-recheck.json) | 现有 `scripts/visual-smoke/review-fixes.mjs`，双域名×桌面1440×900/移动390×844，受控生成失败 | 四上下文均通过；草稿、阅读位置/换宽、搜索清空、视角复位、旧请求重试等专项闭环 |
| [visual-matrix.json](visual-matrix.json) | [capture.mjs.txt](capture.mjs.txt)，双域名×五个配置，模型 POST 请求拦截 | 十上下文、72 张原始截图；无页面/控制台错误、静态资源失败和文档横向溢出。此处的 passed 指采集与布局断言通过，不代表所有 UX 均无问题 |
| [interaction-probes.json](interaction-probes.json) | [interaction-probes.mjs.txt](interaction-probes.mjs.txt)，受控挂起追问回包、实际鼠标按下/移动/松开、移动触摸视口点空白 | 六探针均执行结束，没有脚本错误；其中明确复现两类产品缺陷，不能把“探针执行结束”当作“产品通过” |

视觉矩阵的五个配置：320×568 浅色首访空工作区、320×568 浅色长文、360×780 暗色长文、1440×900 暗色桌面长文、844×390 浅色移动横屏。JSON `screens` 保留原始域名目录和完整截图名；原始采集目录为 `/tmp/anicca-postfix-visual-v2-20261028`，下表所列代表图已复制到本目录，可随文档长期保存。无需依赖 `/tmp` 读取关键证据。

本轮采用项目现有 Playwright 流程做必要的视觉与交互验证，没有安装依赖或修改全局配置；Build Web Apps 的 Browser plugin 不可用。读取了 ego-browser skill 与指南，本轮没有创建或恢复其 TaskSpace，没有借用用户浏览器会话。这里只记录实际使用的方法，不声称两位评审各自独立运行了浏览器。

## 已保存的代表图

| 场景 | 文件 |
| --- | --- |
| 320px 首访 | [首屏](mobile-320-first-entry.png) |
| 320px 阅读与追问 | [阅读](mobile-320-reading-reading.png)、[选句](mobile-320-reading-selected-quote.png)、[极性选择](mobile-320-reading-polarity-picker.png)、[长文中段](mobile-320-reading-reading-middle.png) |
| 320px 设置 | [维度编辑](mobile-320-reading-edit-dimensions.png)、[工作区菜单](mobile-320-reading-workspace-menu.png) |
| 暗色移动 | [阅读](mobile-360-dark-reading.png)、[极性选择](mobile-360-dark-polarity-picker.png)、[维度编辑](mobile-360-dark-edit-dimensions.png) |
| 暗色桌面 | [有种子的初始舞台与提示](desktop-dark-entry.png)、[阅读](desktop-dark-reading.png)、[观察维度](desktop-dark-perspectives.png) |
| 移动横屏 | [长文中段](mobile-landscape-reading-middle.png)、[维度编辑](mobile-landscape-edit-dimensions.png) |
| 第二入口 | [tongye 暗色移动阅读](tongye-mobile-360-dark-reading.png)；其余场景数值在矩阵中 |
| 原生鼠标拖选 | [仍按住鼠标](desktop-native-drag-before-release.png)、[松手后](desktop-native-drag-after-release.png) |
| 慢追问关闭意图 | [移动已关闭](aitoshuu.me-mobile-slow-inquiry-closed.png)、[移动回包后重开](aitoshuu.me-mobile-slow-inquiry-after-reply.png)、[桌面回包后重开](aitoshuu.me-desktop-slow-inquiry-after-reply.png) |
| 中段隐含退出 | [触摸视口点空白后关闭](mobile-middle-blank-exit.png)；退出前按钮位置在交互 JSON |

## 动态证据的解释

`slow-inquiry-dismiss` 有四个上下文。先提交行内追问，将响应挂起，点击“返回种子”，等待整个读层完成退出并从 DOM 移除，再释放合法响应。四次均记录 `closedBeforeReply=true`、`fullyExitedBeforeReply=true`，随后 `readingReopened=true`，焦点为 `conversation-panel-heading`。成功图为原种子、问题、回应共三个节点；没有取消请求，也没有额外用户动作要求重开阅读。这证明退出意图未被迟到回包尊重，不是模型故障或120ms退场过程的短暂重叠。

`native-drag-selection` 发生在桌面 Chromium：鼠标按住，从第一句第 1 字附近向后拖，依次经过 3、8、15、21 字位置，再反向微调。未松手时原文 DOM 已改变，选句固定为“区花”，后续拖动不再扩大目标原句，浏览器选区反而包含操作按钮。没有用脚本直接写入原生 Selection。这里不推断 iOS/Android 选区手柄的行为。

`middle-reading-exit` 记录返回按钮 top=-538、bottom=-494，已离开阅读可见区域112–696；在触摸视口点左侧空白 `(8,400)` 可关闭。它支持“显式返回线索随长文滚走”，也支持“仍有隐含退出途径”。是否使真实用户困惑属于待验证体验假设。

采集过程中两个旧脚本的预期有误，已先查清并纠正：首版视觉脚本把选句态的一次 Escape 当作关闭整个阅读；首版慢追问脚本误等两个节点，而正确成功状态应为三个。这些超时不作为产品故障证据。视觉证据使用纠正后的 v2；交互证据使用 v3，额外等待退出动画结束后才释放响应。v2与v3的四次重开、原生拖选、中段留白退出结论一致，没有跳过必要断言。

## 沿用同版本的既有完整流程证据

- [全仓680项测试记录](../../2026-10-28-lama-emil-frontend/verification/checks.txt)
- [双域名受控完整流程、拖拽与渲染器回退](../../2026-10-28-lama-emil-frontend/verification/controlled-flow.json)
- [双域名真实接口完整流程](../../2026-10-28-lama-emil-frontend/verification/live-flow.json)：24次真实请求，覆盖选句、极性、正反、合、刷新和合后继续展开；本轮未重复消耗模型请求。
- [原六项验收说明](../../2026-10-28-lama-emil-frontend/fix-verification.md)

移动端证据均为 Chromium 触摸视口模拟。本轮没有新增 iPhone Safari/Chrome、Android 真机持续性能、系统键盘、安全区或原生选区手柄测试；静态图也不能证明心流体验或生成内容的持续启发度。未补测的快速动效反转只保留为未确认观察，不升级为问题。
