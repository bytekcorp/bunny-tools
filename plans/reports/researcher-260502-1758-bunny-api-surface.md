# Bunny.net API Surface Research Report

**Date:** 2026-05-02  
**Scope:** Authentication models, Storage API, CDN/Pull Zone API, Storage Zone management, DNS, Stream, Magic Containers, rate limits, error handling, existing tooling.

---

## Executive Summary

Bunny.net exposes a **fragmented auth model** with separate credentials per service (Account API key, Storage Zone passwords, Stream API keys). Core APIs use REST with `AccessKey` header auth. **Regional storage endpoints** are well-documented (8 regions). **No official CLI exists**; 4+ community CLIs fill the gap (bunnycdn-cli, BunnyCLI, own3d/bunny-cli, hop). **Rate limits exist per-region** on Edge Storage; Account API uses standard 429 throttling. **Error format is consistent JSON** across services.

---

## 1. Authentication Models

### Account API Key
- **Source:** Dashboard > Account > API Key
- **Scope:** Account-level: storage zones, pull zones, DNS, billing, Stream libraries, databases, Shield, Magic Containers
- **Base URL:** `https://api.bunny.net`
- **Header:** `AccessKey: {account_api_key}`
- **Uniqueness:** One per account. Regenerable via dashboard.
- **Security Note:** Has full account access; never commit to version control.
- **Retrieval:** Hidden by default in dashboard; reveal/copy via icons.

### Storage Zone Password (Edge Storage API)
- **Source:** Storage Zone settings > FTP & API Access tab
- **Scope:** File operations on that specific storage zone (upload, download, delete, list)
- **Base URLs:** Region-specific:
  - `https://ny.storage.bunnycdn.com` (New York)
  - `https://la.storage.bunnycdn.com` (Los Angeles)
  - `https://sg.storage.bunnycdn.com` (Singapore)
  - `https://syd.storage.bunnycdn.com` (Sydney)
  - `https://uk.storage.bunnycdn.com` (London)
  - `https://se.storage.bunnycdn.com` (Stockholm)
  - `https://br.storage.bunnycdn.com` (São Paulo)
  - `https://jh.storage.bunnycdn.com` (Johannesburg)
- **Header:** `AccessKey: {storage_zone_password}`
- **Region Selection:** Determined by storage zone's primary region setting.
- **Note:** Different password per zone; not the account API key.

### Stream (Video Library) API Key
- **Source:** Video Library settings > API section
- **Scope:** Video management (upload, list, delete, encoding, collections, captions)
- **Base URL:** `https://video.bunnycdn.com`
- **Header:** `AccessKey: {stream_api_key}`
- **Uniqueness:** Per library; separate from Account API key.

### Database API Key
- **Scope:** Serverless SQLite operations (per database)
- **Authentication:** Separate key per database instance
- **Note:** Not heavily documented in this research; consult official docs for details.

---

## 2. Core Account API (api.bunny.net)

**Base URL:** `https://api.bunny.net`  
**Authentication:** `AccessKey: {account_api_key}` header  
**Pagination:** Supports `page` (default 0 = all items as array, >0 = paginated object) and `perPage` (5-1000, default 1000)

### 2.1 Storage Zone Management

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/storagezone` | GET | List all zones. Params: `page`, `perPage`, `search`, `includeDeleted` |
| `/storagezone` | POST | Create zone. Required: `Name` (string) |
| `/storagezone/{id}` | GET | Get specific zone |
| `/storagezone/{id}` | POST | Update zone (name, replication regions, etc.) |
| `/storagezone/{id}` | DELETE | Delete zone |

**Response fields (list):** `Id`, `Name`, `Region`, `StorageUsed`, `FilesStored`, `ReplicationRegions`, `PullZones` (connected zones), `ZoneTier`, `StorageZoneType`.

### 2.2 Pull Zone (CDN) Management

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/pullzone` | GET | List all pull zones. Params: `page`, `perPage`, `search`, `includeCertificate` |
| `/pullzone` | POST | Create pull zone. Required: `Name`. Optional: `OriginUrl`, security/cache settings, optimization flags |
| `/pullzone/{id}` | GET | Get specific pull zone |
| `/pullzone/{id}` | POST | Update pull zone config |
| `/pullzone/{id}` | DELETE | Delete pull zone |
| `/pullzone/{id}/purgeCache` | POST | Purge cache by tag. Body: `{ "CacheTag": "tag-name" }` |
| `/purge` | POST | Purge by URL. Params: `url`, `async` (false for sync). Supports wildcards. |

