const axios = require('axios');

class DeepSeekService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
  }

  async generateResponse(userMessage) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: '你是一个友好、专业的AI助手，负责在飞书群聊中回答用户的问题。请用简洁、清晰的语言回复。'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content;
      } else {
        throw new Error('No response from DeepSeek API');
      }
    } catch (error) {
      console.error('Error calling DeepSeek API:', error.message);
      if (error.response) {
        console.error('API Error:', error.response.data);
      }
      return '抱歉，我现在无法生成回复，请稍后再试。';
    }
  }
}

module.exports = new DeepSeekService();
