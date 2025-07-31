const { Client, GatewayIntentBits, Partials } = require("discord.js");
const axios = require("axios");
require("dotenv").config(); // Útil localmente, no obligatorio en Railway

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel]
});

// Variables de entorno
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// Mensaje de inicio
client.once("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// Detectar mensajes con archivos de audio
client.on("messageCreate", async (message) => {
  // Ignorar mensajes del bot
  if (message.author.bot) return;

  // Verificar si tiene adjuntos de tipo audio
  if (message.attachments.size > 0) {
    const audioAttachment = message.attachments.find(att => att.contentType && att.contentType.startsWith("audio"));

    if (audioAttachment) {
      console.log(`🎙️ Nota de voz detectada: ${audioAttachment.url}`);

      // Mostrar la URL que se está usando para enviar a n8n
      console.log("🧪 URL que estoy usando para enviar a n8n:", N8N_WEBHOOK_URL);

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

// Iniciar sesión con el token de Discord
client.login(DISCORD_TOKEN);
