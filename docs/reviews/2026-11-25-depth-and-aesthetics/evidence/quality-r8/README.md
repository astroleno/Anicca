# 第八轮合流评测证据

## 封存与运行参数

旧卷是第七轮原有 12 道正式题及 5 道迁移题。本轮逐字核对这 17 道题的完整合流请求，保留顺序、两份来源、联结补充和带角色历史。独立新卷 8 题与旧卷一起封存。生成调用读取完整请求，盲卷只显示题面、来源标签与正文、用户的联结补充和实际阅读内容。评分参考与运行请求分别保存。[冻结完整请求](requests.json) · [新卷评分参考](holdout-reference.json) · [哈希](frozen.sha256)

生产路由使用 DeepSeek 默认模型别名 `deepseek-v4-flash`，Chat Completions，思考模式关闭。第七轮校准记录供应商返回名 `deepseek-flash`。本轮生产跟踪用于核对请求别名，成本按供应商返回的 token 和调用数核算。常规生成采用供应商默认温度，正文审阅设为 0。两版默认空间的草稿、批评、最终改写和生成修复上限为 1400 token，高风险审计为 1800，合流正文审阅为 2800，暂不融合审阅为 900。[供应商配置](../quality-r7/provider.json) · [改前运行参数](before/settings.json) · [改后运行参数](after/settings.json)

每版固定并发 4，每题最长 180 秒。网络异常、运行器中断和 HTTP 408、429、500、502、503、504 后可隔 2 秒再尝试一次。明确的 `invalid_model_output` 以及成功 HTTP 回包的协议错误保留为缺测。逐次请求及响应按题保存，续跑读取同一输出目录的记录。模型及服务的内部修复如实计入用量。[改前 HTTP 记录](before/responses) · [改前跟踪](before/traces.json) · [改前汇总](before/summary.json)

## 复跑

在各待测修订的独立工作区构建 Next 应用，按第七轮说明使用生产配置和测量 wrapper。wrapper 只为真实路由跟踪附上请求关联标记。使用 Node 22 命令运行评测。每个输出目录由单个 runner 依次写入，更新版本时建立新的证据目录。[第七轮生产 wrapper 说明](../quality-r7/README.md#复跑)

```sh
evidence=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r8
node scripts/evals/dialectic-quality-r8.mjs \
  --base http://127.0.0.1:3278 --output "$evidence/before" \
  --run before --revision e537d79 --server-log /tmp/r8-before-server.log
```

候选 `5b60884` 先用 `--group r7` 跑 17 道旧题，再用 `--group holdout` 跑 8 道新题，两次使用同一修订、端口、日志和输出目录。

```sh
for group in r7 holdout; do
  node scripts/evals/dialectic-quality-r8.mjs \
    --base http://127.0.0.1:3279 --output "$evidence/after" \
    --run after --revision 5b60884 --server-log /tmp/r8-after-server.log --group "$group"
done
```

需要一次提交 25 道时使用默认 `--group all`。`summary.json` 按组计数。返回非零表示至少一题缺测，原始记录和真实跟踪仍在输出目录。三个中间版本均只跑旧卷，`231d217` 可读 17/17、`36421b1` 可读 15/17、`29b3ab9` 可读 15/17，独立新卷一直保留到候选锁定。[第一次回归](first-regression/summary.json) · [严格门控回归](strict-regression/summary.json) · [审计回归](audit-regression/summary.json)

## 匿名封包与揭盲

使用两个权限为 0700 的独立临时目录。题面顺序和每题 A/B 分别由随机数决定，两侧仅保留正文、暂不融合的原因和问题，或缺测标记。评审者拿匿名题卷，判断封存后再读取独立存放的映射。

```sh
packet_dir=$(mktemp -d /tmp/anicca-r8-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r8-key.XXXXXX)
node scripts/evals/blind-dialectic-quality-r8.mjs \
  --before "$evidence/before" --after "$evidence/after" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json"
```

有且仅有一侧交付正文时，该侧仍接受严重误导检查，当题记为无法比较。汇总器验证判词哈希、盲卷哈希、两版运行设置、逐题请求和每侧正文与映射的对应关系。以下命令使用已封存的判断原样复算技术附表和逐题明细。[封存判词](judgments.json) · [匿名题卷](packet.json) · [揭盲映射](key.json)

```sh
results_dir=$(mktemp -d /tmp/anicca-r8-results.XXXXXX)
node scripts/evals/summarize-dialectic-quality-r8.mjs \
  --judgments "$evidence/judgments.json" \
  --judge-sha 2a98b1cbff15a4be25d15f742b5528b2bb2fb8d597721bba1de7c71657fa7a33 \
  --packet "$evidence/packet.json" --key "$evidence/key.json" \
  --out "$results_dir"
cmp "$evidence/results.md" "$results_dir/results.md"
cmp "$evidence/revealed.json" "$results_dir/revealed.json"
```

| 封存文件 | SHA-256 |
| --- | --- |
| [冻结请求](requests.json) | `f4758f3c3cb2346d830e2be660e16a41ccae8ff72726b925fab897eabe6fcb7e` |
| [新卷参考](holdout-reference.json) | `93ea7a081b2de901353f98d78004c15fe7dacb1267a100318b0ba32fb0cf8948` |
| [匿名题卷](packet.json) | `dee64c507d67256e59b8da68d9a501cff85e90817472fc5733af6982010e047d` |
| [判词](judgments.json) | `2a98b1cbff15a4be25d15f742b5528b2bb2fb8d597721bba1de7c71657fa7a33` |
| [揭盲映射](key.json) | `597adb77a430bdb79f8783881469875fe654d7a330fd6e60cc78f4a090e2ca1a` |

## 验收判读

候选达到两卷的可读率门槛。旧卷由 14/17 至 16/17，胜、平、负、无法比较依次为 8、1、4、4。独立新卷由 7/8 至 8/8，依次为 2、0、5、1。候选质量验收未通过。生产库退役题中，候选把单场恢复当成清空整批旧盘的放行条件，改前该题缺测。口述史题中，两版都把馆内播放许可延伸到网页，候选明确要求公开原句与出处。纸本档案题的严重误导发生在改前，候选避免了直接碎毁未经检查纸本的建议，仍欠无法查完时的处理条件。[技术附表](results.md) · [逐题揭盲](revealed.json)

旧卷两版各发出 17 次请求，模型与供应商调用由 88 次降至 76 次，客户端 p50/p95 由 11,065/17,520 ms 降至 6,709/14,033 ms。新卷两版各发出 8 次请求，调用由 28 次降至 26 次，p50/p95 由 9,269/10,979 ms 降至 5,886/6,830 ms。两版全部请求都有生产跟踪且无重试，输入、缓存和输出 token 按卷列于附表。[改后实测汇总](after/summary.json) · [延迟与用量](results.md#延迟与用量)
