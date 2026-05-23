import container from "../di/container.js";
import type { IModelConfigRepo } from "../models/repo.js";
import type { IMcpConfigRepo } from "../mcp/repo.js";
import { ensureSecurityConfig } from "./security.js";

export async function initConfigs(): Promise<void> {
    const modelConfigRepo = container.resolve<IModelConfigRepo>("modelConfigRepo");
    const mcpConfigRepo = container.resolve<IMcpConfigRepo>("mcpConfigRepo");

    await Promise.all([
        modelConfigRepo.ensureConfig(),
        mcpConfigRepo.ensureConfig(),
        ensureSecurityConfig(),
    ]);
}
