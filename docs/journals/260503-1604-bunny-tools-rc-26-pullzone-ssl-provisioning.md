---
date: 2026-05-03T16:04:00Z
version: 0.1.0-rc.26
commit: 62cc747
status: shipped
severity: High
---

# rc.26 Ship: Pullzone SSL Provisioning Bug Discovery & Fix

**Date**: 2026-05-03 16:04  
**Version**: 0.1.0-rc.26  
**Commit**: 62cc747 (latest + alpha)  
**Component**: Bunny pullzone DNS/SSL workflow  
**Status**: Shipped  

## What Happened

User reported `bunny dns record add ... PULLZONE --pull-zone <id>` failing with "The pull zone ID is not valid" for bytek.org. Command executed, looked reasonable, but Bunny API silently rejected the Type-7 CNAME record. Root cause was clear once we dug: the pullzone hostname had `HasCertificate: false`. Bunny's DNS engine rejects Type-7 records for hostnames without SSL certs, but the error message blames the zone ID instead.

We were missing the entire SSL provisioning step that Bunny's web dashboard bundles invisibly into "Connect Domain" (add hostname → request cert → add DNS). Our CLI was doing add hostname → add DNS, skipping the cert request.

## The Brutal Truth

Thirty minutes of debugging to discover Bunny's error message is fundamentally misleading. The API returned "pull zone ID is not valid" when the real gate was certificate status on a subresource we weren't even checking. This is the third time in four RCs we've hit this pattern: Bunny's general endpoints fail silently while dedicated subresource endpoints succeed or provide real feedback. It stings because the domain was genuinely linked; the zone ID was valid; everything checked out at rc.25's level of inspection. The hidden gate was one field deeper.

## Technical Details

**The shipped fix (rc.26):**
- New command: `bunny pullzone hostname enable-ssl <pzId> <hostname>` wraps `POST /pullzone/loadFreeCertificate?hostname=<host>`
- Polls `PullZoneHostname.HasCertificate` every 5s for up to 90s (deterministic wait, no fire-and-forget)
- Pre-flight check extended: `dns record add --pull-zone` now verifies both "hostname linked?" (rc.25) and "cert provisioned?" (rc.26) before attempting DNS add
- Fast-fail with copy-pasteable remediation: "Run `bunny pullzone hostname enable-ssl <id> <hostname>` first"
- New MCP tool: `bunny.pullzone_hostname_enable_ssl` returns `{ ok, hasCertificate, waitedMs }`
- Extended `PullZoneHostname` type from `{ Value }` to `{ Id, Value, HasCertificate, ForceSSL, IsSystemHostname }`
- 4 new unit tests: poll-success, hostname-not-linked, already-has-cert, timeout
- Test coverage: 143/143 passing; 55 active commands; 18 MCP tools

**Why 90s polling vs fire-and-forget:**
Predictable for both humans and AI agents (MCP callers). No surprise delays. Configurable via core API for test mocking. We'll add `--no-wait` and `--timeout` flags in v0.2 once the pattern stabilizes.

**Why not mega `connect-domain` command:**
Would bundle hostname add → cert → DNS into one transaction. Sounds clean. But partial failure semantics get messy (rollback if cert times out? add DNS even if cert fails?). Shipping three transparent primitives took 70 minutes and is operationally clearer. Mega-command lands in v0.2 once we see real demand and can design rollback.

## What We Tried

1. **Validated PZ ID, hostname, NS auth** — all correct
2. **Checked rc.25 pre-flight (hostname linked)** — passed
3. **Verified Bunny API docs for Type-7 CNAME** — no mention of cert requirement
4. **Went to dashboard and clicked "Connect Domain"** — watched it silently provision a cert before DNS would stick
5. **Inspected PZ object in dashboard** — found `HasCertificate: false` on the hostname

## Root Cause Analysis

Bunny's API design layers validation across multiple endpoints:
- `PUT /pullzone/hostname` accepts the hostname with zero validation (no cert check)
- `POST /pullzone/loadFreeCertificate` is the separate step that actually provisions SSL
- `POST /dns/record` silently rejects Type-7 without checking which step failed

We replicated the dashboard flow (add → verify cert → DNS) in the CLI, but didn't expose the cert step. The pre-flight pattern from rc.25 worked; we extended it with another check. This is the right direction: each validation gate becomes an actionable error message, not a silent rejection buried inside a batch operation.

## Lessons Learned

**Pattern holds.** Three RCs, three times: when Bunny's general endpoints fail silently, the answer lives in a dedicated subresource (`PullZoneHostname`, `DnsRecord`, now `SSL cert`). Worth a v0.2 audit: what other PZ subresources are we missing? (Headers, AccessLists, Logs, Rate Limiting?) Each one likely has a gate we don't know about.

**Pre-flight compounds nicely.** rc.25 added "is hostname linked?" check. rc.26 added "does it have a cert?" check. Same error flow, two more lines, two more actionable messages. Future SSL/TLS checks fit the same shape. The pattern scales.

**Mock persistence is a gotcha.** `.persist()` interceptor in timeout test leaked into the next test's GET request. Switched to `.times(N)` with exact count. setup.ts doesn't reset MockAgent between tests; future audit could add that for cleaner isolation.

**Error messages matter more than we think.** Bunny's "The pull zone ID is not valid" burned 30 minutes. Our new error message `"Hostname <X> has no SSL certificate. Run: bunny pullzone hostname enable-ssl <id> <hostname>"` is actionable in 10 seconds. CLI should fail loud and helpful when it can.

## Next Steps

1. **Live verify**: Test enable-ssl flow against bytek.org PZ #5789465. Cert should provision in <60s (Bunny NS is authoritative).
2. **GA gate**: First scheduled cron run tomorrow at 03:00 UTC includes live bytek.org test.
3. **v0.2 backlog**: connect-domain mega-command, force-ssl wrapper, `--no-wait`/`--timeout` flags on enable-ssl, PZ subresource audit (Headers, AccessLists, Logs).
4. **CI provenance**: Reinstated on next CI release (was unsigned post-rc.13).

**Test suite**: 143 unit + 44 e2e tests all passing. Ready for merge.
