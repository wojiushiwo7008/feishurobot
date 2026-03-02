Task 4 — 需求拆解 — 把一个功能需求拆成 5 个 Ticket

Ticket 1：接入飞书群消息事件并做基础校验与解析
### 描述
搭建飞书事件订阅回调（Webhook Ingress）服务，负责接收并处理飞书推送的群聊消息事件：
- 支持 `url_verification` 校验流程（返回 challenge）
- 对事件请求做基础安全校验（verification token；若开启加密/签名则按配置扩展）
- 仅处理目标事件类型 `im.message.receive_v1`，对其它事件快速返回 200 并记录
- 将飞书原始事件转换为内部统一格式 `NormalizedMessage`，为后续“维修识别/建单/派单”提供稳定输入
- 输出结构化日志（可追踪 message_id / chat_id / sender_id），并将消息投递到后续处理通道（函数调用或队列）

### 输入
- HTTP POST `/feishu/events`
  - `type=url_verification`：包含 `challenge`、`token`
  - `type=event_callback`：包含 `header.event_type`、`event.message.message_id/chat_id/message_type/content`、`event.sender.sender_id`、`event.message.create_time` 等字段

### 输出
- 对 `url_verification`：HTTP 200 + JSON `{ "challenge": "<原值>" }`
- 对事件回调：HTTP 200 + JSON `{ "ok": true }`（或同等快速响应）
- 内部标准化对象 `NormalizedMessage`（写日志 + 交给后续模块）
  - `message_id`: string（用于幂等/去重的唯一键）
  - `chat_id`: string（群聊标识）
  - `sender_id`: string（发送者标识，优先 open_id/union_id）
  - `message_type`: 'text' | 'post' | 'image' | 'file' | ...
  - `text`: string（仅当 message_type=text 时有效，否则为空）
  - `timestamp`: number（毫秒/秒统一，写清楚约定）
  - `raw_event`: object（可选：保留原始 payload 便于排查）

**验收标准**  

1.URL 校验成功：飞书 url_verification 请求能返回正确 challenge，开放平台显示“校验通过/订阅成功”

2.事件类型过滤正确：仅处理 im.message.receive_v1，其他事件类型进入日志但不触发后续业务

3.文本消息解析正确：收到群文本消息时，能正确解析并输出 message_id、chat_id、sender_id、text、create_time（日志可见）

4.消息类型兼容：对 image/file/post 等非 text 消息，服务端返回 200 且记录“unsupported message_type=xxx”，不抛异常、不阻塞后续消息

5.Token 校验生效：verification token 不匹配时，服务端不做业务处理；日志中包含事件摘要（event_type、chat_id、message_id）用于排查

6.响应时延达标：在本地/测试环境连续发送 20 条消息，服务端回调接口平均响应时间 < 500ms，且无超时（避免飞书重试）

7.稳定返回 200：即便内部解析失败/下游异常（例如 JSON parse error），接口依旧返回 200（或按你们策略），并输出可定位的错误日志（避免飞书
持续重试打爆）

8.日志可观测性：每条入站事件必须至少输出一条结构化日志，包含：

request_id（或 trace_id）

event_type

message_id

chat_id

sender_id

handled=true/false（是否进入业务链路）

9.幂等字段就绪：能从回调中稳定获取 message_id（或等价唯一键），为后续“去重/幂等建单”提供基础

10.回调安全性：请求体大小超限会被拒绝或截断（例如 >2MB 返回 413 或记录并忽略），服务不崩溃

11.配置错误可诊断：当 APP_ID/APP_SECRET 未配置或错误时，启动时能给出清晰提示；运行时遇到 token 获取失败能输出明确错误（http code + Feishu code/msg）

12.开发自测脚本可跑：提供最小自测方式（curl/本地 mock JSON），能模拟 url_verification 和 im.message.receive_v1 事件并通过验收

保证飞书回调可用、稳定、可观测、可追踪，否则后续工单链路都不可靠。
**依赖关系**  
无

**预估时间**  
6 小时

---

Ticket 2：维修请求识别与结构化（含紧急程度与类型分类）

