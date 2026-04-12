/**
 * Format a JSON response for MCP tool output.
 * @param data - Data to serialize.
 * @returns MCP content response.
 */
export function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

/**
 * Format a plain text response for MCP tool output.
 * @param str - Pre-formatted text string.
 * @returns MCP content response.
 */
export function text(str: string) {
  return { content: [{ type: "text" as const, text: str }] };
}

/**
 * Format an error response with recovery guidance.
 * @param message - Actionable error message.
 * @returns MCP error response.
 */
export function error(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}
