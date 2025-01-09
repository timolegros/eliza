import { Character, elizaLogger, IAgentRuntime, Client } from "@elizaos/core";
import { validateCommonConfig } from "./environment.ts";
import express, { Request, Response, NextFunction, raw } from "express";
import { CommonApiClient, CommonApiEnvironment } from "@commonxyz/api-client";
import { z } from "zod";
import type { Server } from "http";
import {
    AgentMentionedSchema,
    AugmentedAgentMentionedSchema,
    CommonEnvSchema,
} from "./schemas.ts";
import { MessageManager } from "./messages.ts";
import { createHmac, timingSafeEqual } from "crypto";

// Ensures errors are always handled in async express route handlers
import "express-async-errors";

export class CommonClient {
    private readonly runtime: IAgentRuntime;
    private readonly character: Character;
    private readonly app: express.Application;
    private readonly commonApiClient: CommonApiClient;
    private readonly config: z.infer<typeof CommonEnvSchema>;
    private messageManager: MessageManager;
    private server: Server;

    constructor(runtime: IAgentRuntime) {
        elizaLogger.log("🚀 Initializing CommonClient...");
        this.runtime = runtime;
        this.character = runtime.character;

        this.config = validateCommonConfig(this.runtime);

        this.commonApiClient = new CommonApiClient({
            environment:
                this.config.COMMON_API_URL || CommonApiEnvironment.Default,
            apiKey: this.config.COMMON_API_KEY,
            address: this.config.COMMON_WALLET_ADDRESS,
        });
        this.app = express();
    }

    public async start() {
        try {
            elizaLogger.log("Starting Common client...");

            const user = await this.commonApiClient.user.getUser();
            if (!("id" in user))
                throw new Error(`${this.character.name} Common user not found`);

            this.messageManager = new MessageManager(
                this.commonApiClient,
                this.runtime,
                user
            );

            const webhookPath = `/eliza/${user.id}`;

            this.app.use(express.json());
            this.app.use((req: Request, res: Response, next: NextFunction) => {
                elizaLogger.debug("🌐 [HTTP] Incoming request:", {
                    method: req.method,
                    path: req.path,
                    headers: req.headers,
                    body: req.body,
                    query: req.query,
                    timestamp: new Date().toISOString(),
                });
                next();
            });

            this.app.post(
                webhookPath,
                raw({ type: "application/json" }),
                this._validateWebhook.bind(this),
                this._handleCommonEvent.bind(this)
            );

            this.app.get(webhookPath, (req: Request, res: Response) => {
                res.status(200).send({
                    message: "Success",
                });
            });

            this.server = this.app.listen(
                this.config.COMMON_WEBHOOK_PORT,
                () => {
                    elizaLogger.success(
                        `🚀 [SERVER] Common webhook server is running on port ${this.config.COMMON_WEBHOOK_PORT}`
                    );
                    elizaLogger.success(
                        `   Webhook URL: http://localhost:${this.config.COMMON_WEBHOOK_PORT}${webhookPath}`
                    );
                    elizaLogger.success(
                        `✅ [INIT] Common client successfully started for character ${this.character.name}`
                    );
                    elizaLogger.success(
                        `   Interact by mentioning @${user.profile.name} in threads or comments`
                    );
                }
            );
        } catch (error) {
            elizaLogger.error(
                "❌ [INIT] Failed to start Common client:",
                error
            );
            throw error;
        }
    }

    /**
     * This function does 2 things:
     * 1. Parses the request body to ensure it adheres to the expected schema.
     * 2. Generates a signature from the request body and timestamp and compares to the signature in the header
     *  to ensure the request originates from Common.
     */
    private async _validateWebhook(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        const {
            success,
            data: body,
            error,
        } = AgentMentionedSchema.safeParse(req.body);
        if (success === false) {
            elizaLogger.warn("Invalid request body: ", error);
            return res.status(400).send({
                error: `Invalid request body`,
                schemaErrors: error,
            });
        }
        const rawBody = req.body;
        req.body = body;

        if (!this.config.COMMON_WEBHOOK_SIGNING_KEYS) {
            elizaLogger.warn(
                "Common Webhook signing keys not set. Skipping signature validation."
            );
            return next();
        }

        const { community_id } = req.body;

        const signingKey =
            this.config.COMMON_WEBHOOK_SIGNING_KEYS[community_id];
        if (!signingKey) {
            elizaLogger.warn(
                "Signing key not found for community: ",
                community_id
            );
            return res.status(401).send({
                error: `UNAUTHORIZED`,
            });
        }
        const sig = req.headers["x-knock-signature"] as string;
        if (!sig) {
            elizaLogger.warn("No signature found in request headers");
            return res.status(401).send({
                error: `UNAUTHORIZED`,
            });
        }

        const timestamp = sig.split(",")[0].substring(2);
        const originalSignature = sig.split(",")[1].substring(2);
        const value = `${timestamp}.${rawBody}`;

        // Generate the signature with a HMAC using the SHA256 algorithm
        const reconstructedSig = createHmac("sha256", signingKey)
            .update(value)
            .digest("base64");

        // Compare the signature from the header with reconstructed signature to validate
        const isValid = timingSafeEqual(
            Buffer.from(originalSignature, "base64"),
            Buffer.from(reconstructedSig, "base64")
        );

        // For additional security, validate that the timestamp is within 5 minutes
        const date = new Date(timestamp);
        const now = new Date();
        const isWithinFiveMinutes = now.getTime() - date.getTime() < 60000;

        if (isValid && isWithinFiveMinutes) {
            return next();
        } else {
            return res.status(401).send("UNAUTHORIZED");
        }
    }

    private async _handleCommonEvent(
        req: Request<object, object, z.infer<typeof AgentMentionedSchema>>,
        res: Response
    ) {
        try {
            // Fetch full content from R2 if not all content fit in `object_summary`
            let content = req.body.object_summary;
            if (req.body.content_url) {
                const contentResponse = await fetch(req.body.content_url);

                if (!contentResponse.ok) {
                    elizaLogger.error(
                        "❌ [ERROR] Failed to fetch content from URL:",
                        req.body.content_url,
                        "Status Code:",
                        contentResponse.status
                    );
                    return res.status(400).send({
                        error: "Failed to fetch content from the provided URL",
                    });
                }

                content = await contentResponse.text();

                // Log or handle the content as needed
                elizaLogger.debug(
                    "✅ [INFO] Successfully fetched content from URL:",
                    content
                );
            }

            const augmentedMessage: z.infer<
                typeof AugmentedAgentMentionedSchema
            > = {
                ...req.body,
                full_object_text: content,
            };

            await this.messageManager.handleMessage(augmentedMessage);

            elizaLogger.debug(
                "Successfully handled message. Returning 200 status code."
            );
            res.status(200).send();
        } catch (error) {
            elizaLogger.error("❌ [ERROR] Error processing request:", error);
            res.status(500).send({
                error: "Internal server error",
            });
        }
    }

    public async stop() {
        elizaLogger.warn("Common client stopping...");
        if (this.server) {
            await new Promise<void>((resolve) => {
                this.server.close(() => {
                    elizaLogger.log("Server stopped");
                    resolve();
                });
            });
        }
    }
}

// TODO: add error handling
export const CommonClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        const client = new CommonClient(runtime);
        await client.start();
    },
    stop: async (runtime: IAgentRuntime) => {
        await runtime.clients.common.stop();
    },
};
