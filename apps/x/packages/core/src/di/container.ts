import { asClass, asValue, createContainer, InjectionMode } from "awilix";
import { FSModelConfigRepo, IModelConfigRepo } from "../models/repo.js";
import { FSMcpConfigRepo, IMcpConfigRepo } from "../mcp/repo.js";
import { FSAgentsRepo, IAgentsRepo } from "../agents/repo.js";
import { FSRunsRepo, IRunsRepo } from "../runs/repo.js";
import { IMonotonicallyIncreasingIdGenerator, IdGen } from "../application/lib/id-gen.js";
import { IMessageQueue, InMemoryMessageQueue } from "../application/lib/message-queue.js";
import { IBus, InMemoryBus } from "../application/lib/bus.js";
import { IRunsLock, InMemoryRunsLock } from "../runs/lock.js";
import { IAgentRuntime, AgentRuntime } from "../agents/runtime.js";
import { FSOAuthRepo, IOAuthRepo } from "../auth/repo.js";
import { FSClientRegistrationRepo, IClientRegistrationRepo } from "../auth/client-repo.js";
import { IAbortRegistry, InMemoryAbortRegistry } from "../runs/abort-registry.js";
import { FSSlackConfigRepo, ISlackConfigRepo } from "../slack/repo.js";
import type { IBrowserControlService } from "../application/browser-control/service.js";
import { KnowledgeGraph } from "../knowledge/graph/graph.js";

const container = createContainer({
    injectionMode: InjectionMode.PROXY,
    strict: true,
});

container.register({
    idGenerator: asClass<IMonotonicallyIncreasingIdGenerator>(IdGen).singleton(),
    messageQueue: asClass<IMessageQueue>(InMemoryMessageQueue).singleton(),
    bus: asClass<IBus>(InMemoryBus).singleton(),
    runsLock: asClass<IRunsLock>(InMemoryRunsLock).singleton(),
    abortRegistry: asClass<IAbortRegistry>(InMemoryAbortRegistry).singleton(),
    agentRuntime: asClass<IAgentRuntime>(AgentRuntime).singleton(),

    mcpConfigRepo: asClass<IMcpConfigRepo>(FSMcpConfigRepo).singleton(),
    modelConfigRepo: asClass<IModelConfigRepo>(FSModelConfigRepo).singleton(),
    agentsRepo: asClass<IAgentsRepo>(FSAgentsRepo).singleton(),
    runsRepo: asClass<IRunsRepo>(FSRunsRepo).singleton(),
    oauthRepo: asClass<IOAuthRepo>(FSOAuthRepo).singleton(),
    clientRegistrationRepo: asClass<IClientRegistrationRepo>(FSClientRegistrationRepo).singleton(),
    slackConfigRepo: asClass<ISlackConfigRepo>(FSSlackConfigRepo).singleton(),
    knowledgeGraph: asClass(KnowledgeGraph).singleton(),
});

export default container;

export function registerBrowserControlService(service: IBrowserControlService): void {
    container.register({
        browserControlService: asValue(service),
    });
}