### 描述
基于 Ticket 1 输出的 `NormalizedMessage`，实现维修意图识别与结构化分类模块。

该模块负责判断一条群消息是否为“维修请求”，并输出结构化数据，供工单创建模块使用。

识别策略采用：
1.AI 分类模型（优先）
2.规则关键词匹配（兜底）
2.信心阈值控制（避免误建单）

同时需保证：
- AI 异常不影响整体流程
- 识别结果可追踪（日志可观测）
- 输出字段完整且标准化

### 输入

`NormalizedMessage` 对象：

- message_id: string
- chat_id: string
- sender_id: string
- message_type: string
- text: string
- timestamp: number

仅当 message_type = text 时进入识别逻辑。

### 输出

`RepairIntent` 对象：

- message_id: string
- is_repair: boolean
- issue_desc: string（标准化后的问题描述）
- category: enum（plumbing / electrical / door_window / cleaning / other）
- urgency: enum（low / medium / high）
- confidence: number（0~1 之间）
- detection_method: enum（ai / rule / fallback）
- raw_text: string

### 识别规则设计说明

1.AI 分类输出：
   - 是否维修
   - 分类
   - 紧急程度
   - 置信度

2.当：
   - AI 调用失败
   - 超时 > 2s
   - 或返回格式异常

   自动 fallback 到规则匹配（关键词字典）

3.若 confidence < 0.6：
   - is_repair = false
   - 标记为“低置信度未建单”

### 验收标准

1.输入“厨房水龙头漏水”“洗手间堵塞”，
   - is_repair=true
   - category=plumbing
   - urgency>=medium
   - confidence >= 0.6

2.输入“本月租金已支付”
   - is_repair=false
   - 不进入建单流程

3.输入“门好像关不上”
   - is_repair=true
   - category=door_window
   - 输出 confidence 数值（可低于 0.8 但 >=0.6）

4.AI 服务不可用时：
   - 系统自动使用规则识别
   - detection_method=rule
   - 日志中记录 fallback

5.对空文本或异常文本：
   - is_repair=false
   - 系统不崩溃
   - 输出结构化日志

6.同一 message_id 重复识别：
   - 输出结果一致
   - 不产生副作用

7.单条识别平均耗时 < 1 秒（本地测试 50 条）

### 风险控制

- 误判为维修：通过 confidence 阈值避免误建单
- 漏判：可通过后续“人工确认机制”增强（非本 Ticket 范围）
- AI 成本控制：可设置长度限制（如 text < 300 字）

### 依赖关系

依赖 Ticket 1（需要标准化消息输入）

### 预估时间

10 小时

---

Ticket 3：工单数据模型与创建接口（DB 落地 + 幂等 + 状态机初始化）

### 描述
设计并实现维修工单的持久化数据模型（建议：关系型 DB + ORM；若 MVP 直接用 Bitable 作为主数据源，也需保持字段一致），并提供“创建工单”能力。

当 Ticket 2 输出 `RepairIntent.is_repair=true` 且满足置信度阈值时：
1）读取/关联房东信息（根据 sender_id/chat_id 在配置表中映射 landlord_id，或先用最小字段落地）
2）在数据库中创建一条工单记录（初始化状态、记录来源 message_id、chat_id）
3）通过幂等机制确保同一 message_id 只会创建一次工单
4）返回 `WorkOrder`（order_id + 核心字段），供派单模块使用

同时约定工单状态机初始值：
- `pending_assignment`（待派单）→ 后续由派单 Ticket 更新为 `in_progress`（处理中）→ `done`（已完成）

### 输入
- `RepairIntent`
  - message_id: string
  - is_repair: boolean
  - issue_desc: string
  - category: enum
  - urgency: enum
  - confidence: number
  - raw_text: string
- `NormalizedMessage`（来自 Ticket 1，用于补充上下文）
  - chat_id: string
  - sender_id: string
  - timestamp: number
- （可选）Landlord 映射数据
  - landlord_id / landlord_name / contact / property_id 等（MVP 可只落 landlord_id=sender_id）

### 输出
- `WorkOrder`（创建成功）
  - order_id: string/number
  - status: `pending_assignment`
  - landlord_id: string
  - chat_id: string
  - source_message_id: string
  - issue_desc: string
  - category: enum
  - urgency: enum
  - created_at: timestamp
