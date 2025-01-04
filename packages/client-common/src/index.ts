import { Character, elizaLogger, IAgentRuntime, Client } from "@elizaos/core";
import { validateCommonConfig } from "./environment.ts";
import express, { Request, Response, NextFunction } from "express";
import {CommonApiClient, CommonApiEnvironment} from "@commonxyz/api-client";
import { z } from "zod";
import type { Server } from "http";
import {AgentMentionedSchema, AugmentedAgentMentionedSchema, CommonEnvSchema} from "./schemas.ts";
import {MessageManager} from "./messages.ts";

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
    private commonUserId: number;

    constructor(runtime: IAgentRuntime) {
        elizaLogger.log("🚀 Initializing CommonClient...");
        this.runtime = runtime;
        this.character = runtime.character;

        this.config = validateCommonConfig(this.runtime);

        this.commonApiClient = new CommonApiClient({
            environment: this.config.COMMON_API_URL || CommonApiEnvironment.Default,
            apiKey: this.config.COMMON_API_KEY,
            address: this.config.COMMON_WALLET_ADDRESS,
        });
        this.app = express();
    }

    public async start() {
        try {
            elizaLogger.log("Starting Common client...");

            // TODO: fetch user once Common Api Client is published with the new route
            // const user = await this.commonApiClient.User.getUser();
            const user = { id: 161400, profile: { name: "Eliza Dev 1" } };
            this.commonUserId = user.id;
            this.messageManager = new MessageManager(this.commonApiClient, this.runtime, this.commonUserId);

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

            this.app.post(webhookPath, this._handleMention.bind(this));

            this.server = this.app.listen(this.config.COMMON_WEBHOOK_PORT, () => {
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
            });
        } catch (error) {
            elizaLogger.error(
                "❌ [INIT] Failed to start Common client:",
                error
            );
            throw error;
        }
    }

    private async _handleMention(
        req: Request,
        res: Response,
    ) {
        try {
            // TODO: verify Webhook signature using config.COMMON_WEBHOOK_SIGNING_KEY

            // Validate body
            const { success, data: body } = AgentMentionedSchema.safeParse(req.body);
            if (success === false) {
                return res.status(400).send({
                    error: "Invalid request body",
                });
            }

            // Fetch full content from R2 if not all content fit in `object_summary`
            let content = body.object_summary;
            if (body.content_url) {
                const contentResponse = await fetch(body.content_url);

                if (!contentResponse.ok) {
                    elizaLogger.error(
                        "❌ [ERROR] Failed to fetch content from URL:",
                        body.content_url,
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

            const augmentedMessage: z.infer<typeof AugmentedAgentMentionedSchema> = {
                ...body,
                full_object_text: content,
            }

            await this.messageManager.handleMessage(augmentedMessage);

            res.status(200).send();
        } catch (error) {
            elizaLogger.error(
                "❌ [ERROR] Error processing request:",
                error
            );
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
    }
}
