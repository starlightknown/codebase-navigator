import { CopilotRuntime } from "@copilotkitnext/runtime";
import { BuiltInAgent } from "@copilotkitnext/agent";
import { createCopilotEndpoint } from "@copilotkitnext/runtime";
import { handle } from "hono/vercel";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "cn-llm-settings";

async function getLLMConfig(): Promise<{ baseURL: string; apiKey: string; model: string }> {
  // Env vars take priority; cookie settings override only if env vars are absent
  const envBaseURL = process.env.OPENAI_BASE_URL;
  const envApiKey = process.env.OPENAI_API_KEY;
  const envModel = process.env.OPENAI_MODEL;

  if (envBaseURL && envApiKey && envModel) {
    return { baseURL: envBaseURL, apiKey: envApiKey, model: envModel };
  }

  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.baseURL && parsed.model) {
        return {
          baseURL: parsed.baseURL,
          apiKey: parsed.apiKey || "ollama",
          model: parsed.model,
        };
      }
    } catch {
      // fall through to defaults
    }
  }

  return {
    baseURL: envBaseURL || "http://localhost:11434/v1",
    apiKey: envApiKey || "ollama",
    model: envModel || "qwen2.5",
  };
}

async function handler(req: NextRequest) {
  const { baseURL, apiKey, model } = await getLLMConfig();

  // Use .chat() explicitly to force /v1/chat/completions instead of the
  // @ai-sdk/openai v3 default Responses API (/v1/responses), which is not
  // supported by OpenRouter or Ollama.
  const languageModel = createOpenAI({ baseURL, apiKey }).chat(model);

  const runtime = new CopilotRuntime({
    agents: { default: new BuiltInAgent({ model: languageModel }) },
  });

  const honoApp = createCopilotEndpoint({
    runtime,
    basePath: "/api/copilotkit",
  });

  return handle(honoApp)(req);
}

export const GET = handler;
export const POST = handler;
