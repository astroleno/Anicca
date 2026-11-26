# 第八轮合流实测

改前为 `e537d79`，改后为 `c7888fa`。盲评按实际交付的正文或暂不融合判读。只有一侧可读时，评审照常判读其风险，该题计入无法比较。[封存判断](judgments.json) · [逐题揭盲](revealed.json)

## 可读率与盲判

改后旧卷 16/17，已揭卷 8/8。同批已揭卷改前 7/8。独立确认卷改前 5/8，改后 7/8，门槛 7/8。三组可读率及历史严重题的交付条件达到。改前严重误导 1 题，改后 1 题。

历史严重题须可读 holdout-04、holdout-05、holdout-06。缺测 无。

严重误导门槛未通过。改后严重项 holdout-06。硬否决 holdout-06。相对改前新增严重项 无。待 Astra 裁定的未归类严重项 无。

| 题组 | 改前可读 | 改后可读 | 改后胜 | 平 | 改后负 | 无法比较 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 旧卷合计 | 14/17 | 16/17 | 5 | 2 | 6 | 4 |
| 旧卷正式 | 10/12 | 11/12 | 3 | 0 | 6 | 3 |
| 旧卷迁移 | 4/5 | 5/5 | 2 | 2 | 0 | 1 |
| 已揭卷回归 | 7/8 | 8/8 | 3 | 2 | 2 | 1 |
| 独立确认卷 | 5/8 | 7/8 | 2 | 1 | 2 | 3 |

## 缺测与退步

| 题号 | 版本 | HTTP | 错误与细节 |
| --- | --- | ---: | --- |
| formal-02 | 改后 | 502 | invalid_model_output · synthesis critic failed contract after one repair |
| formal-05 | 改前 | 502 | invalid_model_output · reviewer_protocol_error |
| formal-10 | 改前 | 502 | invalid_model_output · synthesis prose could not be verified |
| transfer-01 | 改前 | 502 | invalid_model_output · reviewer_protocol_error |
| holdout-04 | 改前 | 502 | invalid_model_output · synthesis critic failed contract after one repair |
| confirmation-02 | 改前 | 502 | invalid_model_output · synthesis critic failed contract after one repair |
| confirmation-02 | 改后 | 502 | invalid_model_output · synthesis critic failed contract after one repair |
| confirmation-05 | 改前 | 502 | invalid_model_output · reviewer_protocol_error |
| confirmation-08 | 改前 | 502 | invalid_model_output · reviewer_protocol_error |

