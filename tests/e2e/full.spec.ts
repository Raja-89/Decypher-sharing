import {test,expect} from "@playwright/test";
import {createHash} from "node:crypto";
test.skip(process.env.E2E_FULL!=="1","Full-stack judging run requires Docker services.");
test.beforeEach(async({page,context})=>{
  await page.route("**/api/v1/admin/reset-demo",route=>route.abort("blockedbyclient"));
  // Headless Chromium needs write permission even for an explicit copy click.
  // No clipboard-read permission or user-browser access is granted.
  await context.grantPermissions(["clipboard-write"]);
});
test("full judging vertical slice",async({page},testInfo)=>{
  test.setTimeout(240_000);
  await page.goto("/login");await page.getByRole("button",{name:"Admin",exact:true}).click();await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.getByRole("button",{name:/Operation Nightfall/}).click();
  await page.getByRole("navigation",{name:"Case sections"}).getByRole("button",{name:"Evidence",exact:true}).click();
  const bytes=Buffer.from(`transaction_id,timestamp,from_entity,to_account,amount_inr\n${Date.now()},2026-09-10T22:04:00+05:30,Arjun Verma,4821,245000\n`);
  await page.locator('input[type="file"]').setInputFiles({name:"judging.csv",mimeType:"text/csv",buffer:bytes});
  await expect(page).toHaveURL(/evidence\/EV-/,{timeout:60_000});
  const evidencePath=new URL(page.url()).pathname+new URL(page.url()).search;
  const evidenceNotice=page.locator('pre[role="status"]');
  await expect(page.locator("aside").getByText(`SHA-256 ${createHash("sha256").update(bytes).digest("hex")}`,{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Register on blockchain"}).click();await expect(evidenceNotice).toContainText("Receipt confirmed");
  await page.getByRole("button",{name:"Analyze evidence",exact:true}).click();await expect(evidenceNotice).toContainText("identified",{timeout:120_000});
  await page.getByRole("button",{name:"Verify stored evidence"}).click();await expect(evidenceNotice).toContainText("VERIFIED");
  await page.getByRole("button",{name:"Copy hash"}).click();await expect(evidenceNotice).toContainText("Hash copied");
  const [original]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Download original evidence"}).click()]);
  expect(await original.failure()).toBeNull();
  await page.getByLabel("To custodian").fill("Synthetic judging reviewer");await page.getByLabel("Location",{exact:true}).fill("Local audit lab");await page.getByLabel("Notes",{exact:true}).fill("Synthetic browser validation only.");
  await page.getByRole("button",{name:"Save custody event"}).click();await expect(evidenceNotice).toContainText("Custody event recorded");
  await page.locator('input[type="file"]').setInputFiles({name:"tampered.csv",mimeType:"text/csv",buffer:Buffer.concat([bytes,Buffer.from("tampered")])});await expect(evidenceNotice).toContainText("MODIFIED");
  await expect(page.getByRole("img",{name:"Evidence verification QR code"})).toBeVisible();await page.getByRole("button",{name:"Open verification",exact:true}).click();await expect(page).toHaveURL(/verify\//);await expect(page.getByText("ANCHORED",{exact:true})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(new RegExp(evidencePath.split("?")[0]));
  for(const mode of ["graph","timeline","map","network"]){await page.goto(`/cases/CASE-2026-017/${mode}`);await expect(page.getByRole("heading",{name:"Operation Nightfall",exact:true})).toBeVisible();}
  await page.getByRole("button",{name:"Open Copilot"}).click();await page.getByRole("button",{name:"Raj Mehta evidence"}).click();await expect(page.getByRole("dialog").getByRole("button",{name:/EV-/}).first()).toBeVisible();
  await page.getByRole("dialog").getByRole("button",{name:/EV-/}).first().click();await expect(page).toHaveURL(/evidence\/EV-/);
  await page.goto("/cases/CASE-2026-017/reports");
  for(const locale of ["en","hi"]){
    if(locale==="hi")await page.getByRole("button",{name:"हिंदी",exact:true}).click();
    await expect(page.frameLocator("iframe").getByRole("heading",{name:locale==="en"?"Operation Nightfall":"ऑपरेशन नाइटफॉल",exact:true})).toBeVisible();
    const [download]=await Promise.all([page.waitForEvent("download",{timeout:120_000}),page.getByRole("button",{name:locale==="en"?"Generate & download PDF":"PDF बनाएँ और डाउनलोड करें"}).click()]);
    expect(await download.failure()).toBeNull();await download.saveAs(`output/pdf/judging-${testInfo.project.name}-${locale}.pdf`);
    await expect(page.getByRole("status").filter({hasText:locale==="en"?"PDF downloaded":"PDF डाउनलोड हुआ"})).toBeVisible();
  }
  await page.getByRole("button",{name:"English",exact:true}).click();
  const [saved]=await Promise.all([page.waitForEvent("download"),page.getByRole("heading",{name:"Report history",exact:true}).locator("..").getByRole("button").first().click()]);expect(await saved.failure()).toBeNull();
});
