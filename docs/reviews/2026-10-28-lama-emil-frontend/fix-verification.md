# 六项前端连续性修复与公网验收

日期：2026-10-28。承接 [Lama × Emil 审阅](README.md) 的 F-01–F-06，按 [模块约定](fix-plan.md) 实施。四项 P2、两项 P3 均已修复并部署。

## 修复结果

| 项目 | 最终行为 | 验证 |
| --- | --- | --- |
| F-01 · P2 · 维度草稿 | 按工作区独立保留未保存输入；观察往返、关闭、刷新和工作区切换均保留。保存才应用，取消才丢弃；保存时保留最新观察选择。 | 组件回归、损坏存储校验；两个公网入口均完成观察往返、关闭/刷新、工作区隔离、保存、取消。AI 建议按草稿去重，未保存维度同样计入 24 维上限，连续采用不会覆盖先前草稿。旧种子的框架快照未改。 |
| F-02 · P2 · 移动复位 | 「换个角度」的纯视角区提供「复位视角与缩放」，复用既有 pan/orbit/zoom 复位；不重排种子、不改变思考维度。 | 移动触摸视口连续平移到 panX=960 后复位到 0，保存的布局与维度逐项一致。既有旋转、缩放及复位回归通过。 |
| F-03 · P2 · 阅读恢复 | 独立本地 journal 保存阅读实例与原文字符锚点，刷新接回原对象；主动关闭后刷新保持关闭。工作区隔离，兼容没有 journal 的旧数据。 | 双域名、双端均从 scrollTop=650 刷新恢复到 650。桌面由 1440px 改为 700px、移动由 390px 改为 430px 后，同一原文字符仍在同一阅读高度，误差小于 0.3px。分身恢复与旧工作区清理隔离有 hook/存储回归。 |
| F-04 · P2 · 错误恢复 | 提示保留想法/草稿、继续写或重试；不再要求网页用户修改服务端配置。按钮明确显示「重试上次」。 | 受控失败下重试仍发送原请求，并保留失败后新写的草稿；图没有增加孤立节点。取消、迟到结果和失败回归全部通过。 |
| F-05 · P3 · 搜索空态 | 区分真正没有候选与关键词无匹配；无匹配时可就地「清空搜索」。 | 清空后恢复原来的两个候选，不发送生成请求、不改变组合来源。 |
| F-06 · P3 · 阅读动效 | 键盘、辅助激活和恢复阅读即时呈现；指针入场缩短为 160ms，退出为 120ms。 | 浏览器记录确认键盘与恢复阅读未运行入场动画，焦点落在标题；退出竞争、惯性保护及既有双击快捷操作回归通过。 |

没有新增卡片，也没有调整种子材质、色彩、形体、融合或手势逻辑。保留 sketch1638178 的低饱和软糯感、贴着原句的追问、极性与正反的概念区分，以及合后继续探索。原审阅中另列的两项体验假设未转为新需求。

## 全仓与生产构建

- 全仓 lint、生产/测试 TypeScript、**93 个测试文件、680 项测试**通过。lint 为 0 error、26 条既有 warning。[检查日志](verification/checks.txt)
- 临时开发服务写入的类型引用已清理，默认配置恢复后再次通过两项 TypeScript 检查；新增浏览器脚本 lint 与 `git diff --check` 通过。
- Linux x64 / Node 22.23.4 / Next.js 15.5.28 生产构建及 standalone 打包通过。发布前逐文件核对 155 个前端源码与配置文件，与最终候选构建一致。
- 先在隔离候选服务完成双端完整流程、六项专项、渲染器切换及故障回退，再更新共享腾讯源站。原发布保留，可回滚。
- 顺带修复上次 CI 视觉脚本把 TSL 当作原版读取 GLSL uniform 的错误：仅原版专用的融合探针与 WebGL/CSS 回退场景指定原版，保留全部数值和图保护断言；其他场景继续使用平台默认值。两个场景在隔离的本地开发服务通过，脚本证据回归 5 项通过；生产的 TSL 切换和回退由双域名验收覆盖。[探针结果](verification/ci-probes.json)

## 公网完整流程

| 入口 | 桌面 | 移动触摸视口 | 六项专项 / 手动切换 / 自动回退 |
| --- | --- | --- | --- |
| https://aitoshuu.me/Anicca | 受控与真实接口流程均通过；默认 WebGPU | 受控与真实接口流程均通过；默认原版 | 均通过 |
| https://tongye.me/Anicca | 受控与真实接口流程均通过；默认 WebGPU | 受控与真实接口流程均通过；默认原版 | 均通过 |

完整流程为：长文阅读与返回 → 精确选择重复句中的第二处 → 行内追问草稿刷新恢复 → 追问 → 极性两端 → 从极性继续正反 → 刷新后选择本轮另一端 → 合成 → 从合继续正反 → 再次刷新 → 从合继续时间极性。另用鼠标和触摸输入执行直接拖拽、停留后松手合成，检查失败重试、取消和迟到响应。

两个域名、两个视口共 **24 次真实 API 请求全部成功**，每个上下文最终 12 个节点。没有浏览器运行错误、前缀静态资源失败或横向溢出。两个入口和 `/Anicca/dialogue` 均返回 200，并保留请求域名与路径。既有域名主页正常响应；tongye 根路径保留原有 `/experience/` 跳转，未改其路由。[协议检查](verification/protocol.json)

原版、TSL WebGL2、TSL 自动的手动切换与刷新保留均通过；注入图形上下文丢失后自动恢复原版。这里的回退是受控故障验证，移动端是 Chromium 触摸视口验收，本轮没有新增 iPhone/Android 真机持续性能测试，也没有更改移动端默认渲染器。

## 发布与证据

当前共享源站：腾讯云 `122.51.59.89`；两个域名继续经过既有公网入口，不修改 DNS、证书和反代规则。

- 当前发布：`/opt/anicca/releases/20261028-six-fixes-final`
- Build ID：`gYvsXfhsH4WQe87NjnYgQ`
- 回滚发布：`/opt/anicca/releases/20261027-subpath-IBPSEMvmKfkwr9DoSXEkl`
- `anicca.service` active，发布后 NRestarts=0；隔离候选服务已停止。服务凭据仍由原 EnvironmentFile 提供，未进入发布包、文档或 Git。

原始结果与代表截图已随文档保存：

- [六项专项：双域名、双端](verification/six-fixes.json)
- [受控完整流程、拖拽与回退](verification/controlled-flow.json)
- [真实接口完整流程](verification/live-flow.json)
- [桌面刷新接回阅读](verification/desktop-reading-restored.png)、[桌面换宽度](verification/desktop-reading-reflowed.png)
- [移动刷新接回阅读](verification/mobile-reading-restored.png)、[移动换宽度](verification/mobile-reading-reflowed.png)
- [移动复位后](verification/mobile-camera-reset.png)、[保存维度](verification/mobile-dimension-saved.png)
- [无匹配提示](verification/mobile-query-no-match.png)、[可执行的重试](verification/mobile-retry.png)
- [真实接口移动合成](verification/mobile-live-synthesis.png)、[桌面合后继续极性](verification/desktop-live-continued.png)

复测：`scripts/visual-smoke/review-fixes.mjs` 执行六项专项；`scripts/visual-smoke/deployment.mjs` 执行完整流程，加 `--live` 使用真实接口。均使用独立上下文与合成的花园讨论，不清理现有用户工作区。
