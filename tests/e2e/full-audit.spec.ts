import {test,expect,Page} from "@playwright/test";
test.skip(process.env.E2E_FULL!=="1","Requires the live full-stack adapter.");
test.beforeEach(async({page})=>{
  test.setTimeout(120_000);
  // Live validation must never reach the destructive demo-reset endpoint.
  await page.route("**/api/v1/admin/reset-demo",route=>route.abort("blockedbyclient"));
});
const root="/cases/CASE-2026-017";
async function login(page:Page,role="Admin"){
  await page.goto("/login");await page.getByRole("button",{name:role,exact:true}).click();
  await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
}
async function width(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}

test("authentication, permissions, session recovery and public controls",async({page},info)=>{
  await page.goto(`${root}/graph`);await expect(page).toHaveURL(/login/);
  for(const role of ["Investigator","Supervisor","Forensics","Admin"]){
    await page.getByRole("button",{name:role,exact:true}).click();await expect(page.getByLabel("Password",{exact:true})).toHaveValue("DemoAccess2026!");
  }
  await page.getByRole("button",{name:"Show password"}).click();await expect(page.getByLabel("Password",{exact:true})).toHaveAttribute("type","text");await page.getByRole("button",{name:"Hide password"}).click();
  await page.getByLabel("Password",{exact:true}).fill("Incorrect2026!");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("alert")).toBeVisible();
  await login(page,"Investigator");await page.goto("/evidence/EV-2026-0001?caseId=CASE-2026-017");
  await expect(page.getByRole("button",{name:"Register on blockchain"})).toBeDisabled();await expect(page.getByRole("button",{name:"Register on blockchain"})).toHaveAttribute("title",/role required/);
  await expect(page.getByRole("button",{name:"Save custody event"})).toHaveCount(0);
  await expect(page.getByRole("img",{name:"Evidence verification QR code"})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem("decypher.accessToken","expired-test-token"));await page.getByRole("button",{name:"Verify stored evidence"}).click();await expect(page.locator('pre[role="status"]')).toContainText("Integrity result");await page.reload();await expect(page.getByRole("button",{name:"Verify stored evidence"})).toBeEnabled();
  expect(await page.evaluate(()=>localStorage.getItem("decypher.accessToken"))).not.toBe("expired-test-token");
  await page.getByRole("button",{name:"Sign Out",exact:true}).click();await page.goto(`${root}/evidence`);await expect(page).toHaveURL(/login/);
  await login(page,"Forensics");await expect(page.getByRole("button",{name:"New case",exact:true})).toBeDisabled();await page.goto(`${root}/reports`);await expect(page.getByRole("button",{name:"Generate & download PDF"})).toBeDisabled();
  await page.getByRole("button",{name:"Sign Out",exact:true}).click();await page.goto("/");
  if(info.project.name==="mobile"){await page.getByRole("button",{name:"Toggle navigation menu"}).click();await expect(page.getByRole("button",{name:"Toggle navigation menu"})).toHaveAttribute("aria-expanded","true");}
  await width(page);await page.getByRole("button",{name:"See the workflow",exact:true}).click();await expect(page).toHaveURL(/how-it-works/);
  for(const [label,path] of [["About","about"],["Terms and disclaimer","terms"],["Privacy and accessibility","privacy"]]){
    await page.getByRole("navigation",{name:"Footer links"}).getByRole("button",{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(path));await width(page);
  }
  await page.getByRole("button",{name:"Explore the investigation",exact:true}).click();await expect(page).toHaveURL(/login/);
});

