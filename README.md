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
This satisfies Phase 1 / Gate 1; later phases are not implemented.
