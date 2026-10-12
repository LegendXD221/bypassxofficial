# Link-bypass API research for BypassX

Research checked on 2026-10-12. This report separates **documented server-to-server APIs** from websites that expose only a browser flow or userscript.

## Best additional candidates

### 1. BypassTools — best fit for a real API fallback

- Website: <https://bypass.tools/>
- Official Node SDK: <https://github.com/XxEASTRxX/bypasstools-sdks-node>
- Base URL documented by the SDK: `https://api.bypass.tools/api/v1`
- Authentication: API key from the BypassTools dashboard, sent through the SDK.
- Synchronous method: `bypass(url)`.
- Async method: `createTask(url)` followed by `getTaskResult(taskId)`, or `bypassAsync(url)` which polls until completion.
- Result shape documented by the SDK: `{ resultUrl, cached, processTime, requestId }`.
- Error categories include invalid key, quota exceeded, rate limited, timeout, and task failure.
- The public site advertises support for Linkvertise, LootLabs, Work.ink, Delta, Hydrogen, Luarmor, Lockr, Rapid-Links, key systems, and many other services.

**Recommendation:** Add this as a paid/keyed provider after Alysse, UseBypass, and OmegaTech. Its documented async task flow is useful for LootLabs-style providers that take longer to resolve.

### 2. Bypass.vip Premium — viable keyed fallback

- Website: <https://bypass.vip/premium>
- Official client script: <https://bypass.vip/assets/js/scripts.js>
- Premium endpoint shown in the official site script: `GET https://api.bypass.vip/premium/bypass?url=...`.
- Refresh endpoint: `GET https://api.bypass.vip/premium/refresh?url=...`.
- Authentication: `x-api-key` header.
- The premium page advertises 1 credit per successful bypass and a limit of 25 requests per 10 seconds.
- Pricing shown by the provider starts at $1 for 1,000 credits.
- The free web flow uses `POST https://api.bypass.vip/bypass?url=...` with a browser-generated hCaptcha token. That free route is not a clean server-to-server integration for a Discord bot.

**Recommendation:** Add only the premium endpoint, with the API key stored in an environment variable such as `BYPASS_VIP_API_KEY`. Do not automate the free hCaptcha route.

## Services that are not currently clean API candidates

### Bypass.city / AdBypass

- Website: <https://bypass.city/>
- Official userscript page: <https://bypass.city/how-to-install-userscript>
- AdBypass is identified as an official mirror of Bypass.city: <https://adbypass.org/how-to-install-userscript>
- The published integration is a browser userscript downloaded from `api2.adbypass.org`; the pages do not publish a stable public JSON API contract, API key flow, or bot integration documentation.

**Recommendation:** Keep these as manual/browser alternatives, not automatic BypassX providers. Calling undocumented internal endpoints would be brittle and could violate provider terms.

## Provider ranking for BypassX

1. **Alysse** — already integrated; simple JSON POST and no key.
2. **UseBypass** — already integrated; documented GET/POST flow, optional token, pending-result support.
3. **OmegaTech** — already integrated; documented endpoint in its API catalog, no key stated.
4. **BypassTools** — strongest next addition if an API key is available; documented SDK and async task support.
5. **Bypass.vip Premium** — useful paid/keyed fallback with explicit API endpoints and rate limit.
6. **Bypass.city / AdBypass** — do not add as an API until an official server-to-server contract is published.

## Operational cautions

- Treat every provider as an external dependency that can change or disappear.
- Store API keys only in Render environment variables or another secret manager, never in Neon rows or Git.
- Add per-provider timeouts, rate limits, circuit breakers, and success/failure metrics before enabling paid providers.
- Do not expose raw provider errors or submitted URLs in public Discord channels.
- Use only for links and content that the server operator is authorized to access, and respect each provider's terms and rate limits.

## Free-only conclusion

