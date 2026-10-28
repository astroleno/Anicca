# 三项交互修复与公网验收

日期：2026-10-28。按已批准的 [模块约定](fix-plan.md) 修复 R01–R03，保留历史独立报告与修复前证据。

## 修复行为

| 项目 | 最终行为 | 验证 |
| --- | --- | --- |
| R01 · 原生拖选 | 指针或 Shift 扩选进行中，保持正文和展开控件的位置稳定；松手/结束扩选后才读取最终原文范围并进入现有行内追问。取消不提交；普通辅助选择和按句按钮保留。 | 单测覆盖前拖、回拖、父层重渲染、外部松手、取消后新选择、Shift 连续扩选。两个公网域名的真实鼠标操作均六步通过：按住时原文未改、引用未提前出现，松手后引用准确为最终的“区花园是否应该”，再进入追问仍是同一句。重复句偏移及既有选句草稿刷新回归通过。 |
| R02 · 主动退出 | “返回种子”、Escape、点空白和舞台交互复用已有注意力版本保护；回应照常保存，显式退出后不再自动打开阅读或聚焦标题。 | 三种退出路径有组件回归，未退出的正常追问仍自动阅读。两个公网域名×桌面/移动四次均等待阅读完全退场再释放受控响应；都保持关闭、不抢标题焦点。刷新保持关闭，之后可主动打开已保存回应。 |
| R03 · 帮助语义 | 舞台与首次帮助共用 coarse-pointer 检测和同一手势说明；媒体查询变化时同步更新。鼠标说明旋转，触摸说明平移、拖球合成与双指操作。 | 输入方式切换与监听清理回归通过。双域名双端的帮助内容符合实际输入方式；320px浅色、360px暗色、桌面和移动横屏的提示均在屏幕内，没有文档横向溢出。 |

没有修改卡片结构、CSS、种子形体、融合、材质、颜色或既有手势；保留 sketch1638178 的低饱和软糯感。长文返回位置和鼠标双击等待仍属未批准实施的体验建议，没有夹带改动。

## 仓库与构建

- Node.js 22.22.0 下全仓 lint、生产/测试类型检查和 **93 文件、688 项测试**全部通过；lint 为0错误、26条既有警告。[完整检查日志](verification/checks.txt)
- 新增8项有意义的交互回归；浏览器专项脚本语法、lint与精确暂存变更的空白检查通过。最初额外使用 Node24 的局部检查出现两项既有圆桌用例超时；未放宽超时或跳过用例，改用项目部署目标 Node22 后完整688项通过。
- Linux x64 / Node.js22.23.4 / Next.js15.5.28 的 `/Anicca` 生产构建及standalone打包通过。[构建日志](verification/linux-build.txt)
- 253个源码、配置及资源文件与候选构建逐项SHA256一致；运行时提示词存在，发布包无dotenv文件。生产凭据仍由原EnvironmentFile独立提供。[构建来源](verification/source-verification.json)

## 候选与公网流程

候选服务先完成桌面1440×900与移动触摸390×844的三项专项、完整受控思考流程、鼠标/触摸拖拽合成，以及原版/TSL WebGL2/TSL自动的手动切换、刷新保留和受控故障回退，全部通过。[候选专项](verification/candidate-targets.json)、[候选完整流程](verification/candidate-flow.json)

共享源站切换后，两个公网域名的三项专项和双端受控完整流程均通过。完整链包含长文阅读、重复句精确选句、行内草稿刷新、追问、极性、从极性继续正反、刷新后本轮另一端、合成、从合继续正反、再次刷新并从合继续时间极性；每个上下文最终12节点。另覆盖鼠标/触摸直接拖拽、停留松手、取消与迟到结果，以及手动渲染器切换与模拟故障回退。

- [公网三项专项](verification/public-targets.json)
- [双域名受控完整流程](verification/public-controlled.json)
- [窄屏/暗色/横屏帮助布局](verification/guide-layout.json)
- [协议检查](verification/protocol.json)：两个入口及 `/Anicca/dialogue` 为200并保持原域名；`.env`与`.git/config`为404。带前缀资源与懒加载chunk由完整流程检查。

真实接口复测也已完成：两个域名×桌面/移动四个上下文，共 **24次真实API请求全部成功**，每个上下文最终12节点，均完成从选句到合成、刷新与合后继续展开。[真实接口结果](verification/public-live.json)

| 入口 | 桌面1440×900 | 移动触摸390×844 | 三项专项 / 拖拽 / 渲染器切换与回退 |
| --- | --- | --- | --- |
| aitoshuu.me/Anicca | 受控与真实流程均通过；默认WebGPU | 受控与真实流程均通过；默认原版 | 均通过 |
| tongye.me/Anicca | 受控与真实流程均通过；默认WebGPU | 受控与真实流程均通过；默认原版 | 均通过 |

已实际查看 [拖选进行中](verification/aitoshuu.me-drag-before-release.png)、[松手后的准确引用](verification/aitoshuu.me-drag-after-release.png)、[移动退出后回应保存](verification/aitoshuu.me-mobile-after-reply.png)、[320px帮助](verification/guide-mobile-320.png)、[暗色帮助](verification/guide-mobile-dark.png)、[桌面帮助](verification/guide-desktop.png)、[真实移动合成](verification/mobile-live-synthesis.png)和[合后继续展开](verification/mobile-live-continued.png)等代表图。没有新增卡片或视觉变更。

## 当前发布

腾讯共享源站 `122.51.59.89` 当前为 `/opt/anicca/releases/20261028-selection-intent`，Build ID `g1H9dsn-sTPdvQCvkB7Ww`。应用active/running，切换后重启计数0；旧发布 `/opt/anicca/releases/20261028-six-fixes-final` 保留作为回滚点。[发布记录](verification/rollout.json)

- https://aitoshuu.me/Anicca
- https://tongye.me/Anicca

继续使用原入口反代，两个域名各保留地址栏；未改DNS、证书或反代规则。桌面默认TSL自动，移动默认原版，手动切换和回退保留。候选服务与本轮临时SSH转发均已停止。

移动为Chromium触摸视口验证，本轮没有新增iPhone Safari/Chrome或Android真机、系统选区手柄、真实软键盘与持续GPU性能测试。

R01–R03 均已修复、验证并同步公网。仓库沿用现有main，只提交本轮交互修改、回归脚本、两份独立报告与验收证据；保留工作区既有其他修改。