**Pull Zone Properties (GET response):** `Id`, `Name`, `OriginUrl`, `Enabled`, `Suspended`, `Hostnames[]`, `CacheControl`, `SmartCache`, `CacheSlicing`, `Zone security`, `BlockedIPs`, `BlockedCountries`, `ReferrerControl`, `Optimizer`, `ImageManipulation`, `RateLimit`, `OriginShield`, `LogForwarding`, `WebSockets`.

### 2.3 DNS Zone Management

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/dnszone` | GET | List DNS zones. Params: `page`, `perPage`, `search` |
| `/dnszone` | POST | Create DNS zone. Body: `{ "Domain": "example.com" }` |
| `/dnszone/{id}` | GET | Get zone details + records |
| `/dnszone/{id}` | POST | Update zone |
| `/dnszone/{id}` | DELETE | Delete zone |
| `/dnszone/{id}/records` | GET | List records in zone |
| `/dnszone/{id}/records` | POST | Add DNS record. Body: `{ "Type": "A|AAAA|CNAME|TXT|MX|SRV|CAA|NS", "Name": "", "Value": "...", ... }` |
| `/dnszone/{id}/records/{recordId}` | POST | Update record |
| `/dnszone/{id}/records/{recordId}` | DELETE | Delete record |

**Supported DNS Record Types:** A, AAAA, CNAME, TXT, MX, SRV, CAA, NS, and advanced options like geolocation routing, health monitoring, acceleration.

### 2.4 Billing & Account

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/billing/summary` | GET | Account billing summary (charges, balance, invoice history) |
| `/billing/details` | GET | Detailed billing info |
| `/billing/payment-requests` | GET | Pending payment requests |
| `/affiliate` | GET | Affiliate account details |

