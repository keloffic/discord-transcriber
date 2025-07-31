const { Client, GatewayIntentBits, Partials } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
let N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Elimina espacios invisibles
N8N_WEBHOOK_URL = N8N_WEBHOOK_URL.trim();

// ✅ Imprimir URL real para confirmar
console.log("📡 URL final a usar:", N8N_WEBHOOK_URL);

client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.attachments.size > 0) {
    const audioAttachment = message.attachments.find(att => att.contentType && att.contentType.startsWith("audio"));

    if (audioAttachment) {
      console.log(`🎙️ Nota de voz detectada: ${audioAttachment.url}`);

      try {
        await axios.post(N8N_WEBHOOK_URL, {
          username: message.author.username,
          audio_url: audioAttachment.url,
          channel: message.channel.name
        });
        message.reply("📝 Recibí tu nota de voz. Procesando...");
      } catch (error) {
        console.error("❌ Error al enviar a n8n:", error.message);
        message.reply("⚠️ Ocurrió un error al procesar el audio.");
      }
    }
  }
});

client.login(DISCORD_TOKEN);
