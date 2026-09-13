// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {authorizedFetch} from "./api";
beforeEach(()=>{localStorage.clear();localStorage.setItem("decypher.accessToken","OLD");localStorage.setItem("decypher.refreshToken","REFRESH");});
afterEach(()=>vi.unstubAllGlobals());
it("refreshes once for concurrent secure previews and retries with the new token",async()=>{
  let rotations=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
    if(url.endsWith("/auth/refresh")){rotations++;await Promise.resolve();return new Response(JSON.stringify({access_token:"NEW",refresh_token:"ROTATED",user:{role:"admin"}}));}
    return new Response("{}",{status:new Headers(init.headers).get("Authorization")==="Bearer NEW"?200:401});
  }));
  const results=await Promise.all([authorizedFetch("http://localhost/preview"),authorizedFetch("http://localhost/qr")]);
  expect(results.every(r=>r.ok)).toBe(true);expect(rotations).toBe(1);expect(localStorage.getItem("decypher.refreshToken")).toBe("ROTATED");
});
it("clears expired sessions instead of continuing with a stale identity",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("{}",{status:401})));
  await expect(authorizedFetch("http://localhost/preview")).rejects.toThrow();
  expect(localStorage.getItem("decypher.accessToken")).toBeNull();
});
