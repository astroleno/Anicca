# 第九轮追加确认卷

四道独立确认题于 `b568b08` 冻结，全允、全缓、混合、非领域各一道。4/4 须可读，四道的所有动作均须符合对应原文边界。原 41 题复跑及其门槛仍按第九轮主卷执行。新增题的权利来源、准确原句、逐动作结论均在封存参考中。[冻结请求](requests.json) · [逐动作参考](reference.json) · [冻结 SHA-256](frozen.sha256)

## 生产采样

进入本目录执行 `shasum -a 256 -c frozen.sha256` 校验封卷。以下命令从项目根目录运行；复跑使用独立生产日志和新的空目录。

```sh
r9=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r9
runner=scripts/evals/dialectic-quality-r9.mjs

node "$runner" --exam confirmation \
  --base http://127.0.0.1:3284 --output "$r9/confirmation/before" \
  --run before --revision 34a47e4 --server-log /tmp/anicca-r9.Km3QPA/extra-base-server.log

node "$runner" --exam extended \
  --base "$candidate_base" --output "$candidate_output" \
  --run after --revision "$candidate_revision" --server-log "$candidate_log"
```

`extended` 一次采样全部 45 题，并发 4，沿用第九轮 HTTP 重试及缺测规则。也可用 `--exam all` 和 `--exam confirmation` 在同一生产修订下分别采样，用两个不同输出目录。每题只进入其中一种运行安排，按固定传输规则处理重试。[第九轮主卷设置与复跑](../README.md)

改前 `34a47e4` 可读 3/4。四道各尝试一次，全部关联真实生产跟踪。模型及供应商调用各 12 次，含一次格式修复。客户端 p50/p95 为 5,594/6,564 毫秒。输入、已缓存输入、输出分别为 34,520、19,584、2,613 token。缺测保留 `invalid_model_output`，最后一次 critic 检查记录 `synthesis_unsupported_quantity`。在本目录执行 `shasum -a 256 -c baseline.sha256` 校验全部改前档案。[改前统计](before/summary.json) · [真实跟踪](before/traces.json) · [基线档案校验](baseline.sha256)

## 45 题盲包与揭盲

单目录 45 题在下例两处传 `--extended --after "$candidate_output"`。若 41 题和 4 题分目录采样，则将这段换成 `--after "$candidate_original_output" --confirmation-after "$candidate_confirmation_output"`。盲包会复核两次运行使用同一候选修订和设置。旧版 41 题使用既有命令，不使用新增选项。

```sh
blind=scripts/evals/blind-dialectic-quality-r9.mjs
packet_dir=$(mktemp -d /tmp/anicca-r9-extra-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r9-extra-key.XXXXXX)
node "$blind" pack --extended --after "$candidate_output" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json"

# 收齐独立判词后记录 UTC 时间并封存该文件的 SHA-256。
date -u +%Y-%m-%dT%H:%M:%SZ
shasum -a 256 "$judgments"
results_dir=$(mktemp -d /tmp/anicca-r9-extra-reveal.XXXXXX)
node "$blind" reveal --extended --after "$candidate_output" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json" \
  --judgments "$judgments" --judge-sha "$sealed_sha" --out "$results_dir"
```

45 题随机混排，评审只收到匿名包和填写说明。每题保留用户后续消息的角色和文字，删去技术标识。程序按五组分别复算可读、盲判、供应商调用、修复、延迟和失败阶段。追加确认单列 4/4 可读及逐动作门槛，最终由独立评审逐条核对许可依据和动作语义。[盲判填写说明](../judge-instructions.md)
