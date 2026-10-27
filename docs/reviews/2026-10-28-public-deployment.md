# /Anicca 公网部署验收 · 2026-10-28

两个入口已上线，各自保留域名与 `/Anicca` 地址：

- https://aitoshuu.me/Anicca
- https://tongye.me/Anicca

## 部署状态

- 阿里云 ECS `47.103.120.24` 终止 HTTPS，在两个既有域名的 HTTPS vhost 中加入精确 `/Anicca` 与 `/Anicca/` 前缀反代。未改 DNS、证书、SSH 认证和原站点路由。
- 腾讯云 Lighthouse `122.51.59.89` 承载应用；源站只接受入口服务器和回环访问。Node 仅监听 `127.0.0.1:3250`。
- `anicca.service` 已启用开机启动，应用与 Nginx 均为 active，验收后重启次数为 0。
- Linux x64 / Node 22.23.4 / Next.js 15.5.28；原生 Sharp 0.35.5 已运行验证。
- 首次发布目录：`/opt/anicca/releases/20261027-subpath-IBPSEMvmKfkwr9DoSXEkl`。62 个待提交源码文件与服务器构建目录逐文件哈希一致，已删除文件在构建目录中不存在。
- 服务凭据独立存放于 root 专用目录，发布包中没有 dotenv 文件；Git 暂存检查未发现生产凭据。
- 入口 vhost 备份：`/root/anicca-deploy-backup-20261028-1793117610`。恢复办法见 `deploy/README.md`。

## 公网浏览器验收

使用独立 Chromium 上下文；桌面 1440×900，移动触摸视口 390×844。没有清理现有用户工作区。

| 入口 | 桌面真实接口完整流程 | 移动视口真实接口完整流程 | 鼠标/触摸拖拽合成 | 手动切换、刷新保留、回退 |
| --- | --- | --- | --- | --- |
| aitoshuu.me/Anicca | 通过，WebGPU | 通过，原版 | 均通过 | 双端通过 |
| tongye.me/Anicca | 通过，WebGPU | 通过，原版 | 均通过 | 双端通过 |

完整流程包含：长文阅读位置恢复、精确选择重复原句中的第二处、选句草稿刷新恢复、追问、关切极性两端、从极性继续正反、刷新后匹配本轮另一端、合成、从合继续正反、再次刷新、从合继续时间极性。每个上下文最终 12 个节点；共 24 次真实 API 请求全部返回 200，无浏览器运行错误或横向溢出。

控制响应的鼠标与触摸测试覆盖直接拖动、停留后松手合成、合成完成不打开卡片、失败重试保留新草稿，以及取消后的迟到结果。手动检查覆盖原版、TSL WebGL2、TSL 自动；刷新后保留选择。回退检查通过在独立测试画布中注入图形上下文丢失事件，确认恢复原版和对应状态提示；这不是一次真实 GPU 故障。

已查看桌面和移动端的阅读、行内追问、合成、合成后展开截图：保持无卡片、低饱和软糯材质。默认仍为桌面 TSL 自动、移动原版。两个域名的工作区继续按各自 origin 独立保存在浏览器。

协议检查：两个入口与 `/Anicca/dialogue` 均为 200，入口不跨域或跳转改址；带前缀静态资源及懒加载渲染器全部加载成功；提示词 API 返回 200，`.env` 和 `.git/config` 返回 404。既有主页仍正常响应。

本轮是桌面浏览器和移动触摸视口验收，不构成新一轮 iPhone、Android 真机持续性能测试；移动端默认没有改为 TSL。

## 仓库与构建检查

- 全仓 lint、生产/测试 TypeScript、88 文件 667 项测试通过；lint 保留 26 条已有 warning，无 error。
- Linux 生产构建通过，包括类型、静态生成与 standalone tracing；运行时提示词完整，原生图像依赖可用。
- 新增验收脚本的语法与 lint、CI 配置回归测试、`git diff --check` 通过。
- 首次真实接口验收把可选的“理解变化”说明误作必填，导致脚本超时。已按现有审校契约验证有依据时显示、无依据时隐藏，并保留合成摘要回退断言。修正后两个域名、双端的真实完整流程全部通过，产品行为未因此变更。

原始证据位于本机 `/tmp/anicca-public-qa-20261028/`：

- `controlled/summary.json`：双域名双端完整流程与指针合成。
- `live-rerun/summary.json`：真实 API 请求、节点与刷新恢复记录及截图。
- `renderers-rerun/summary.json`：双域名双端手动渲染切换、持久化与模拟故障回退。

复测入口：`scripts/visual-smoke/deployment.mjs`，真实接口加 `--live`；仅检查渲染器加 `--renderer-only`。

## 后续：Lama × Emil 六项修复

同日完成四项 P2、两项 P3，当前共享发布为 `/opt/anicca/releases/20261028-six-fixes-final`，Build ID `gYvsXfhsH4WQe87NjnYgQ`。首次发布保留作为回滚点；两个域名、桌面与移动触摸视口的受控和真实接口完整流程重新通过，共 24 次真实 API 请求成功。全仓检查为 93 文件、680 项测试通过，仍保留 26 条既有 lint warning。未更改反代、证书、默认渲染器或种子材质。

详见 [六项修复与公网验收](2026-10-28-lama-emil-frontend/fix-verification.md)。