- 若幂等命中（同 message_id 已建单）
  - 返回已存在工单的 order_id（而不是新建）
- 若不满足建单条件（is_repair=false 或 confidence < 阈值）
  - 返回 “skipped” 且不产生副作用

### 数据模型建议（最小字段）
`work_orders`
- id (PK)
- landlord_id (string)
- chat_id (string)
- source_message_id (string, UNIQUE)  ← 幂等关键
- issue_desc (text)
- category (string)
- urgency (string)
- status (string)
- created_at (timestamp)
- updated_at (timestamp)

（可选）`landlords`
- landlord_id (PK)
- name
- phone
- default_chat_id
- property_id
  
### 幂等与并发安全策略
- DB 层：`source_message_id` 唯一约束（最可靠）
- Redis 层（可选增强）：`SETNX dedup:feishu_msg:{message_id}` TTL 7 天，加速挡掉重复回调
- 工单创建必须保证“创建/返回已存在”的行为是可重复执行且结果一致的（Idempotent）

### 验收标准
1.正常建单成功
   - 输入一个 `is_repair=true & confidence>=阈值` 的 RepairIntent
   - 数据库新增 1 条工单记录
   - 字段齐全：landlord_id、issue_desc、category、urgency、created_at、status、source_message_id、chat_id

2.幂等生效（飞书重推/重复回调）
   - 使用同一个 `message_id` 连续触发 3 次创建
   - 数据库最终仍只有 1 条记录（source_message_id 唯一）
   - 接口返回的 order_id 恒定一致（返回已存在工单）

3.状态初始化正确
   - 新工单创建后 status 必须为 `pending_assignment`（待派单）
   - 可通过 order_id 查询到该工单并验证 status

4.输入不满足建单条件不会落库
   - 对 `is_repair=false` 或 `confidence < 阈值` 的输入
   - 数据库不会新增工单记录
   - 系统日志记录 “skipped_reason=not_repair/low_confidence”

5.失败可观测且不误触发下游
   - 模拟 DB 写入失败（断开 DB / 触发异常）
   - 服务端记录 error 日志（包含 message_id、chat_id）
   - 不会产生“派单触发事件”（例如不会进入待派单队列）

6.字段合法性校验
   - category/urgency/status 仅允许在 enum 范围内
   - 非法输入会被拒绝或归类为 `other`，但系统不崩溃

### 依赖关系
依赖 Ticket 2（需要结构化识别结果）  
同时使用 Ticket 1 的 chat_id / sender_id / timestamp 用作上下文补齐

### 预估时间
9 小时

---

Ticket 4：自动派单系统（师傅匹配 + 通知发送 + 状态流转 + 幂等）

### 描述
实现“自动派单”业务能力：当存在 `status=pending_assignment（待派单）` 的工单时，系统根据工单类别与紧急程度，从“师傅资源池”中选择合适师傅并发送派单通知；派单成功后将工单状态更新为 `in_progress（处理中）`，并记录指派关系。

该 Ticket 包含：
1）师傅资源池模型：师傅ID、技能标签（类别）、可接单状态、联系方式（飞书 open_id / chat_id）、当前负载（可选）  
2）匹配策略（可配置，默认采用 “类别匹配优先 + 可用性 + 轮询”）  
3）派单通知：向师傅飞书发送消息（文本/卡片均可），包含 order_id、问题描述、紧急程度、房东/房源关键信息、回传指令（例如“完工 #order_id”）  
4）状态机与并发安全：确保同一工单只能被成功派单一次（幂等），并在并发 worker 场景下不重复派单  
5）失败兜底：无师傅匹配、通知发送失败、更新状态失败时的回退与告警

### 输入
- `WorkOrder`（来自 Ticket 3）
  - order_id
  - status = pending_assignment
  - category
  - urgency
  - issue_desc
  - landlord_id
  - chat_id
  - created_at

### 输出
- `AssignmentResult`
  - order_id
  - assignee_id（匹配到的师傅ID）
  - dispatch_message_id（飞书发消息返回的 message_id，若成功）
  - status_after = in_progress
  - dispatched_at
