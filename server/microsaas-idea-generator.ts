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
    console.log('[MicroSaaS Generator] Starting idea generation...');
    
    try {
      await this.loadData();
    } catch (error) {
      console.error('[MicroSaaS Generator] Failed to load data:', error);
      throw new Error('Failed to load parameter data');
    }

    if (!this.paramData) {
      throw new Error('Parameter data not loaded');
    }

    const userTypeKeys = Object.keys(this.paramData.user_types);
    const problemKeys = Object.keys(this.paramData.problem_nature);

    const selectedUserTypeKey = this.getRandomElement(userTypeKeys);
    const selectedProblemKey = this.getRandomElement(problemKeys);

    const userTypeDescription = this.paramData.user_types[selectedUserTypeKey];
    const problemDescription = this.paramData.problem_nature[selectedProblemKey];
    
    console.log('[MicroSaaS Generator] Selected user type:', selectedUserTypeKey);
    console.log('[MicroSaaS Generator] Selected problem:', selectedProblemKey);

    const prompt = `Generate an EXTREMELY CONCISE microSaaS idea (5-8 words maximum).

User type: ${userTypeDescription}
Problem: ${problemDescription}

MicroSaaS principles:
${this.microSaaSPrinciples}

Requirements:
- MAXIMUM 5-8 words total
- One specific tool/solution
- Clear target audience
- No fluff or explanations

Example format: "AI expense tracker for freelancers" or "Automated scheduling for trainers"

Your idea (5-8 words only):`;

    try {
      console.log('[MicroSaaS Generator] Calling OpenAI API...');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          {
            role: 'system',
            content: 'You are a microSaaS idea generator. Generate ONLY 5-8 word ideas. Be extremely concise.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 50,
      });

      const generatedIdea = response.choices[0]?.message?.content?.trim();
      
      if (!generatedIdea) {
        console.error('[MicroSaaS Generator] No idea in response');
        throw new Error('No idea generated from OpenAI');
      }

      console.log('[MicroSaaS Generator] Successfully generated idea:', generatedIdea.substring(0, 100));
      return generatedIdea;
    } catch (error) {
      console.error('[MicroSaaS Generator] Error generating idea with OpenAI:', error);
      if (error instanceof Error) {
        console.error('[MicroSaaS Generator] Error message:', error.message);
        console.error('[MicroSaaS Generator] Error stack:', error.stack);
      }
      throw new Error('Failed to generate idea with AI: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

export const microSaaSIdeaGenerator = new MicroSaaSIdeaGenerator();
