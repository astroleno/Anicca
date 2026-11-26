# 第九轮授权范围评测

## 冻结与改前基线

八道独立双源题于 `edfceed` 冻结，包含两道明确授权、两道授权缺口、两道混合动作、一道缺许可仍可形成可执行方案及一道非领域对照。逐动作参考记录判断、权利来源和范围。核对冻结件和基线存档时，在本目录分别执行 `shasum -a 256 -c frozen.sha256` 与 `shasum -a 256 -c baseline.sha256`。[冻结请求](requests.json) · [冻结逐动作参考](reference.json) · [基线文件清单](baseline.sha256)

原 33 道使用第八轮最终确认候选 `c7888fa` 的原始请求与响应，保留 `formal-02` 和 `confirmation-02` 的 HTTP 缺测。新八道在 `34a47e4` 的生产入口各采一次。两版生产源码、依赖清单和生产配置目录的 Git 比对无差异。两批模型、传输、并发和重试设置一致。[旧卷与已揭回归原档](../quality-r8/confirmation-regression/after) · [原确认卷原档](../quality-r8/confirmation/after) · [新卷改前设置](new-before/settings.json)

| 题组 | 改前可读 | 改后最低可读 |
| --- | ---: | ---: |
| 旧卷 | 16/17 | 16/17 |
| 已揭回归 | 8/8 | 8/8 |
| 原确认卷 | 7/8 | 7/8 |
| 第九轮新卷 | 8/8 | 8/8 |

新卷共 8 次 HTTP 请求，8 条真实跟踪，零重试。模型及供应商调用各 27 次，含 3 次格式修复。客户端 p50/p95 为 6,495/9,978 毫秒。输入、已缓存输入、输出分别为 75,517、43,008、5,503 token。[改前新卷原始统计](new-before/summary.json) · [改前新卷真实跟踪](new-before/traces.json)

## 生产复跑

运行真实 `POST /api/synthesis`。合流入口须有对应版本与设置的独立服务和生产跟踪日志。两个命令之前先冻结并校验请求。用空目录保存新一轮响应，下面的改前命令保留实际运行记录中的端口与修订。候选的环境变量指向正式运行的生产实例。

```sh
r9=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r9

node scripts/evals/dialectic-quality-r9.mjs --exam new \
  --base http://127.0.0.1:3284 --output "$r9/new-before" \
  --run before --revision 34a47e4 --server-log /tmp/anicca-r9.Km3QPA/before-server.log

node scripts/evals/dialectic-quality-r9.mjs --exam all \
  --base "$candidate_base" --output "$r9/after" \
  --run after --revision "$candidate_revision" --server-log "$candidate_log"
```

并发四个请求，超时 180 秒，每题每版只正式抽取一次。沿用第八轮预先约定的传输重试，模型无效产物计缺测。进程退出码 1 可表示完整跑完且有缺测，以原始统计及跟踪为准。相同配置和目录可以续接中断。更换生产实现须另列候选并另起目录全量运行。

## 封包、盲判与揭盲

匿名卷随机混排 41 题并独立交换逐题 A/B。每题含原问题、两源、连接补充（若有）、按角色及时间排列的上下文与两侧正文。评审只得到匿名卷与盲判说明。评审独立判每侧，缺测也记录，并对仍可读的一侧判风险。映射单独保管，先封存判词哈希及 UTC 时间，再揭盲。[盲判填写说明](judge-instructions.md)

```sh
packet_dir=$(mktemp -d /tmp/anicca-r9-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r9-key.XXXXXX)
node scripts/evals/blind-dialectic-quality-r9.mjs pack \
  --after "$r9/after" --packet "$packet_dir/packet.json" --key "$key_dir/key.json"

# 收齐独立判词后，对实际文件记录 UTC 时间与 SHA-256，复算应始终传入封存的 SHA-256。
date -u +%Y-%m-%dT%H:%M:%SZ
shasum -a 256 "$judgments"
results_dir=$(mktemp -d /tmp/anicca-r9-reveal.XXXXXX)
node scripts/evals/blind-dialectic-quality-r9.mjs reveal \
  --after "$r9/after" --packet "$packet_dir/packet.json" --key "$key_dir/key.json" \
  --judgments "$judgments" --judge-sha "$sealed_sha" --out "$results_dir"
```

复算校验两版每题原始 HTTP、跟踪、请求、设置、匿名映射及判词哈希，生成机器可读的 `revealed.json` 与 `results.md`。其中新卷参考动作与两侧盲判动作并列。程序核对动作数、决定类型与盲判，Astra 按语义逐条核对动作对应、遗漏与引文，再对照第八轮原参考核验三道历史严重题。动作名称可用同义改述，动作对应须逐项成立。[历史严重题原参考](../quality-r8/holdout-reference.json)
