import { defineConfig } from 'vitest/config';
export default defineConfig({resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{include:['tests/unit/**/*.test.ts','tests/integration/**/*.test.ts'],fileParallelism:false,testTimeout:30000,hookTimeout:60000}});
