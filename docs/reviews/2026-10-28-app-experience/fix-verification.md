# 输入可达性与 Escape 层级修复

日期：2026-10-28。按用户确认的[模块与验收约定](fix-plan.md)修复 A01、A02；原 Lama、Emil 独立报告与两轮修复前证据保留。

## 最终行为

| 项目 | 实现与行为 | 验收 |
| --- | --- | --- |
| A01 · 输入屏外 | 当前舞台壳按实际可视高度布局，清零遗留底部 padding 与 scroll padding。保留原输入测高、viewport、安全区与材质接口。 | 空白首访与已有内容均补验680/681、980/981边界、768×1024、844×700、844×390；首屏不先fill输入，直接确认其完整可见并能命中。另验320px、输入聚焦/失焦、草稿刷新与窗口缩放。 |
| A02 · Escape越级退出 | Shell尊重内层已消费的按键；极性选择在其共同祖先统一处理Escape，覆盖默认标题、顶部返回按钮及radio。 | 菜单Escape只关菜单、保留正文650位置并回焦更多；极性三种焦点均先回正文、恢复650与触发按钮焦点。第二次Escape再返回种子。角度对话框和全景的正常返回回归通过。 |

没有新增卡片、overlay管理器或新的渲染接口。形体、融合、颜色、光照和手势算法未改；继续保持 sketch1638178 的低饱和软糯感、桌面TSL自动、移动原版、手动选择与原版回退。

实现范围：[舞台壳](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.module.css:2998)、[外层退出](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/DialogueShell.tsx:861)、[极性共同祖先](/Users/aitoshuu/Documents/GitHub/Anicca/src/components/dialogue/SeedInspector.tsx:139)。

## 仓库与构建

- Node22.22.0全仓lint、生产/测试类型检查、**93文件692项测试全部通过**；lint为0错误、26条既有warning。[完整检查](verification/checks.txt)、[91项局部组件检查](verification/targeted-tests.txt)。
- 新增4项交互回归：Shell集成的菜单/极性默认焦点退出，加上现有radio用例扩展的标题/返回按钮两路。未降低超时、跳过断言或把单组件通过冒充集成通过。
- 首次全仓检查出现一项既有时间用例失败：同轮两个测试节点跨越真实毫秒边界，导致比较截止日期排除其中一个。将夹具日期显式设为前轮/本轮/未来，并新增未来分支排除断言；生产novelty逻辑未修改。随后完整692项通过。[初次日志](verification/checks-initial-failure.txt)。此测试稳定性修复单独提交为`34e0647`。
- Linux x64、Node22.23.4、Next15.5.28的 `/Anicca` 生产构建与standalone打包通过。本机可用空间约400MB，复用已授权的腾讯云隔离构建目录和依赖，未清理用户文件或在本机强行构建。[构建日志](verification/linux-build.txt)。
- 253个构建源码、配置、资源逐项SHA256一致，暂存区对应源码也与构建档案一致；无生产凭据进入包或提交。[服务端核对](verification/source-verification.json)、[暂存来源核对](verification/staged-source.json)、[清单](verification/source-manifest.json)。

## 浏览器回归与完整流程

[新增app-experience脚本](/Users/aitoshuu/Documents/GitHub/Anicca/scripts/visual-smoke/app-experience.mjs)已接入既有production visual CI，并可独立对指定候选/公网运行。它在旧公网版本按预期失败：768×1024的壳高1200、输入不可见；同一断言在候选和两个新公网入口均通过。[旧版负对照](verification/baseline-targets.json)。

专项使用新建的隔离浏览器上下文，空白首访不注入工作区数据；有内容路径仅注入合成花园长文。两个公网入口各37个状态均通过，覆盖输入前的几何与命中、刷新、不同焦点的Escape以及正常覆盖层对照，无pageerror。

- [候选专项](verification/candidate-targets.json)、[候选完整受控流程](verification/candidate-flow.json)
- [aitoshuu专项](verification/aitoshuu.me-targets.json)、[tongye专项](verification/tongye.me-targets.json)
- [双域名受控完整流程](verification/public-controlled.json)

受控完整链覆盖桌面1440×900和移动触摸390×844：长文阅读→精确选句→行内草稿刷新→追问→极性两端→从极性推演正反→刷新后选本轮另一端→合成→从合继续正反→再次刷新→从合继续时间极性，每上下文12节点。另覆盖鼠标与触摸直接拖拽、停留松手、取消/迟到回应、失败重试、新草稿，以及原版/TSL WebGL2/TSL自动的手动切换、刷新保留和模拟图形上下文故障回退。

真实接口复测也全部通过：两个域名×桌面/移动四个上下文，每个6次请求、最终12节点，共 **24次真实API请求全部返回200**。每组均完成合成、刷新、从合继续正反和时间极性；静态资源无失败、页面无运行错误。受控回复不记入此计数。[真实接口记录](verification/public-live.json)。

| 入口 | 桌面1440×900 | 移动触摸390×844 | 专项/拖拽/渲染切换回退 |
| --- | --- | --- | --- |
| aitoshuu.me/Anicca | 受控与真实完整链均通过，默认WebGPU | 受控与真实完整链均通过，默认原版 | 均通过 |
| tongye.me/Anicca | 受控与真实完整链均通过，默认WebGPU | 受控与真实完整链均通过，默认原版 | 均通过 |

## 当前发布与限制

腾讯源站为 `/opt/anicca/releases/20261028-app-experience`，Build ID **`G0tgHltanXgUhENX7R9J8`**。应用active/running，切换后重启计数0；上一发布 `/opt/anicca/releases/20261028-selection-intent` 保留作为回滚点。[切换记录](verification/rollout.json)。两个域名及各自 `/Anicca/dialogue` 均返回200、保持地址，HTML包含新build token。[协议检查](verification/public-protocol.json)。

真实流程完成后再次核对服务active/running、重启计数0；临时候选服务及本轮SSH转发均已停止。[收尾状态](verification/current.json)。

沿用原有反代、证书与部署方式，生产凭据仍由原EnvironmentFile独立提供。移动检查为Chromium触摸视口仿真，键盘视口与图形故障属于受控模拟；未新增真实iPhone/Android、软键盘/IME、系统大字、辅助技术或持续性能测试。

已实际查看：[平板输入](verification/aitoshuu.me-app-input-768-1024.png)、[横屏输入](verification/aitoshuu.me-app-input-844-390.png)、[菜单Escape后保留阅读](verification/aitoshuu.me-app-desktop-after-menu-escape.png)、[桌面真实合成](verification/desktop-live-synthesis.png)、[移动真实合后继续](verification/mobile-live-continued.png)。原报告与证据作为修复前快照保留；本轮实现、回归与文档沿用现有main提交，其他工作区改动不纳入。
