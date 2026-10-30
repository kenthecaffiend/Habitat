import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,fullyParallel:false,timeout:60000,use:{headless:true},reporter:'list'});
