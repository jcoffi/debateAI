# Phone-a-Friend MCP v2 - AI Consensus Panel

## Project Overview
Bygg en MCP-server som låter Claude moderera en debatt mellan OpenAI, Gemini och Claude (via API) för att nå konsensus om komplexa problem. När konsensus inte nås inom rimlig tid/kostnad, pausas debatten för mänsklig input.

## Core Concept
```
User asks complex question → 
Claude (moderator) sends to AI panel →
AIs debate (max 3 rounds) →
If consensus: return unified answer
If no consensus: pause for human decision
```

## Technical Requirements

### Language & Framework
- **TypeScript** (för att matcha Johans andra MCP-servrar)
- **MCP SDK** (@modelcontextprotocol/sdk)
- **Node.js** runtime

### Project Structure
```
C:\phone-a-friend-mcp\
├── package.json
├── tsconfig.json
├── .env
├── src/
│   ├── index.ts           # MCP server entry
│   ├── consensus-engine.ts # Debate orchestration
│   ├── ai-clients.ts      # API client wrappers
│   ├── cost-controller.ts # Token/cost tracking
│   └── types.ts           # TypeScript interfaces
└── build/                  # Compiled output
```

### API Integrations Required

1. **OpenAI**
   - Models: gpt-4o, o1-preview, o3-mini (när tillgänglig)
   - Authentication: Bearer token
   - Endpoint: https://api.openai.com/v1/chat/completions

2. **Google Gemini**
   - Models: gemini-2.0-flash-exp, gemini-1.5-pro
   - Authentication: API key
   - Package: @google/generative-ai

3. **Anthropic** (för Claude som deltagare)
   - Models: claude-3-opus-20240229, claude-3-sonnet-20240229
   - Authentication: API key
   - Package: @anthropic-ai/sdk

## MCP Tools to Implement

### 1. `phone_a_friend`
**Purpose:** Initiate AI consensus panel for a question
**Parameters:**
```typescript
{
  question: string;           // The complex question/problem
  context?: string;          // Additional context from conversation
  max_rounds?: number;       // Max debate rounds (default: 3)
  max_cost_usd?: number;     // Cost limit (default: 2.0)
  strategy?: 'debate' | 'synthesize' | 'tournament'; // Debate style
  models?: {
    openai?: string;       // Override model choice
    gemini?: string;
    anthropic?: string;
  }
}
```

**Returns:**
```typescript
{
  status: 'consensus' | 'deadlock' | 'intervention_needed';
  final_answer?: string;
  debate_log: DebateRound[];
  cost_summary: CostBreakdown;
  disagreement_summary?: DisagreementReport;
}
```

### 2. `continue_debate`
**Purpose:** Continue a paused debate after human intervention
**Parameters:**
```typescript
{
  session_id: string;
  instruction: 'continue_2_rounds' | 
               'continue_until_consensus' | 
               'accept_answer' |
               'synthesize_and_stop';
  selected_ai?: 'openai' | 'gemini' | 'claude'; // If accepting specific answer
}
```

### 3. `analyze_disagreement`
**Purpose:** Deep analysis of why AIs disagree
**Parameters:**
```typescript
{
  session_id: string;
}
```

**Returns:** Detailed breakdown of core disagreements, assumptions, and reasoning differences

## Debate Flow Implementation

### Round Structure
```typescript
interface DebateRound {
  round_number: number;
  responses: {
    openai: AIResponse;
    gemini: AIResponse;
    claude: AIResponse;
  };
  consensus_score: number; // 0-1, how aligned are the responses
  tokens_used: number;
  cost_usd: number;
  timestamp: Date;
}
```

### Consensus Detection Algorithm
```typescript
// Pseudocode
function checkConsensus(responses: AIResponses): boolean {
  // 1. Extract key claims from each response
  // 2. Compare semantic similarity
  // 3. Check if core conclusions align
  // 4. Return true if similarity > 0.85
}
```

### Debate Prompts Generator
```typescript
function generateDebatePrompt(round: number, previousResponses: AIResponses): string {
  if (round === 1) {
    return originalQuestion;
  }
  
  return `
    Previous responses:
    - GPT-4: ${previousResponses.openai}
    - Gemini: ${previousResponses.gemini}
    - Claude: ${previousResponses.claude}
    
    ${getDebateInstruction(round)}
  `;
}

function getDebateInstruction(round: number): string {
  const instructions = {
    2: "Analyze the other responses. Where do you agree/disagree? Provide evidence for your position.",
    3: "This is the final round. Push toward consensus or clearly state your fundamental disagreement.",
    4: "Focus on finding common ground. What can all parties agree on?",
    5: "Last chance: Synthesize all perspectives into a unified answer if possible."
  };
  return instructions[round] || instructions[3];
}
```

## Cost Control System

### Token Pricing (as of 2025)
```typescript
const pricing = {
  'gpt-4o': { input: 0.005, output: 0.015 },        // per 1K tokens
  'o1-preview': { input: 0.030, output: 0.120 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0003 },
  'gemini-1.5-pro': { input: 0.001, output: 0.002 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 }
};
```

### Budget Management
- Track cumulative cost per session
- Warn at 75% of budget
- Hard stop at 100% of budget
- Show cost breakdown by model and round

## Human Intervention Format

When consensus isn't reached, return a structured summary:

