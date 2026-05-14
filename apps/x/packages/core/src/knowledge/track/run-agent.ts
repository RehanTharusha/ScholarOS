import z from "zod";
import { Agent } from "@x/shared/dist/agent.js";

export function buildTrackRunAgent(): z.infer<typeof Agent> {
    return {
        name: "track-run",
        instructions: "",
        tools: {},
    };
}
