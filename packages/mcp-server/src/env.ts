import { z } from "zod";

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OWNER_USER_ID: z.string().uuid(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    process.stderr.write(
      `[world-builder-mcp] Invalid environment:\n${issues}\n\n` +
        `Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USER_ID.\n` +
        `OWNER_USER_ID is the auth.users.id row whose worlds you want the agent to operate on.\n`,
    );
    process.exit(1);
  }
  return parsed.data;
}
