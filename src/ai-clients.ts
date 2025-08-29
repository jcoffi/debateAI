import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIClient, AIResponse } from './types.js';

export class OpenAIClient implements AIClient {
  private client: OpenAI;
  private defaultModel = 'gpt-4o';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(prompt: string, model?: string): Promise<AIResponse> {
    const modelToUse = model || this.defaultModel;
    
    try {
      const createParams: any = {
        model: modelToUse,
        messages: [{ role: 'user', content: prompt }],
      };

      // GPT-5 only supports default temperature (1)
      if (!modelToUse.startsWith('gpt-5') && !modelToUse.startsWith('o4')) {
        createParams.temperature = 0.7;
      }

      const response = await this.client.chat.completions.create(createParams);

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || inputTokens + outputTokens;

      return {
        content,
        confidence: this.extractConfidence(content),
        model: modelToUse,
        tokens_used: totalTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens, modelToUse)
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API failed: ${error}`);
    }
  }

  getAvailableModels(): string[] {
    return ['gpt-5', 'gpt-5-mini', 'o4-mini', 'gpt-4o'];
  }

  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-5': { input: 1.25, output: 10.00 },
      'gpt-5-mini': { input: 0.25, output: 2.00 },
      'o4-mini': { input: 0.60, output: 2.40 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'o1-preview': { input: 0.030, output: 0.120 },
      'o3-mini': { input: 0.002, output: 0.008 }
    };

    const modelPricing = pricing[model] || pricing['gpt-4o'];
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
  }

  private extractConfidence(content: string): number {
    // Simple heuristic to extract confidence from response
    const confidencePatterns = [
      /(?:confident|confidence|certain|sure).*?(\d{1,3})%/i,
      /(\d{1,3})%.*?(?:confident|confidence|certain|sure)/i
    ];

    for (const pattern of confidencePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        return Math.min(100, Math.max(0, parseInt(match[1])));
      }
    }

    // Fallback heuristic based on language certainty
    const certainWords = ['definitely', 'certainly', 'absolutely', 'clearly'];
    const uncertainWords = ['maybe', 'perhaps', 'possibly', 'might', 'could'];
    
    const certainCount = certainWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    const uncertainCount = uncertainWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;

    if (certainCount > uncertainCount) return 85;
    if (uncertainCount > certainCount) return 60;
    return 75; // Default confidence
  }
}

export class GeminiClient implements AIClient {
  private client: GoogleGenerativeAI;
  private defaultModel = 'gemini-2.5-pro';

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(prompt: string, model?: string): Promise<AIResponse> {
    const modelToUse = model || this.defaultModel;
    
    try {
      const geminiModel = this.client.getGenerativeModel({ model: modelToUse });
      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      // Gemini doesn't provide detailed token usage, so we estimate
      const estimatedTokens = this.estimateTokens(prompt + content);
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = estimatedTokens - inputTokens;

      return {
        content,
        confidence: this.extractConfidence(content),
        model: modelToUse,
        tokens_used: estimatedTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens, modelToUse)
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(`Gemini API failed: ${error}`);
    }
  }

  getAvailableModels(): string[] {
    return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];
  }

  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-2.5-pro': { input: 3.50, output: 10.50 },
      'gemini-2.5-flash': { input: 0.30, output: 2.50 },
      'gemini-2.0-flash-exp': { input: 0.0001, output: 0.0003 },
      'gemini-1.5-pro': { input: 0.001, output: 0.002 },
      'gemini-1.5-flash': { input: 0.0001, output: 0.0003 }
    };

    const modelPricing = pricing[model] || pricing['gemini-2.5-pro'];
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private extractConfidence(content: string): number {
    // Same confidence extraction logic as OpenAI
    const confidencePatterns = [
      /(?:confident|confidence|certain|sure).*?(\d{1,3})%/i,
      /(\d{1,3})%.*?(?:confident|confidence|certain|sure)/i
    ];

    for (const pattern of confidencePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        return Math.min(100, Math.max(0, parseInt(match[1])));
      }
    }

    const certainWords = ['definitely', 'certainly', 'absolutely', 'clearly'];
    const uncertainWords = ['maybe', 'perhaps', 'possibly', 'might', 'could'];
    
    const certainCount = certainWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    const uncertainCount = uncertainWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;

    if (certainCount > uncertainCount) return 85;
    if (uncertainCount > certainCount) return 60;
    return 75;
  }
}

export class AnthropicClient implements AIClient {
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateResponse(prompt: string, model?: string): Promise<AIResponse> {
    const modelToUse = model || this.defaultModel;
    
    try {
      const response = await this.client.messages.create({
        model: modelToUse,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0]?.type === 'text' 
        ? response.content[0].text 
        : '';
      
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      return {
        content,
        confidence: this.extractConfidence(content),
        model: modelToUse,
        tokens_used: inputTokens + outputTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens, modelToUse)
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API failed: ${error}`);
    }
  }

  getAvailableModels(): string[] {
    return ['claude-opus-4-1-20250805', 'claude-sonnet-4-20250514', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'];
  }

  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
      'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
    };

    const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
  }

  private extractConfidence(content: string): number {
    // Same confidence extraction logic
    const confidencePatterns = [
      /(?:confident|confidence|certain|sure).*?(\d{1,3})%/i,
      /(\d{1,3})%.*?(?:confident|confidence|certain|sure)/i
    ];

    for (const pattern of confidencePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        return Math.min(100, Math.max(0, parseInt(match[1])));
      }
    }

    const certainWords = ['definitely', 'certainly', 'absolutely', 'clearly'];
    const uncertainWords = ['maybe', 'perhaps', 'possibly', 'might', 'could'];
    
    const certainCount = certainWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    const uncertainCount = uncertainWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;

    if (certainCount > uncertainCount) return 85;
    if (uncertainCount > uncertainCount) return 60;
    return 75;
  }
}

export class AIClientManager {
  private openaiClient?: OpenAIClient;
  private geminiClient?: GeminiClient;
  private anthropicClient?: AnthropicClient;

  constructor(apiKeys: {
    openai?: string;
    gemini?: string;
    anthropic?: string;
  }) {
    if (apiKeys.openai) {
      this.openaiClient = new OpenAIClient(apiKeys.openai);
    }
    if (apiKeys.gemini) {
      this.geminiClient = new GeminiClient(apiKeys.gemini);
    }
    if (apiKeys.anthropic) {
      this.anthropicClient = new AnthropicClient(apiKeys.anthropic);
    }
  }

  getClient(provider: 'openai' | 'gemini' | 'claude'): AIClient | null {
    switch (provider) {
      case 'openai':
        return this.openaiClient || null;
      case 'gemini':
        return this.geminiClient || null;
      case 'claude':
        return this.anthropicClient || null;
      default:
        return null;
    }
  }

  getAvailableProviders(): ('openai' | 'gemini' | 'claude')[] {
    const providers: ('openai' | 'gemini' | 'claude')[] = [];
    if (this.openaiClient) providers.push('openai');
    if (this.geminiClient) providers.push('gemini');
    if (this.anthropicClient) providers.push('claude');
    return providers;
  }
}