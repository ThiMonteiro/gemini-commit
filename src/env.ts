import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    server: {
        GEMINI_API_KEY: z.string().nonempty("GEMINI_API_KEY é obrigatória"),
        MODEL_GEMINI: z.string().default("gemini-2.5-flash-lite"),
    },
    runtimeEnv: process.env,
});
