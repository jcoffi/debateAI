import { ModelPricing, CostBreakdown } from './types.js';

export class CostController {
  private readonly pricing: Record<string, ModelPricing> = {
    // OpenAI flagship models
    'gpt-5': { input: 1.25, output: 10.00 },
    'gpt-5-mini': { input: 0.25, output: 2.00 },
    'o4-mini': { input: 0.60, output: 2.40 },
    // Google flagship models  
    'gemini-2.5-pro': { input: 3.50, output: 10.50 },
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    // Anthropic flagship models
    'claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
    // Legacy models for fallback
    'gpt-4o': { input: 0.005, output: 0.015 },
    'o1-preview': { input: 0.030, output: 0.120 },
    'o3-mini': { input: 0.002, output: 0.008 },
    'gemini-2.0-flash-exp': { input: 0.0001, output: 0.0003 },
    'gemini-1.5-pro': { input: 0.001, output: 0.002 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
    'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 }
  };

  private costs: { [sessionId: string]: CostBreakdown } = {};

  initializeSession(sessionId: string): void {
    this.costs[sessionId] = {
      total_cost_usd: 0,
      by_model: {
        openai: 0,
        gemini: 0,
        claude: 0
      },
      by_round: [],
      tokens_used: 0
    };
  }

  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.pricing[model];
    if (!pricing) {
      console.warn(`Unknown model pricing for ${model}, using default rates`);
      return (inputTokens * 0.003 + outputTokens * 0.015) / 1000;
    }

    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
  }

  addCost(sessionId: string, provider: 'openai' | 'gemini' | 'claude', cost: number, tokens: number, round: number): void {
    if (!this.costs[sessionId]) {
      this.initializeSession(sessionId);
    }

    const breakdown = this.costs[sessionId]!;
    breakdown.total_cost_usd += cost;
    breakdown.by_model[provider] += cost;
    breakdown.tokens_used += tokens;

    // Ensure by_round array is large enough
    while (breakdown.by_round.length < round) {
      breakdown.by_round.push(0);
    }
    breakdown.by_round[round - 1] = (breakdown.by_round[round - 1] || 0) + cost;
  }

  getCostBreakdown(sessionId: string): CostBreakdown | null {
    return this.costs[sessionId] || null;
  }

  getCurrentCost(sessionId: string): number {
    return this.costs[sessionId]?.total_cost_usd || 0;
  }

  checkBudgetLimit(sessionId: string, maxCost: number): {
    withinBudget: boolean;
    currentCost: number;
    remainingBudget: number;
    warningThreshold: boolean;
  } {
    const currentCost = this.getCurrentCost(sessionId);
    const remainingBudget = maxCost - currentCost;
    const warningThreshold = currentCost >= maxCost * 0.75;

    return {
      withinBudget: currentCost < maxCost,
      currentCost,
      remainingBudget,
      warningThreshold
    };
  }

  formatCostSummary(sessionId: string): string {
    const breakdown = this.getCostBreakdown(sessionId);
    if (!breakdown) {
      return 'No cost data available';
    }

    return `
💰 **Cost Summary**
- Total: $${breakdown.total_cost_usd.toFixed(4)}
- Tokens: ${breakdown.tokens_used.toLocaleString()}
- OpenAI: $${breakdown.by_model.openai.toFixed(4)}
- Gemini: $${breakdown.by_model.gemini.toFixed(4)}
- Claude: $${breakdown.by_model.claude.toFixed(4)}
- By Round: ${breakdown.by_round.map((cost, i) => `R${i+1}: $${cost.toFixed(3)}`).join(', ')}
    `.trim();
  }

  cleanupSession(sessionId: string): void {
    delete this.costs[sessionId];
  }
}