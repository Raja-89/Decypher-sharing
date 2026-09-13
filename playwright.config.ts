import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/e2e",timeout:45_000,fullyParallel:false,workers:1,
  expect:{timeout:15_000},
  use:{baseURL:process.env.E2E_BASE_URL||"http://127.0.0.1:8443",channel:process.env.E2E_BROWSER_CHANNEL||undefined,launchOptions:{timeout:30_000},trace:"retain-on-failure",screenshot:"only-on-failure"},
  projects:[{name:"desktop",use:{viewport:{width:1360,height:900}}},{name:"mobile",use:{viewport:{width:390,height:844}}}],
});
