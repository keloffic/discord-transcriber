require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Attachment],
});

client.once('ready', () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignorar mensajes del bot
  if (message.author.bot) return;

  // Verifica si el mensaje tiene algún archivo adjunto
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    const audioUrl = attachment.url;

    // Filtra por tipo de archivo
    if (!audioUrl.endsWith('.mp3') && !audioUrl.endsWith('.wav') && !audioUrl.endsWith('.ogg') && !audioUrl.endsWith('.m4a')) {
      return;
    }

    console.log(`🎧 Audio detectado: ${audioUrl}`);

    try {
      // Descarga el archivo
      const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
      const tempPath = path.join(__dirname, 'temp_audio_' + Date.now() + path.extname(audioUrl));
      fs.writeFileSync(tempPath, response.data);

      // Envía a n8n
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempPath), {
        filename: 'audio' + path.extname(audioUrl),
        contentType: attachment.contentType || 'audio/mpeg',
      });

      const res = await axios.post(process.env.N8N_WEBHOOK_URL, formData, {
        headers: formData.getHeaders(),
      });

      console.log('✅ Audio enviado a n8n:', res.data);
      fs.unlinkSync(tempPath); // borra archivo temporal
    } catch (err) {
      console.error('❌ Error procesando audio:', err.message);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
