const { Client, GatewayIntentBits, Partials } = require("discord.js");
const axios = require("axios");
require("dotenv").config(); // Para usar variables de entorno

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// VARIABLES
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = "https://n8nkeloffic-production.up.railway.app/webhook/discord-audio";

// CONEXIÓN DEL BOT
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ESCUCHAR MENSAJES
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const audioAttachment = message.attachments.find(
    (att) => att.contentType && att.contentType.startsWith("audio")
  );

  const dataToSend = {
    username: message.author.username,
    channel: message.channel.name,
    text: message.content || null,
    audio_url: audioAttachment?.url || null
  };

  try {
    await axios.post(N8N_WEBHOOK_URL, dataToSend, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (dataToSend.audio_url) {
      message.reply("📝 Recibí tu nota de voz. Procesando...");
    } else if (dataToSend.text) {
      message.reply("📩 Recibí tu mensaje de texto. Procesando...");
    }
  } catch (error) {
    console.error("❌ Error al enviar a n8n:", error.message);
    console.error("➡️ URL usada:", error.config?.url);
    message.reply("⚠️ Ocurrió un error al enviar tu mensaje.");
  }
});

// LOGIN
client.login(DISCORD_TOKEN);
