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
