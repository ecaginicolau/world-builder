import { randomUUID } from "node:crypto";

export function newAgentSessionId(): string {
  // Opaque string. UUIDv4 keeps things simple — no need for ULID order in v1.
  return randomUUID();
}
