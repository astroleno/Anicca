# 第七轮正文评测技术附表

修订为改前 `ec007d3`、改后 `801fe83`。逐题理由和原始 A/B 判读见[封存判断](judgments.json)，缺测与分类明细见[揭盲结果](revealed.json)。

## 匿名比较揭盲

胜、平、负以改后为参照。无法比较计入原分母。

| 题组 | 路由 | 胜 | 平 | 负 | 无法比较 |
| --- | --- | ---: | ---: | ---: | ---: |
| 正式 12 题 | 正反 | 8 | 0 | 4 | 0 |
| 正式 12 题 | 合 | 4 | 2 | 3 | 3 |
| 迁移 5 题 | 正反 | 0 | 0 | 2 | 3 |
| 迁移 5 题 | 合 | 3 | 1 | 1 | 0 |

### 缺测

| 题号 | 路由 | 版本 | 状态 | 原因 |
| --- | --- | --- | ---: | --- |
| formal-01 | 合 | 改后 | 502 | invalid_model_output · synthesis prose could not be verified |
| formal-04 | 合 | 改前 | 502 | invalid_model_output · synthesis critic failed contract after one repair |
| formal-11 | 合 | 改后 | 502 | invalid_model_output · final synthesis prose could not be verified |
| transfer-02 | 正反 | 改后 | 502 | invalid_model_output · branch prose could not be verified |
| transfer-03 | 正反 | 改前 | 502 | invalid_model_output · branch output failed contract after one repair |
| transfer-04 | 正反 | 改后 | 502 | invalid_model_output · branch prose could not be verified |

## 策略卡语义门控

改前检索复核记录在[复跑说明](README.md)。改后候选与适用卡取自当次真实跟踪，final 阶段用于识别高风险审计后的最终重写。audit 调用还包括正文审阅。

| 题号 | 语境 | 改后候选 | 改后适用 | final 阶段 改前 → 改后 | 客户端耗时 ms 改前 → 改后 |
| --- | --- | --- | --- | --- | ---: |
| formal-05 | 工程 | authoritative-decision | authoritative-decision | 有 → 有 | 9,098 → 12,040 |
| formal-11 | 工程 | verified-recovery | verified-recovery | 有 → 有 | 7,990 → 14,693 |
| transfer-01 | 比喻 | verified-recovery | 无 | 有 → 无 | 9,336 → 5,793 |
| transfer-02 | 比喻 | authoritative-decision | 无 | 有 → 无 | 10,945 → 6,080 |

## 可读率、时延与用量

合路由的可读结果包含有理由和追问的暂不融合。耗时是逐题最后一次 HTTP 尝试，含失败并采用最近秩分位数。调用数与 token 累加所有有跟踪的尝试，含失败与修复。输入 token 含已缓存部分。用量按供应商回报统计。

| 版本 | 路由 | 可读 | 暂不融合 | p50 / p95 ms | 跟踪 / 尝试 | 模型 / 供应商调用 | 修复调用 | 输入 / 缓存输入 / 输出 token |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 改前 | 正反 | 16/17（94.1%） | 0 | 4,715 / 7,447 | 17 / 17 | 37 / 37 | 4 | 58,764 / 36,864 / 12,420 |
| 改前 | 合 | 16/17（94.1%） | 1 | 7,990 / 11,089 | 17 / 17 | 81 / 81 | 5 | 174,016 / 91,264 / 16,529 |
| 改后 | 正反 | 15/17（88.2%） | 0 | 5,396 / 10,769 | 17 / 17 | 51 / 51 | 10 | 87,703 / 64,640 / 18,302 |
| 改后 | 合 | 15/17（88.2%） | 2 | 6,399 / 14,693 | 17 / 17 | 79 / 79 | 9 | 193,052 / 141,056 / 19,631 |

| 路由 | 改后减改前模型调用 | 改后减改前供应商调用 | 输入 / 输出 token 差 | p50 / p95 ms 差 |
| --- | ---: | ---: | ---: | ---: |
| 正反 | +14 | +14 | +28,939 / +5,882 | +681 / +3,322 |
| 合 | -2 | -2 | +19,036 / +3,102 | -1,591 / +3,604 |
