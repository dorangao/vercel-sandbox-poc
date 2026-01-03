# Vercel Sandbox POC

A Next.js + TypeScript proof-of-concept that uses the Vercel AI SDK to generate
JavaScript and executes it safely inside a Vercel Sandbox microVM.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Connect the project to Vercel (for Sandbox credentials):

```bash
vercel link
vercel env pull
```

3. Provide an AI Gateway key:

```bash
echo "AI_GATEWAY_API_KEY=your_key" >> .env.local
```

## Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Try the API

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"prompt":"Get the top Hacker News story title and URL"}' \
  http://localhost:3000/api/agent
```

## Notes

- The sandbox uses the `VERCEL_OIDC_TOKEN` pulled by `vercel env pull`.
- Each request creates a short-lived microVM. Files and processes are wiped after execution.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
