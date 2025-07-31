import { Client, GatewayIntentBits, Partials, Message } from "discord.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import config from "./config.ts";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Attachment],
});

client.once("ready", () => {
  console.log(`✅ Bot listo como ${client.user?.tag}`);
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (!attachment) return;

    const audioUrl = attachment.url;
    const fileExt = path.extname(audioUrl).toLowerCase();

    const allowedExtensions = [".mp3", ".ogg", ".m4a", ".wav"];
    if (!allowedExtensions.includes(fileExt)) return;

    try {
      console.log(`🎧 Audio detectado: ${audioUrl}`);

      // Descargar archivo de audio
      const response = await axios.get(audioUrl, { responseType: "arraybuffer" });
      const tempFile = `temp_${Date.now()}${fileExt}`;
      const tempPath = path.join("temp", tempFile);

      fs.mkdirSync("temp", { recursive: true });
      fs.writeFileSync(tempPath, response.data);

      // Enviar a n8n
      const form = new FormData();
      form.append("file", fs.createReadStream(tempPath), {
        filename: tempFile,
        contentType: attachment.contentType || "audio/mpeg",
      });

      const res = await axios.post(config.N8N_WEBHOOK_URL, form, {
        headers: form.getHeaders(),
      });

      console.log("✅ Enviado a n8n:", res.data);
      fs.unlinkSync(tempPath); // limpiar archivo temporal
    } catch (err: any) {
      console.error("❌ Error al procesar audio:", err.message);
    }
  }
});

client.login(config.DISCORD_TOKEN);
