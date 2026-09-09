import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import manifest from "@/package.json";

test("Better Auth patches target the installed dependency versions", () => {
  for (const name of [
    "@better-auth/core",
    "@better-auth/oauth-provider",
  ] as const) {
    const version = manifest.dependencies[name];
    const key = `${name}@${version}`;
    expect(Object.keys(manifest.patchedDependencies)).toContain(key);
    const installed = JSON.parse(
      readFileSync(require.resolve(`${name}/package.json`), "utf8"),
    );
    expect(installed.version).toBe(version);
  }
});

test("installed core prefers the Workers global async storage", () => {
  const source = readFileSync(
    require.resolve("@better-auth/core/async_hooks"),
    "utf8",
  );
  expect(source).toContain(
    "const globalAsyncLocalStorage = globalThis.AsyncLocalStorage;",
  );
  expect(source).toContain(
    "globalAsyncLocalStorage ? Promise.resolve(globalAsyncLocalStorage) : import(",
  );
});

test("Drizzle adapter construction does not access a request-scoped database", () => {
  const database = new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `Database accessed outside a request: ${String(property)}`,
        );
      },
    },
  );
  expect(() => drizzleAdapter(database, { provider: "pg" })).not.toThrow();
  const version = manifest.dependencies["better-auth"];
  expect(Object.keys(manifest.patchedDependencies)).toContain(
    `@better-auth/drizzle-adapter@${version}`,
  );
});

test("installed OAuth provider defers resource writes until a request", () => {
  const directory = dirname(require.resolve("@better-auth/oauth-provider"));
  const filename = readdirSync(directory).find(
    (name) => name.startsWith("authorize-") && name.endsWith(".mjs"),
  );
  expect(filename).toBeDefined();
  const source = readFileSync(join(directory, filename!), "utf8");
  expect(source).not.toContain("await seedResources(ctx, opts);");
  expect(source).toContain(
    "const isAllowedWebHttpLoopback = isHttp && isRedirectLoopback;",
  );
  expect(source).toContain('url.hostname === "anysphere.cursor-mcp"');
});
