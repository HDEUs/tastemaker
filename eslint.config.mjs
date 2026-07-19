// source: HDEUs/fittracker eslint.config.mjs, exported 2026-07
// status: verbatim copy op één punt na — het projectspecifieke ignore van
// "supabase/**" (Deno Edge Functions) is gemarkeerd als optioneel.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Optioneel per project: runtimes met eigen toolchain uitsluiten,
    // bijv. Supabase Edge Functions (Deno):
    // "supabase/**",
  ]),
  // AI slop rules — catches common AI-generated code problems.
  // These are the BLOCKING, deterministic guardrail (zero false positives,
  // unlike regex-based AI analysis which runs advisory-only).
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/scripts/**"],
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],

      // AI001: No placeholder code — TODO/FIXME/HACK in production = slop.
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme", "hack", "xxx"], location: "anywhere" },
      ],

      // AI004: No dead code — unused imports/variables block the commit.
      // `_`-prefixed args/vars are intentional opt-outs.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // AI001 / AI008: No placeholder throws + no string-interpolated SQL.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ThrowStatement > NewExpression[callee.name='Error'][arguments.0.value=/^(TODO|FIXME|not implemented|placeholder|implement this)/i]",
          message:
            "AI001: No placeholder throws in production code. Implement the actual logic.",
        },
        {
          selector: "NewExpression[callee.name='NotImplementedError']",
          message:
            "AI001: NotImplementedError is a placeholder pattern. Implement the actual logic.",
        },
        {
          // AI008: interpolated template literal passed to a raw SQL executor
          // (.sql()/.query()/.raw()/.unsafe()/.execute()). Tagged templates
          // (sql`...`) are the SAFE parameterized form and are NOT matched.
          selector:
            "CallExpression[callee.property.name=/^(sql|query|raw|unsafe|execute)$/i] TemplateLiteral[expressions.length>0]",
          message:
            "AI008: No string-interpolated SQL. Use parameterized queries / query builders, never build SQL from interpolated values.",
        },
      ],

      // AI004: No leftover console.log — server-side default is `warn` when a
      // project logs to console intentionally (e.g. serverless function logs).
      // The client/UI override block below makes it an error where a
      // console.log IS slop.
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  // Client/UI code — a console.log here is a forgotten debug log, not
  // observability. Block it. (Later block wins for matching files.)
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/lib/hooks/**/*.{ts,tsx}",
    ],
    rules: {
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
]);

export default eslintConfig;
