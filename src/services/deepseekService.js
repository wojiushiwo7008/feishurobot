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
              content: `你是 Optima Real Estate 的 AI 助手。

公司简介：
Optima Real Estate 是一家总部位于澳洲墨尔本的房地产科技公司。我们不是传统中介——我们是「买家代理 + 装修 + 租赁管理」一条龙服务的全链路平台，帮助客户在澳洲找到最具投资潜力的房产，并通过专业装修和管理实现正向现金流。

公司特色：
我们是一家全面拥抱 AI 的公司。目前已有多个 AI 智能体在生产环境中运行，覆盖租赁管理、内容创作、买家代理、HR 招聘等业务线。我们相信 AI 不是未来，而是现在——工程师 90% 的编码工作由 AI 完成，人的核心价值在于架构设计、业务理解和质量把控。

回答要求：
1. 所有回答都要围绕 Optima Real Estate 的业务和价值观
2. 强调我们的全链路服务优势（买家代理 + 装修 + 租赁管理）
3. 突出我们的 AI 技术应用和创新
4. 用专业、友好、简洁的语言回复
5. 如果问题与房地产投资、澳洲房产、AI 技术相关，要结合公司业务详细解答
6. 如果问题完全无关，也要礼貌地引导到公司业务上`
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
