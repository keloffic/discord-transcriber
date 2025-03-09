# Discord Voice Transcriber Bot

A Discord bot that transcribes voice channel conversations using Google's Gemini AI API.

## Features

- Joins voice channels and listens to conversations
- Transcribes spoken content in real-time using Gemini AI
- Uses Silero voice activity detection (VAD) to filter out noise and background sounds
- Displays placeholder messages immediately when speech is detected
- Updates transcriptions in-place with real-time editing
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
   LOG_LEVEL=4  # Optional: 1=error, 2=warn, 3=log, 4=info, 5=debug
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
3. Voice activity detection (VAD) determines if actual speech is present
4. When speech is detected, a placeholder message is immediately created
5. Audio is processed and converted from 48kHz stereo to 16kHz mono PCM
6. The processed audio is sent to Gemini API for transcription
7. The placeholder message is updated in-place with the transcribed text
8. If no speech is detected, the message is deleted to keep the channel clean

### Technical Details

- Uses the Silero VAD model to differentiate speech from noise
- Implements a hysteresis pattern with different activation/deactivation thresholds
- Process audio in small chunks (~120ms) for real-time detection
- Leverages async iterators for modern stream processing
- Uses consola for structured logging with configurable verbosity levels

## License

ISC