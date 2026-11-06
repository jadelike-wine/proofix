/**
 * Risk-aware review (P2): classify files changed by the fix into risk
 * categories and attach gate recommendations to the report.
 *
 * Design follows Anthropic's published practice — risk-scaled human
 * approval — but deliberately stays LLM-free: matching is path/pattern
 * based, deterministic, and auditable. High-risk fixes never get an
 * automatic merge blessing; they get evidence + a review checklist.
 */

export type RiskCategory =
  | 'authentication'
  | 'authorization'
  | 'payments'
  | 'database-migration'
  | 'sensitive-data'
  | 'ci-cd'
  | 'supply-chain'
  | 'crypto'
  | 'infrastructure';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskHit {
  category: RiskCategory;
  level: RiskLevel;
  /** Repo-relative file paths that triggered the category. */
  files: string[];
  /** Why these paths are risky (pattern description). */
  reason: string;
}

interface Rule {
  category: RiskCategory;
  level: RiskLevel;
  reason: string;
  /** Tested against the POSIX-relative lowercase path. */
  match: RegExp;
}

const RULES: Rule[] = [
  {
    category: 'authentication',
    level: 'high',
    reason: 'authentication / session / token code',
    match: /(^|\/)(auth|login|signin|session|oauth|sso|jwt|token|passwd|password|credential)s?[\/._-]|(^|\/)auth\//i,
  },
  {
    category: 'authorization',
    level: 'high',
    reason: 'permission / ACL / role checks',
    match: /(^|\/)(rbac|acl|permission|policy|role|authorize|access[-_]?control)s?[\/._-]/i,
  },
  {
    category: 'payments',
    level: 'high',
    reason: 'payment / billing / checkout code',
    match: /(^|\/)(payment|billing|checkout|stripe|paypal|invoice|subscription|order)s?[\/._-]/i,
  },
  {
    category: 'database-migration',
    level: 'high',
    reason: 'schema migration files',
    match: /(^|\/)(migrations?|migrate|schema\.(sql|prisma|ts|rs))\/|\.migration\.|(^|\/)migrations?\//i,
  },
  {
    category: 'sensitive-data',
    level: 'high',
    reason: 'secrets, keys, PII handling',
    match: /(^|\/|\.)(secret|secrets|\.env|env\.|private[-_]?key|\.pem$|\.key$|pii|personal[-_]?data|gdpr|ssn)/i,
  },
  {
    category: 'crypto',
    level: 'high',
    reason: 'cryptographic primitives / certificate handling',
    match: /(^|\/)(crypto|tls|ssl|certificate|cert|encrypt|decrypt|cipher|hash[-_]?password)s?[\/._-]/i,
  },
  {
    category: 'ci-cd',
    level: 'medium',
    reason: 'CI/CD pipeline configuration',
    match: /(^|\/)\.github\/workflows\/|(^|\/)\.gitlab-ci|(^|\/)jenkinsfile|(^|\/)\.circleci\/|(^|\/)azure-pipelines|(^|\/)\.travis\.yml|(^|\/)dockerfile|docker-compose/i,
  },
  {
    category: 'supply-chain',
    level: 'medium',
    reason: 'dependency manifests & lockfiles',
    match: /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pipfile\.lock|go\.mod|go\.sum|cargo\.toml|cargo\.lock|gemfile\.lock|composer\.(json|lock)|pom\.xml|build\.gradle)$/i,
  },
  {
    category: 'infrastructure',
    level: 'medium',
    reason: 'infra-as-code / deployment config',
    match: /(^|\/)(terraform|k8s|kubernetes|helm|ansible|cloudformation|pulumi)[\/._-]|\.tf$/i,
  },
];

export interface RiskAssessment {
  /** Highest level across hits; 'low' when nothing matched. */
  level: RiskLevel;
  hits: RiskHit[];
  /** Files that matched no rule. */
  unflagged: string[];
  /** Gate advice for the report. */
  gate: {
    /** True when the fix may be auto-approved by policy. */
    autoApprovable: boolean;
    /** Human-readable gate explanation. */
    summary: string;
    /** Checklist items for the human reviewer. */
    checklist: string[];
  };
}

/** Classify the changed file list into risk hits. Pure + deterministic. */
export function assessRisk(changedFiles: string[], diff?: string): RiskAssessment {
  const hits: RiskHit[] = [];
  const flagged = new Set<string>();

  for (const rule of RULES) {
    const files = changedFiles.filter((f) => rule.match.test(f) && !flagged.has(f));
    if (files.length > 0) {
      files.forEach((f) => flagged.add(f));
      hits.push({ category: rule.category, level: rule.level, files, reason: rule.reason });
    }
  }

  // Content-based escalation: new secrets/deps inside the diff body.
  if (diff) {
    const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    const suspicious = added.filter((l) => /(api[-_]?key|secret|password|private[-_]?key)\s*[:=]/i.test(l));
    if (suspicious.length > 0 && !hits.some((h) => h.category === 'sensitive-data')) {
      hits.push({
        category: 'sensitive-data',
        level: 'high',
        files: [],
        reason: `diff adds ${suspicious.length} line(s) that look like embedded credentials`,
      });
    }
  }

  const level: RiskLevel = hits.some((h) => h.level === 'high')
    ? 'high'
    : hits.some((h) => h.level === 'medium')
      ? 'medium'
      : 'low';

  const checklist: string[] = [];
  if (level === 'high') {
    checklist.push('manual security review required before merge');
    for (const h of hits.filter((h) => h.level === 'high')) {
      checklist.push(`${h.category}: verify ${h.files.length > 0 ? h.files.join(', ') : 'flagged diff lines'} — ${h.reason}`);
    }
  } else if (level === 'medium') {
    checklist.push('review recommended: deployment or dependency surface changed');
    for (const h of hits) checklist.push(`${h.category}: ${h.reason}`);
  }

  return {
    level,
    hits,
    unflagged: changedFiles.filter((f) => !flagged.has(f)),
    gate: {
      autoApprovable: level === 'low',
      summary:
        level === 'high'
          ? `HIGH RISK — this fix touches ${hits.map((h) => h.category).join(', ')}. Proof evidence is attached, but merge/deploy requires human review; do not auto-approve.`
          : level === 'medium'
            ? 'MEDIUM RISK — the fix touches deployment/dependency surfaces. Review recommended before merge.'
            : 'low risk — no sensitive surfaces detected.',
      checklist,
    },
  };
}