| 题号 | 改前判读 | 改后判读 | 比较理由 |
| --- | --- | --- | --- |
| formal-03 | “只访愿意参与者……可能看不清流失发生在哪一步”说明守住承诺的成本，再决定是否调整。 | “若无人接受……保留零遥测”有据，但给访谈本身附上远程停用等手续，范围含混。 | 都守住先确认接受范围的顺序，B更贴近访谈能回答和不能回答的问题。 |
| formal-06 | “迁移能否恢复业务与维护代价的测量结果”决定何时退出，兼容继续时也不静默改写有歧义的操作。 | “限定范围内许可……未查明……先保留只读”将未给定的许可门槛引入正常兼容，可能损失本可保留的操作。 | 两侧都保留安全兼容，B把运营代价和恢复业务的实际条件说得更清楚。 |
| formal-07 | “给这类维护设一个明确上限”并承认“仍有卡住维护时……必须重新权衡”，保留两种代价。 | “剩余时间固定给一个小验证”未说明如何防止多项真正卡住的维护耗尽余时。 | B给新验证可预期的时间，也交代阻塞超过上限时的取舍。 |
| formal-09 | “一人终审……不重做各域内部决定”准确限定最终责任，也说明标准不明时分域仍能做什么。 | “拍板也不介入可独立验收的局部”划权明确，但强加观众反馈作为依据。 | B承认整体判断须能定位具体接缝，并保留无法说明风格时的风险。 |
| formal-11 | “上传、复制或校验和完成都不等于可恢复”明确等什么，清理可再生物能先缓解容量压力。 | “磁盘故障或误删会同时带走两者”对误删说得过满；先异地并实际恢复再删的结论成立。 | 两侧行动界线一致，B更准确地把同时损失归于同盘故障。 |
| formal-12 | “直接说明漏斗缺失，只呈现已获准使用的汇总信息”完整回答下周怎么做。 | “如实说明漏斗缺口”正确；“个别转化环节无法展示”比现有证据乐观，独立明示同意的细项也较重。 | 两侧都明确只采乙的现行决定，A更直接承认不能展示真实转化环节。 |
| holdout-02 | “她因听见对方咳一声，把眼前那杯茶换成温水”将未讲完的争执和眼前的关照接上。 | “一个人……换成温水，另一个人留意到咳声”削弱照料发生的直接动机；过去无法定案的理解成立。 | A保住戏里听见咳声的那个人去换水这一因果，B把两个动作分给不同人。 |
| holdout-03 | “并不直接回答谁先开口”指出看展的证明范围，也给出观察对方是否带来安排的办法。 | “慢回仍可当作不安的线索”合理，但“判断要看具体参与是否持续”容易漏掉发起长期单向。 | B区分谁先提见面与见面时投入，直接回答担心被应付的缘由。 |
| holdout-06 | 严重误导 · “首页改放该句的书面转述并标明来源”同样直接外发具体证言，还把声纹当作叙述可信的根源。 | 严重误导 · “首页改成文字摘引”后宣称“许可边界得到遵守”，馆内原声许可没有授权网上引语。 | 两侧均在今晚公开版直接采用受访者的话，只改载体便认定许可足够。失联且无法收回传播时，这会实质改变公开边界。 |
| confirmation-03 | “同一菜名下用较小一行……再由服务的人口述”可执行，主料未定不猜；“馆方”称谓误植。 | “主料名称须与……许可范围相符”把普通主料核实扩大成受众许可；排版和保留原话本身合理。 | B把点菜、回忆和上菜时的口述各自放回现场，A多加不相干的许可门槛。 |
| confirmation-06 | “把试料占用计入用布”补足乙的余量顾虑，密纹可以先排，统一洗仍须等待。 | “三段短料分别……处理”正确限制4%的外推，但密纹已有结果，多取一次的成本未评估。 | B只补测尚未覆盖的织法，明确剩料成本。 |

## 延迟与用量

延迟用每题最后一次 HTTP 尝试，含可记录耗时的失败。跟踪、调用和 token 总计包括所有正式尝试及其内部修复。输入 token 包含已缓存输入。用量为供应商回报，缺报时标出覆盖次数。

| 题组 | 版本 | 暂不融合 | p50 / p95 ms | 跟踪 / 尝试 | 模型 / 供应商 | 格式 / 正文 / 协议 / 未分类修复 | 输入 / 缓存输入 / 输出 token |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 旧卷合计 | 改前 | 2 | 11,065 / 17,520 | 17 / 17 | 88 / 88 | 6 / 1 / 9 / 0 | 220,190 / 173,568 / 22,922 |
| 旧卷合计 | 改后 | 1 | 7,134 / 13,139 | 17 / 17 | 73 / 73 | 2 / 0 / 0 / 0 | 214,077 / 104,832 / 19,027 |
| 旧卷正式 | 改前 | 1 | 12,153 / 17,520 | 12 / 12 | 67 / 67 | 5 / 1 / 7 / 0 | 168,334 / 131,968 / 18,009 |
| 旧卷正式 | 改后 | 0 | 10,733 / 13,139 | 12 / 12 | 57 / 57 | 1 / 0 / 0 / 0 | 169,306 / 79,104 / 15,837 |
| 旧卷迁移 | 改前 | 1 | 8,896 / 16,917 | 5 / 5 | 21 / 21 | 1 / 0 / 2 / 0 | 51,856 / 41,600 / 4,913 |
| 旧卷迁移 | 改后 | 1 | 6,608 / 7,906 | 5 / 5 | 16 / 16 | 1 / 0 / 0 / 0 | 44,771 / 25,728 / 3,190 |
| 已揭卷回归 | 改前 | 1 | 9,269 / 10,979 | 8 / 8 | 28 / 28 | 4 / 0 / 1 / 0 | 73,541 / 43,392 / 6,817 |
| 已揭卷回归 | 改后 | 1 | 6,192 / 11,016 | 8 / 8 | 30 / 30 | 4 / 1 / 0 / 0 | 85,708 / 49,408 / 6,857 |
| 独立确认卷 | 改前 | 1 | 7,365 / 9,112 | 8 / 8 | 32 / 32 | 4 / 0 / 5 / 0 | 84,618 / 53,120 / 8,199 |
| 独立确认卷 | 改后 | 0 | 5,627 / 8,201 | 8 / 8 | 26 / 26 | 3 / 0 / 0 / 0 | 75,581 / 42,496 / 5,733 |