test("create case, empty-state scoping, tabs, filters, history and retry",async({page},info)=>{
  await login(page);await page.getByRole("button",{name:"New case",exact:true}).click();await page.getByRole("button",{name:"Cancel",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button",{name:"New case",exact:true}).click();const name=`Synthetic browser audit ${info.project.name} ${Date.now()}`;
  await page.getByLabel("Title",{exact:true}).fill(name);await page.getByLabel("Description",{exact:true}).fill("Synthetic isolated case for browser control validation only.");await page.getByRole("combobox",{name:"Priority",exact:true}).selectOption("high");await page.getByRole("button",{name:"Create",exact:true}).click();
  await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();const casePath=new URL(page.url()).pathname;
  for(const [label,route] of [["Evidence","evidence"],["Graph","graph"],["Timeline","timeline"],["Map","map"],["Network","network"],["Financial","financial"],["Reports","reports"],["Overview",""]]){
    await page.getByRole("navigation",{name:"Case sections"}).getByRole("button",{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(`${casePath}${route?"/"+route:""}$`));await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();await width(page);
  }
  await page.getByLabel("Selected case").selectOption("CASE-2026-017");await expect(page).toHaveURL(new RegExp(root+"$"));
  await page.goto(`${root}/evidence`);await page.getByLabel("Search evidence").fill("EV-2026-0001");await expect(page).toHaveURL(/q=EV-2026-0001/);await page.reload();await expect(page.getByLabel("Search evidence")).toHaveValue("EV-2026-0001");await page.getByRole("button",{name:/EV-2026-0001 ·/}).click();await page.goBack();await expect(page.getByLabel("Search evidence")).toHaveValue("EV-2026-0001");await page.goForward();await expect(page).toHaveURL(/evidence\/EV-2026-0001/);
  await page.route("**/api/v1/cases/CASE-2026-017/snapshot",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({detail:{message:"Synthetic audit outage"}})}));await page.goto(`${root}/graph`);await expect(page.getByRole("alert")).toContainText("Synthetic audit outage");await page.unroute("**/api/v1/cases/CASE-2026-017/snapshot");await page.getByRole("button",{name:"Retry",exact:true}).click();await expect(page.getByRole("button",{name:"Raj Mehta (person)"})).toBeVisible();
  // Admin reset is excluded: only its role-gated visibility is audited live.
  await page.goto(root);await expect(page.getByRole("button",{name:"Reset demo (admin)"})).toBeVisible();
});

test("graph inspection, filters, map layers, timeline, network and Hindi",async({page},info)=>{
  await login(page);await page.goto(`${root}/graph`);const zoom=page.getByRole("button",{name:"Zoom in",exact:true});await expect(zoom).toBeVisible();
  const transform=()=>page.locator('svg[viewBox="0 0 800 600"] > g').first().getAttribute("transform");const before=await transform();await zoom.click();expect(await transform()).not.toBe(before);await page.getByRole("button",{name:"Zoom out",exact:true}).click();await page.getByRole("button",{name:"Reset view"}).click();expect(await transform()).toBe(before);
  await page.getByRole("button",{name:"Raj Mehta (person)"}).press("Enter");await expect(page.locator("aside").getByRole("heading",{name:"Raj Mehta",exact:true})).toBeVisible();await expect(page.locator("aside").getByText(/→/).first()).toBeVisible();await page.locator("aside").getByRole("button",{name:/EV-/}).first().click();await expect(page).toHaveURL(/evidence\/EV-/);
  await page.goto(`${root}/graph`);await page.getByLabel("Entity filter").selectOption("vehicle");await expect(page.getByRole("button",{name:"Raj Mehta (person)"})).toHaveCount(0);await page.getByLabel("Search entities").fill("DL");await page.reload();await expect(page).toHaveURL(/filter=vehicle.*q=DL/);
  await page.goto(`${root}/timeline`);await page.getByLabel("Event filter").selectOption("call");await expect(page.locator("article").first()).toContainText("IST");await page.locator("article").getByRole("button",{name:/EV-/}).first().click();await expect(page).toHaveURL(/evidence\/EV-/);
  await page.goto(`${root}/financial?filter=call`);await expect(page.getByText("No matching timestamped evidence events.",{exact:true})).toBeVisible();await page.getByLabel("Event filter").selectOption("transaction");await expect(page.locator("article").first()).toBeVisible();
  await page.route("https://tile.openstreetmap.org/**",r=>r.abort());await page.goto(`${root}/map`);await expect(page.getByRole("button",{name:"Connections",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"Connections",exact:true})).toHaveAttribute("title",/evidence-backed/);
  await expect(page.getByRole("status")).toContainText("Map tiles are unavailable");const markers=page.locator(".leaflet-marker-icon");const count=await markers.count();expect(count).toBeGreaterThan(0);await markers.first().click();await expect(page.locator(".leaflet-popup-content")).toBeVisible();await page.locator(".leaflet-popup-content").getByRole("button",{name:/EV-/}).first().click();await expect(page).toHaveURL(/evidence\/EV-/);await page.goBack();await expect(markers).toHaveCount(count);
  await page.getByRole("button",{name:"Primary node",exact:true}).click();await expect(markers).toHaveCount(0);await page.getByRole("button",{name:"Primary node",exact:true}).click();await expect(markers).toHaveCount(count);await page.getByRole("button",{name:"Orientation circles",exact:true}).click();await expect(page.getByRole("button",{name:"Orientation circles",exact:true})).toHaveAttribute("aria-pressed","false");await width(page);
  await page.goto(`${root}/network`);await page.getByRole("button",{name:"Vikram Singh",exact:true}).click();await expect(page).toHaveURL(/graph/);await expect(page.locator("aside").getByRole("heading",{name:"Vikram Singh",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"A+",exact:true}).click();await expect(page.getByRole("button",{name:"A+",exact:true})).toHaveAttribute("aria-pressed","true");await page.getByRole("button",{name:"A-",exact:true}).click();await page.getByRole("button",{name:"A",exact:true}).click();await page.getByRole("button",{name:"High Contrast",exact:true}).click();await expect(page.locator("html")).toHaveClass(/hc/);await page.getByRole("button",{name:"High Contrast",exact:true}).click();
  await page.getByRole("button",{name:"हिंदी",exact:true}).click();await page.reload();await expect(page.getByRole("heading",{name:"ऑपरेशन नाइटफॉल",exact:true})).toBeVisible();await page.screenshot({path:`test-results/full-graph-hi-${info.project.name}.png`,fullPage:true});await width(page);
  await page.goto("/verify/unknown-token");await expect(page.getByRole("alert")).toBeVisible();await page.getByRole("button",{name:"डिसाइफ़र पर लौटें",exact:true}).click();await expect(page).toHaveURL(/\/$/);
});

test("seeded media, secure downloads, upload rejection and guided demo controls",async({page},info)=>{
  await login(page);await page.goto(`${root}/evidence`);await page.locator('input[type="file"]').setInputFiles({name:"fake.png",mimeType:"image/png",buffer:Buffer.from("not an image")});await expect(page.getByRole("status")).toContainText(/content|image|signature/i);await page.getByRole("button",{name:"Dismiss message"}).click();await expect(page.getByRole("status")).toHaveCount(0);
  for(const [id,selector] of [["EV-2026-0001","iframe"],["EV-2026-0004","img"],["EV-2026-0005","audio"],["EV-2026-0006","video"],["EV-2026-0007",""]]){
    await page.goto(`/evidence/${id}?caseId=CASE-2026-017`);await expect(page.getByRole("button",{name:"Download original evidence"})).toBeVisible();
    if(selector==="img")await expect(page.locator("section img").first()).toBeVisible();else if(selector)await expect(page.locator(selector)).toBeVisible();
    if(selector==="audio"||selector==="video")await expect.poll(()=>page.locator(selector).evaluate((el:HTMLMediaElement)=>el.readyState)).toBeGreaterThanOrEqual(1);
    const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Download original evidence"}).click()]);expect(await download.failure()).toBeNull();await width(page);
  }
  await page.getByRole("button",{name:"Open case graph"}).click();await expect(page).toHaveURL(/graph/);await page.goto("/dashboard");await page.getByRole("button",{name:"Guided demo",exact:true}).click();await expect(page).toHaveURL(/demo/);
  const steps=["Open Operation Nightfall","Inspect and upload evidence","View evidence-backed graph","Reconstruct the timeline","Review locations on the map","Find the bridge entity","Ask the grounded Copilot","Generate the investigation report"];
  for(const step of steps){await page.goto("/demo");await page.getByRole("button",{name:new RegExp(step)}).click();await expect(page).toHaveURL(/cases\/CASE-2026-017/);}
  await page.goto("/demo");await expect(page.getByRole("button",{name:"Reset demo data (admin)"})).toBeVisible();await expect(page.getByRole("heading",{name:"Operation Nightfall walkthrough",exact:true})).toBeVisible();await page.screenshot({path:`test-results/full-guide-${info.project.name}.png`,fullPage:true});
});

test("primary navigation, registry search, graph gestures, map zoom and typed Copilot",async({page},info)=>{
  await login(page);await page.getByLabel("Search cases").fill("CASE-2026-017");await expect(page.getByRole("button",{name:/Operation Nightfall/})).toHaveCount(1);await expect(page.getByRole("button",{name:/Operation Northbridge/})).toHaveCount(0);
  for(const [label,path] of [["Command Center","/dashboard"],["Cases","/cases"],["Investigation Graph",`${root}/graph`],["Timeline",`${root}/timeline`],["Geo Intelligence",`${root}/map`],["Evidence",`${root}/evidence`],["Network",`${root}/network`],["Reports",`${root}/reports`]]){
    if(info.project.name==="mobile")await page.getByRole("button",{name:"Toggle navigation menu"}).click();
    await page.getByRole("navigation",{name:"Primary"}).getByRole("button",{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(path+"$"));await width(page);
  }
  await page.getByRole("navigation",{name:"Primary"}).getByRole("button",{name:/^Decypher/}).click();await expect(page).toHaveURL(/dashboard/);
  await page.goto(`${root}/graph`);const svg=page.locator('svg[viewBox="0 0 800 600"]');await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox();expect(box).not.toBeNull();
  const group=svg.locator(":scope > g").first();const before=await group.getAttribute("transform");
  await page.mouse.move(box!.x+box!.width*.95,box!.y+box!.height*.6);await page.mouse.down();await page.mouse.move(box!.x+box!.width*.85,box!.y+box!.height*.65,{steps:5});await page.mouse.up();expect(await group.getAttribute("transform")).not.toBe(before);
  await page.getByRole("button",{name:"Reset view"}).click();const raj=page.getByRole("button",{name:"Raj Mehta (person)"});const nodeBefore=await raj.getAttribute("transform");const node=await raj.boundingBox();expect(node).not.toBeNull();await page.mouse.move(node!.x+node!.width/2,node!.y+node!.height/2);await page.mouse.down();await page.mouse.move(node!.x+node!.width/2+20,node!.y+node!.height/2+20,{steps:5});await page.mouse.up();expect(await raj.getAttribute("transform")).not.toBe(nodeBefore);
  await page.goto(`${root}/map`);await expect(page.locator(".leaflet-container")).toBeVisible();await page.locator(".leaflet-control-zoom-in").click();await expect(page.locator('img.leaflet-tile[src*="/10/"]').first()).toBeAttached();await expect(page.locator(".leaflet-container")).not.toHaveClass(/leaflet-zoom-anim/);await page.locator(".leaflet-control-zoom-out").click();await expect(page.locator('img.leaflet-tile[src*="/9/"]').first()).toBeAttached();
  await page.getByRole("button",{name:"Open Copilot"}).click();const dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"Send",exact:true})).toBeDisabled();await page.getByLabel("Copilot question").fill("Raj Mehta evidence");await dialog.getByRole("button",{name:"Send",exact:true}).click();await expect(dialog.getByText(/Confidence:/).first()).toBeVisible();await expect(dialog.getByRole("button",{name:/EV-/}).first()).toBeVisible();
  for(const suggestion of ["Vikram Singh relationships","Case summary"]){const count=await dialog.locator("article").count();await dialog.getByRole("button",{name:suggestion,exact:true}).click();await expect(dialog.locator("article")).toHaveCount(count+2);}
  await page.getByRole("button",{name:"Close Copilot"}).click();await expect(dialog).toHaveCount(0);await page.getByRole("button",{name:"Open Copilot"}).click();await expect(dialog.getByRole("button",{name:/EV-/}).first()).toBeVisible();await dialog.getByRole("button",{name:/EV-/}).first().click();await expect(page).toHaveURL(/evidence\/EV-/);await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:"← Evidence library",exact:true}).click();await page.getByLabel("Selected case").selectOption("CASE-X007");await page.getByRole("button",{name:"Open Copilot"}).click();await expect(dialog.locator("article")).toHaveCount(0);await expect(dialog).toContainText("CASE-X007");
});

