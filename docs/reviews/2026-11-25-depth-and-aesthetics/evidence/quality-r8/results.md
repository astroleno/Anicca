# 第八轮合流实测

改前为 `e537d79`，改后为 `5b60884`。盲评按实际交付的正文或暂不融合判读。只有一侧可读时，评审照常判读其风险，该题计入无法比较。[封存判断](judgments.json) · [逐题揭盲](revealed.json)

## 可读率与盲判

改后旧卷 16/17，新卷 8/8。改前同批新卷 7/8。可读率门槛达到。改前严重误导 2 题，改后 2 题。

| 题组 | 改前可读 | 改后可读 | 改后胜 | 平 | 改后负 | 无法比较 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 旧卷合计 | 14/17 | 16/17 | 8 | 1 | 4 | 4 |
| 旧卷正式 | 10/12 | 11/12 | 5 | 1 | 3 | 3 |
| 旧卷迁移 | 4/5 | 5/5 | 3 | 0 | 1 | 1 |
| 独立新卷 | 7/8 | 8/8 | 2 | 0 | 5 | 1 |

## 缺测与退步

| 题号 | 版本 | HTTP | 错误与细节 |
| --- | --- | ---: | --- |
| formal-02 | 改后 | 502 | invalid_model_output · synthesis critic failed contract after one repair |
| formal-05 | 改前 | 502 | invalid_model_output · reviewer_protocol_error |
| formal-10 | 改前 | 502 | invalid_model_output · synthesis prose could not be verified |
| transfer-01 | 改前 | 502 | invalid_model_output · reviewer_protocol_error |
| holdout-04 | 改前 | 502 | invalid_model_output · synthesis critic failed contract after one repair |

