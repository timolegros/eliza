import { z } from "zod";

const stringToJSONSchema = z
    .string()
    .transform((str, ctx): z.infer<ReturnType<typeof JSON.parse>> => {
        try {
            return JSON.parse(str);
        } catch {
            ctx.addIssue({ code: "custom", message: "Invalid JSON" });
            return z.NEVER;
        }
    });

export const CommonEnvSchema = z.object({
    COMMON_API_KEY: z.string().min(1, "Common API key is required"),
    COMMON_WALLET_ADDRESS: z
        .string()
        .min(1, "Common wallet address is required"),
    COMMON_API_URL: z.string().optional(),
    COMMON_WEBHOOK_PORT: z.coerce.number().optional().default(3001),
    COMMON_WEBHOOK_SIGNING_KEYS: stringToJSONSchema
        .pipe(z.record(z.string(), z.string())).optional()
        .describe(
            "A mapping of community ids to signing keys for validating webhook signatures"
        ),
});

export const AgentMentionedSchema = z.object({
    community_id: z
        .string()
        .max(255)
        .describe("The id of the community on Common"),
    profile_name: z
        .string()
        .max(255)
        .describe("The profile name of the author"),
    profile_url: z
        .string()
        .describe("The URL to the author's profile on Common"),
    thread_title: z.string(),
    object_url: z
        .string()
        .describe("The URL to the thread or comment on Common"),
    object_summary: z
        .string()
        .describe("The first 255 characters of the content (safely truncated)"),
    content_url: z
        .string()
        .nullish()
        .describe(
            "The Cloudflare R2 URL containing the full content of a thread or comment if it exceeds 1MB"
        ),
    content_type: z.union([z.literal("thread"), z.literal("comment")]),
    thread_id: z.number().describe("The id of the thread on Common"),
    comment_id: z
        .number()
        .optional()
        .describe("The id of the comment on Common"),
    author_user_id: z
        .number()
        .describe("The user id of the author of the thread or comment"),
});

export const AugmentedAgentMentionedSchema = AgentMentionedSchema.extend({
    full_object_text: z
        .string()
        .describe("The full text of the thread or comment"),
});
