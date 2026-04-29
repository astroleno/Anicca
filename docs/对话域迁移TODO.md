## Anicca 对话域迁移 TODO（分阶段）

状态标记：✅ 完成｜🟡 进行中｜⬜ 待做

### P0｜最小可用 Chat 核心（必须）
- ✅ types/chat.ts：Message/Usage/ToolCall 基础类型
- ✅ chat/core.ts：chatRun 最小实现（支持系统提示、回调占位）
- ✅ chat/providers/registry.ts：ProviderRegistry（内置 Mock）
- ✅ chat/stream/sse.ts：流式占位
- ✅ 与分支图打通：llm/runner.ts 改为调用 chatRun，写回节点
- ✅ engine/rerun.ts：从任意节点重跑至叶
- ✅ prompts 路由：/api/prompts（正/反/合）
- ✅ 上下文（父系近5轮）：chat/context.ts（权重 w=exp(-0.5·(k-1)) 与长度配额）
- ✅ 摘要：types/anicca.ts 增 meta.summary/summaryStatus；chat/summary.ts 本地校验与规范化
- ✅ /graph 页面：一键“生成 正/反”、合并、导入/导出、重跑

小幅补强（P0 直接纳入）
- ⬜ 输出 schema 固化：thesis/antithesis = { text, summary, meta{ model,temp,seed,summaryStatus } }
- ⬜ 幂等与取消：chatRun 支持 requestId 与取消标志，防幽灵请求
- ⬜ 错误分级与落盘：retryable(429/5xx/超时) vs fatal(401/无效提示)，记录 errorType
- ⬜ 流式聚合约定：约定仅落最终文本，可派发 1 条 partial 进度事件

验收（P0）
- ✅ 生成正/反 → 文本+单行摘要写回；父系近5轮上下文按配额裁剪
- ✅ 导出/导入 JSON 后结构与内容一致（Mock 下）

### P1｜体验与稳健（优先增强）
- ⬜ OpenAIProvider：接入 Responses API（支持结构化 { text, summary } 与流式）
- ⬜ 双分支结构化输出：thesis/antithesis = { text, summary }，失败占位 + summaryStatus
- ⬜ 上下文配额宣言：在系统提示头部插入权重与长度上限清单
- ⬜ 超限兜底顺序：固定裁剪策略（老原文→老摘要压缩→更老仅摘要→最后动最近原文）
- ⬜ 补摘要管道：summary 缺失/越界/重复触发低温度补跑（仅用该轮输出）
- ⬜ 事件域统一：events/bus 增加 chat.started/partial/final/failed
- ⬜ 导出增强：记录 contextNodeIds、weightsUsed、lengthCaps
- ⬜ 合的 prompt 版本化：synthesis 单独 version/hash
- ⬜ 摘要质检“三条红线”规则并触发补摘要
- ⬜ 在 system 注入“上下文配额宣言”（表格文本）

### P2｜扩展（按需）
- ⬜ Provider 限速与退避：并发阈值、指数退避、令牌桶
- ⬜ Prompt 预设版本化：thesis/antithesis/synthesis 模板版本与 hash
- ⬜ 使用计量：tokens/latency/成功率写入节点元数据
- ⬜ RAG/检索钩子：beforeChat/afterChat 注入检索要点
- ⬜ 回放与基准：Mock 回放与小型用例回归测试
- ⬜ providerSignature 与 promptVersionHash 写入节点，确保回放一致

### 当前下一步（可执行）
1) ⬜ 实现 OpenAIProvider（OpenAI SDK 兼容格式，后续可接国产大模型 SDK），切换 /graph 的生成调用（保留 Mock 切换）
2) ⬜ “正/反”结构化返回（Responses JSON Schema）：{ text, summary }
3) ⬜ 在 runNode 注入“上下文配额宣言”与长度上限清单
4) ⬜ 导出 JSON 增加 weightsUsed/lengthCaps/contextNodeIds 字段

备注
- UI 与 Shader 编舞保持解耦；对话域仅输出结构化胶囊与摘要。
- 无数据库前提下，默认本地存储与 JSON 导入/导出。


