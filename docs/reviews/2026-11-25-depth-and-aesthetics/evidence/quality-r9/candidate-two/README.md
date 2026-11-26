# 第九轮第二候选揭盲

第二候选 `a7c1b8f` 未达到冻结门槛。41 题中可读 36 题，改前为 39 题。四组分别为旧卷 15/17、已揭回归 7/8、原确认卷 7/8、第九轮新卷 7/8，最低要求为 16/17、8/8、7/8、8/8。41 次 HTTP 请求全部匹配真实跟踪，零重试。原有两个缺测仍在，新增缺测为 `formal-05`、`holdout-05`、`r9-new-03`。[分组复算与成本](results.md) · [逐题 HTTP、跟踪和判词](revealed.json)

三道历史严重题均未通过。旧盘题 `holdout-04` 从原先只为已检范围提供证据，退化为以单场戏恢复作为清空整季档案旧盘的条件，盲判标为严重。纸本题 `holdout-05` 无可读回答。口述史题 `holdout-06` 延续了擅许网页文字摘引的问题，并新增将家属当作可授权方的建议，材料未表明家属有代理权，盲判仍标为严重。[封存判词](judgments.json) · [逐题揭盲](revealed.json)

独立新卷的逐动作结构校验为改前 3/8、改后 4/8。这里保留程序复算和封存原判。另有 `r9-new-02` 的改后盲判为 `pass`，说清长期在线导览需另取许可。该动作编码为 `permission_gap`，参考编码为 `deny`，所以结构校验未计入通过。该编码差异不影响整版未通过的结论。[冻题动作参考](../reference.json) · [封存哈希和时间](seal.json) · [揭盲映射](key.json)

## 复算

在仓库根目录执行，输出到空目录。判词 SHA-256 取自封存记录。

```sh
q=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r9/candidate-two
out=$(mktemp -d /tmp/anicca-r9-candidate-two.XXXXXX)
sealed_sha=$(jq -r .judgmentsSha256 "$q/seal.json")
node scripts/evals/blind-dialectic-quality-r9.mjs reveal --after "$q" \
  --packet "$q/packet.json" --key "$q/key.json" \
  --judgments "$q/judgments.json" --judge-sha "$sealed_sha" --out "$out"
cmp "$q/results.md" "$out/results.md"
cmp "$q/revealed.json" "$out/revealed.json"
```