test("overview count cards and actual upload/compare file-picker controls",async({page})=>{
  await login(page);await page.getByRole("button",{name:/Operation Nightfall/}).click();
  for(const [label,path] of [["Evidence","evidence"],["Entities","graph"],["Events","timeline"],["Relationships","network"]]){
    await page.getByRole("button",{name:new RegExp(`^\\d+\\s*${label}$`)}).click();await expect(page).toHaveURL(new RegExp(`${root}/${path}$`));await page.getByRole("navigation",{name:"Case sections"}).getByRole("button",{name:"Overview",exact:true}).click();
  }
  await page.getByRole("navigation",{name:"Case sections"}).getByRole("button",{name:"Evidence",exact:true}).click();
  const [upload]=await Promise.all([page.waitForEvent("filechooser"),page.getByRole("button",{name:"Upload / hash evidence",exact:true}).click()]);await upload.setFiles({name:"fake.png",mimeType:"image/png",buffer:Buffer.from("not an image")});await expect(page.getByRole("status")).toContainText(/content|image|signature/i);
  await page.getByRole("button",{name:/EV-2026-0001 ·/}).click();const [compare]=await Promise.all([page.waitForEvent("filechooser"),page.getByRole("button",{name:"Compare another file",exact:true}).click()]);await compare.setFiles({name:"tampered.pdf",mimeType:"application/pdf",buffer:Buffer.from("synthetic changed bytes")});await expect(page.locator('pre[role="status"]')).toContainText("MODIFIED");
});
