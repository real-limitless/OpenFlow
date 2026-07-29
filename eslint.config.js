import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const serverOnlyPath = {
  name: "server-only",
  message:
    "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    files: [
      "src/lib/workflow/**",
      "src/lib/nodes/**",
      "src/lib/expressions/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            serverOnlyPath,
            {
              name: "react",
              message:
                "Engine code must not import React. Move React dependencies to src/components.",
            },
            {
              name: "react-dom",
              message:
                "Engine code must not import ReactDOM. Move React dependencies to src/components.",
            },
            {
              name: "react-dom/client",
              message:
                "Engine code must not import ReactDOM. Move React dependencies to src/components.",
            },
            {
              name: "react-dom/server",
              message:
                "Engine code must not import ReactDOM. Move React dependencies to src/components.",
            },
          ],
          patterns: [
            {
              group: ["react-dom/*"],
              message:
                "Engine code must not import ReactDOM. Move React dependencies to src/components.",
            },
            {
              group: ["@tanstack/*"],
              message: "Engine code must not import TanStack React packages.",
            },
            {
              group: ["vite", "vite/*"],
              message: "Engine code must not import Vite.",
            },
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "Engine code must not import Prisma. Access the database through src/server.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            serverOnlyPath,
            {
              name: "react",
              message: "Server code must not import React.",
            },
            {
              name: "react-dom",
              message: "Server code must not import ReactDOM.",
            },
            {
              name: "react-dom/client",
              message: "Server code must not import ReactDOM.",
            },
            {
              name: "react-dom/server",
              message: "Server code must not import ReactDOM.",
            },
          ],
          patterns: [
            {
              group: ["react-dom/*"],
              message: "Server code must not import ReactDOM.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnlyPath],
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "UI code must not import Prisma. Access the database through src/server.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/storage/**", "src/lib/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnlyPath],
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "Lib code must not import Prisma. Access the database through src/server.",
            },
          ],
        },
      ],
    },
  },
);
