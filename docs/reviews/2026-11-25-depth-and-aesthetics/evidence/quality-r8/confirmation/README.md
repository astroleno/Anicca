# 第八轮独立确认卷

## 封存与分组

确认卷 8 道题覆盖技术隐喻、授权范围、替代物等价性、抽样边界与足够前提下可直接采取的行动。完整合流请求与评分参考分别封存。先前已揭盲的 17+8 道作为两组回归，改前结果沿用 `e537d79` 原始记录。确认卷的改前与改后各按相同生产合流入口运行一次。[确认卷请求](requests.json) · [判断参考](reference.json) · [封存哈希](frozen.sha256) · [回归改前原始结果](../before/summary.json)

| 封存文件 | SHA-256 |
| --- | --- |
| [确认卷请求](requests.json) | `01204552b43dcd33c050e72d98cddec42f733d5ee06bfa75edeee0f249a5af3f` |
| [确认卷参考](reference.json) | `ed4adf6f327d5be8b7cb279a271c94460f54bbd32bb6d6d4999b9fc4cf8d7e16` |
| [确认卷哈希清单](frozen.sha256) | `1281ce53bba287b2dea78a643c568fa8e5903046d1dde1f5b05e95ebe7863711` |

## 生产实测

两批共用第八轮默认模型、并发 4、超时和重试规则。每版通过 `POST /api/synthesis` 发送 `meaningVersion: 1` 与固定完整来源。生成与跟踪的配置沿用主证据说明。下例输出目录以已归档记录命名。复跑时改用空目录，指定对应修订生产服务的新端口和日志。[第八轮运行和复跑说明](../README.md#复跑)

```sh
r8=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r8
node scripts/evals/dialectic-quality-r8.mjs --exam confirmation \
  --base http://127.0.0.1:3282 --output "$r8/confirmation/before" \
  --run before --revision e537d79 --server-log /tmp/r8-confirmation-before.log
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
