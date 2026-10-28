# 本轮证据索引

对应提交：`8995c52917ebcb2aee7a345eb0883da928f95c33`。证据由主线程统一采集，Lama、Emil 两个独立审阅者分别查看原图与状态并形成结论。产品文件和公网版本未因本轮评审改变。

本文为修复前的审阅证据。后续实施的检查、构建、候选与公网结果另存于 [verification/](../verification/)，状态见[修复与验收记录](../fix-verification.md)。

第二轮主线程复核的新增数据、脚本和10张精选截图放在 [recheck/](recheck/)，对应[复核说明](../recheck.md)。其中空白首访没有注入工作区夹具；补充中央入口触摸仅设置帮助已关闭，不注入种子。此批资料未用于冒充新增独立 agent 评审。

## 新动态采集

| 文件 | 内容与边界 |
| --- | --- |
| [deployment-current.json](deployment-current.json) | 只读核对腾讯云 current release、build ID、完整 revision 和服务状态；不含服务密钥。 |
| [app-flows.json](app-flows.json) / [脚本](capture.mjs.txt) | 1440×900 桌面、390×844 触摸、844×390 横屏触摸、360×780 暗色触摸，各13状态，全部完成且无 pageerror。覆盖菜单/极性 Escape、阅读位置、角度对话框、全景与10次Tab、重命名、输入等待和失败恢复。4次POST为隔离上下文故意注入的502，无真实模型调用。 |
| [responsive-boundary.json](responsive-boundary.json) / [补充脚本](capture-supplement.mjs.txt) | 680/681/768/844/980/981px边界和844×390，共7组全部完成，无 pageerror。包含计算样式、外盒、padding与输入可见高度。横屏还包含模拟触摸滑动及临时padding置零归因实验。临时样式只在一个隔离页面DOM里生效，没有产品变更。 |
| [history-recheck.json](history-recheck.json) | 同源合成来源页→app阅读650→浏览器Back→Forward。来源页明确UTF-8，Forward恢复阅读650。只证明浏览器导航，不证明系统返回手势。 |
| [ci-status.json](ci-status.json) / [ci-status-latest.json](ci-status-latest.json) | 同版CI只读快照。质量检查与构建成功；末次快照中production visual smoke仍运行。快照不是对未来状态的承诺。 |

主脚本最初的 `history` 来源夹具未声明 UTF-8，来源页标题/正文出现乱码；这是夹具编码问题。已用 `history-recheck.json` 单独复测，并替换下面的历史来源截图。旧 `app-flows.json` 保留原始记录供追溯；历史结论以 recheck 为准，其他四组 app 状态不受此夹具问题影响。

运行方法：项目现有 Playwright、Chromium headless、macOS Metal ANGLE；移动项为 `isMobile/hasTouch` 及viewport仿真，额外滑动为CDP触摸事件。Browser plugin不可用；未安装依赖或改全局配置。采集脚本的本机绝对路径是运行时定位信息，不是部署要求。

## 精选截图

| 观察 | 图片 |
| --- | --- |
| 桌面菜单 Escape | [打开更多并保留阅读](desktop-reading-more.png) → [一次Escape后阅读也关闭](desktop-after-more-escape.png) |
| 390触摸菜单 Escape | [更多](mobile-390-reading-more.png) → [越级退出](mobile-390-after-more-escape.png) |
| 极性标题焦点 Escape | [标题默认获焦](mobile-390-polarity-title-focus.png) → [越级退出](mobile-390-after-polarity-title-escape.png) |
| 全景正确返回 | [全景](mobile-390-panorama.png) → [返回原文位置](mobile-390-after-panorama-escape.png) |
| 横屏原状态 | [初始](mobile-landscape-entry.png)、[长文阅读](mobile-landscape-reading-middle.png)、[自动聚焦后页面被带走](mobile-landscape-error-recovery.png) |
| 宽度边界 | [680对照输入可见](boundary-680-initial.png)、[768平板输入不可见](tablet-768-initial.png)、[981对照输入可见](boundary-981-initial.png) |
| CSS归因 | [844横屏原状态](landscape-844-initial.png) → [仅临时padding清零](landscape-844-temporary-padding-zero.png)；后者为诊断，不是已发布修复 |
| 暗色次级状态 | [换个角度](mobile-dark-perspective.png)、[工作区重命名](mobile-dark-rename.png)、[受控失败与重试](mobile-dark-error-recovery.png) |
| 浏览器Back | [同源合成来源页](history-after-browser-back.png)，不是真实外部站点或app错误页 |

Escape关闭后的截图可能位于已有舞台透明度过渡中；不据此将瞬间浅淡文字另列对比度缺陷。

## 同版既有验证

两位审阅者还分别读取并查看了 [上一轮同版验证目录](../../2026-10-28-lama-emil-postfix/verification/)中的 `public-targets.json`、`public-controlled.json`、`public-live.json`、`guide-layout.json`及相应图片。

- `public-live.json`：两个域名×桌面/移动视口的24次真实API请求、合流、刷新与合后继续；本轮未重新执行，不冒称新真机实验。
- 专项/受控记录：拖选保持、显式退出后迟到回应、取消/重试、直接拖拽、渲染切换和回退。
- `guide-layout.json`：此前横屏断言检查的是帮助边界和无横向溢出，没有断言主输入可见。它不能推翻本轮A01的尺寸/几何证据。

## 未覆盖

真实iPhone/Android、Safari/Chrome设备差异、软键盘与IME、Dynamic Type/系统大字、真实安全区、辅助技术实机、系统选区手柄、系统返回、后台恢复、长期帧率/耗电、真人单手握持与心理心流。本轮不对这些给出通过结论。