For a genuinely free Discord-bot fallback with no paid credits and no browser CAPTCHA automation, the verified options remain **Alysse, UseBypass, and OmegaTech**, which are already in BypassX. [9] [10] [11] BypassTools has a free website but its documented SDK requires an API key from its dashboard. Bypass.vip has a free browser flow that requires hCaptcha; its documented server API is the premium API. Zen Bypass says its free website is for light manual use and that developer API access is paid. Bypass.city/AdBypass publishes a userscript but no stable public JSON API. [1] [2] [3] [4] [6] [7] [8]

## Daily-quota conclusion

Allowing a daily quota does not currently reveal a verified fourth free API with a documented server-to-server contract. BypassTools is worth checking for a free/trial API key because its official SDK documents the integration, but its public material does not state a free daily API quota. Bypass.vip and Zen Bypass document paid API access, while their free website flows use CAPTCHA or manual browser interaction. [2] [3] [6]

The practical free setup is therefore to keep Alysse, UseBypass, and OmegaTech and enforce BypassX's own daily per-guild or global quota across them. That gives predictable usage without relying on undocumented endpoints or rotating accounts/keys.

## GitHub code findings

Public GitHub code confirms a few integration patterns, but it should be treated as reference code rather than proof that an endpoint is current:

- `itsreimau/nirwabot` calls OmegaTech with `GET /api/tools/all-bypass?url=...` and reads `data.result`. The official OmegaTech catalog documents the same endpoint and supports GET and POST, so this is a useful compatibility pattern. [12] [11]
- `AyGemuy/api-wudysoft` calls `https://api.bypass.vip/bypass?url=...` without the current browser hCaptcha flow. This appears stale compared with Bypass.vip's current official script, which requires hCaptcha for the free route or `x-api-key` for premium routes. Do not copy it unchanged. [13] [4]
- `L-O-G-A-N/linkvertise-bypass` also references the old public Bypass.vip route, so it is useful historically but not a reliable current provider adapter. [14]
- The official BypassTools SDK repository is the cleanest current GitHub integration: it documents API-key auth, sync and async methods, task polling, result fields, and error codes. [2]

I did not find a trustworthy public GitHub implementation for UseBypass or Alysse that adds capabilities beyond their official docs. I also found no reason to copy exposed API keys or tokens from public repositories; BypassX should keep all provider credentials in Render environment variables.

## References

[1]: https://bypass.tools/ "BypassTools official website"
[2]: https://github.com/XxEASTRxX/bypasstools-sdks-node "BypassTools official Node.js SDK repository"
[3]: https://bypass.vip/premium "Bypass.vip Premium API page"
[4]: https://bypass.vip/assets/js/scripts.js "Bypass.vip official client script with API calls"
[5]: https://bypass.vip/terms-of-service "Bypass.vip Terms of Service"
[6]: https://bypass.city/ "Bypass.city official website"
[7]: https://bypass.city/how-to-install-userscript "Bypass.city official userscript page"
[8]: https://adbypass.org/how-to-install-userscript "AdBypass official mirror and userscript page"
[9]: https://alysse.top/api "Alysse API documentation"
[10]: https://usebypass.com/api-docs "UseBypass API documentation"
[11]: https://api.omegatech.app/docs "OmegaTech API documentation"
[12]: https://github.com/itsreimau/nirwabot/blob/2155fa5ccbda67a0131c5cd0cfb334b5e7b9deeb/commands/tool/bypassshortlink.js "Public OmegaTech integration example"
[13]: https://github.com/AyGemuy/api-wudysoft/blob/0ad546b3393884f15532304bb28cc0883df362db/pages/api/tools/web/bypass/v2.js "Public legacy Bypass.vip integration example"
[14]: https://github.com/L-O-G-A-N/linkvertise-bypass/blob/f2cf4f4bb1b883ff8b3f995989c8208d9052e654/README.md "Public legacy Bypass.vip integration README"
