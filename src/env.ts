import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
    server:{
        GEMINI_API_KEY: z.string().nonempty("GEMINI_API_KEY é obrigatória"),
    },
    runtimeEnv: process.env,
});