- 同时写入持久层：
  - 工单状态更新（pending_assignment → in_progress）
  - 指派记录（order_id, assignee_id, assigned_at, assigned_by=system）

### 数据模型建议
`technicians`
- technician_id (PK)
- name
- categories (array / json) 例：["plumbing","electrical"]
- is_available (bool)
- feishu_open_id (string) / receive_id
- current_load (int, optional)
- updated_at

`work_order_assignments`
- id (PK)
- order_id (UNIQUE) ← 保证一单只对应一个生效指派（自动派单场景）
- assignee_id
- assigned_at
- assigned_by ("system")
- dispatch_message_id
- status ("active"/"reassigned", optional)

### 匹配策略（默认方案）
1.按 category 过滤：只选具备该类别技能的师傅
2.按 is_available 过滤：只选可接单师傅
3.选择策略：
   - 默认：轮询（round-robin）或按 current_load 最小
   - 紧急（high）：优先选择“响应快/负载低”的师傅（可用字段扩展）

### 幂等与并发安全策略
- 核心点：派单属于“有副作用操作”（发通知 + 改状态），必须保证只发生一次
- 推荐实现（任意一种即可）：
  1）DB 条件更新（CAS）
     - `UPDATE work_orders SET status='in_progress', assignee_id=? WHERE order_id=? AND status='pending_assignment'`
     - 受影响行数=1 才算派单成功，=0 说明已被处理（幂等）
  2）Redis 分布式锁（可选增强）
     - `SET lock:order:{order_id} NX EX 30`，拿到锁才执行派单

- 防重复通知：
  - 发送通知前/后写入 `notify:sent:{order_id}:dispatch` 标记（Redis 或 DB），避免重试重复发

### 失败兜底规则
- 无匹配师傅：
  - 工单保持 pending_assignment
  - 写入 `dispatch_status=no_tech`（或创建运营待办）
  - 通知管理员/运营群（含 order_id、category、urgency）
- 通知发送失败：
  - 工单保持 pending_assignment（或标记 dispatch_failed）
  - 记录失败原因（http/code/msg）
  - 可重试（例如最多 3 次，指数退避）

### 验收标准
1.正确匹配类别
   - 创建 category=plumbing（水电）工单
   - 系统只会在具备 plumbing 技能的师傅中选择
   - 师傅收到派单消息，消息内容包含 `order_id`、`issue_desc`、`urgency`

2.状态流转正确
   - 派单成功后工单状态从 `pending_assignment` 更新为 `in_progress`
   - 工单记录中 assignee_id 不为空，assigned_at 有值

3.指派关系可追踪
   - `work_order_assignments` 中存在该 order_id 的指派记录
   - 指派记录包含 assignee_id、assigned_at、dispatch_message_id

4.无可用师傅时兜底生效
   - 当所有 plumbing 师傅 is_available=false
   - 工单仍保持 `pending_assignment`
   - 管理员/运营收到异常提醒（或系统生成待处理队列记录），且包含 order_id

5.幂等保护（防重复派单）
   - 对同一 order_id 并发触发派单 2 次（模拟两个 worker）
   - 最终只有 1 个师傅被指派成功（assignment 表 order_id 唯一）
   - 群里/师傅端只收到 1 条派单通知（无重复刷屏）

6.通知失败回退
   - 模拟飞书发送接口返回失败
   - 工单不会被错误更新为 `in_progress`
   - 系统记录错误日志（包含 order_id、assignee_id、错误码）

7.性能可接受
   - 在 50 条待派单工单的测试中，派单处理平均耗时 < 2 秒/单（本地或测试环境）

8.数据一致性
   - 派单成功时，工单表与 assignment 表的信息一致（同一个 assignee_id）
   - 不存在“工单已处理中但无 assignment 记录”的情况（或有明确补偿机制）

### 依赖关系
依赖 Ticket 3（必须有工单数据、状态字段、message_id 幂等基础）

### 预估时间
11 小时

---

Ticket 5：完工闭环 + 满意度收集 + Bitable 同步与统计（含幂等/重试）

