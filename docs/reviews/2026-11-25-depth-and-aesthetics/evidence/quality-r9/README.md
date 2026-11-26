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

最终评测合并原 41 题与追加确认 4 题。[最终 45 题结果](results.md) · [最终判词封存](seal.json) · [第一候选生产统计](candidate-one/summary.json) · [第二候选 41 题揭盲](candidate-two/README.md) · [追加确认卷](confirmation/README.md)

## 生产复跑

运行真实 `POST /api/synthesis`。合流入口须有对应版本与设置的独立服务和生产跟踪日志。运行前先校验冻结请求。每次复跑用新建的空目录保存响应，原始档案留作揭盲输入。下面的改前及候选环境变量分别指向对应版本的生产实例。

```sh
r9=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r9
baseline_output=$(mktemp -d /tmp/anicca-r9-new-before.XXXXXX)
candidate_output=$(mktemp -d /tmp/anicca-r9-extended-after.XXXXXX)

node scripts/evals/dialectic-quality-r9.mjs --exam new \
  --base "$baseline_base" --output "$baseline_output" \
  --run before --revision 34a47e4 --server-log "$baseline_log"

node scripts/evals/dialectic-quality-r9.mjs --exam extended \
  --base "$candidate_base" --output "$candidate_output" \
  --run after --revision "$candidate_revision" --server-log "$candidate_log"
```

并发四个请求，超时 180 秒，每题每版只正式抽取一次。沿用第八轮预先约定的传输重试，模型无效产物计缺测。进程退出码 1 可表示完整跑完且有缺测，以原始统计及跟踪为准。相同配置和目录可以续接中断。更换生产实现须另列候选并另起目录全量运行。

## 封包、盲判与揭盲

最终匿名卷随机混排 45 题并独立交换逐题 A/B。每题含原问题、两源、连接补充（若有）、按角色及时间排列的上下文与两侧正文。评审只得到匿名卷与盲判说明。评审独立判每侧，缺测也记录，并对仍可读的一侧判风险。映射单独保管，先封存判词哈希及 UTC 时间，再揭盲。[盲判填写说明](judge-instructions.md)

```sh
packet_dir=$(mktemp -d /tmp/anicca-r9-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r9-key.XXXXXX)
node scripts/evals/blind-dialectic-quality-r9.mjs pack \
  --extended --after "$candidate_output" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json"
```

## 复算封存结果

最终 45 题使用根目录的封存判词与映射，生产采样取自 `after`。复算产物写到新建的空目录。

```sh
results_dir=$(mktemp -d /tmp/anicca-r9-reveal.XXXXXX)
sealed_sha=$(jq -r .judgmentsSha256 "$r9/seal.json")
node scripts/evals/blind-dialectic-quality-r9.mjs reveal \
  --extended --after "$r9/after" --packet "$r9/packet.json" --key "$r9/key.json" \
  --judgments "$r9/judgments.json" --judge-sha "$sealed_sha" --out "$results_dir"
cmp "$r9/results.md" "$results_dir/results.md"
cmp "$r9/revealed.json" "$results_dir/revealed.json"
```

历史 41 题用 `--exam all` 进行生产采样。复算第二候选时，输入和封存判词均取自 `candidate-two`，输出写入新的空目录。[第二候选评测说明](candidate-two/README.md)

```sh
second="$r9/candidate-two"
results_dir=$(mktemp -d /tmp/anicca-r9-second-reveal.XXXXXX)
sealed_sha=$(jq -r .judgmentsSha256 "$second/seal.json")
node scripts/evals/blind-dialectic-quality-r9.mjs reveal \
  --after "$second" --packet "$second/packet.json" --key "$second/key.json" \
  --judgments "$second/judgments.json" --judge-sha "$sealed_sha" --out "$results_dir"
cmp "$second/results.md" "$results_dir/results.md"
cmp "$second/revealed.json" "$results_dir/revealed.json"
```

复算校验两版每题原始 HTTP、跟踪、请求、设置、匿名映射及判词哈希，生成机器可读的 `revealed.json` 与 `results.md`。其中新卷参考动作与两侧盲判动作并列。程序核对动作数、决定类型与盲判，Astra 按语义逐条核对动作对应、遗漏与引文，再对照第八轮原参考核验三道历史严重题。动作名称可用同义改述，动作对应须逐项成立。[历史严重题原参考](../quality-r8/holdout-reference.json)
