import { EndBehaviorType, VoiceConnection } from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FrameProcessor, NonRealTimeVAD } from "@ricky0123/vad-node";
import consola from "consola";
import type { Message, TextBasedChannel } from "discord.js";
import { Buffer } from "node:buffer";
import prism from "prism-media";
import config from "./config.ts";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

// Configure consola
const logger = consola.create({
  level: config.LOG_LEVEL || 4, // 4 = info level, 5 = debug level
});

/**
 * Class to handle a single speech utterance
 * - Creates and manages Discord message
 * - Collects audio chunks
 * - Processes transcription on finalize
 */
class Utterance {
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
        if (transcription && transcription !== "No speech detected") {
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

/**
 * Class that processes a user's audio stream with real-time VAD
 */
class UserAudioStream {
  private opusDecoder: prism.opus.Decoder;
  private vadInstance: NonRealTimeVAD | null = null;
  private currentUtterance: Utterance | null = null;
  private isProcessing = false;
  private audioBuffer: Buffer[] = []; // For VAD processing
  private isSpeaking = false;

  // VAD parameters
  private frameSamples = 1536;
  private inactivityTimeout = 1500; // ms
  private lastSpeechTime = 0;
  private activationThreshold = config.ACTIVATION_THRESHOLD;
  private deactivationThreshold = config.DEACTIVATION_THRESHOLD;
  private silenceDuration = config.SILENCE_DURATION; // Allow 1 second of silence before ending speech

  constructor(
    private userId: string,
    private streamKey: string,
    private textChannel: TextBasedChannel,
    private audioStream: any,
    private onEnd: () => void
  ) {
    // Create decoder
    this.opusDecoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });

    // Start processing
    this.initializeVAD()
      .then(() => {
        this.processAudioStream();
      })
      .catch((error) => {
        logger.error("Error initializing VAD:", error);
        this.destroy();
      });
  }

  /**
   * Initialize the VAD model
   */
  private async initializeVAD() {
    try {
      this.vadInstance = await NonRealTimeVAD.new({
        frameSamples: 1024, // Standard frame size for Silero VAD
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.3,
      });
      logger.info(`VAD initialized for user ${this.userId}`);
    } catch (error) {
      logger.error("Error initializing VAD:", error);
    }
  }

  /**
   * Process the audio stream with VAD in real-time using async iteration
   */
  private async processAudioStream() {
    try {
      this.isProcessing = true;

      // Create processing pipeline
      const decoder = this.opusDecoder;
      this.audioStream.pipe(decoder);

      // Set up inactivity check (to finalize utterances after silence)
      this.scheduleInactivityCheck();

      // Process audio chunks using for-await-of pattern
      try {
        for await (const chunk of decoder) {
          if (!this.isProcessing) break;
          await this.processAudioChunk(chunk as Buffer);
        }
      } catch (streamError) {
        logger.error(`Stream error for user ${this.userId}:`, streamError);
      }

      logger.info(`Audio stream ended for user ${this.userId}`);

      // Finalize any active utterance
      if (this.currentUtterance) {
        this.currentUtterance.finalize();
        this.currentUtterance = null;
      }

      this.destroy();
    } catch (error) {
      logger.error(
        `Error processing audio stream for user ${this.userId}:`,
        error
      );
      this.destroy();
    }
  }

