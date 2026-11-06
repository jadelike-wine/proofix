/**
 * ProofFix core types — the shared vocabulary of the verification engine.
 */

/** Final verdict of a verification run. */
export type Verdict =
  /** The bug reproduces on the base and the fix passes the frozen oracle. */
  | 'VERIFIED'
  /** The fix does not pass the oracle, breaks the oracle, or causes regressions. */
  | 'FAILED'
  /** Evidence is insufficient (e.g. bug not reproducible on the base). */
  | 'INCONCLUSIVE'
  /** The verification itself could not run (environment, setup, git errors). */
  | 'ERROR'
  /** Evidence exists but a human must review (tamper signals, high risk files). */
  | 'NEEDS_REVIEW';

/** Confidence attached to a VERIFIED / FAILED verdict. */
export type EvidenceLevel = 'high' | 'medium' | 'low' | 'none';

/** Outcome of a single command execution inside a worktree. */
export interface CommandResult {
  /** Shell command as executed. */
  command: string;
  /** Process exit code; null when killed by timeout or failed to spawn. */
  exitCode: number | null;
  /** True when the run hit the configured timeout. */
  timedOut: boolean;
  /** Combined stdout tail (bounded). */
  stdout: string;
  /** Combined stderr tail (bounded). */
  stderr: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Why the command could not start, when applicable. */
  spawnError?: string;
}

/** Classification of one test run outcome. */
export type RunOutcome =
  /** Command exited 0 — acceptance criteria met. */
  | 'pass'
  /** Command exited non-zero — the oracle reports failure. */
  | 'fail'
  /** The command could not run for environmental reasons. */
  | 'error'
  /** The command exceeded its timeout. */
  | 'timeout';

export interface StageResult {
  outcome: RunOutcome;
  command: CommandResult;
  /** Human-readable explanation attached to the outcome. */
  note?: string;
}

/** One hashed file entry in the frozen oracle manifest. */
export interface OracleFileEntry {
  /** Repo-relative POSIX path. */
  path: string;
  /** SHA-256 hex digest of file contents. */
  sha256: string;
  /** File size in bytes. */
  bytes: number;
  /** Whether the file existed in the base revision. */
  presentInBase: boolean;
}

/** The frozen oracle: pinned test files + the acceptance command. */
export interface OracleManifest {
  /** Schema version for forward compatibility. */
  version: 1;
  /** ISO timestamp of when the oracle was frozen. */
  frozenAt: string;
  /** The acceptance test command that defines correctness. */
  testCommand: string;
  /** Optional setup command run before the test command in each worktree. */
  setupCommand?: string;
  /** Optional regression command run after acceptance. */
  regressionCommand?: string;
  /** Sorted list of hashed oracle files. */
  files: OracleFileEntry[];
  /** Combined digest over all file entries (order-independent input sorted). */
  digest: string;
}

/** Result of comparing the live oracle files against the manifest. */
export interface OracleCheck {
  intact: boolean;
  /** Files whose hash changed after freezing. */
  modified: string[];
  /** Files deleted after freezing. */
  removed: string[];
  /** New files matching the oracle globs that were not frozen. */
  added: string[];
}

/** Git environment snapshot for the report. */
export interface GitContext {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  baseSubject: string;
  headSubject: string;
  /** Files changed between base and head. */
  changedFiles: string[];
  /** `git diff base head` output, possibly truncated. */
  diff: string;
  diffTruncated: boolean;
}

/** Machine environment snapshot. */
export interface EnvInfo {
  platform: NodeJS.Platform;
  arch: string;
  node: string;
  git: string;
  cwd: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

/** Options accepted by {@link verify}. */
export interface VerifyOptions {
  /** Path to the target git repository. */
  repo: string;
  /** Git revision that contains the bug (default: HEAD~1 when head is HEAD). */
  base: string;
  /** Git revision that claims to fix the bug (default: HEAD). */
  head: string;
  /** Acceptance test command, run inside each isolated worktree. */
  test: string;
  /** Setup command run once per worktree before tests (e.g. `pnpm install`). */
  setup?: string;
  /** Regression command run on the head worktree after acceptance passes. */
  regression?: string;
  /**
   * Extra glob patterns (repo-relative) whose files become part of the frozen
   * oracle in addition to auto-detected test files.
   */
  freeze?: string[];
  /** Per-command timeout in milliseconds (default 10 min). */
  timeoutMs?: number;
  /** Directory that holds worktrees/reports (default `<repo>/.proofix`). */
  stateDir?: string;
  /** Keep worktrees after verification (default false → clean up). */
  keepWorktrees?: boolean;
  /**
   * Allow the candidate fix to modify frozen test files. When false (default)
   * test modifications flag the run as tampered.
   */
  allowTestChanges?: boolean;
  /**
   * Whether the negative control may copy oracle files into the base
   * worktree when the acceptance tests do not exist there (default true).
   */
  negativeControl?: boolean;
  /** Environment variable names allowed to leak into test subprocesses. */
  passEnv?: string[];
  /** Called with human-readable progress lines. */
  onProgress?: (line: string) => void;
}

/** The full machine-readable verification report. */
export interface ProofReport {
  schema: 'proofix.report/v1';
  tool: { name: 'proofix'; version: string };
  verdict: Verdict;
  evidence: EvidenceLevel;
  /** Ordered list of human-readable reasons supporting the verdict. */
  reasons: string[];
  env: EnvInfo;
  git: GitContext;
  oracle: {
    manifest: OracleManifest;
    /** Integrity check performed inside the head worktree after acceptance. */
    headCheck: OracleCheck | null;
    /** Files the fix changed that are part of the oracle. */
    oracleFilesChangedByFix: string[];
  };
  stages: {
    /** Base worktree running the frozen acceptance tests: expected `fail`. */
    red: StageResult | null;
    /** Head worktree running the frozen acceptance tests: expected `pass`. */
    green: StageResult | null;
    /** Negative control re-check. */
    control: (StageResult & { kind: 'baseline-rerun' | 'oracle-on-base' }) | null;
    /** Regression suite on the head worktree. */
    regression: StageResult | null;
  };
  /** Risk assessment of the changed surface (P2). */
  risk: import('./risk.js').RiskAssessment;
  /** The command line that can reproduce this run. */
  reproduce: string;
  /** Absolute paths of generated artifacts. */
  artifacts: { json: string; html: string; logDir: string };
}

/** Error thrown for unrecoverable environment / input problems. */
export class ProofixError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not-a-repo'
      | 'bad-revision'
      | 'dirty-repo'
      | 'worktree-failed'
      | 'setup-failed'
      | 'io'
      | 'invalid-input',
  ) {
    super(message);
    this.name = 'ProofixError';
  }
}
