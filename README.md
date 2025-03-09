# Discord Voice Transcriber Bot

A Discord bot that transcribes voice channel conversations using Google's Gemini AI API.

## Features

- Joins voice channels and listens to conversations
- Transcribes spoken content in real-time using Gemini AI
- Posts transcriptions to a text channel
- Simple commands to start and stop transcription

## Prerequisites

- Node.js v22.14.0 or later (with built-in TypeScript support)
- Discord Bot Token
- Google Gemini API Key

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Create a `.env` file based on the example:
   ```
   cp .env.example .env
   ```
4. Add your Discord and Gemini API credentials to the `.env` file:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   ```
5. Configure Privileged Intents in the Discord Developer Portal:
   - Go to https://discord.com/developers/applications
   - Select your bot application
   - Go to the "Bot" section
   - Under "Privileged Gateway Intents", enable:
     - MESSAGE CONTENT INTENT
   - Save changes

## Usage

Start the bot:
```
pnpm dev
```

In Discord, use the following commands:
- `!transcribe` - Start transcribing the voice channel you're in
- `!stop` - Stop transcription

## Development

Run type checking:
```
pnpm typecheck
```

## How It Works

1. The bot connects to a Discord voice channel
2. It captures audio streams from users as they speak
3. Audio is processed and converted to PCM format
4. The audio is sent to Gemini API for transcription
5. Transcribed text is posted to the Discord text channel

## License

ISC