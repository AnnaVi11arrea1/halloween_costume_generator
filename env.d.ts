// env.d.ts
declare namespace NodeJS {
    interface ProcessEnv {
        OPENAI_API_KEY: string;
        // Add other env vars here if needed
    }
}