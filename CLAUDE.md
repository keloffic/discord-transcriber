# Discord Transcriber Bot Development Guide

## Commands

- `pnpm install` - Install dependencies
- `pnpm dev` - Start development server with hot reloading
- `pnpm start` - Start the application
- `pnpm typecheck` - Run TypeScript type checking

## Project Structure

- `src/index.ts` - Main entry point and Discord bot setup
- `src/config.ts` - Configuration and environment variables
- `src/transcription.ts` - Audio processing and Gemini API integration
  - `TranscriptionService` - Main service for handling audio transcription
  - `UserAudioStream` - Processes individual user audio streams with VAD
  - `Utterance` - Manages a speech segment with Discord message lifecycle

## Environment Setup

Required environment variables in `.env` file:
- `DISCORD_TOKEN` - Discord bot token
- `GEMINI_API_KEY` - Google Gemini API key
- `LOG_LEVEL` - (Optional) Logging level (1=error, 2=warn, 3=log, 4=info, 5=debug)

## TypeScript Configuration

- This project uses Node.js native TypeScript support (no transpilation)
- Important tsconfig.json settings:
  - `allowImportingTsExtensions: true` - Allows importing .ts files directly
  - `verbatimModuleSyntax: true` - Ensures type imports use the `type` keyword
  - `noEmit: true` - No JavaScript files are generated

## Important Implementation Details

- **Discord Bot Setup**:
  - Requires MESSAGE_CONTENT privileged intent
  - Uses top-level await for error handling during login

- **Audio Processing**:
  - Opus audio is decoded to 48kHz stereo PCM 
  - Converted to 16kHz mono for better transcription results
  - WAV header is added to PCM data before sending to Gemini
  - Active user tracking prevents duplicate audio stream processing
  - Uses Silero VAD model for voice activity detection
  - Real-time message updates with placeholder before transcription
  - Configurable silence duration and activation thresholds
  - For-await-of pattern for stream processing

- **Error Handling**:
  - Proper cleanup of resources in all error cases
  - Clear error messages for common issues
  - Defensive programming to handle edge cases
  - Structured logging with consola for different verbosity levels

## Code Style Guidelines

- Use TypeScript for type safety
- All type imports must use the `type` keyword
- Import local files with `.ts` extension, not `.js`
- Organize imports alphabetically
- Use async/await for asynchronous operations
- Add comprehensive error handling
- Include descriptive comments for complex logic
- Prefer const over let when variables won't be reassigned
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces
- Use object-oriented design with class-based encapsulation
- Leverage modern JavaScript features like async iterators
- Use structured logging with consola for better debugging

## Voice Activity Detection (VAD)

- Uses Silero VAD model through @ricky0123/vad-node
- Configurable activation (0.5) and deactivation (0.3) thresholds
- 1 second silence duration before ending speech detection
- Uses hysteresis pattern to avoid rapid on/off switching during speech
- Processes audio in small chunks (~120ms) for real-time detection

## Message Handling

- Creates placeholder "*Listening...*" messages immediately
- Updates messages in-place as transcription completes
- Deletes messages when no speech is detected
- Shows error messages when transcription fails
- Uses Discord message editing API for smooth updates