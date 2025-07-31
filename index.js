const { Client, GatewayIntentBits, Partials } = require("discord.js");
const axios = require("axios");
require("dotenv").config(); // útil localmente

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
let N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";

// LIMPIEZA COMPLETA de URL (quita \n, \r, espacios)
N8N_WEBHOOK_URL = N8N_WEBHOOK_URL.replace(/[\n\r\s]/g, "");

// DEBUG AVANZADO: imprimir caracteres individuales
console.log("🧪 URL inspeccionada:");
[...N8N_WEBHOOK_URL].forEach((char, i) => {
  console.log(`Posición ${i}: '${char}' - Código ASCII: ${char.charCodeAt(0)}`);
});
console.log(`🔗 URL final limpia: ${N8N_WEBHOOK_URL}`);

// CONEXIÓN DEL BOT
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ESCUCHAR MENSAJES
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.attachments.size > 0) {
    const audioAttachment = message.attachments.find(
      (att) => att.contentType && att.contentType.startsWith("audio")
    );

    if (audioAttachment) {
      console.log(`🎙️ Nota de voz detectada: ${audioAttachment.url}`);

      try {
        await axios.post(N8N_WEBHOOK_URL, {
          username: message.author.username,
          audio_url: audioAttachment.url,
          channel: message.channel.name,
        });
        message.reply("📝 Recibí tu nota de voz. Procesando...");
      } catch (error) {
        console.error("❌ Error al enviar a n8n:", error.message);
        console.error("➡️ URL usada:", error.config?.url);
        message.reply("⚠️ Ocurrió un error al procesar el audio.");
      }
    }
  }
});

// LOGIN
client.login(DISCORD_TOKEN);
