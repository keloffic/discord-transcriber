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

## Environment Setup

Required environment variables in `.env` file:
- `DISCORD_TOKEN` - Discord bot token
- `GEMINI_API_KEY` - Google Gemini API key

## Code Style Guidelines

- Use TypeScript for type safety
- Organize imports alphabetically
- Use async/await for asynchronous operations
- Add comprehensive error handling
- Include descriptive comments for complex logic
- Prefer const over let when variables won't be reassigned
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces