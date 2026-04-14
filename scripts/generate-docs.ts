#!/usr/bin/env bun
/**
 * Generate MDX documentation for each Mymir MCP tool.
 *
 * Imports the tool registration functions with a mock MCP server that
 * captures { name, description, inputSchema } without hitting the database.
 * Walks Zod schemas via ._def introspection and emits one .mdx per tool
 * plus a meta.json index.
 *
 * Usage: bun scripts/generate-docs.ts [output-dir]
 * Default output: ../mymir-docs/content/docs/mcp/tools/
 */

import { z, type ZodType } from "zod/v4";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolRegistration {
  name: string;
  description: string;
  schema: z.ZodObject<Record<string, ZodType>>;
}

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// Mock MCP server — captures registrations, never calls handlers
// ---------------------------------------------------------------------------

const registrations: ToolRegistration[] = [];

const mockServer = {
  registerTool(
    name: string,
    opts: { description: string; inputSchema: ZodType; annotations?: unknown },
    _handler: unknown,
  ) {
    registrations.push({
      name,
      description: opts.description,
      schema: opts.inputSchema as z.ZodObject<Record<string, ZodType>>,
    });
  },
};

// ---------------------------------------------------------------------------
// Import tool registration functions via the barrel export
// ---------------------------------------------------------------------------

// Bun resolves TS imports natively. The tool files import from @/lib/ai/tool-handlers
// but the mock server never invokes handlers, so those imports only run at module level.
// We need to stub the handler imports to avoid database connections at import time.
// Approach: register each tool by calling its exported function with our mock.

// Import the single source of truth — registerAllTools from the HTTP MCP server.
// The mock server captures registrations without hitting the database.

const { registerAllTools } = await import("../lib/mcp/create-server");

registerAllTools(mockServer as never);

// ---------------------------------------------------------------------------
// Zod introspection helpers (Zod v4 internal layout)
// ---------------------------------------------------------------------------

/**
 * Get the _def object from a Zod v4 schema.
 * @param schema - Any Zod schema.
 * @returns The internal definition object.
 */
function getDef(schema: ZodType): Record<string, unknown> | undefined {
  return (schema as unknown as { _def?: Record<string, unknown> })._def;
}

/**
 * Extract the base Zod type name from a potentially wrapped schema.
 * Unwraps optional, default, nullable to find the core type.
 * In Zod v4, _def.type is the discriminator (not _def.typeName).
 * @param schema - Any Zod schema.
 * @returns Human-readable type string.
 */
function zodTypeString(schema: ZodType): string {
  const def = getDef(schema);
  if (!def) return "unknown";

  const defType = def.type as string | undefined;

  if (defType === "optional" || defType === "default" || defType === "nullable") {
    const inner = def.innerType as ZodType | undefined;
    if (inner) return zodTypeString(inner);
  }

  if (defType === "enum") {
    const entries = def.entries as Record<string, string> | undefined;
    if (entries) {
      return Object.values(entries).sort().map((v: string) => `"${v}"`).join(" \\| ");
    }
  }

  if (defType === "array") {
    const element = def.element as ZodType | undefined;
    return element ? `${zodTypeString(element)}[]` : "array";
  }

  if (defType === "literal") {
    return JSON.stringify(def.value);
  }

  const map: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    object: "object",
  };
  return map[defType ?? ""] ?? defType ?? "unknown";
}

/**
 * Extract field info from a Zod object schema.
 * @param schema - A ZodObject schema.
 * @returns Alphabetically sorted field descriptors.
 */
function extractFields(schema: z.ZodObject<Record<string, ZodType>>): FieldInfo[] {
  const shape = schema.shape as Record<string, ZodType>;
  const fields: FieldInfo[] = [];

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const isOptional = fieldSchema.isOptional();
    const description = extractDescription(fieldSchema);
    fields.push({
      name,
      type: zodTypeString(fieldSchema),
      required: !isOptional,
      description,
    });
  }

  return fields.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract description from a Zod schema, unwrapping wrappers.
 * @param schema - Any Zod schema.
 * @returns Description string or empty.
 */
function extractDescription(schema: ZodType): string {
  const desc = schema.description;
  if (desc) return desc;

  const def = getDef(schema);
  if (!def) return "";

  const defType = def.type as string | undefined;
  if (defType === "optional" || defType === "default" || defType === "nullable") {
    const inner = def.innerType as ZodType | undefined;
    if (inner) return extractDescription(inner);
  }
  return "";
}

/**
 * Unwrap optional/default/nullable wrappers to get the core Zod def.
 * @param schema - Any Zod schema.
 * @returns The innermost non-wrapper _def.
 */
function unwrapDef(schema: ZodType): Record<string, unknown> | undefined {
  const def = getDef(schema);
  if (!def) return undefined;
  const t = def.type as string | undefined;
  if (t === "optional" || t === "default" || t === "nullable") {
    const inner = def.innerType as ZodType | undefined;
    if (inner) return unwrapDef(inner);
  }
  return def;
}

/**
 * Find the discriminator enum field in a tool schema.
 * Checks "action", "type", then "depth" (mymir_context uses depth).
 * @param schema - Tool's ZodObject schema.
 * @returns [fieldName, enumValues] or [null, []] if not found.
 */
function findDiscriminator(schema: z.ZodObject<Record<string, ZodType>>): [string | null, string[]] {
  const shape = schema.shape as Record<string, ZodType>;
  for (const candidate of ["action", "type", "depth"]) {
    const field = shape[candidate];
    if (!field) continue;
    const def = unwrapDef(field);
    if (!def || def.type !== "enum") continue;
    const entries = def.entries as Record<string, string> | undefined;
    if (entries) return [candidate, Object.values(entries).sort()];
  }
  return [null, []];
}

/**
 * Get the action enum values from a tool's schema.
 * @param schema - Tool's ZodObject schema.
 * @returns Sorted action/type/depth enum values, or empty array.
 */
function getActionValues(schema: z.ZodObject<Record<string, ZodType>>): string[] {
  return findDiscriminator(schema)[1];
}

/**
 * Get the name of the action/type/depth discriminator field.
 * @param schema - Tool's ZodObject schema.
 * @returns Field name or "action" as fallback.
 */
function getActionFieldName(schema: z.ZodObject<Record<string, ZodType>>): string {
  return findDiscriminator(schema)[0] ?? "action";
}

// ---------------------------------------------------------------------------
// MDX generation
// ---------------------------------------------------------------------------

/**
 * Build a usage hint callout based on tool annotations/description.
 * @param reg - Tool registration data.
 * @returns Callout MDX string.
 */
function buildCallout(reg: ToolRegistration): string {
  const name = reg.name.replace("mymir_", "");
  const hints: Record<string, string> = {
    project: "Use this tool at session start to list and select a project, or to create and update projects.",
    task: "Use this tool to create work items, update their status through the lifecycle, or manage task ordering.",
    edge: "Use this tool to define dependencies between tasks. Edges drive ready/blocked analysis and context propagation.",
    query: "Use this tool to search, browse, and inspect project data without making changes.",
    context: "Use this tool before reasoning about or implementing a task. Always fetch context first.",
    analyze: "Use this tool to find actionable work: what's ready, what's blocked, and where the bottleneck is.",
  };
  return hints[name] ?? `Use this tool to work with ${name} data.`;
}

/**
 * Build an example JSON payload for a given action.
 * @param reg - Tool registration.
 * @param action - The action/type value.
 * @returns JSON string.
 */
function buildExample(reg: ToolRegistration, action: string): string {
  const fieldName = getActionFieldName(reg.schema);
  const shape = reg.schema.shape as Record<string, ZodType>;
  const example: Record<string, unknown> = { [fieldName]: action };

  for (const [name, fieldSchema] of Object.entries(shape)) {
    if (name === fieldName) continue;
    if (fieldSchema.isOptional()) continue;
    const type = zodTypeString(fieldSchema);
    if (type === "string") example[name] = `<${name}>`;
  }

  return JSON.stringify(example, null, 2);
}

