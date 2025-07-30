require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioResource, AudioPlayerStatus, createAudioPlayer, VoiceReceiver } = require('@discordjs/voice');
const { OpusDecoder } = require('@discordjs/opus');
const prism = require('prism-media');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
});

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

          console.log('✅ Transcripción enviada a n8n:', response.data);
        } catch (error) {
          console.error('❌ Error enviando audio a n8n:', error.message);
        }

        fs.unlinkSync(filename); // borra el archivo local
      });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
