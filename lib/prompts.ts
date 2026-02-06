import { readFileSync } from 'fs';
import { join } from 'path';

const promptCache = new Map<string, string>();

export function loadPrompt(name: string): string {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  const promptPath = join(process.cwd(), 'prompts', `${name}.txt`);
  const content = readFileSync(promptPath, 'utf-8');
  
  promptCache.set(name, content);
  return content;
}

export function createUserPrompt(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (prompt, [key, value]) => prompt.replace(`{{${key}}}`, value),
    template
  );
}
