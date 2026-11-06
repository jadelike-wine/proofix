/**
 * Plugin contract test: verify the module exports the Cordis plugin surface
 * and that apply() registers the expected tools against a mock context.
 * This is a smoke test of the plugin wiring — the engine itself is covered
 * by packages/core integration tests.
 */
import { describe, it, expect } from 'vitest';
import { name, inject, apply, Config } from '../src/index.js';

describe('dsh-plugin contract', () => {
  it('exports cordis plugin surface', () => {
    expect(name).toBe('proofix');
    expect(inject).toEqual(['tools', 'systemPrompt']);
    expect(typeof apply).toBe('function');
    expect(Config).toBeDefined();
  });

  it('registers proofix_verify and proofix_report tools', () => {
    const registered: string[] = [];
    const sections: string[] = [];
    const ctx = {
      tools: {
        register: (def: { name: string }) => {
          registered.push(def.name);
        },
      },
      systemPrompt: {
        section: (s: { name: string }) => {
          sections.push(s.name);
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply(ctx as any, Config.parse ? Config.parse({}) : ({} as never));
    expect(registered).toContain('proofix_verify');
    expect(registered).toContain('proofix_report');
    expect(sections).toContain('tool:proofix');
  });
});
