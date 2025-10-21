import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

interface ParamV4Data {
  user_types: Record<string, string>;
  problem_nature: Record<string, string>;
}

class MicroSaaSIdeaGenerator {
  private openai: OpenAI;
  private paramData: ParamV4Data | null = null;
  private microSaaSPrinciples: string | null = null;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }

  private async loadData() {
    if (!this.paramData) {
      const paramPath = path.join(process.cwd(), 'data', 'paramV4.json');
      const paramContent = await fs.readFile(paramPath, 'utf-8');
      this.paramData = JSON.parse(paramContent);
    }

    if (!this.microSaaSPrinciples) {
      const principlesPath = path.join(process.cwd(), 'data', 'microsaas-principles.txt');
      this.microSaaSPrinciples = await fs.readFile(principlesPath, 'utf-8');
    }
  }

  private getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async generateIdea(): Promise<string> {
    await this.loadData();

    if (!this.paramData) {
      throw new Error('Parameter data not loaded');
    }

    const userTypeKeys = Object.keys(this.paramData.user_types);
    const problemKeys = Object.keys(this.paramData.problem_nature);

    const selectedUserTypeKey = this.getRandomElement(userTypeKeys);
    const selectedProblemKey = this.getRandomElement(problemKeys);

    const userTypeDescription = this.paramData.user_types[selectedUserTypeKey];
    const problemDescription = this.paramData.problem_nature[selectedProblemKey];

    const prompt = `You are a microSaaS idea generator. Your goal is to create focused, actionable, and specific microSaaS ideas based on the following principles:

${this.microSaaSPrinciples}

Generate a ONE-SENTENCE microSaaS idea that:
- Targets this user type: ${userTypeDescription}
- Solves this problem: ${problemDescription}
- Follows all the microSaaS principles above (single killer feature, high pain/low friction, clearly defined niche, immediate value)
- Is specific, actionable, and focused on solving ONE concrete problem
- Can be built by one person in a few weeks
- Provides immediate value within 30 seconds of first use

Format your response as a single concise sentence describing the microSaaS idea. Make it compelling and specific. Do not include any preamble or explanation - just the idea itself.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          {
            role: 'system',
            content: 'You are an expert microSaaS idea generator. You create focused, specific, and actionable startup ideas that solve real problems for niche audiences.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 150,
      });

      const generatedIdea = response.choices[0]?.message?.content?.trim();
      
      if (!generatedIdea) {
        throw new Error('No idea generated from OpenAI');
      }

      return generatedIdea;
    } catch (error) {
      console.error('Error generating idea with OpenAI:', error);
      throw new Error('Failed to generate idea with AI');
    }
  }
}

export const microSaaSIdeaGenerator = new MicroSaaSIdeaGenerator();
