# 第七轮正文评测证据

## 冻结题卷

[正式题源](formal-source.json)逐字复制工作区的 `scripts/evals/dialectic-semantic-eval-cases.json`。正式组沿用其十二题的编号、顺序、分类和问题。迁移组的五道问题依序覆盖记忆数据库比喻、关系缓存比喻、家庭角色和个人前提、共同创作的同正组合、缺少共同问题的联结。甲乙正文、摘要、标签和角色由评测执行者编写并提前固定。正反生成与合流是两个独立请求，合流每次使用同一对甲乙。

[完整请求](requests.json)使用客户端的 `meaningVersion: 1`。正反从空工作区提交题面，合流按客户端用两个来源正文以双换行拼接 `rootInput`，并附题面的用户上下文和两条来源消息。共同创作题另发用户给出的联结。每次网络尝试仅另加请求标识 `requestId` 和对应的 `x-anicca-eval-id` 请求头。[哈希](frozen.sha256)覆盖正式题源和请求文件。

基线检索复核得到三个关键对照。正式 05 和迁移 02 均召回高风险缓存卡 `authoritative-decision`。正式 11 和迁移 01 均召回高风险恢复卡 `verified-recovery`。迁移 03 至 05 无候选。比喻与真实工程题先都能进入候选，语义判断才有可比较的机会。

## 复跑

用 Node 22，在待测修订的独立工作区安装依赖并执行 `npm run build`。用该修订的生产环境配置 DeepSeek 凭证及默认模型。生产服务器和 runner 可以放在不同工作区，服务器的当前目录应是运行版本的仓库根目录。若旧修订尚未包含 wrapper，可用新修订里 wrapper 的绝对路径，并让该文件使用自身工作区同一锁定版本的 Next 依赖。

```sh
node scripts/evals/dialectic-quality-r7-server.mjs 3276 > /tmp/quality-r7-server.log 2>&1
```

服务器将关联请求标识附在既有结构化跟踪日志上，真实 Next HTTP 路由完成全部生成。另一个终端运行以下命令。修改修订、运行标签、端口、日志和输出目录即可复测第二版，使用同一份 [provider.json](provider.json)。

```sh
evidence=docs/reviews/2026-11-25-depth-and-aesthetics/evidence/quality-r7
node scripts/evals/dialectic-quality-r7.mjs \
  --base http://127.0.0.1:3276 --output "$evidence/baseline" --run baseline \
  --revision BASELINE_GIT_SHA --settings "$evidence/provider.json" \
  --concurrency 3 --server-log /tmp/quality-r7-server.log
```

两条路由从服务器默认模型配置选用 DeepSeek 的 `deepseek-v4-flash`，校准时供应商返回 `deepseek-flash`。runner 用跟踪日志核对实际请求别名。使用 Chat Completions，DeepSeek 思考模式关闭。主要生成阶段使用供应商默认温度，意义审阅显式设为 0。基线每次正反生成上限为 2000 token，默认空间的合流草稿、批评及最后生成各为 1400，高风险审计为 1800，意义审阅为 2200。机制调整时，以真实版本的阶段、上限及路由行为为准。

每个尝试最长 180 秒，遇网络异常、运行器中断、HTTP 408、429、500、502、503 或 504 后最多再尝试一次，间隔 2 秒。`invalid_model_output` 和成功状态下的协议不匹配保留为失败。以同一命令、同一输出目录重启可续跑，之前的请求、响应正文和中断记录保留。退出码非零时仍检查 `summary.json`、`traces.json` 和 `responses/`，其中保留失败、逐次耗时、返回结局、首轮检查、修复次数、模型调用与已有的 token 用量。trace 也区分可关联和缺失的请求。

## 匿名判读

在系统临时目录各建一个权限为 0700 的独立目录，分别放题卷和映射。

```sh
packet_dir=$(mktemp -d /tmp/anicca-r7-packet.XXXXXX)
key_dir=$(mktemp -d /tmp/anicca-r7-key.XXXXXX)
node scripts/evals/blind-dialectic-quality-r7.mjs \
  --first "$evidence/baseline" --second "$evidence/candidate" \
  --packet "$packet_dir/packet.json" --key "$key_dir/key.json"
```

匿名题卷含题面、固定甲乙、题面补充联结与两侧最终阅读正文或暂不融合的理由及问题。错误回包仅显示缺测。每题独立以等概率交换左右，两条路由在同题共享左右。映射另存题卷哈希和版本对应。先把匿名题卷交给评审者，待按题封存判读后再提供映射。
