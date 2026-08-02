---
type: '@n8n/n8n-nodes-langchain.toolCalculator'
displayName: Calculator
category: AI
versions: [1]
priority: medium
status: specced
---

# Calculator

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolcalculator.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://langchain-ai.github.io/langgraphjs/how-tos/tool-calling/ | Public docs only (tool-calling contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolCalculator`
- **Aliases:** (none)
- **Inputs:** (none — invoked by the connected AI agent at tool-calling time)
- **Outputs:** `ai_tool` × 1
- **Credentials:** (none)

This is a LangChain **tool sub-node**. It connects to an AI agent root node through a single `ai_tool` output and is exposed to the model as a callable tool. It receives no independent `main` data input and performs no external I/O.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `description` | string | — | no | Free-text guidance telling the model when to invoke the tool (e.g. that it performs mathematical calculations on an expression string) |

The node's functional contract is fixed: given a mathematical expression string, it returns the numeric result. Configuration is intentionally minimal — at most a `description` used to steer the model's tool selection. The exact default description is not part of the documented contract and is intentionally not reproduced.

## Runtime behavior

### Input

The node has no `main` input connection. The connected agent invokes it during tool-calling, passing a single **expression string** as the tool argument. Expressions in the node's own parameters resolve against the **first item only** of the calling context (standard sub-node semantics); they do not iterate per-item.

### Invocation

When the model calls the tool, the node parses the supplied expression and evaluates it as a mathematical calculation. The expression supports the usual arithmetic operators (add, subtract, multiply, divide, exponentiation) and grouping via parentheses, with standard operator precedence. The node is deterministic and has no external dependencies: the result is computed locally.

### Output

The tool's response to the agent is the numeric result of evaluating the expression. No additional data structures are added to the workflow output — the agent receives the computed value and uses it to compose its answer.

### Errors

If the expression cannot be parsed or evaluated (e.g. malformed syntax, unbalanced parentheses, or an unsupported operation), the tool reports the failure rather than returning a fabricated result. Standard `continueOnFail` behavior applies: when set, the failure is handed to the agent as an error payload instead of aborting the run.

### Expressions

The `description` parameter accepts n8n expression strings.

## Acceptance tests

### Test: basic arithmetic

**Given** a connected AI agent with the Calculator tool available and the model invokes it with the expression `"2 + 3 * 4"`:

**Expect** the tool returns the numeric result `14`, and the agent composes its answer using that value. (Functional outcome: the tool evaluates the expression with standard precedence rather than left-to-right.)

### Test: parentheses and exponentiation

**Given** the model invokes the tool with `"(2 + 3) * 4"` and separately with `"2^10"`:

**Expect** results of `20` and `1024` respectively, demonstrating grouping and exponent support.

### Test: deterministic, no side effects

**Given** the same expression is passed twice in the same run:

**Expect** identical results on both calls, and no external service is contacted, no data persisted, and no workflow data mutated.

### Test: invalid expression

**Given** the model invokes the tool with a malformed expression such as `"2 +"`:

**Expect** the tool does not return a number; it reports a parse/evaluation failure. With `continueOnFail` enabled the error payload is delivered to the agent rather than aborting the workflow.

### Test: multi-item expression resolution

**Given** multiple input items flow through the calling agent and the tool's `description` references `$json`:

**Expect** the expression resolves against the first item only (sub-node semantics), not per item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose | documented | Public docs: "allows an agent to run mathematical calculations" |
| Wire format (tool sub-node, `ai_tool` output) | documented | Public tool-sub-node docs describe the `ai_tool` connection; type string `@n8n/n8n-nodes-langchain.toolCalculator` confirmed from package descriptor |
| Expression input + numeric result | inferred | Public docs state the purpose but not the argument/response envelope; the expression→result contract follows the documented purpose and standard tool-calling mechanics |
| Supported operators / precedence | inferred | Standard arithmetic (incl. exponentiation, parentheses) is implied by "mathematical calculations"; exact grammar intentionally not reverse-engineered |
| `description` parameter | inferred | Standard tool-sub-node contract (name + description); exact defaults intentionally not reproduced |
| Sub-node first-item expression semantics | documented | Public sub-node hint box confirms expressions resolve against the first item only |
| Error behavior | inferred | No public statement; failure-on-unparseable-expression is the only behavior consistent with a deterministic calculator |
| Versions [1] | inferred from corpus | Package descriptor lists a single `v1`; public docs are not version-specific |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/toolCalculator.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
