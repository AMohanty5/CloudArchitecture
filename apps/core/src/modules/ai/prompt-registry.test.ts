import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getPrompt, loadPromptRegistry } from './prompt-registry';

const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../ai/prompts');

describe('loadPromptRegistry', () => {
  const registry = loadPromptRegistry(promptsDir);

  it('indexes the five generation-pipeline agents (doc 17)', () => {
    expect([...registry.byId.keys()].sort()).toEqual(['composer', 'critic', 'planner', 'repair', 'requirements']);
  });

  it('parses required fields and assigns model tiers', () => {
    expect(getPrompt(registry, 'composer').modelTier).toBe('frontier');
    expect(getPrompt(registry, 'requirements').modelTier).toBe('mid');
    expect(getPrompt(registry, 'composer').outputContract).toBe('caml_fragment');
    expect(getPrompt(registry, 'composer').system.length).toBeGreaterThan(0);
  });

  it('throws for an unregistered prompt id', () => {
    expect(() => getPrompt(registry, 'nonexistent')).toThrow();
  });
});