```markdown
## 🚨 AI Panel Deadlock - Round ${round}/${maxRounds}

**Question:** ${originalQuestion}

### Current Positions:

**🤖 GPT-4:** ${gptPosition}
- Confidence: ${gptConfidence}%
- Key argument: ${gptMainPoint}

**🧠 Claude:** ${claudePosition}
- Confidence: ${claudeConfidence}%  
- Key argument: ${claudeMainPoint}

**🌟 Gemini:** ${geminiPosition}
- Confidence: ${geminiConfidence}%
- Key argument: ${geminiMainPoint}

### Disagreement Analysis:
- Core conflict: ${coreDisagreement}
- Type: ${disagreementType} // factual, interpretive, philosophical
- Resolvable: ${resolvabilityScore}/10

### Resources Used:
- Tokens: ${tokensUsed}/${tokenLimit}
- Cost: $${costSoFar}/$${budgetLimit}
- Time elapsed: ${timeElapsed}

### Your Options:
1. Continue 2 more rounds
2. Continue until consensus (risky!)
3. Accept GPT's answer
4. Accept Claude's answer
5. Accept Gemini's answer
6. Request synthesis and stop
7. Abort and handle manually
```

## Configuration (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "phone-a-friend": {
      "command": "node",
      "args": ["C:\\phone-a-friend-mcp\\build\\index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "GEMINI_API_KEY": "AI...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## Error Handling

### API Failures
- Implement exponential backoff
- Fallback to other models if one fails
- Cache responses to avoid re-querying

### Rate Limiting
```typescript
class RateLimiter {
  // OpenAI: 10,000 TPM
  // Gemini: 60 QPM  
  // Claude: 5 QPM
  
  async throttleRequest(service: string): Promise<void> {
    // Implement token bucket algorithm
  }
}
```

## Testing Strategy

### Test Cases
1. **Simple Consensus:** "What is 2+2?" - Should reach consensus immediately
2. **Complex Technical:** "Is Rust or Go better for systems programming?" - Likely deadlock
3. **Philosophical:** "Is free will an illusion?" - Guaranteed deadlock
4. **Factual Dispute:** "What year was the transistor invented?" - Should converge

### Mock Mode
Include a `--mock` flag that uses fake API responses for development/testing without burning tokens.

## Advanced Features (Phase 2)

### Memory System
- Store previous debates in `C:\claude_memory\debates\`
- Reference historical consensus on similar topics
- Learn which types of questions cause deadlocks

### Model Specialization
```typescript
const modelSpecialties = {
  'code_review': ['o1-preview', 'claude-3-opus', 'gemini-1.5-pro'],
  'creative_writing': ['gpt-4o', 'claude-3-opus', 'gemini-2.0-flash'],
  'factual_research': ['gemini-1.5-pro', 'gpt-4o', 'claude-3-sonnet'],
  'math_problems': ['o1-preview', 'gemini-1.5-pro', 'claude-3-opus']
};
```

### Debate Strategies
```typescript
interface DebateStrategy {
  socratic: "Each AI questions others' assumptions";
  dialectic: "Thesis → Antithesis → Synthesis";
  tournament: "Pairs debate, third judges";
  consensus_building: "Focus on common ground";
  devil_advocate: "One AI argues against all";
}
```

## Development Steps

1. **Setup Project**
   ```bash
   cd C:\phone-a-friend-mcp
   npm init -y
   npm install @modelcontextprotocol/sdk @anthropic-ai/sdk openai @google/generative-ai
   npm install -D typescript @types/node
   npx tsc --init
   ```

2. **Create Basic MCP Server**
   - Start with simple echo tool
   - Verify it loads in Claude Desktop

3. **Implement AI Clients**
   - Test each API individually
   - Verify authentication works

4. **Build Consensus Engine**
   - Start with 2 AIs, 1 round
   - Add consensus detection
   - Add multi-round capability

5. **Add Cost Control**
   - Implement token counting
   - Add budget limits

6. **Create Intervention System**
   - Design deadlock detection
   - Format human-readable summaries

7. **Test with Claude Desktop**
   - Try various question types
   - Verify error handling
   - Test intervention flow

## Example Usage in Claude

```
User: "Phone a friend about whether P=NP"

Claude: I'll convene the AI panel to discuss this fundamental computer science question.

[Calling phone_a_friend tool...]

After 3 rounds of debate:

🚨 The panel has reached a deadlock. Here's where they stand:

GPT-4: Believes P≠NP based on complexity theory evidence
Gemini: Agrees P≠NP but emphasizes it's unproven  
Claude: Points out the question remains open, leans toward P≠NP

Cost so far: $0.42

Would you like them to continue debating, or should we proceed with the consensus that P≠NP is likely but unproven?
```

## Success Criteria

1. ✅ Can orchestrate debates between 3 AI models
2. ✅ Detects consensus vs deadlock accurately  
3. ✅ Respects cost/token limits
4. ✅ Provides clear human intervention points
5. ✅ Integrates seamlessly with Claude Desktop
6. ✅ Handles API failures gracefully
7. ✅ Maintains debate context across rounds

## Notes for Claude Code

- Start simple: Get basic MCP server working first
- Test with cheap models initially (gemini-flash, gpt-3.5)
- Use environment variables for API keys
- Include lots of logging for debugging
- Consider making the first version synchronous before adding async complexity
- Remember: This runs INSIDE Claude Desktop, so Claude is both the moderator AND a participant

---

**For Johan:** This spec should give Claude Code everything needed to build the MCP server. The key insight is that your Claude Desktop instance acts as the moderator/orchestrator, while also participating in debates via the Anthropic API. This creates an interesting dynamic where Claude has the full context of your conversation but must fairly moderate between different AI perspectives.