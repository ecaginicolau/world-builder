// Standard tool return envelope: every tool returns a single text content
// block whose body is JSON-stringified `{ok: true, data}` or `{ok: false, error}`.
// This keeps consumption uniform regardless of tool kind and avoids the agent
// having to special-case error vs success at the MCP layer.

export function ok<T>(data: T): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, data }) }],
  };
}

export function fail(error: string): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
    isError: true,
  };
}

export function fromSupabase<T>(
  result: { data: T | null; error: { message: string } | null },
  emptyError = "Not found",
) {
  if (result.error) return fail(result.error.message);
  if (result.data === null) return fail(emptyError);
  return ok(result.data);
}
