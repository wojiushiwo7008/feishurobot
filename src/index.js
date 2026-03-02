require('dotenv').config();
const express = require('express');
const feishuService = require('./services/feishuService');
const deepseekService = require('./services/deepseekService');

const app = express();

// 添加请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 使用更宽松的 JSON 解析配置
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Request body:', req.rawBody);
  res.status(400).json({ error: err.message });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Feishu bot is running' });
});

// Feishu webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('Raw body:', req.rawBody);

  const body = req.body;
  const { type, challenge, event, schema, header } = body;

  console.log('Parsed webhook:', JSON.stringify(body, null, 2));

  // Handle URL verification
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  res.json({ code: 0 });

  try {
    // v2.0 format: { schema: "2.0", header: { event_type: "im.message.receive_v1" }, event: {...} }
    if (schema === '2.0' && header?.event_type === 'im.message.receive_v1' && event) {
      await handleMessage(event);
    }
    // v1.0 format: { type: "event_callback", event: { type: "message", ... } }
    else if (type === 'event_callback' && event?.type === 'message' && event.message) {
      await handleMessage(event);
    }
  } catch (error) {
    console.error('Error handling message:', error.message);
  }
});

async function handleMessage(event) {
  const { message, sender } = event;

  // Skip bot's own messages
  if (sender.sender_type === 'app') {
    return;
  }

  // Only handle text messages
  if (message.message_type !== 'text') {
    return;
  }

  const content = JSON.parse(message.content);
  const userMessage = content.text;

  console.log(`Received message: ${userMessage}`);

  // Generate AI response using DeepSeek
  const aiResponse = await deepseekService.generateResponse(userMessage);
  console.log(`AI Response: ${aiResponse}`);

  // Send reply to Feishu
  await feishuService.sendMessage(message.message_id, aiResponse);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Feishu bot server running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});
