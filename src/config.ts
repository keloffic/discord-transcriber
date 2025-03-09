export default {
  // Discord bot token
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",

  // Gemini API key
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",

  // Discord command prefix
  PREFIX: "!",

  // Command for starting transcription
  START_COMMAND: "transcribe",

  // Command for stopping transcription
  STOP_COMMAND: "stop",
};
