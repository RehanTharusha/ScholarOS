import { z } from "zod";
import { ScholarOSApiConfig } from "@x/shared/dist/scholaros-account.js";
import { API_URL } from "./env.js";

let cached: z.infer<typeof ScholarOSApiConfig> | null = null;

export async function getScholarOSConfig(): Promise<z.infer<typeof ScholarOSApiConfig>> {
  if (cached) {
    return cached;
  }
  const response = await fetch(`${API_URL}/v1/config`);
  const data = ScholarOSApiConfig.parse(await response.json());
  cached = data;
  return data;
}