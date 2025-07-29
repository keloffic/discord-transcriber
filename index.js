
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', () => {
  console.log(`Bot listo como ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.channelId && newState.channelId !== oldState.channelId) {
    console.log(`Usuario ${newState.member.user.username} entró al canal de voz: ${newState.channel.name}`);
    // Aquí podrías integrar la grabación de audio y envío a Whisper vía n8n webhook
  }
});

client.login(process.env.DISCORD_TOKEN);
