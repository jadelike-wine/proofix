import { describe, it, expect } from 'vitest';
import { assessRisk } from '../src/risk.js';

describe('assessRisk', () => {
  it('flags auth code as high risk → not auto-approvable', () => {
    const r = assessRisk(['src/auth/login.ts']);
    expect(r.level).toBe('high');
    expect(r.gate.autoApprovable).toBe(false);
    expect(r.hits[0].category).toBe('authentication');
  });

  it('flags migrations and payments', () => {
    const r = assessRisk(['db/migrations/004_init.sql', 'src/billing/stripe.ts']);
    expect(r.level).toBe('high');
    const cats = r.hits.map((h) => h.category);
    expect(cats).toContain('database-migration');
    expect(cats).toContain('payments');
  });

  it('flags CI and lockfiles as medium', () => {
    const r = assessRisk(['.github/workflows/ci.yml', 'pnpm-lock.yaml']);
    expect(r.level).toBe('medium');
    expect(r.gate.autoApprovable).toBe(false);
  });

  it('leaves ordinary code low risk', () => {
    const r = assessRisk(['src/cart/calc.ts', 'README.md']);
    expect(r.level).toBe('low');
    expect(r.gate.autoApprovable).toBe(true);
    expect(r.unflagged).toEqual(['src/cart/calc.ts', 'README.md']);
  });

  it('escalates on credentials added inside the diff', () => {
    const diff = '+const API_KEY = "sk-abc123";\n context';
    const r = assessRisk(['src/x.ts'], diff);
    expect(r.hits.some((h) => h.category === 'sensitive-data')).toBe(true);
  });
});
