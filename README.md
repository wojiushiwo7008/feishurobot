# Feishu DeepSeek Chatbot

A Feishu (Lark) group chatbot that uses DeepSeek AI to automatically generate intelligent replies.

## Features

- Receive messages from Feishu group chats
- Generate AI-powered responses using DeepSeek model
- Easy deployment with Docker

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies: `npm install`
4. Run the bot: `npm start`

## Docker Deployment

```bash
docker build -t feishu-bot .
docker run -p 3000:3000 --env-file .env feishu-bot
```

## Configuration

Configure your Feishu app event subscription URL to: `http://your-server:3000/webhook`

代码使用claude code生成的；接入deekseep api实现群聊对话功能：

第一步：去飞书开发者平台创建应用开通机器人以及相应权限

第二步：提供APPID 、App Secret、 deekseep api、将需求给到claude code

第三步：部署到本地docker desktop（用服务器更方便，今天出来看病家里停电服务器关机了，这里浪费了时间多配置了许多东西）

第四部：飞书添加群聊机器人（权限问题卡了一会，已验证成功）

第五步：验证成功push到github

遇到的最大问题就是json文件传入不对排查了好一会，claude code说是权限问题，我把截图都给他，判断出是json问题

<img width="782" height="760" alt="image" src="https://github.com/user-attachments/assets/d73f3dad-480e-4caf-b3b3-68e89ccd09f4" />

