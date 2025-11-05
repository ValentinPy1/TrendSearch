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

  private stripQuotes(text: string): string {
    return text.replace(/^["']|["']$/g, '').trim();
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

    const prompt = `Generate a microSaaS idea using EXACTLY 5 to 8 words. Never use fewer than 5 words or more than 8 words.

User type: ${userTypeDescription}
Problem: ${problemDescription}

MicroSaaS principles:
${this.microSaaSPrinciples}

STRICT Requirements:
- EXACTLY 5 to 8 words
- One specific tool/solution
- Clear target audience included
- No articles unless necessary for clarity

Valid examples (word count shown):
- AI expense tracker for freelancers
- Automated scheduling tool for fitness trainers
- Content calendar and planner for creators
- Storytelling coach for international students

Your idea (exactly 5-8 words):`;

    try {
      console.log('[MicroSaaS Generator] Calling OpenAI API...');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
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
        max_tokens: 50,
        temperature: 0.9,
      });

      let generatedIdea = response.choices[0]?.message?.content?.trim();
      
      if (!generatedIdea) {
        console.error('[MicroSaaS Generator] No idea in response');
        throw new Error('No idea generated from OpenAI');
      }

      // Remove quotes from the generated idea
      generatedIdea = this.stripQuotes(generatedIdea);

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

  async generateLongerIdea(): Promise<string> {
    console.log('[MicroSaaS Generator] Starting longer idea generation...');
    
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

    const prompt = `Generate a detailed microSaaS idea description using 15 to 25 words. The idea should be cohesive, well-structured, and provide a clear description of what the product does and who it serves.

User type: ${userTypeDescription}
Problem: ${problemDescription}

MicroSaaS principles:
${this.microSaaSPrinciples}

Requirements:
- 15 to 25 words
- Cohesive and well-structured description
- Clearly describes what the product does
- Includes the target audience
- Flows naturally as a single sentence or short paragraph
- Focus on the core value proposition

Example format:
"A comprehensive AI-powered expense tracking and invoicing platform designed specifically for freelancers and independent contractors who struggle with managing multiple clients and need automated financial organization."

Your idea (15-25 words):`;

    try {
      console.log('[MicroSaaS Generator] Calling OpenAI API for longer idea...');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a microSaaS idea generator. Generate detailed, cohesive idea descriptions that are 15-25 words long. Focus on clarity and value proposition.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.8,
      });

      let generatedIdea = response.choices[0]?.message?.content?.trim();
      
      if (!generatedIdea) {
        console.error('[MicroSaaS Generator] No idea in response');
        throw new Error('No idea generated from OpenAI');
      }

      // Remove quotes from the generated idea
      generatedIdea = this.stripQuotes(generatedIdea);

      console.log('[MicroSaaS Generator] Successfully generated longer idea:', generatedIdea.substring(0, 100));
      return generatedIdea;
    } catch (error) {
      console.error('[MicroSaaS Generator] Error generating longer idea with OpenAI:', error);
      if (error instanceof Error) {
        console.error('[MicroSaaS Generator] Error message:', error.message);
        console.error('[MicroSaaS Generator] Error stack:', error.stack);
      }
      throw new Error('Failed to generate longer idea with AI: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

export const microSaaSIdeaGenerator = new MicroSaaSIdeaGenerator();
