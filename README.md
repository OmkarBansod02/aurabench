This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# aurabench

## Phase 1: PingAura connectivity spike

Run from the project root with Node.js 22.13 or newer:

```bash
npm ci
npm run spike:pingaura
```

Provide these variables in the ignored `.env.local` file or your shell environment
(shell values take precedence):

```dotenv
PINGAURA_MCP_URL=https://www.pingaura.ai/api/mcp
PINGAURA_API_KEY=your-api-key
```

The standalone [script](scripts/pingaura-spike.mts) uses the official
`@modelcontextprotocol/client` v2 SDK and Streamable HTTP. It authenticates with
`Authorization: Key ...`, discovers all tool pages, and prints each tool's name,
description and input schema. See the [SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk)
and [PingAura documentation](https://www.pingaura.ai/docs/mcp/mcp-server).

Only the exact documented read tool `list-domains` can be called, once with `{}`.
If it is unavailable, requires arguments, or has contradictory safety annotations,
the call is skipped. All other tools are ineligible, including unknown tools.
The script prints call status and latency, omits account response data, rejects
HTTP redirects, uses 20 second request timeouts, and closes the connection.
Failures exit nonzero without logging raw errors or credentials.

This spike requires no Next.js server. It adds no application routes or UI and
does not use the database or OpenAI variables.

```bash
npm run test:spike
npx tsc --noEmit
npm run lint
```

Verified on 2026-10-07: authenticated discovery returned **52 tools**; exactly one
`list-domains` call succeeded in **204.49 ms**. No mutation tool was called.
This satisfies Phase 1 / Gate 1.

## Phase 2: Read-only agent spike

Set `OPENAI_API_KEY` alongside the PingAura variables above. Optionally set
`OPENAI_MODEL` (defaults to `gpt-5`). Run:

```bash
npm run spike:agent
# Optional scenario override:
npm run spike:agent -- "Find my highest-priority site health problems."
npm run test:agent
```

The default scenario asks for the highest-priority site health problems and what
to fix first. The runner uses OpenAI Responses function calling over HTTPS with
native `fetch`, executes calls sequentially through `lib/mcp/gateway.mts`, and
returns results to the model. `MAX_AGENT_STEPS = 10` caps model requests, including
the final-answer turn. Exhausting the cap produces a failed run and retains the
trace. Model requests have a 60-second timeout; MCP requests use 20 seconds.

Tool schemas come from live MCP discovery. Exact reviewed read/write names in
`lib/mcp/guard.mts` come from PingAura's public tool documentation. Everything
else is unknown and blocked, even with a read-only annotation. Contradictory
annotations veto read permissions. Discovery currently returns 52 tools: 15 read,
15 write, and 22 unknown. Review undocumented tools before changing this policy.

The raw MCP client remains private to the connection module. The gateway checks
every requested name independently of the schemas exposed to the model. It
records sequence, arguments, status, result/error, start/completion times,
latency, blocked flag, and risk level. JSON/object argument checks happen locally;
PingAura handles schema-specific validation. Tool errors and denials go back to
the model. No mutation is executed.

The CLI prints the final answer, tool sequence, call and success/failure counts,
each call's latency, total agent-loop latency, and available aggregate token
usage. The total includes model calls and excludes connection/discovery. Traces
and conversation history remain in memory; OpenAI requests use `store: false`.
Full tool results are sent to OpenAI as part of the agent conversation. CLI output
redacts configured keys and the endpoint. No database, routes, UI, or eval/replay
features are added. The Phase 1 script remains unchanged and independent.

Verified live on 2026-10-07: the model selected `list-domains` (489.09 ms) and
`get-site-health-summary` (200.39 ms). Both succeeded, with zero failed or blocked
calls and no mutations. The run reached a final answer in 3 model turns,
36,795.79 ms, and 7,779 tokens. The account had no completed site audits, which
the answer reported rather than claiming observed audit issues.
