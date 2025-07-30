require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus
} = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ✅ Entrar automáticamente al canal al iniciar
client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL_ID);

    if (channel && channel.isVoiceBased()) {
      joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator
      });
      console.log("🔊 Bot se unió automáticamente al canal de voz.");
    } else {
      console.error("❌ No se encontró el canal de voz o no es de voz.");
    }
  } catch (err) {
    console.error("❌ Error al intentar unirse al canal:", err);
  }
});

// ✅ Detectar cuando alguien habla y grabar
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.channelId && newState.channelId !== oldState.channelId) {
    console.log(`🎤 ${newState.member.user.username} entró al canal de voz: ${newState.channel.name}`);

    const connection = joinVoiceChannel({
      channelId: newState.channelId,
      guildId: newState.guild.id,
      adapterCreator: newState.guild.voiceAdapterCreator
    });

    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId) => {
      const user = client.users.cache.get(userId);
      if (!user) return;

      const filename = path.join(__dirname, `./grabacion-${userId}.pcm`);
      const pcmStream = receiver.subscribe(userId, {
        end: {
          behavior: 'silence',
          duration: 1000,
        },
      });

      const out = fs.createWriteStream(filename);
      const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });

      pcmStream.pipe(decoder).pipe(out);

      out.on('finish', async () => {
        console.log(`🎧 Audio guardado: ${filename}`);

        const audioBuffer = fs.readFileSync(filename);
        const formData = new FormData();
        formData.append('file', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });

        try {
          const response = await axios.post(process.env.N8N_WEBHOOK_URL, formData, {
            headers: formData.getHeaders(),
          });

          console.log('✅ Audio enviado a n8n:', response.data);
        } catch (error) {
          console.error('❌ Error enviando audio a n8n:', error.message);
        }

        fs.unlinkSync(filename); // eliminar archivo temporal
      });
    });
  }
});

// ✅ Iniciar el bot
client.login(process.env.DISCORD_TOKEN);
