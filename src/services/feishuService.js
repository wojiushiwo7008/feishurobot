const axios = require('axios');

class FeishuService {
  constructor() {
    this.appId = process.env.FEISHU_APP_ID;
    this.appSecret = process.env.FEISHU_APP_SECRET;
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }

  // Get tenant access token
  async getTenantAccessToken() {
    const now = Date.now();

    // Return cached token if still valid
    if (this.accessToken && now < this.tokenExpireTime) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          app_id: this.appId,
          app_secret: this.appSecret
        }
      );

      if (response.data.code === 0) {
        this.accessToken = response.data.tenant_access_token;
        // Token expires in 2 hours, refresh 5 minutes early
        this.tokenExpireTime = now + (response.data.expire - 300) * 1000;
        return this.accessToken;
      } else {
        throw new Error(`Failed to get access token: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('Error getting tenant access token:', error.message);
      throw error;
    }
  }

  // Send reply message
  async sendMessage(messageId, content) {
    try {
      const token = await this.getTenantAccessToken();

      const payload = {
        content: JSON.stringify({ text: content }),
        msg_type: 'text'
      };

      console.log('Sending message payload:', JSON.stringify(payload));

      const response = await axios.post(
        `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.code === 0) {
        console.log('Message sent successfully');
        return response.data;
      } else {
        throw new Error(`Failed to send message: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('Error sending message:', error.message);
      if (error.response) {
        console.error('API Error detail:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }
}

module.exports = new FeishuService();
