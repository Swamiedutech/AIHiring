const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const keyRotator = require('../utils/keyRotator');
const logger = require('../utils/logger');

/**
 * Dual-LLM Orchestrator (GPT & Gemini Only)
 * Routes tasks to specific providers as per restricted system policy
 */
class LLMService {
  constructor() {
    // OpenAI Initialization
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Gemini Initialization
    this.geminiModelName = process.env.GENAI_MODEL || "gemini-1.5-flash";
    
    logger.info(`LLMService initialized with Dual-Provider Support (GPT, Gemini: ${this.geminiModelName})`);
  }

  /**
   * Main completion router
   * @param {string} useCase - The specific task
   * @param {string} prompt - The prompt to send
   * @returns {Promise<string>} - The LLM response
   */
  async generateCompletion(useCase, prompt) {
    try {
      const provider = this.getProviderForUseCase(useCase);
      logger.info(`[LLM Router] Routing '${useCase}' to provider: ${provider}`);

      if (provider === 'GPT') {
        return await this.callGPT(prompt);
      } else {
        return await this.callGemini(prompt);
      }
    } catch (error) {
      logger.error(`[LLM Router] Error in generateCompletion for ${useCase}: ${error.message}`);
      // Final fallback to Gemini
      return await this.callGemini(prompt);
    }
  }

  /**
   * Mapping logic: GPT for text analysis, Gemini for multimodal/scaling
   */
  getProviderForUseCase(useCase) {
    const mappings = {
      'RESUME_SCORING': 'GEMINI',
      'INTERVIEW_ANALYSIS': 'GEMINI',
      'VIDEO_AUDIO_INTERVIEW': 'GEMINI',
      'BIAS_SAFE_HR': 'GEMINI', 
      'LOW_COST_SCALING': 'GEMINI'
    };
    return mappings[useCase] || 'GEMINI';
  }

  /**
   * OpenAI GPT implementation
   */
  async callGPT(prompt) {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.0
    });
    return response.choices[0].message.content;
  }

  /**
   * Google Gemini implementation with automatic rate-limit rotation
   */
  async callGemini(prompt, attempt = 1) {
    const key = keyRotator.getNextKey();
    if (!key) throw new Error("No Gemini API keys available.");

    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ 
        model: this.geminiModelName,
        generationConfig: {
          temperature: 0.0
        }
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      const isRateLimit = error.message?.includes("429") || error.message?.toLowerCase().includes("quota");
      
      if (isRateLimit && attempt < Math.min(keyRotator.getAllKeys().length, 3)) {
        logger.warn(`[LLM Router] Gemini Key Rate-Limited (429). Attempting rotation ${attempt + 1}/${Math.min(keyRotator.getAllKeys().length, 3)}...`);
        return await this.callGemini(prompt, attempt + 1);
      }
      
      logger.error(`[LLM Router] Gemini Final Failure (Attempt ${attempt}): ${error.message}`);
      throw error;
    }
  }
}

module.exports = new LLMService();