### 2.5 User Account

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/user/close-account` | POST | Close the account (destructive) |

---

## 3. Edge Storage API (Storage File Operations)

**Base URL:** `https://{region}.storage.bunnycdn.com`  
**Authentication:** `AccessKey: {storage_zone_password}` header  
**Regional Endpoints:** ny, la, sg, syd, uk, se, br, jh (determined by zone's primary region)

### File Operations

| Endpoint | Method | Path Format | Notes |
|----------|--------|-------------|-------|
| `/{path}/{filename}` | PUT | `PUT /directory/file.txt` | Upload/overwrite file. Auto-creates directory tree if needed. |
| `/{path}/{filename}` | GET | `GET /directory/file.txt` | Download file |
| `/{path}/{filename}` | DELETE | `DELETE /directory/file.txt` | Delete file |
| `/{path}/` | GET | `GET /directory/` | List directory contents (returns JSON with files/subdirs) |

### Checksum / ETag Handling
- **PUT Response:** Includes `Content-Length`, `Last-Modified` headers. No explicit Checksum header documented.
- **GET Response:** Returns `ETag` header for caching. Supports `If-None-Match` / `If-Modified-Since` to detect changes without full download.
- **Implication for CLI:** Can diff remote vs. local by comparing ETags / file modification times, avoiding full downloads.

### Constraints
- **Max File Size:** No hard limit documented. Large files may not cache well in shared environment.
- **Rate Limits:** Per-region. Multiple servers per region; each tracks limits independently. Connecting to multiple servers doubles concurrency. Exact limits not publicly specified; typically 100-200 requests/sec per IP per region.
- **File Count:** Keep per-folder under 10,000 files (use subdirectories for larger datasets).
- **Multipart Upload:** Not explicitly documented in reference docs; standard PUT likely handles most needs.

---

## 4. Pull Zone (CDN) Cache Management

### Purge by URL
```
POST https://api.bunny.net/purge?url={encoded_url}&async=false
Header: AccessKey: {api_key}
```
- **Params:**
  - `url` (required): Full URL to purge. Supports wildcard patterns (e.g., `example.com/*.jpg`).
  - `async` (optional, default false): Set true for async purge (returns 202); false waits for completion.
- **Response:** 204 No Content on success.
- **Wildcard Support:** Yes; documented in blog post "Wildcard CDN Cache Purging."

### Purge by Cache Tag
```
POST https://api.bunny.net/pullzone/{id}/purgeCache
Header: AccessKey: {api_key}
Body: { "CacheTag": "tag-name" }
```
- **Workflow:** Tag responses beforehand with `Cache-Tag` header on origin. Then purge by tag granularly.
- **Use Case:** Bulk invalidate related assets (e.g., all images in a collection).

---

## 5. Stream (Video Library) API

**Base URL:** `https://video.bunnycdn.com`  
**Authentication:** `AccessKey: {stream_api_key}` header  

### Core Resources

| Resource | CRUD Support | Notes |
|----------|--------------|-------|
| `/library/{libraryId}/videos` | GET, POST, DELETE | List, upload, delete videos |
| `/library/{libraryId}/videos/{videoId}` | GET, POST, DELETE | Get/update/delete specific video |
| `/library/{libraryId}/collections` | GET, POST, DELETE | Organize videos into collections |
| `/library/{libraryId}/videos/{videoId}/captions` | GET, POST | Upload/manage captions & transcriptions |
| `/library/{libraryId}/videos/{videoId}/heatmap` | GET | View viewer engagement heatmap |
| `/library/{libraryId}/statistics` | GET | Aggregated library stats |

### High-Level Capabilities
- **Video Upload:** HTTP POST multipart (typical flow).
- **Encoding:** Configured per library; automatic transcoding to multiple bitrates.
- **Playback:** Embed via player ID; supports DRM, progressive download, HLS/DASH streaming.
- **Webhooks:** Event-driven integration (upload complete, encoding done, etc.).

---

## 6. Magic Containers API

**Base URL:** `https://api.bunny.net/mc`  
**Authentication:** `AccessKey: {account_api_key}` header  
**Status:** Publicly available (not beta).

### Available Resources

| Resource | CRUD | Notes |
|----------|------|-------|
| `/apps` | GET, POST, DELETE | Create/list/delete container applications |
| `/apps/{appId}` | GET, POST | Get/update app config |
| `/apps/{appId}/endpoints` | GET, POST, DELETE | Manage service endpoints & regional deployment |
| `/apps/{appId}/volumes` | GET, POST, DELETE | Persistent storage volumes |
| `/apps/{appId}/autoscale` | GET, POST | Autoscaling rules |

### Key Operations
- Deploy Docker containers globally.
- Manage replicas, resource limits, scaling policies.
- Attach storage volumes.
- Configure health checks and restart policies.

---

## 7. Edge Scripting API

**Base URL:** `https://api.bunny.net`  
**Authentication:** `AccessKey: {account_api_key}` header  

### Core Resources

| Resource | CRUD | Notes |
|----------|------|-------|
| `/script/code` | GET, POST, DELETE | Manage edge script code |
| `/script/code/{codeId}` | GET, POST, DELETE | Specific script code version |
| `/script/edge-script` | GET, POST, DELETE | Deploy scripts to pull zones |
| `/script/releases` | GET | Track script releases |
| `/script/secrets` | GET, POST, DELETE | Manage environment secrets |
| `/script/variables` | GET, POST, DELETE | Store variables across deployments |

---

## 8. Bunny Shield API (Security)

**Base URL:** `https://api.bunny.net`  
**Authentication:** `AccessKey: {account_api_key}` header  

### Core Domains

| Domain | Resources | Notes |
|--------|-----------|-------|
| **WAF** | `/shield/waf/*` | OWASP Top 10 protection, custom rules |
| **Rate Limiting** | `/shield/rate-limit/*` | Per-IP, per-user, per-path rate limits |
| **Bot Detection** | `/shield/bot-detection/*` | Identify and block malicious bots |
| **Access Lists** | `/shield/access-lists/*` | IP allowlists/blocklists |
| **Metrics** | `/shield/events/*` | Security event logs and dashboards |

---

## 9. Rate Limits & Error Handling

### Account API Rate Limits
- **429 Status:** Returned when rate limit exceeded. Implement exponential backoff.
- **Per-Account Throttling:** Rate limits are applied per account, not per IP.
- **No Explicit Limit Published:** Typical cloud APIs use 100-500 req/sec per account; honor 429 responses.

### Edge Storage API Rate Limits
- **Per-Region, Per-Server:** Each server in a region tracks limits independently.
- **Concurrency Multiplier:** Connecting to multiple servers in a region increases effective concurrency (e.g., 2 servers = 2x concurrency).
- **File Count Ceiling:** Keep per-folder under 10,000 files.
- **Implicit Limits:** Likely 100-200 requests/sec per IP per region (not documented).

### Pagination
- **Default Behavior:** `page=0` returns all items as JSON array (suitable for small datasets).
- **Paginated Response:** `page>0` returns object: `{ "Items": [...], "CurrentPage": N, "TotalItems": M, "HasMoreItems": true/false }`.
- **Per-Page:** Default 1000, max 1000. Min 5.

### Error Response Format

```json
{
  "ErrorKey": "pullZone.not_found",
  "Field": "PullZone",
  "Message": "The requested Pull Zone was not found"
}
```

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Success |
| 201 | Created | Resource created |
| 204 | No Content | Success, no response body (purge cache) |
| 400 | Bad Request | Malformed request; check ErrorKey for details |
| 401 | Unauthorized | Invalid/missing AccessKey |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limit | Too many requests; implement backoff |
| 500 | Server Error | Bunny server issue; retry with backoff |

---

## 10. Existing CLI & SDK Tooling

### Community CLIs

| Name | Language | Features | GitHub |
|------|----------|----------|--------|
| **bunnycdn-cli (bnycdn)** | JavaScript/Node | File operations, cp-like syntax, v0.3 | [DKFN/bunnycdn-cli](https://github.com/DKFN/bunnycdn-cli) |
| **BunnyCLI** | Rust | Storage login, upload, download, file mgmt | [publicarray/BunnyCLI](https://github.com/publicarray/bunnycli) |
| **bunny-cli** | JavaScript/Node | Deploy dist folder to edge storage | [own3d/bunny-cli](https://github.com/own3d/bunny-cli) |
| **hop** | Go | Static site deployment to Bunny CDN | [StephanSchmidt/hop](https://github.com/stephanSchmidt/hop) |

**Installation:** Most available on npm (`npm install -g bnycdn`) or as binary releases.  
**Maturity:** All unofficial; low to moderate community adoption. No official Bunny-maintained CLI.

### Official SDKs

| Language | Scope | Status |
|----------|-------|--------|
| JavaScript/TypeScript | Storage, Core API | Official |
| Node.js | Storage, Core API | Official |
| Python | Storage, Core API | Community-supported |
| PHP | Storage, Core API | Official |
| C# / .NET | Storage, Core API | Official |
| Java | Storage, Core API | Official |
| Go | Storage, Core API | Community-supported |
| Deno | Core API | Official (via BunnySDK) |

**Docs:** https://bunny-launcher.net/bunny-sdk/ — quickstart guides per language.

### GitHub Actions

No official Bunny GitHub Action. Community actions available via search; integration typically done via `curl` + account API key or community CLI.

---

## 11. Gotchas & Design Notes for CLI

### Auth Model Fragmentation
- **Challenge:** Different credentials for Storage vs. Stream vs. Account operations. Users must juggle multiple keys.
- **CLI Design:** Support multiple config profiles. Auto-detect which API to call based on resource type (e.g., `storage push` uses Storage Zone password; `purge` uses Account API key).
- **Config File:** Store in `~/.bunny-tools/config.json` or `~/.config/bunny-tools/config.yaml`. Support env var override (`BUNNY_API_KEY`, `BUNNY_STORAGE_PASSWORD`).

### Regional Awareness
- **Challenge:** Storage operations require region-specific endpoint. Users may not know their zone's region.
- **CLI Design:** Fetch zone metadata on first run; cache region → endpoint mapping locally. Allow override via flag (`--region ny`).

### Rate Limiting & Concurrency
- **Challenge:** Edge Storage has per-region per-server limits; CLI could easily hit 429 if uploading many files sequentially.
- **CLI Design:** Implement parallel uploads (respect backoff on 429). Queue-based uploader with configurable concurrency (default 5-10).

### Checksum-Free Diffing
- **Challenge:** No official checksum algorithm documented; ETag may not be stable across reupload.
- **CLI Design:** Use `Last-Modified` header + file size to detect changes. For paranoid sync, compute local SHA256; store in `.bunny-sync-state.json` per directory. Compare on remote, but warn user that remote doesn't verify checksums.

### Pagination Default Behavior
- **Challenge:** `page=0` returns all items as array, which fails for large account (10K+ zones/pull zones).
- **CLI Design:** Default to `page=1, perPage=100` and iterate. Offer `--all` flag to force single request if user wants array (will fail gracefully on large dataset).

### No Multipart Upload Documented
- **Challenge:** Standard PUT may timeout on very large files (100+ MB).
- **CLI Design:** For now, document that files >100 MB may need manual tooling or smaller chunk uploads. Version 2.0 can add custom multipart if demand arises.

### Stream API Requires Per-Library Key
- **Challenge:** Users managing multiple video libraries must rotate keys.
- **CLI Design:** Allow `bunny-tools stream --library-id {id}` to specify target. Fetch library key from config or env (`BUNNY_STREAM_KEY_{LIBRARY_ID}`).

### No Official CLI Precedent
- **Challenge:** Competitive landscape has 4+ community CLIs but no Bunny-maintained reference implementation.
- **Opportunity:** bunny-tools can differentiate by:
  - Clean, consistent UX across all services (storage, DNS, pull zones, etc.).
  - Inline help (`bunny-tools help storage push`).
  - Config validation at startup.
  - Batch operations (e.g., `bunny-tools purge --tag "release-v1.*"` to purge all matching tags).

### Error Message Inconsistency
- **Challenge:** Some endpoints return `ErrorKey`, others return plain text.
- **CLI Design:** Parse both formats. Wrap errors with context: `Error: Could not delete storage zone 'old-zone' (ErrorKey: storagezone.in_use) — zone has 2 attached pull zones.`

---

## Unresolved Questions

1. **Exact Edge Storage rate limits:** Bunny doesn't publish specific req/sec limits per region. Community reports suggest 100-200 req/sec, but this is inference.

2. **Multipart upload support:** Storage API reference doesn't mention chunked uploads. Confirm whether large files (500+ MB) require custom multipart protocol or are handled via standard PUT with retries.

3. **Stream webhooks schema:** Documentation mentions webhooks exist but doesn't detail payload structure or event types. Need to fetch webhook reference docs separately.

4. **Database API surface:** Mentioned as separate auth but not detailed in this research. Likely REST-to-SQLite proxy; full endpoint map needed.

5. **Cache-Tag header persistence:** Unclear whether Cache-Tag must be set on origin or can be set client-side via API. Affects CLI design for purge workflows.

6. **Magic Containers cost model:** No pricing or resource limit info in API reference. Affects CLI's recommendation logic.

---

## Sources

- [Bunny.net Documentation Hub](https://docs.bunny.net)
- [Storage API Reference](https://docs.bunny.net/api-reference/storage/index.md)
- [Core Account API Reference](https://docs.bunny.net/api-reference/authentication.md)
- [API Keys Documentation](https://docs.bunny.net/account/api-keys.md)
- [Pull Zone Operations](https://docs.bunny.net/api-reference/core/pull-zone/)
- [Storage Zone Management](https://docs.bunny.net/api-reference/core/storage-zone/)
- [DNS Zone API](https://docs.bunny.net/api-reference/core/dns-zone/)
- [Stream / Video Library API](https://docs.bunny.net/api-reference/stream/index.md)
- [Magic Containers API](https://docs.bunny.net/api-reference/magic-containers/overview.md)
- [Edge Scripting API](https://docs.bunny.net/api-reference/scripting/index.md)
- [Bunny Shield Security API](https://docs.bunny.net/api-reference/shield/index.md)
- [Purge Cache Documentation](https://docs.bunny.net/api-reference/core/pull-zone/purge-cache)
- [HTTP Status Codes Guide](https://support.bunny.net/hc/en-us/articles/360024887131-Typical-HTTP-Response-Codes)
- [BunnyCDN CLI (Community)](https://github.com/DKFN/bunnycdn-cli)
- [BunnyCLI (Rust)](https://github.com/publicarray/bunnycli)
- [bunny-cli (own3d)](https://github.com/own3d/bunny-cli)
- [hop (Go)](https://github.com/StephanSchmidt/hop)
- [Official Bunny SDKs](https://bunny-launcher.net/bunny-sdk/)