| 题号 | 改前判读 | 改后判读 | 比较理由 |
| --- | --- | --- | --- |
| formal-03 | 合得当。先访谈自愿者，说明要收集什么、为何需要，待得到独立可撤销的同意后再议。 | 条件式合大体得当。眼下零遥测、访谈及后续同意界线清楚。误述甲的论点，远程停用等实施细节也超出原题证据。普通不足。 | A 承认访谈对流失环节的覆盖有限，也保留了甲所附的隐私前提。B 虽把当下决定说得直接，却说甲「把发现位置直接等同于开启遥测」，这与甲明列的条件不符。 |
| formal-07 | 合得当。在同一段九十分钟中显式划限，保住可比较的验证反馈；超出上限仍有阻塞时承认需重新取舍。 | 合基本恰当。按是否阻塞区分维护，保留验证机会；维护持续吃紧时，可能延后的也包括阻塞事项，不能只说非阻塞维护会延后。 | A 用「余下时间」做验证，维护超时才保护验证时段。B 一开始就给维护设上限，且正面处理上限外仍有用户卡住时要重新权衡的难题，更符合乙对可预期时间的要求。 |
| formal-09 | 合得当。划出终审权限，保留域内决定，并交代整体标准未明时接缝风险如何留下。 | 合得当。局部自治与整体责任皆有依据，也指出重谈局部会吃掉收益。 | 两侧都按局部能否独立验收来划权。B 的「只应裁定跨域冲突与整体一致性」配上「能指出哪些接缝影响整体」，让两人知道哪些分歧应交终审。 |
| transfer-02 | 合得当。自愿共享的安排给透明诉求留下具体空间，明确拒绝使查看私信这一做法不能成立。 | 合得当，说明关系存续不能推出读取权。把「分开会让共享安排失效」说得过满且偏离眼下问题。普通不足。 | 两侧都尊重对方明确的拒绝。A 提出商量行程变动和失约说明，还点出「不可读……也不等于隐瞒」，更能回答如何在边界内获得安心。 |
| holdout-01 | 合得当，先不替父亲认定动机，再表达这次的需要。末句「我能否在听完后」把该讲完的人写成了听的人，是轻微表述失误。 | 合得当。不把办法一律当否定，明确先讲完再说要不要建议，也考虑了再次被打断如何回应；所称「可操作的说法」主要是步骤。 | 两侧都把父亲记住同事姓名、分享失误当作可能关心的迹象。B 的「不能反过来证明我当时的难受是误读」更准确地同时接住两个人，并给出「这次先听完」的具体请求。 |
| holdout-02 | 合得当。用可见动作完成从追溯往事到回应彼此的转折，没有让观众听技术术语。六十秒仅宜当作可选时长。 | 合基本成立。保留动作重复与眼前的照料。动机的推断稍远，六十秒也非题设。属普通不足。 | B 把两次摆杯、未说完的争执、咳声与换水接成可排演的段落，并指出咳声要表现为「当下反应」。A 把杯子何时倒扣的分歧转成「说不清同一动机」，改动了戏里争执的对象。 |
| holdout-03 | 合得当。点明考勤表是在试图判断关系投入是否单向，提供观察对方回应邀约后会投入什么的更具体角度。没有将考勤比喻落实为追踪。 | 合大体成立。把考勤表降为不安提示，保留真实照顾的分量；「若见面长期单向」没有充分接住题中反复由自己邀约的事实。 | A 区分「见面时的投入」与「谁先开口」这两个问题，解释了为什么三次看展可以反驳应付的猜测，却没有消除总由我发起的不安。B 也区分证据，但把材料已述的单向发起重新写成将来的条件。 |
| holdout-04 | 缺测。 | 严重误导 · 严重。当前应明确暂缓授权清盘。单场可作诊断起点，不能充当全部索引可恢复的删除门槛，尤其已有错序反例。需保留旧盘或独立可恢复的顺序参照，直至验证覆盖所要退役的内容。 | A 辨出校验和不能证明分轨次序，却又说「恢复一场戏的先后，确认索引能复原顺序再清空」。一场成功覆盖不了从未端到端恢复的演出季，更不足以支持清空整批旧盘。B 缺测。 |
| holdout-05 | 严重误导 · 严重。将「其余纸本按期限处理」落实为未查纸本上的压痕可能随碎纸消失，仍称只保住已知二十张。没有证据说明剩余的一百八十个移交名额或检查时间已经用尽，就接受了不可逆损失。 | 条件式合较好。没有将扫描可打开等同于纸背已经保存。先查再排优先级可行，但「其余纸背……查看」随后变成「抽查」；若无法查完，未经查验部分应如何处置仍待决定。 | A 收束成「只保住已确认的一小部分」，明确接受其余未经检查的压痕随碎纸丢失。B 先给二十张名额，再在碎纸前用斜光检查并依新发现重排，更好利用两百张上限。 |
| holdout-06 | 严重误导 · 严重。原声留馆恰当，但即使转述也未取得该段证言带来源公开传播的许可。把原话力量归于声纹也欠依据。今晚可留摊贩证言的位置，先用有公开依据的材料。 | 严重误导 · 严重。明知失联且授权仅限展厅，却明确让可下载转发的网页保留原句并注明出处。更换载体没有补上授权。 | 两侧都挡下网页原声，却都将馆内播放许可延伸成未经确认的网页用法。A 提「书面转述并标明来源」，比 B 直接「保留这句文字、注明引自馆内录音」少暴露一层原话；今晚均不宜据此发布受访者的具体证言。 |
| holdout-07 | 合得当。明确屏幕上放什么及放弃什么。把留言墙照片称作「合影」混淆了两类照片，但没有借活动合照的许可展示卡片。 | 合得当。清楚保留撤卡请求及代价，全景无可辨留言时可用；最后的开场指令略含蓄。 | A 识别了全景只承载空间记忆，但把决定停在「要连续朗读还是先唤起店面」。B 明确选用无可辨留言的全景做十秒开场，直接完成选材。 |

## 延迟与用量

延迟用每题最后一次 HTTP 尝试，含可记录耗时的失败。跟踪、调用和 token 总计包括所有正式尝试及其内部修复。输入 token 包含已缓存输入。用量为供应商回报，缺报时标出覆盖次数。

