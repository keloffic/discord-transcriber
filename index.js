require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');
process.env.DISCORDJS_OPUS_ENGINE = 'opusscript';
const prism = require('prism-media');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL);

  if (!channel || channel.type !== 2) { // type 2 = voice channel
    console.error("❌ Canal de voz no encontrado o no válido");
    return;
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  // Escuchar y grabar
  setupRecording(connection);
});

function setupRecording(connection) {
  const receiver = connection.receiver;

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log('🎙️ Conectado al canal de voz');
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
      ]);
    } catch {
      console.log("🔌 Conexión perdida. Reconectando...");
      connection.destroy();
    }
  });

  receiver.speaking.on('start', (userId) => {
    const user = client.users.cache.get(userId);
    if (!user) return;

    const filename = path.join(__dirname, `grabacion-${userId}.pcm`);
    const pcmStream = receiver.subscribe(userId, {
      end: { behavior: 'silence', duration: 1000 }
    });

    const out = fs.createWriteStream(filename);
    const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
    pcmStream.pipe(decoder).pipe(out);

    out.on('finish', async () => {
      const audioBuffer = fs.readFileSync(filename);
      const formData = new FormData();
      formData.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });

      try {
        const response = await axios.post(process.env.N8N_WEBHOOK_URL, formData, {
          headers: formData.getHeaders()
        });
        console.log('📨 Enviado a n8n:', response.data);
      } catch (err) {
        console.error('❌ Error al enviar a n8n:', err.message);
      }

      fs.unlinkSync(filename);
    });
  });
}

client.login(process.env.DISCORD_TOKEN);
