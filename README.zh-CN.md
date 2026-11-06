# ProofFix

[![ci](https://github.com/jadelike-wine/proofix/actions/workflows/ci.yml/badge.svg)](https://github.com/jadelike-wine/proofix/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**AI 说修好了，不代表真的修好了。ProofFix 帮你验证。**

ProofFix 是一个开源、本地运行的编码 Agent 验证工具。当 AI 声称“Bug 已修复”时，ProofFix 用**可复现的执行证据**来确认：

- 在**隔离的 git worktree** 中检出 buggy 基线与候选修复版本；
- 把验收测试冻结成 **SHA-256 预言机（oracle）**，防止修复通过改/删/跳过测试来冒充成功；
- 要求 **基线 RED → 修复 GREEN**，再执行**负向对照**与可选**回归测试**；
- 生成机器可读 JSON 与本地可打开的 HTML **Proof Report**。

不需要 API Key，不依赖云端。判定只来自真实测试执行，而不是再问一次模型。

## 快速开始

**现在即可安装（已端到端验证）：**

```bash
npm i -g https://github.com/jadelike-wine/proofix/releases/download/v0.1.0/proofix-cli-0.1.0.tgz
proofix demo
```

从源码安装：

```bash
git clone https://github.com/jadelike-wine/proofix
cd proofix && pnpm install && pnpm build
node packages/cli/dist/bin.js demo
```

一旦 npm 正式发布，即可使用 `npm i -g @proofix/cli`。

```bash
proofix demo                  # 自带 buggy→fixed 示例，完整跑通验证

cd your-repo
proofix init                  # 生成 .proofix.yml
proofix verify \
  --base HEAD~1 \             # 含 Bug 的基线版本
  --head HEAD \               # 声称已修复的版本
  --test "node test/cart.test.js" \
  --regression "pnpm test"    # 可选：更广的回归测试
```

打开报告：`proofix report --open`。

## 判定结果

| 判定 | 含义 |
|---|---|
| `VERIFIED` | 基线失败、修复通过、负向对照成立 |
| `FAILED` | 修复未通过验收、预言机被篡改或引入回归 |
| `INCONCLUSIVE` | Bug 无法复现 / 测试不稳定或无效 —— 诚实的“无法证明” |
| `ERROR` | 环境或依赖故障 —— 绝不算作修复成功 |
| `NEEDS_REVIEW` | 有证据但修复改动了验收测试本身 —— 需要人工复核 |

当负向对照或回归不可用时，置信等级（`evidence: high|medium|low`）自动降级。

## 安全

- 测试命令只在 `.proofix/worktrees` 的隔离 worktree 中运行，绝不修改你的工作区；
- 子进程环境默认剔除 `*TOKEN*`/`*SECRET*`/`*KEY*`/`*PASSWORD*` 类变量；
- 所有命令有超时；不推送远端、不改全局 git 配置、不上传任何内容；
- 验证不可信仓库时，请在容器/虚拟机中运行 ProofFix 本体，详见 [SECURITY.md](SECURITY.md)。

## DeepSeek Harness 插件

`packages/dsh-plugin` 是原生 Cordis 插件，向会话暴露 `proofix_verify`、`proofix_report` 工具。提出修复的 Agent 只能*请求*验证，无法左右结论——冻结预言机由独立引擎评估。

```bash
dsh plugin add @proofix/dsh-plugin
```

已在 `@deepseek-ai/cordis ^4` / DSH `0.1.2-rc.1` 上验证（API 仍为 rc，建议锁版本）。

## License

MIT — 见 [LICENSE](LICENSE)。English docs: [README.md](README.md)
