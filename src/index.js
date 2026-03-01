require('dotenv').config();
const express = require('express');
const feishuService = require('./services/feishuService');
const deepseekService = require('./services/deepseekService');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Feishu bot is running' });
});

// Feishu webhook endpoint
app.post('/webhook', async (req, res) => {
  const { type, challenge, event } = req.body;

  // Handle URL verification
  if (type === 'url_verification') {
    return res.json({ challenge });
  }

  // Handle message events
  if (type === 'event_callback' && event) {
    res.json({ code: 0 });

    // Process message asynchronously
    if (event.type === 'message' && event.message) {
      try {
        await handleMessage(event);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    }
    return;
  }

  res.json({ code: 0 });
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
