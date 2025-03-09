import { EndBehaviorType, VoiceConnection } from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TextBasedChannel } from "discord.js";
import { Buffer } from "node:buffer";
import prism from "prism-media";
import config from "./config.ts";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

export class TranscriptionService {
  private activeStreams: Map<string, any> = new Map();
  private processingInterval: Map<string, NodeJS.Timeout> = new Map();
  private transcriptionChannels: Map<string, TextBasedChannel> = new Map();

  constructor() {}

  /**
   * Adds a WAV header to PCM audio data
   * @param pcmData PCM audio data buffer
   * @param sampleRate Sample rate (48000 from Discord)
   * @param numChannels Number of channels (2 for stereo)
   * @returns Buffer with WAV header + PCM data
   */
  private addWavHeader(
    pcmData: Buffer,
    sampleRate: number,
    numChannels: number
  ): Buffer {
    const byteRate = sampleRate * numChannels * 2; // 2 bytes per sample
    const blockAlign = numChannels * 2;
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + pcmData.length);

    // RIFF identifier
    buffer.write("RIFF", 0);
    // File size
    buffer.writeUInt32LE(36 + dataSize, 4);
    // RIFF type
    buffer.write("WAVE", 8);
    // Format chunk identifier
    buffer.write("fmt ", 12);
    // Format chunk length
    buffer.writeUInt32LE(16, 16);
    // Sample format (PCM)
    buffer.writeUInt16LE(1, 20);
    // Channel count
    buffer.writeUInt16LE(numChannels, 22);
    // Sample rate
    buffer.writeUInt32LE(sampleRate, 24);
    // Byte rate (SampleRate * NumChannels * BitsPerSample/8)
    buffer.writeUInt32LE(byteRate, 28);
    // Block align (NumChannels * BitsPerSample/8)
    buffer.writeUInt16LE(blockAlign, 32);
    // Bits per sample
    buffer.writeUInt16LE(16, 34);
    // Data chunk identifier
    buffer.write("data", 36);
    // Data chunk length
    buffer.writeUInt32LE(dataSize, 40);

    // Copy audio data
    pcmData.copy(buffer, 44);

    return buffer;
  }

  createTranscriptionStream(
    connection: VoiceConnection,
    textChannel: TextBasedChannel
  ) {
    const receiver = connection.receiver;

    // Create a subscription ID to track this transcription session
    const subscriptionId = Date.now().toString();

    // Store the text channel for sending transcriptions
    this.transcriptionChannels.set(subscriptionId, textChannel);

    // Track active users to avoid duplicate subscriptions
    const activeUsers = new Set<string>();

    // Set up audio receiving
    receiver.speaking.on("start", async (userId) => {
      console.log(`User ${userId} started speaking`);

      // Skip if we already have an active stream for this user
      const streamKey = `${subscriptionId}_${userId}`;
      if (activeUsers.has(userId)) {
        return;
      }

      // Mark user as active
      activeUsers.add(userId);

      // Create subscription
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 2000,
        },
      });

      // Store the stream to close it later if needed
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
          console.log(`Processing audio chunk for user ${userId}`);
          if (chunks.length > 0) {
            const audioBuffer = Buffer.concat(chunks);
            await this.processAudioChunk(subscriptionId, userId, audioBuffer);
          }
          // Clean up
          this.activeStreams.delete(streamKey);
          activeUsers.delete(userId);
        });
      } catch (error) {
        console.error("Error setting up audio processing:", error);
        this.activeStreams.delete(streamKey);
        activeUsers.delete(userId);
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

  /**
   * Converts 48kHz stereo PCM to 16kHz mono PCM
   * @param buffer 48kHz stereo PCM buffer (interleaved)
   * @returns 16kHz mono PCM buffer
   */
  private convertToMono16k(buffer: Buffer): Buffer {
    // Parameters
    const inputSampleRate = 48000;
    const outputSampleRate = 16000;
    const ratio = inputSampleRate / outputSampleRate;
    const inputChannels = 2; // Stereo
    const bytesPerSample = 2; // 16-bit

    // Calculate output buffer size
    const inputSamples = buffer.length / (bytesPerSample * inputChannels);
    const outputSamples = Math.floor(inputSamples / ratio);
    const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample);

    // Process each output sample
    for (let i = 0; i < outputSamples; i++) {
      // Find the corresponding input sample
      const inputIndex = Math.floor(i * ratio) * inputChannels * bytesPerSample;

      // Average the left and right channels for mono conversion
      if (inputIndex + 3 < buffer.length) {
        const leftSample = buffer.readInt16LE(inputIndex);
        const rightSample = buffer.readInt16LE(inputIndex + 2);
        const monoSample = Math.round((leftSample + rightSample) / 2);

        // Write to output buffer
        outputBuffer.writeInt16LE(monoSample, i * bytesPerSample);
      }
    }

    return outputBuffer;
  }

  private async processAudioChunk(
    subscriptionId: string,
    userId: string,
    audioBuffer: Buffer
  ) {
    try {
      // Convert 48kHz stereo to 16kHz mono
      const monoBuffer = this.convertToMono16k(audioBuffer);

      // Add WAV header to the mono 16kHz PCM data
      const wavBuffer = this.addWavHeader(monoBuffer, 16000, 1);

      // Convert audio buffer to base64
      const base64Audio = wavBuffer.toString("base64");

      // Get the Gemini model
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      // Send audio to Gemini for transcription
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "audio/wav",
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
          channel.send(`<@${userId}>: ${transcription}`);
        }
      }
    } catch (error) {
      console.error("Error processing audio for transcription:", error);
    }
  }
}