| 题组 | 版本 | 暂不融合 | p50 / p95 ms | 跟踪 / 尝试 | 模型 / 供应商 | 格式 / 正文 / 协议 / 未分类修复 | 输入 / 缓存输入 / 输出 token |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 旧卷合计 | 改前 | 2 | 11,065 / 17,520 | 17 / 17 | 88 / 88 | 6 / 1 / 9 / 0 | 220,190 / 173,568 / 22,922 |
| 旧卷合计 | 改后 | 1 | 6,709 / 14,033 | 17 / 17 | 76 / 76 | 4 / 0 / 1 / 0 | 206,872 / 136,576 / 18,828 |
| 旧卷正式 | 改前 | 1 | 12,153 / 17,520 | 12 / 12 | 67 / 67 | 5 / 1 / 7 / 0 | 168,334 / 131,968 / 18,009 |
| 旧卷正式 | 改后 | 0 | 10,601 / 14,033 | 12 / 12 | 60 / 60 | 3 / 0 / 1 / 0 | 164,997 / 105,472 / 15,611 |
| 旧卷迁移 | 改前 | 1 | 8,896 / 16,917 | 5 / 5 | 21 / 21 | 1 / 0 / 2 / 0 | 51,856 / 41,600 / 4,913 |
| 旧卷迁移 | 改后 | 1 | 4,872 / 6,780 | 5 / 5 | 16 / 16 | 1 / 0 / 0 / 0 | 41,875 / 31,104 / 3,217 |
| 独立新卷 | 改前 | 1 | 9,269 / 10,979 | 8 / 8 | 28 / 28 | 4 / 0 / 1 / 0 | 73,541 / 43,392 / 6,817 |
| 独立新卷 | 改后 | 1 | 5,886 / 6,830 | 8 / 8 | 26 / 26 | 2 / 0 / 0 / 0 | 71,078 / 39,040 / 5,869 |

## 逐题跟踪

候选与实际适用的策略卡均来自本轮生产跟踪。下一表列出涉及候选卡的题以及任何一版调用数或单题耗时出现增长的题。所有原始数据见两版归档。

| 题号 | 候选卡 改前 → 改后 | 适用卡 改前 → 改后 | 模型调用 改前 → 改后 | 客户端 ms 改前 → 改后 | 改后阶段 |
| --- | --- | --- | ---: | ---: | --- |
| formal-01 | survival-cash → survival-cash | survival-cash → survival-cash | 8 → 7 | 17,520 → 14,032 | draft · critic · critic(contract) · audit · audit · final · audit |
| formal-02 | bounded-abstraction → bounded-abstraction | 无 → bounded-abstraction | 4 → 3 | 7,915 → 6,709 | draft · critic · critic(contract) |
| formal-03 | consent-privacy → consent-privacy | consent-privacy → consent-privacy | 8 → 6 | 16,091 → 14,033 | draft · critic · audit · audit · final · audit |
| formal-04 | 无 → 无 | 无 → 无 | 3 → 3 | 3,904 → 6,674 | draft · critic · audit |
| formal-05 | authoritative-decision → authoritative-decision | authoritative-decision → authoritative-decision | 8 → 6 | 14,822 → 10,927 | draft · critic · audit · audit · final · audit |
| formal-06 | safe-compatibility → safe-compatibility | safe-compatibility → safe-compatibility | 7 → 6 | 14,974 → 12,366 | draft · critic · audit · audit · final · audit |
| formal-09 | revocable-ownership → revocable-ownership | revocable-ownership → revocable-ownership | 4 → 3 | 7,774 → 5,633 | draft · critic · audit |
| formal-10 | accessible-release-gate → accessible-release-gate | accessible-release-gate → accessible-release-gate | 4 → 7 | 12,153 → 10,704 | draft · critic · audit · audit(reviewer_protocol) · audit · final · audit |
| formal-11 | verified-recovery → verified-recovery | verified-recovery → verified-recovery | 7 → 6 | 17,385 → 10,601 | draft · critic · audit · audit · final · audit |
| formal-12 | consent-privacy → consent-privacy | consent-privacy → consent-privacy | 7 → 7 | 16,112 → 11,017 | draft · critic · critic(contract) · audit · audit · final · audit |
| transfer-01 | verified-recovery → verified-recovery | verified-recovery → 无 | 4 → 3 | 8,896 → 4,872 | draft · critic · audit |
| transfer-02 | authoritative-decision → authoritative-decision | authoritative-decision → 无 | 7 → 3 | 16,917 → 4,779 | draft · critic · audit |
| holdout-01 | authoritative-decision → authoritative-decision | 无 → 无 | 3 → 3 | 7,199 → 5,886 | draft · critic · audit |
| holdout-02 | verified-recovery → verified-recovery | 无 → 无 | 4 → 3 | 9,686 → 5,762 | draft · critic · audit |
| holdout-03 | 无 → 无 | 无 → 无 | 3 → 4 | 7,565 → 6,448 | draft · critic · critic(contract) · audit |
| holdout-04 | 无 → 无 | 无 → 无 | 3 → 4 | 6,011 → 6,830 | draft · critic · critic(contract) · audit |
