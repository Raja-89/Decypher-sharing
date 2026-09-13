import {test,expect} from "@playwright/test";
test.skip(process.env.E2E_FULL==="1","Showcase assertions require the showcase adapter, not the live full stack.");

async function signIn(page:any){await page.goto("/login");await page.getByRole("button",{name:"Investigator",exact:true}).click();await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);}

test("protected routing, case story, history and no fake anchors",async({page})=>{
  await page.goto("/cases/CASE-2026-017/graph");await expect(page).toHaveURL(/login/);
  await signIn(page);await page.getByRole("button",{name:/Operation Nightfall/}).click();
  await page.getByRole("navigation",{name:"Case sections"}).getByRole("button",{name:"Evidence",exact:true}).click();
  await expect(page).toHaveURL(/CASE-2026-017\/evidence/);
  await page.getByRole("button",{name:/EV-2026-0001/}).click();
  await expect(page.getByRole("button",{name:"Register on blockchain"})).toBeDisabled();
  await expect(page.getByRole("img",{name:"Evidence verification QR code"})).toBeVisible();
  await page.getByRole("button",{name:"Open verification"}).click();
  await expect(page.getByText("SHOWCASE / NOT ANCHORED")).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(/evidence\/EV-2026-0001/);
});

test("case selection, citation navigation, report download and responsive width",async({page})=>{
  await signIn(page);await page.getByRole("button",{name:/Operation Northbridge/}).click();
  await expect(page).toHaveURL(/CASE-X007$/);
  await page.getByRole("navigation",{name:"Case sections"}).getByRole("button",{name:"Graph",exact:true}).click();
  await expect(page.getByRole("button",{name:"Vikram Singh (person)"})).toBeVisible();
  await page.getByRole("button",{name:"Open Copilot"}).click();
  await page.getByRole("button",{name:"Vikram Singh relationships"}).click();
  await expect(page.getByRole("dialog").getByRole("button",{name:"EV-2026-0007"})).toBeVisible();
  await page.getByRole("dialog").getByRole("button",{name:"EV-2026-0007"}).click();
  await expect(page).toHaveURL(/EV-2026-0007.*CASE-X007/);
  await page.goto("/cases/CASE-X007/reports");
  const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Generate & download PDF"}).click()]);
  expect(download.suggestedFilename()).toBe("CASE-X007-en.pdf");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("Hindi persists, filters survive reload, unknown verification is rejected",async({page})=>{
  await signIn(page);await page.goto("/cases/CASE-2026-017/timeline?filter=call");
  await page.getByRole("button",{name:"हिंदी",exact:true}).click();await page.reload();
  await expect(page.getByRole("navigation",{name:"केस अनुभाग"}).getByRole("button",{name:"साक्ष्य",exact:true})).toBeVisible();
  await expect(page).toHaveURL(/filter=call/);
  await page.screenshot({path:`test-results/timeline-hi-${test.info().project.name}.png`,fullPage:true});
  await page.goto("/verify/unknown-token");await expect(page.getByRole("alert")).toBeVisible();
});
