import { EndBehaviorType, VoiceConnection } from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TextBasedChannel } from "discord.js";
import { Buffer } from "node:buffer";
import prism from "prism-media";
import config from "./config.js";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

export class TranscriptionService {
  private activeStreams: Map<string, any> = new Map();
  private processingInterval: Map<string, NodeJS.Timeout> = new Map();
  private transcriptionChannels: Map<string, TextBasedChannel> = new Map();

  constructor() {}

  createTranscriptionStream(
    connection: VoiceConnection,
    textChannel: TextBasedChannel
  ) {
    const receiver = connection.receiver;

    // Create a subscription ID to track this transcription session
    const subscriptionId = Date.now().toString();

    // Store the text channel for sending transcriptions
    this.transcriptionChannels.set(subscriptionId, textChannel);

    // Set up audio receiving
    receiver.speaking.on("start", async (userId) => {
      console.log(`User ${userId} started speaking`);

      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 500,
        },
      });

      // Store the stream to close it later if needed
      const streamKey = `${subscriptionId}_${userId}`;
      this.activeStreams.set(streamKey, audioStream);

      try {
        // Create pipeline for converting Opus to PCM
        const opusDecoder = new prism.opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960,
        });

        // Collect audio data
        const chunks: Buffer[] = [];

        // Set up the pipeline
        audioStream.pipe(opusDecoder).on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        // When user stops speaking, process the audio
        audioStream.on("end", async () => {
          if (chunks.length > 0) {
            const audioBuffer = Buffer.concat(chunks);
            await this.processAudioChunk(subscriptionId, userId, audioBuffer);
            this.activeStreams.delete(streamKey);
          }
        });
      } catch (error) {
        console.error("Error setting up audio processing:", error);
        this.activeStreams.delete(streamKey);
      }
    });

    return subscriptionId;
  }

  stopTranscription(subscriptionId: string) {
    // Close all active streams for this subscription
    for (const [key, stream] of this.activeStreams.entries()) {
      if (key.startsWith(`${subscriptionId}_`)) {
        stream.destroy();
        this.activeStreams.delete(key);
      }
    }

    // Clean up the channel reference
    this.transcriptionChannels.delete(subscriptionId);
  }

  private async processAudioChunk(
    subscriptionId: string,
    userId: string,
    audioBuffer: Buffer
  ) {
    try {
      // Convert audio buffer to base64
      const base64Audio = audioBuffer.toString("base64");

      // Get the Gemini model
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      // Send audio to Gemini for transcription
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "audio/wav", // PCM audio from Discord
            data: base64Audio,
          },
        },
        {
          text: 'Please transcribe any speech in this audio. If there is no clear speech, respond with "No speech detected".',
        },
      ]);

      const transcription = result.response.text();

      // Send transcription to the appropriate text channel
      if (transcription && transcription !== "No speech detected") {
        const channel = this.transcriptionChannels.get(subscriptionId);
        if (channel && "send" in channel) {
          // Get the username if possible (would need to be passed from main)
          channel.send(`User <@${userId}>: ${transcription}`);
        }
      }
    } catch (error) {
      console.error("Error processing audio for transcription:", error);
    }
  }
}