### 描述
实现维修工单的完整闭环流程，并保证数据在飞书 Bitable 可视化可统计。

范围包含：
1）师傅完工回传
   - 支持至少一种完工方式：
   - 文本指令：`完工 #<order_id>`
   - 或消息卡片按钮回调（推荐，减少误操作）
2）工单状态流转
   - 当工单处于 `in_progress` 且由被指派师傅触发完工时，将状态更新为 `done`
   - 记录 `completed_at`、`completed_by`
3）房东通知
   - 完工后自动通知房东（回到原群或房东私聊），包含工单概要（问题、师傅、时间、工单ID）
4）满意度收集
   - 发送评价入口（1-5 分 + 可选文字）
   - 评价落库，并关联 order_id
   - 防重复提交（同一工单默认只接受一次评价，除非允许追加）
5）Bitable 同步
   - 将工单的创建/更新（状态、指派、完工、评价）同步到飞书 Bitable
   - 支持按状态/类别/紧急程度/时间筛选与统计
6）可靠性增强
   - 幂等：重复完工/重复评价/飞书重推不会造成重复写入或重复通知
   - 重试：Bitable/消息发送失败可重试，避免数据长期不同步
   - （可选）SLA 钩子：完工后可取消相关 SLA 计时任务

### 输入
- 完工事件：
  - 方式 A：师傅发送文本（包含 order_id）
  - 方式 B：消息卡片按钮回调（包含 order_id、technician_id）
- 评价提交：
  - 方式 A：房东回复评分文本（如 `评分 5 很满意`）
  - 方式 B：表单/卡片交互（rating + comment）
- 工单数据源：
  - `WorkOrder`（order_id、status、assignee_id、chat_id、landlord_id…）

### 输出
- 工单状态更新：
  - `status=done`
  - `completed_at`
  - `completed_by`
- 通知消息：
  - 房东收到完工通知 message_id（可追踪）
  - 房东收到评价请求入口 message_id
- 评价数据落库：
  - `work_order_feedback`（order_id, rating, comment, created_at, submitted_by）
- Bitable 表更新：
  - 记录新增/更新（Upsert）
  - 字段包含：order_id、status、category、urgency、created_at、assignee、completed_at、rating

### 数据模型建议
`work_orders` 追加字段：
- completed_at (timestamp, nullable)
- completed_by (string, nullable)
- rating (int, nullable)  (也可单独 feedback 表)
- last_synced_at (timestamp, nullable) (可选)

`work_order_feedback`
- id (PK)
- order_id (UNIQUE)  ← 默认一单一次评价（可调）
- rating (1~5)
- comment (text, nullable)
- submitted_by (landlord_id)
- created_at (timestamp)

`sync_outbox`（可选，用于可靠同步/重试）
- id (PK)
- target ("bitable" / "feishu_msg")
- payload (json)
- status ("pending"/"sent"/"failed")
- retry_count
- next_retry_at

### 幂等与并发安全策略
- 完工幂等：仅允许 `in_progress → done`
  - DB 条件更新（CAS）：
    - `UPDATE work_orders SET status='done', completed_at=?, completed_by=? WHERE order_id=? AND status='in_progress' AND assignee_id=?`
- 重复完工事件：
  - 若状态已 done，则不重复通知（通过 `notify:sent:{order_id}:done` 标记或 outbox 去重）
- 评价幂等：
  - feedback 表对 order_id UNIQUE
  - 重复提交返回“已评价”提示，不重复写入

### Bitable 同步策略（建议）
- Upsert：以 `order_id` 作为主键（或额外维护 `bitable_record_id` 映射表）
- 限速与重试：失败进入 outbox，指数退避重试（最多 5 次）
- 最终一致：允许短时间延迟，但保证最终同步成功

### 验收标准
1.完工状态更新正确
   - 被指派师傅触发完工后，工单状态从 `in_progress` 更新为 `done`
   - 工单记录包含 completed_at、completed_by

2.权限校验正确
   - 非被指派师傅尝试完工（assignee_id 不匹配）
   - 状态不得变更，系统提示“无权限/不是该单师傅”，并记录安全日志