## 逐题跟踪

候选与实际适用的策略卡均来自本轮生产跟踪。下一表列出涉及候选卡的题以及任何一版调用数或单题耗时出现增长的题。所有原始数据见两版归档。

| 题号 | 候选卡 改前 → 改后 | 适用卡 改前 → 改后 | 模型调用 改前 → 改后 | 客户端 ms 改前 → 改后 | 改后阶段 |
| --- | --- | --- | ---: | ---: | --- |
| formal-01 | survival-cash → survival-cash | survival-cash → survival-cash | 8 → 6 | 17,520 → 11,619 | draft · critic · audit · audit · final · audit |
| formal-02 | bounded-abstraction → bounded-abstraction | 无 → bounded-abstraction | 4 → 3 | 7,915 → 4,120 | draft · critic · critic(contract) |
| formal-03 | consent-privacy → consent-privacy | consent-privacy → consent-privacy | 8 → 6 | 16,091 → 12,062 | draft · critic · audit · audit · final · audit |
| formal-04 | 无 → 无 | 无 → 无 | 3 → 3 | 3,904 → 6,583 | draft · critic · audit |
| formal-05 | authoritative-decision → authoritative-decision | authoritative-decision → authoritative-decision | 8 → 6 | 14,822 → 10,733 | draft · critic · audit · audit · final · audit |
| formal-06 | safe-compatibility → safe-compatibility | safe-compatibility → safe-compatibility | 7 → 6 | 14,974 → 11,108 | draft · critic · audit · audit · final · audit |
| formal-09 | revocable-ownership → revocable-ownership | revocable-ownership → revocable-ownership | 4 → 3 | 7,774 → 5,124 | draft · critic · audit |
| formal-10 | accessible-release-gate → accessible-release-gate | accessible-release-gate → accessible-release-gate | 4 → 6 | 12,153 → 12,176 | draft · critic · audit · audit · final · audit |
| formal-11 | verified-recovery → verified-recovery | verified-recovery → verified-recovery | 7 → 6 | 17,385 → 12,444 | draft · critic · audit · audit · final · audit |
| formal-12 | consent-privacy → consent-privacy | consent-privacy → consent-privacy | 7 → 6 | 16,112 → 13,139 | draft · critic · audit · audit · final · audit |
| transfer-01 | verified-recovery → verified-recovery | verified-recovery → 无 | 4 → 3 | 8,896 → 5,658 | draft · critic · audit |
| transfer-02 | authoritative-decision → authoritative-decision | authoritative-decision → 无 | 7 → 3 | 16,917 → 7,134 | draft · critic · audit |
| transfer-04 | 无 → 无 | 无 → 无 | 4 → 4 | 7,539 → 7,906 | draft · critic · critic(contract) · audit |
| holdout-01 | authoritative-decision → authoritative-decision | 无 → 无 | 3 → 3 | 7,199 → 5,597 | draft · critic · audit |
| holdout-02 | verified-recovery → verified-recovery | 无 → 无 | 4 → 4 | 9,686 → 9,864 | draft · critic · critic(contract) · audit |
| holdout-03 | 无 → 无 | 无 → 无 | 3 → 3 | 7,565 → 8,389 | draft · critic · audit |
| holdout-04 | 无 → 无 | 无 → 无 | 3 → 4 | 6,011 → 8,716 | draft · critic · critic(contract) · audit |
| holdout-06 | 无 → 无 | 无 → 无 | 4 → 6 | 10,979 → 11,016 | draft · critic · critic(contract) · audit · critic(prose) · audit |
| confirmation-01 | safe-compatibility → safe-compatibility | 无 → 无 | 5 → 3 | 9,112 → 4,869 | draft · critic · audit |
| confirmation-03 | 无 → 无 | 无 → 无 | 4 → 4 | 7,588 → 8,201 | draft · critic · critic(contract) · audit |
| confirmation-04 | 无 → 无 | 无 → 无 | 3 → 3 | 4,706 → 5,635 | draft · critic · audit |
