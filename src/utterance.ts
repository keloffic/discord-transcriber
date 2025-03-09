import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Message, TextBasedChannel } from "discord.js";
import { Buffer } from "node:buffer";
import config from "./config.ts";
import logger from "./logger.ts";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

/**
 * Class to handle a single speech utterance
 * - Creates and manages Discord message
 * - Collects audio chunks
 * - Processes transcription on finalize
 */
export class Utterance {
  private chunks: Buffer[] = [];
  private discordMessage: Message | null = null;
  private startTime = Date.now();
  private isFinalized = false;

  constructor(private userId: string, private textChannel: TextBasedChannel) {
    this.createPlaceholderMessage();
  }

  /**
   * Create the initial Discord message
   */
  private async createPlaceholderMessage() {
    if ("send" in this.textChannel) {
      try {
        this.discordMessage = await this.textChannel.send(
          `<@${this.userId}>: *Listening...*`
        );
        logger.info(`Created placeholder message for user ${this.userId}`);
      } catch (error) {
        logger.error("Error creating placeholder message:", error);
      }
    }
  }

  /**
   * Add audio data to this utterance
   */
  public addAudioData(data: Buffer) {
    if (!this.isFinalized) {
      this.chunks.push(data);
    }
  }

  /**
   * Finalize the utterance and perform transcription
   */
  public async finalize() {
    if (this.isFinalized) return;
    this.isFinalized = true;

    // Update message to show it's processing
    if (this.discordMessage) {
      try {
        await this.discordMessage.edit(`<@${this.userId}>: *Transcribing...*`);
      } catch (error) {
        logger.error("Error updating message to transcribing status:", error);
      }
    }

    if (this.chunks.length === 0) {
      // No audio data collected
      this.updateMessageNoSpeech();
      return;
    }

    // Process audio data
    try {
      // Combine all chunks
      const pcmBuffer = Buffer.concat(this.chunks);

      // Convert to mono 16kHz for processing
      const monoBuffer = this.convertToMono16k(pcmBuffer);

      // Add WAV header
      const wavBuffer = this.addWavHeader(monoBuffer, 16000, 1);

      // Convert to base64
      const base64Audio = wavBuffer.toString("base64");

      // Get Gemini model and transcribe
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      // Transcribe audio
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

      // Update the Discord message with the transcription
      await this.updateMessageWithTranscription(transcription);
    } catch (error) {
      logger.error("Error transcribing audio:", error);
      this.updateMessageError();
    }
  }

  /**
   * Update message when no speech is detected - delete the message
   */
  private async updateMessageNoSpeech() {
    if (this.discordMessage) {
      try {
        // Delete the message instead of showing "No speech detected"
        await this.discordMessage.delete();
        logger.debug(`Deleted message for user ${this.userId} (no speech detected)`);
      } catch (error) {
        logger.error("Error deleting no-speech message:", error);
      }
    }
  }

  /**
   * Update message on error
   */
  private async updateMessageError() {
    if (this.discordMessage) {
      try {
        await this.discordMessage.edit(
          `<@${this.userId}>: *Error transcribing audio*`
        );
      } catch (error) {
        logger.error("Error updating error message:", error);
      }
    }
  }

  /**
   * Update message with transcription
   */
  private async updateMessageWithTranscription(transcription: string) {
    if (this.discordMessage) {
      try {
        if (transcription && transcription !== "No speech detected" && transcription !== "No speech detected.") {
          await this.discordMessage.edit(`<@${this.userId}>: ${transcription}`);
        } else {
          // Delete the message instead of showing "No speech detected"
          await this.discordMessage.delete();
          logger.debug(`Deleted message for user ${this.userId} (empty transcription)`);
        }
      } catch (error) {
        logger.error("Error updating transcription message:", error);
      }
    }
  }

  /**
   * Converts 48kHz stereo PCM to 16kHz mono PCM
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

  /**
   * Adds a WAV header to PCM audio data
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
}