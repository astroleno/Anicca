# 第八轮合流评测证据

## 封存与运行参数

旧卷是第七轮原有 12 道正式题及 5 道迁移题。本轮逐字核对这 17 道题的完整合流请求，保留顺序、两份来源、联结补充和带角色历史。独立新卷 8 题与旧卷一起封存。生成调用读取完整请求，盲卷只显示题面、来源标签与正文、用户的联结补充和实际阅读内容。评分参考与运行请求分别保存。[冻结完整请求](requests.json) · [新卷评分参考](holdout-reference.json) · [哈希](frozen.sha256)

生产路由使用 DeepSeek 默认模型别名 `deepseek-v4-flash`，Chat Completions，思考模式关闭。第七轮校准记录供应商返回名 `deepseek-flash`。本轮生产跟踪用于核对请求别名，成本按供应商返回的 token 和调用数核算。常规生成采用供应商默认温度，正文审阅设为 0。默认空间的草稿、批评、最终改写和生成修复上限为 1400 token，高风险审计为 1800，改前合流正文审阅为 2800，暂不融合审阅为 900。[供应商配置](../quality-r7/provider.json) · [改前运行参数](before/settings.json)

每版固定并发 4，每题最长 180 秒。网络异常、运行器中断和 HTTP 408、429、500、502、503、504 后可隔 2 秒再尝试一次。明确的 `invalid_model_output` 以及成功 HTTP 回包的协议错误保留为缺测。逐次请求及响应按题保存，续跑读取同一输出目录的记录。模型及服务的内部修复如实计入用量。[改前 HTTP 记录](before/responses) · [改前跟踪](before/traces.json) · [改前汇总](before/summary.json)

## 复跑

在各待测修订的独立工作区构建 Next 应用，按第七轮说明使用生产配置和测量 wrapper。wrapper 只为真实路由跟踪附上请求关联标记。使用 Node 22 命令运行评测。每个输出目录由单个 runner 依次写入，更新版本时建立新的证据目录。[第七轮生产 wrapper 说明](../quality-r7/README.md#复跑)

```sh
evidence=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r8
node scripts/evals/dialectic-quality-r8.mjs \
  --base http://127.0.0.1:3278 --output "$evidence/before" \
  --run before --revision e537d79 --server-log /tmp/r8-before-server.log
```

候选先用 `--group r7` 跑 17 道旧题，再用 `--group holdout` 跑 8 道新题，两次使用同一修订、端口、日志和输出目录。需要一次提交 25 道时使用默认 `--group all`。`summary.json` 按组计数。返回非零表示至少一题缺测，原始记录和真实跟踪仍在输出目录。

## 匿名封包与揭盲

使用两个权限为 0700 的独立临时目录。题面顺序和每题 A/B 分别由随机数决定，两侧仅保留正文、暂不融合的原因和问题，或缺测标记。评审者拿匿名题卷，判断封存后再读取独立存放的映射。

```sh
packet_dir=$(mktemp -d /tmp/anicca-r8-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r8-key.XXXXXX)
node scripts/evals/blind-dialectic-quality-r8.mjs \
  --before "$evidence/before" --after "$evidence/after" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json"
```

有且仅有一侧交付正文时，该侧仍接受严重误导检查，当题记为无法比较。汇总器验证判词哈希、盲卷哈希、两版运行设置、逐题请求和每侧正文与映射的对应关系。以下命令输出可重复计算的技术附表和逐题明细，`JUDGE_SHA256` 取封存判词的哈希。

```sh
results_dir=$(mktemp -d /tmp/anicca-r8-results.XXXXXX)
node scripts/evals/summarize-dialectic-quality-r8.mjs \
  --judgments "$evidence/judgments.json" --judge-sha JUDGE_SHA256 \
  --packet "$evidence/packet.json" --key "$evidence/key.json" \
  --out "$results_dir"
```
