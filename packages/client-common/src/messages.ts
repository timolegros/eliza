import {CommonApiClient} from "@commonxyz/api-client";
import {
    Clients,
    composeContext, Content,
    elizaLogger, generateMessageResponse,
    generateShouldRespond,
    getEmbeddingZeroVector,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
} from "@elizaos/core";
import {AugmentedAgentMentionedSchema} from "./schemas.ts";
import {z} from "zod";
import {
    commonMessageHandlerTemplate,
    commonShouldRespondTemplate,
} from "./templates.ts";
import {CreateCommentResponse} from "@commonxyz/api-client/api";

export class MessageManager {
    private readonly runtime: IAgentRuntime;
    private readonly commonApiClient: CommonApiClient;
    // TODO: combine into a single Common user with type from common-client GetUser
    private readonly commonUserId: number;
    private readonly commonProfileName: string;

    constructor(
        commonApiClient: CommonApiClient,
        runtime: IAgentRuntime,
        commonUserId: number,
        commonProfileName: string,
    ) {
        this.runtime = runtime;
        this.commonApiClient = commonApiClient;
        this.commonUserId = commonUserId;
        this.commonProfileName = commonProfileName;
    }

    private async _shouldRespond(
        message: z.infer<typeof AugmentedAgentMentionedSchema>,
        state: State
    ) {
        // Don't respond to self
        if (message.author_user_id === this.commonUserId) {
            elizaLogger.debug("Skipping message from self");
            return false;
        }

        // TODO: disable this to enable longer conversations without mentioning the bot
        // Agent not mentioned
        if (!message.full_object_text.includes(this.commonUserId.toString())) {
            return false;
        }

        const context = composeContext({
            state,
            template:
                this.runtime.character.templates?.commonShouldRespondTemplate ||
                this.runtime.character.templates?.shouldRespondTemplate ||
                commonShouldRespondTemplate,
        });

        const shouldRespond = await generateShouldRespond({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.SMALL,
        });

        return shouldRespond === "RESPOND";
    }

    private async _generateResponse(
        memory: Memory,
        context: string,
    ): Promise<Content> {
        elizaLogger.debug("[Common Client] Generating response");
        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        if (!response) {
            elizaLogger.error('No response from generateMessageResponse');
            return;
        }

        await this.runtime.databaseAdapter.log({
            body: {memory, context, response},
            userId: memory.userId,
            roomId: memory.roomId,
            type: "response",
        });

        return response;
    }

    private _generateMemoryIds({message, commentResponse}: {
        message?: z.infer<typeof AugmentedAgentMentionedSchema>,
        commentResponse?: CreateCommentResponse
    }) {
        if (message) {
            let userId = stringToUuid(
                `${message.author_user_id}-${this.runtime.agentId}`
            );
            if (message.author_user_id === this.commonUserId)
                userId = this.runtime.agentId;

            return {
                roomId: stringToUuid(
                    `${message.community_id}-${message.thread_id}-${this.runtime.agentId}`
                ),
                userId,
                messageId: stringToUuid(
                    `${message.content_type}-${message.comment_id || message.thread_id}-${this.runtime.agentId}`
                ),
            };
        } else if (commentResponse) {
            return {
                roomId: stringToUuid(`${commentResponse.community_id}-${commentResponse.thread_id}-${this.runtime.agentId}`),
                userId: this.runtime.agentId,
                messageId: stringToUuid(`comment-${commentResponse.id}-${this.runtime.agentId}`),
            }
        }
    }

    public async handleMessage(
        message: z.infer<typeof AugmentedAgentMentionedSchema>
    ) {
        const {messageId, userId, roomId} = this._generateMemoryIds({ message });

        await this.runtime.ensureConnection(
            userId,
            roomId,
            undefined,
            message.profile_name,
            Clients.COMMON
        );

        const memory: Memory = {
            id: messageId,
            userId,
            roomId,
            agentId: this.runtime.agentId,
            content: {
                text: message.full_object_text,
                source: Clients.COMMON,
                url: message.object_url,
                // TODO: inReplyTo: undefined,
            },
            createdAt: new Date().getTime(),
            unique: true,
            embedding: getEmbeddingZeroVector(), // TODO: check this
        };
        await this.runtime.messageManager.createMemory(memory);

        const state = await this.runtime.composeState(memory, {
            commonClient: this.commonApiClient,
            commonMessage: message,
            agentName: this.commonProfileName,
        });

        if (!(await this._shouldRespond(message, state))) {
            elizaLogger.debug("Not responding to message", message);
            await this.runtime.evaluate(memory, state, false);
            return;
        }

        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.commonMessageHandlerTemplate ||
                this.runtime.character.templates?.messageHandlerTemplate ||
                commonMessageHandlerTemplate,
        });

        const response = await this._generateResponse(memory, context);

        const res = await this.commonApiClient.comment.createComment({
            thread_id: message.thread_id,
            body: response.text,
            parent_id: message.comment_id,
        });

        const { messageId: resMessageId, userId: resUserId, roomId: resRoomId } = this._generateMemoryIds({ commentResponse: res });
        const resMemory: Memory = {
            id: resMessageId,
            userId: resUserId,
            roomId: resRoomId,
            agentId: this.runtime.agentId,
            content: {
                text: res.body,
                source: Clients.COMMON,
                content_url: res.content_url,
            },
            createdAt: new Date(res.created_at).getTime(),
            unique: true,
            embedding: getEmbeddingZeroVector(), // TODO: check this
        };

        await this.runtime.messageManager.createMemory(resMemory);

        if (response.action) {
            await this.runtime.processActions(
                memory,
                [resMemory],
                state,
            )
        }

        await this.runtime.evaluate(memory, state, true);
    }
}
