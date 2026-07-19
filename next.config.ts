import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The analysis system prompt is a versioned md file read at runtime
  // (src/lib/claude.ts); trace it into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/telegram": ["./docs/prompts/analysis-system-prompt.md"],
  },
};

export default nextConfig;