/**
 * Determine which fields are relevant for a specific action.
 * Returns all fields; the action field itself is always included.
 * @param fields - All extracted fields.
 * @param action - The action value.
 * @param description - Tool description text for heuristics.
 * @returns Filtered fields relevant to this action.
 */
function fieldsForAction(fields: FieldInfo[], action: string, description: string): FieldInfo[] {
  // Include all fields — the user needs to see what's available per action.
  // We could filter by description mentions but that's fragile.
  // Instead, keep all and let the description column guide usage.
  return fields;
}

/**
 * Generate the full MDX content for one tool.
 * @param reg - Tool registration data.
 * @returns MDX string.
 */
function generateToolMdx(reg: ToolRegistration): string {
  const fields = extractFields(reg.schema);
  const actions = getActionValues(reg.schema);
  const actionFieldName = getActionFieldName(reg.schema);
  const callout = buildCallout(reg);

  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`title: ${reg.name}`);
  lines.push(`description: "${escapeYaml(reg.description)}"`);
  lines.push("---");
  lines.push("");
  lines.push("import { Callout } from 'fumadocs-ui/components/callout';");
  lines.push("import { Tabs, Tab } from 'fumadocs-ui/components/tabs';");
  lines.push("");
  lines.push(`# ${reg.name}`);
  lines.push("");
  lines.push(reg.description);
  lines.push("");
  lines.push(`<Callout type="info">${callout}</Callout>`);
  lines.push("");

  // Actions as tabs
  if (actions.length > 0) {
    lines.push("## Actions");
    lines.push("");
    const itemsList = actions.map((a) => `"${a}"`).join(", ");
    lines.push(`<Tabs items={[${itemsList}]}>`);

    for (const action of actions) {
      lines.push(`  <Tab value="${action}">`);
      lines.push("");
      lines.push("### Parameters");
      lines.push("");
      lines.push("| Name | Type | Required | Description |");
      lines.push("|---|---|---|---|");

      for (const f of fields) {
        const req = f.required ? "Yes" : "No";
        lines.push(`| \`${f.name}\` | \`${f.type}\` | ${req} | ${escapeTable(f.description)} |`);
      }

      lines.push("");
      lines.push("### Example");
      lines.push("");
      lines.push("```json");
      lines.push(buildExample(reg, action));
      lines.push("```");
      lines.push("");
      lines.push("  </Tab>");
    }

    lines.push("</Tabs>");
    lines.push("");
  }

  // Errors section
  lines.push("## Errors");
  lines.push("");
  lines.push("- Invalid or missing required parameters returns an `error` response with actionable details.");
  lines.push("- Tool responses may include `_hints` with contextual guidance.");
  lines.push("");

  // Source link
  lines.push("---");
  lines.push("");
  lines.push(`Source: [lib/mcp/create-server.ts](https://github.com/FrkAk/mymir/blob/main/lib/mcp/create-server.ts)`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Escape a string for YAML double-quoted value.
 * @param s - Input string.
 * @returns Escaped string.
 */
function escapeYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Escape pipe characters for markdown table cells.
 * @param s - Input string.
 * @returns Escaped string.
 */
function escapeTable(s: string): string {
  return s.replace(/\|/g, "\\|");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const outputDir = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../../mymir-docs/content/docs/mcp/tools"),
);

await mkdir(outputDir, { recursive: true });

// Sort registrations alphabetically for deterministic output
registrations.sort((a, b) => a.name.localeCompare(b.name));

const written: string[] = [];

for (const reg of registrations) {
  const slug = reg.name.replace("mymir_", "");
  const filePath = join(outputDir, `${slug}.mdx`);
  const content = generateToolMdx(reg);
  await writeFile(filePath, content, "utf-8");
  written.push(filePath);
  console.log(`wrote ${filePath}`);
}

// meta.json — alphabetical listing for Fumadocs sidebar
const metaPages = registrations.map((r) => r.name.replace("mymir_", ""));
const meta = {
  title: "Tools",
  pages: metaPages,
};
const metaPath = join(outputDir, "meta.json");
await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
written.push(metaPath);
console.log(`wrote ${metaPath}`);

console.log(`\ndone: ${written.length} files written to ${outputDir}`);