3.重复完工幂等
   - 同一师傅对同一 order_id 连续触发完工 3 次
   - 工单仍只有一次状态变更
   - 房东只收到一次完工通知（无重复刷屏）

4.房东完工通知内容完整
   - 完工后房东在飞书收到通知
   - 通知至少包含：order_id、问题描述、师傅信息、完工时间

5.评价收集可用
   - 房东提交评分 1-5 任一值
   - feedback 成功落库并关联 order_id
   - 工单可查询到 rating（或可通过 feedback 表查到）

6.评价范围校验
   - 输入评分 0 或 6（非法）
   - 系统拒绝并提示合法范围 1-5，不写入数据库

7.评价幂等
   - 房东对同一工单重复提交评分
   - 默认只保留首次（或按策略覆盖），但必须行为一致且可解释
   - 不产生多条 feedback 记录（order_id 唯一）

8.Bitable 新增同步
   - 新工单创建后（来自 Ticket 3）能在 Bitable 出现对应记录
   - Bitable 记录包含 order_id、status、category、urgency、created_at 字段

9.Bitable 更新同步
   - 工单从 pending_assignment→in_progress→done 过程中
   - Bitable 状态字段随之更新，且能在 1 分钟内可见（可设定 SLA）

10.Bitable 可筛选统计
   - 在 Bitable 中能按 status 过滤查看
   - 能按 category 汇总统计（至少支持视图/分组）

11.同步失败可恢复
   - 模拟 Bitable API 返回失败
   - 系统不会丢数据：进入 outbox/重试队列
   - 恢复 API 后可自动补偿同步成功

12.可观测性完整
   - 完工、通知、评价、同步四个关键动作均有结构化日志
   - 日志包含 order_id、message_id（如有）、执行结果（success/fail）与错误原因

### 依赖关系
- 依赖 Ticket 4（需要指派关系与 `in_progress` 状态）
- Bitable 同步依赖 Ticket 3（工单为数据源；建议 order_id 作为同步主键）

### 预估时间
14 小时

---

## 依赖关系总览

核心主链路（严格串行）：
Ticket 1 → Ticket 2 → Ticket 3 → Ticket 4 → Ticket 5（完工闭环）

并行关系说明：
- Ticket 5 的「Bitable 同步」部分仅依赖 Ticket 3（工单数据模型）
- 因此在 Ticket 3 完成后，Bitable 同步可以与 Ticket 4 并行开发
- Redis / SLA 等增强设计不阻塞主链路，可作为并行优化任务

简化图示：

Ticket 1
   ↓
Ticket 2
   ↓
Ticket 3 ────────────────→ Ticket 5（Bitable 同步）
   ↓
Ticket 4
   ↓
Ticket 5（完工闭环）

## 总预估时间

- Ticket 1：6h
- Ticket 2：8h
- Ticket 3：9h
- Ticket 4：11h
- Ticket 5：14h

总计：48 小时（约 6 个工作日）

说明：
- 若按单人串行开发：约 6 个工作日
- 若部分并行（Bitable 同步与派单并行）：约 5 个工作日
- Redis / SLA 增强为可选优化，不影响 MVP 交付

## 可选增强（Future Improvements）：可靠性与可运维能力

> 说明：以下不影响 MVP 主链路交付，但能显著降低漏单、重复派单、超时无人处理等问题。

### 1) 幂等与防重推（必须）
- 以 `message_id` 做工单创建幂等（DB unique 兜底，可加 Redis SETNX 加速）
- 派单/完工使用状态机条件更新（CAS），确保同一工单不会被重复派单/重复完工
- 发送通知采用 outbox 或 `notify_sent` 标记，避免重复通知刷屏

### 2) 并发安全（建议）
- 派单、完工等“有副作用操作”使用分布式锁或 CAS 保证只有一个执行者生效
- Redis 不作为主数据源，仅用于锁、去重与队列协调；Redis 故障时系统可降级运行

### 3) SLA 超时提醒（建议）
- 待派单/处理中超时触发提醒（按 urgency 分档）
- 支持 Cron 扫描（简单）或 Redis 延迟队列（精准）实现
- 关键提醒事件落库，便于复盘统计漏单与响应时间