  /**
   * Process an individual audio chunk with VAD
   */
  private async processAudioChunk(chunk: Buffer) {
    try {
      // Add to buffer
      this.audioBuffer.push(chunk);

      // Skip processing if VAD isn't ready yet
      if (!this.vadInstance) return;

      // Process audio with VAD when we have enough data
      if (this.audioBuffer.length >= 5) {
        // ~120ms of audio
        // Convert to mono 16kHz for VAD
        const pcmBuffer = Buffer.concat(this.audioBuffer);
        const monoBuffer = this.convertToMono16k(pcmBuffer);

        // Convert to Float32Array for VAD
        const float32Data = new Float32Array(monoBuffer.length / 2);
        for (let i = 0; i < float32Data.length; i++) {
          float32Data[i] = monoBuffer.readInt16LE(i * 2) / 32768;
        }

        // Process with VAD using the frameProcessor directly
        // Only process if we have enough data for a frame
        if (float32Data.length >= 1024) {
          // Take 1024 samples (standard frame size for the model)
          const frameData = float32Data.slice(0, 1024);

          // Use the frameProcessor directly to get speech confidence
          const frameProcessor = this.vadInstance
            .frameProcessor as FrameProcessor;
          const result = await frameProcessor.modelProcessFunc(frameData);

          // Get speech confidence (value between 0 and 1)
          const speechConfidence = result.isSpeech;
          logger.debug(`Speech confidence: ${speechConfidence.toFixed(3)}`);

          // Use different thresholds for activation and deactivation
          // This creates a hysteresis effect to prevent rapid on/off switching
          let speechDetected = false;

          if (!this.isSpeaking) {
            // Not speaking yet, use higher threshold to activate
            speechDetected = speechConfidence >= this.activationThreshold;
          } else {
            // Already speaking, use lower threshold to maintain
            speechDetected = speechConfidence >= this.deactivationThreshold;
          }

          // Handle speech state transitions
          if (speechDetected) {
            this.lastSpeechTime = Date.now();

            // Speech start
            if (!this.isSpeaking) {
              this.isSpeaking = true;
              logger.info(`Speech start detected for user ${this.userId}`);

              // Create a new utterance
              this.currentUtterance = new Utterance(
                this.userId,
                this.textChannel
              );
            }

            // Add audio to current utterance
            if (this.currentUtterance) {
              for (const buffer of this.audioBuffer) {
                this.currentUtterance.addAudioData(buffer);
              }
            }
          } else if (this.isSpeaking) {
            // Check for speech end after silence
            const silenceDuration = Date.now() - this.lastSpeechTime;

            if (silenceDuration > this.silenceDuration) {
              // 1 second of silence (configured in config.ts)
              logger.info(`Speech end detected for user ${this.userId}`);
              this.isSpeaking = false;

              // Add final audio to current utterance and finalize
              if (this.currentUtterance) {
                for (const buffer of this.audioBuffer) {
                  this.currentUtterance.addAudioData(buffer);
                }

                this.currentUtterance.finalize();
                this.currentUtterance = null;
              }
            } else {
              // Still in speech, just add the audio
              if (this.currentUtterance) {
                for (const buffer of this.audioBuffer) {
                  this.currentUtterance.addAudioData(buffer);
                }
              }
            }
          }
        } else if (this.isSpeaking) {
          // Not enough data for VAD, but we're already speaking, so continue collecting
          if (this.currentUtterance) {
            for (const buffer of this.audioBuffer) {
              this.currentUtterance.addAudioData(buffer);
            }
          }
        }

        // Clear buffer after processing
        this.audioBuffer = [];
      }
    } catch (error) {
      logger.error(
        `Error processing audio chunk for user ${this.userId}:`,
        error
      );
    }
  }

  /**
   * Schedule regular checks for inactivity to finalize stale utterances
   */
  private scheduleInactivityCheck() {
    const interval = setInterval(() => {
      if (!this.isProcessing) {
        clearInterval(interval);
        return;
      }

      // Check if we need to finalize an utterance due to inactivity
      if (this.isSpeaking && this.currentUtterance) {
        const silenceDuration = Date.now() - this.lastSpeechTime;
        if (silenceDuration > this.inactivityTimeout) {
          logger.info(
            `Finalizing utterance due to inactivity for user ${this.userId}`
          );
          this.isSpeaking = false;
          this.currentUtterance.finalize();
          this.currentUtterance = null;
        }
      }
    }, 500); // Check every 500ms
  }

  /**
   * Clean up and destroy this processor
   */
  public destroy() {
    this.isProcessing = false;

    // Finalize any active utterance
    if (this.currentUtterance) {
      this.currentUtterance.finalize();
      this.currentUtterance = null;
    }

    // Clean up streams
    if (this.audioStream) {
      try {
        this.audioStream.destroy();
      } catch (error) {
        logger.error("Error destroying audio stream:", error);
      }
    }

    // Notify parent
    this.onEnd();
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
}

export class TranscriptionService {
  private activeStreams: Map<string, UserAudioStream> = new Map();
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

    // Track active users to avoid duplicate subscriptions
    const activeUsers = new Set<string>();

    // Set up audio receiving
    receiver.speaking.on("start", (userId) => {
      logger.debug(`User ${userId} started speaking`);

      // Skip if we already have an active stream for this user
      const streamKey = `${subscriptionId}_${userId}`;
      if (activeUsers.has(userId)) {
        return;
      }

      // Mark user as active
      activeUsers.add(userId);

      // Create audio subscription
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 2000,
        },
      });

      // Create a new audio stream processor
      const userStream = new UserAudioStream(
        userId,
        streamKey,
        textChannel,
        audioStream,
        () => {
          // Cleanup function
          this.activeStreams.delete(streamKey);
          activeUsers.delete(userId);
        }
      );

      // Store the stream processor
      this.activeStreams.set(streamKey, userStream);
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
}
