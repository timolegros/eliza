import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import { z } from "zod";
import {CommonEnvSchema} from "./schemas.ts";

export function validateCommonConfig(runtime: IAgentRuntime) {
    try {
        elizaLogger.debug(
            "Validating Common configuration with runtime settings"
        );
        const config = {
            COMMON_API_KEY:
                runtime.getSetting("COMMON_API_KEY") ||
                process.env.COMMON_API_KEY,
            COMMON_API_URL:
                runtime.getSetting("COMMON_API_URL") || process.env.COMMON_API_URL,
            COMMON_WEBHOOK_PORT:
                runtime.getSetting("COMMON_WEBHOOK_PORT") ||
                process.env.COMMON_WEBHOOK_PORT,
            COMMON_WEBHOOK_SIGNING_KEY:
                runtime.getSetting("COMMON_WEBHOOK_SIGNING_KEY") ||
                process.env.COMMON_WEBHOOK_SIGNING_KEY,
            COMMON_WALLET_ADDRESS:
                runtime.getSetting("COMMON_WALLET_ADDRESS") ||
                process.env.COMMON_WALLET_ADDRESS,
        };
        elizaLogger.debug("Parsing configuration with schema", config);
        const validated = CommonEnvSchema.parse(config);
        elizaLogger.debug("Configuration validated successfully");
        return validated;
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((e) => `${e.path.join(".")}: ${e.message}`)
                .join("\n");
            elizaLogger.error(
                "Configuration validation failed:",
                errorMessages
            );
            throw new Error(
                `Common configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
