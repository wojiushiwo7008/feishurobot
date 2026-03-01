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
