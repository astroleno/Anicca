# 第八轮独立确认卷

## 封存与分组

确认卷 8 道题覆盖技术隐喻、授权范围、替代物等价性、抽样边界与足够前提下可直接采取的行动。完整合流请求与评分参考分别封存。先前已揭盲的 17+8 道作为两组回归，改前结果沿用 `e537d79` 原始记录。确认卷的改前与改后各按相同生产合流入口运行一次。[确认卷请求](requests.json) · [判断参考](reference.json) · [封存哈希](frozen.sha256) · [回归改前原始结果](../before/summary.json)

| 封存文件 | SHA-256 |
| --- | --- |
| [确认卷请求](requests.json) | `01204552b43dcd33c050e72d98cddec42f733d5ee06bfa75edeee0f249a5af3f` |
| [确认卷参考](reference.json) | `ed4adf6f327d5be8b7cb279a271c94460f54bbd32bb6d6d4999b9fc4cf8d7e16` |
| [确认卷哈希清单](frozen.sha256) | `1281ce53bba287b2dea78a643c568fa8e5903046d1dde1f5b05e95ebe7863711` |
| [33 题匿名卷](packet.json) | `9b94c6c9a1dbfa9b9647836346aeacb720578f7d8fa007d20b0eadb2cc0c0cb1` |
| [封存判词](judgments.json) | `13826815adb924d144a0ede19735509f3253a8cf541c22d63d2d394e5c46ccaa` |
| [揭盲映射](key.json) | `2f61a75618d06e51c54f0f71e08b29e09bed1f9af2893fa4522d12358e4cb7df` |

## 生产实测

两批共用第八轮默认模型、并发 4、超时和重试规则。每版通过 `POST /api/synthesis` 发送 `meaningVersion: 1` 与固定完整来源。生成与跟踪的配置沿用主证据说明。下例输出目录以已归档记录命名。复跑时改用空目录，指定对应修订生产服务的新端口和日志。[第八轮运行和复跑说明](../README.md#复跑)

```sh
r8=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r8
node scripts/evals/dialectic-quality-r8.mjs --exam confirmation \
  --base http://127.0.0.1:3282 --output "$r8/confirmation/before" \
  --run before --revision e537d79 --server-log /tmp/r8-confirmation-before.log

node scripts/evals/dialectic-quality-r8.mjs \
  --base http://127.0.0.1:3283 --output "$r8/confirmation-regression/after" \
  --run after --revision c7888fa --server-log /tmp/r8-confirmation-after.log

node scripts/evals/dialectic-quality-r8.mjs --exam confirmation \
  --base http://127.0.0.1:3283 --output "$r8/confirmation/after" \
  --run after --revision c7888fa --server-log /tmp/r8-confirmation-after.log
```

改前可读 5/8，含 1 道暂不融合。8 道均保留真实跟踪和单次 HTTP 尝试，调用模型及供应商各 32 次。输入、已缓存输入、输出分别为 84,618、53,120、8,199 token，客户端 p50/p95 为 7,365/9,112 ms。[改前实测](before/summary.json) · [改前真实跟踪](before/traces.json)

## 匿名封包

从两版的回归与确认卷实测记录抽取同一组 33 个匿名 ID。随机混排题目并逐题交换 A/B。一份匿名题卷交给评审，映射单独保管，待判词按哈希封存后揭盲。

```sh
packet_dir=$(mktemp -d /tmp/anicca-r8-confirm-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r8-confirm-key.XXXXXX)
node scripts/evals/blind-dialectic-quality-r8.mjs \
  --before "$r8/before" --after "$r8/confirmation-regression/after" \
  --confirmation-before "$r8/confirmation/before" --confirmation-after "$r8/confirmation/after" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json"
```

## 揭盲复算

封存独立判词后，使用同一份题卷与映射复算。两份输出均已通过逐字比对。[技术附表](results.md) · [逐题揭盲](revealed.json)

```sh
confirmation="$r8/confirmation"
results_dir=$(mktemp -d /tmp/anicca-r8-confirm-results.XXXXXX)
node scripts/evals/summarize-dialectic-quality-r8.mjs \
  --judgments "$confirmation/judgments.json" \
  --judge-sha 13826815adb924d144a0ede19735509f3253a8cf541c22d63d2d394e5c46ccaa \
  --packet "$confirmation/packet.json" --key "$confirmation/key.json" \
  --before "$r8/before" --after "$r8/confirmation-regression/after" \
  --confirmation-before "$confirmation/before" --confirmation-after "$confirmation/after" \
  --out "$results_dir"
cmp "$confirmation/results.md" "$results_dir/results.md"
cmp "$confirmation/revealed.json" "$results_dir/revealed.json"
```

## 结果

三组可读率及三道历史严重题的交付条件均通过。两版各 33 次 HTTP 尝试，全部关联到真实生产跟踪，零重试。已揭卷的调用增量集中在两道历史题。旧盘清空题多一次生成格式修复，且交付了原先缺测的正文。口述史公开题同时发生格式与正文修复，多两次模型调用。该题仍未守住授权范围，也是已揭卷 p95 对应的请求。[回归候选汇总](../confirmation-regression/after/summary.json) · [确认卷候选汇总](after/summary.json) · [逐题跟踪](results.md#逐题跟踪)

| 题组 | 可读 改前 → 改后 | 改后胜 / 平 / 负 / 无法比较 | 供应商调用 改前 → 改后 | p50 / p95 ms 改前 → 改后 |
| --- | ---: | ---: | ---: | ---: |
| 旧卷 17 题 | 14/17 → 16/17 | 5 / 2 / 6 / 4 | 88 → 73 | 11,065 / 17,520 → 7,134 / 13,139 |
| 已揭卷 8 题 | 7/8 → 8/8 | 3 / 2 / 2 / 1 | 28 → 30 | 9,269 / 10,979 → 6,192 / 11,016 |
| 独立确认卷 8 题 | 5/8 → 7/8 | 2 / 1 / 2 / 3 | 32 → 26 | 7,365 / 9,112 → 5,627 / 8,201 |

**质量门槛未通过。** 口述史题 `holdout-06` 对应 `q08`，候选是 A。候选把馆内播放许可延伸为网页文字摘引，并认定许可边界得到遵守。同批改前的 B 也把具体证言转述到网页。两侧判严重，候选仍触发授权硬否决。

旧盘题 `holdout-04` 对应 `q29`，候选 A 明确暂缓清盘，并指出恢复演练只证明已检场次可恢复，修正了上一候选把单场验证当成整批清盘条件的问题。同批改前缺测。纸档案题 `holdout-05` 对应 `q23`，候选 B 通过斜光筛查使用可移交名额，判读胜出。尚可明确优先保住已确认的二十张，并说明未经筛查纸本的去向。[三题判词与正文](revealed.json)

独立确认卷候选未被判严重。试演海报题明确使用可用的剧团自摄舞台照，全量验证正对照允许限定清单内的清理，两题胜出。菜单题把主料核实附上了不相干的许可门槛，布料题要求重复抽取已有验证的织法，两题退步。室友协商题两版均因批评阶段回包格式失败而缺测。[确认卷逐题证据](revealed.json)
