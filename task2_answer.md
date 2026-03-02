Task 3 — 找出代码中的 Bug

问：文件buggy_bot.js是一个简化版的企微自动回复机器人。上线后用户反馈：「有时候机器人会重复回复同一条消息」，请你帮我从整体逻辑来判断下哪里有问题，并提供修改意见 claude code：

76行处：

if (processedMessages.includes(text)) continue; processedMessages.push(text);

这个去重逻辑只检查消息的文本内容。如果两个不同的用户发送相同的文本（比如"你好"），第二个用户的消息会被错误地过滤掉。更严重的是，如果同一个用户在不同时间发送相同内容，第二次也会被过滤。 修复方案:

应该使用消息的唯一 ID（如 msg.msgId 或 msg.id）来去重，而不是消息内容：

// 假设消息对象有 msgId 字段 const msgId = msg.msgId || msg.id; if (processedMessages.includes(msgId)) continue; processedMessages.push(msgId);

93行处：

pendingBatches[friendName].timer = setTimeout(async () => { // ... }, DEBOUNCE_MS);

每次收到新消息时，代码会创建一个新的 setTimeout，但没有清除之前的定时器。这意味着如果在 3 秒内收到多条消息，会创建多个定时器，每个定时器都会触发一次回复。 修复方案: 在设置新定时器之前，先清除旧的定时器：

// 清除旧的定时器 if (pendingBatches[friendName].timer) { clearTimeout(pendingBatches[friendName].timer); }

pendingBatches[friendName].timer = setTimeout(async () => { // ... }, DEBOUNCE_MS);

26和77行处：

const processedMessages = []; // 已处理消息列表（用于去重） // ... processedMessages.push(text);

processedMessages 数组会无限增长，永远不会清理。这会导致： 内存泄漏 数组查找性能下降（includes 是 O(n) 操作） 如果服务重启，数组会被清空，之前处理过的消息可能会被重复处理 修复方案: 使用 Set 代替数组（查找更快），并添加过期清理机制：

const processedMessages = new Map(); // msgId -> timestamp const MESSAGE_EXPIRE_MS = 3600000; // 1小时后过期 // 在去重检查时 const msgId = msg.msgId || msg.id; const now = Date.now(); // 清理过期消息 for (const [id, timestamp] of processedMessages.entries()) { if (now - timestamp > MESSAGE_EXPIRE_MS) { processedMessages.delete(id); } } if (processedMessages.has(msgId)) continue; processedMessages.set(msgId, now);

126到128行处：

res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ code: 200, message: "ok" })); await handleCallback(json);

代码先返回 200 响应，然后才异步处理消息。虽然这看起来没问题，但如果 handleCallback 抛出异常（在 try-catch 之外的异步错误），webhook 提供方可能会认为处理失败并重试，导致重复处理。 更重要的是，如果企微的 webhook 系统有超时重试机制，而 handleCallback 处理时间过长（比如 AI 调用慢），企微可能会在第一次请求还在处理时就发起重试。 修复方案: 确保在处理完成后再响应，或者添加请求 ID 去重：

// 方案 1: 等待处理完成再响应（可能导致超时） await handleCallback(json); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ code: 200, message: "ok" }));

// 方案 2: 添加请求 ID 去重（推荐） const requestId = json.requestId || json.msgId; if (processedRequests.has(requestId)) { res.writeHead(200); res.end(JSON.stringify({ code: 200, message: "duplicate" })); return; } processedRequests.add(requestId);
