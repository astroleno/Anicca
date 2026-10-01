# Anicca 浅色液态前端参考源码

归档日期：2026-10-01。来源：用户提供的 anicca 前端项目。

这是新主线的视觉与交互参考快照，不是独立可启动应用，也没有接入现有 `/dialogue`。后续设计和迁移以本目录为来源，不再依赖下载目录。

## 核心文件

| 文件 | 用途 |
| --- | --- |
| [Home.tsx](src/pages/Home.tsx) | 页面、画布、标签、输入与原型交互 |
| [world.ts](src/dialectic/world.ts) | 种子状态、拖拽、物理模拟、原型分裂/合并与本地存储 |
| [renderer.ts](src/dialectic/renderer.ts) | WebGL2 渲染、自适应分辨率、uniform 更新 |
| [spcode.ts](src/dialectic/spcode.ts) | Shader Park 材质、色场与液态融合源码生成 |
| [color.ts](src/dialectic/color.ts) | 正反合配色与稳定颜色映射 |
| [index.css](src/index.css) | 原始全局样式与主题变量 |
| [shader-park-core.d.ts](src/types/shader-park-core.d.ts) | 原型调用的 Shader Park 接口类型声明 |

未复制 node_modules、dist、package.json、锁文件、工具配置、路由启动壳、未使用的 UI 组件或模板 App.css。源码仍引用 React、Shader Park 和 Tailwind 样式；这些库本身没有被复制或安装。接入时按主项目版本适配，不照搬原工程依赖。

归档时逐文件校验了复制内容；唯一后续修改是移除 `spcode.ts` 注释中的本机下载路径，原型行为未改动。已有相对导入保持有效。

## 使用边界

- `world.ts` 的正反内容是复制输入，合并会删除来源，均为原型行为，不能直接作为生产业务。
- 原型 `anicca.seeds.v1` 存储不得替代现有工作区与 BranchGraphStore。
- 原型渲染器需要补资源清理、回退和移动端生命周期处理；保留视觉不等于照搬运行逻辑。
- 本目录在应用源码目录之外；后续按模块迁入主项目，不从生产页面直接加载整套原型。

实施方案见 [浅色液态前端接入计划](../../docs/superpowers/plans/2026-10-01-anicca-liquid-frontend-integration-plan.md)。旧前端作为备选分支的策略也记录在该计划中。
