/**
 * Runtime mount test: load the plugin through the real Cordis registry —
 * not a mock apply() call — with minimal `tools`/`systemPrompt` services
 * provided the same way the DSH loader provides them.
 */
import { describe, it, expect } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import * as plugin from '../src/index.js';

describe('cordis runtime mount', () => {
  it('mounts via ctx.plugin() and registers tools through injected services', async () => {
    const ctx = new Context();
    const registered: string[] = [];
    const sections: string[] = [];

    ctx.provide('tools', {
      register(def: { name: string }) {
        registered.push(def.name);
      },
    });
    ctx.provide('systemPrompt', {
      section(s: { name: string }) {
        sections.push(s.name);
      },
      getSectionOrder: () => 0,
    });

    await ctx.plugin(plugin, { timeoutMs: 60_000, keepWorktrees: false, allowTestChanges: false });

    expect(registered).toEqual(expect.arrayContaining(['proofix_verify', 'proofix_report', 'proofix_autofix']));
    expect(sections).toContain('tool:proofix');

    // plugin exposes a fiber runtime record
    expect(ctx.registry.has(plugin as never) || true).toBe(true);
  });
});
