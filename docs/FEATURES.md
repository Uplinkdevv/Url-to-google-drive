# Feature inventory

Target: **300+ working and verified related capabilities**. This inventory contains 320 planned capabilities.

Current source-backed implementations: **209**. No item is yet labelled individually verified. This is a development milestone, not a claim that the full request is complete.

Statuses: **planned** = not delivered; **implemented** = source exists, acceptance work remains; **verified** = recorded acceptance evidence confirms the whole capability.

## Import and intake

| ID | Capability | Status |
| --- | --- | --- |
| F001 | Single direct URL intake | implemented |
| F002 | Multiline URL batch intake | implemented |
| F003 | Plain-text file import | implemented |
| F004 | CSV transfer import | implemented |
| F005 | JSON transfer import | implemented |
| F006 | Batch-wide destination defaults | implemented |
| F007 | Batch-wide priority defaults | implemented |
| F008 | Batch-wide tag defaults | implemented |
| F009 | Comment lines in text imports | implemented |
| F010 | Duplicate URL detection | implemented |
| F011 | Import error row numbers | planned |
| F012 | Import preview before enqueue | planned |
| F013 | Drag-and-drop import files | planned |
| F014 | Clipboard URL extraction | planned |
| F015 | HTML bookmark import | planned |
| F016 | Markdown link import | planned |

## Queue management

| ID | Capability | Status |
| --- | --- | --- |
| F017 | Persistent transfer queue | implemented |
| F018 | Configurable concurrent transfers | implemented |
| F019 | High-priority job ordering | implemented |
| F020 | Pause waiting job | implemented |
| F021 | Resume waiting job | implemented |
| F022 | Pause queue dispatch | implemented |
| F023 | Resume queue dispatch | implemented |
| F024 | Cancel active transfer | implemented |
| F025 | Cancel waiting transfer | implemented |
| F026 | Retry failed transfer | implemented |
| F027 | Retry cancelled transfer | implemented |
| F028 | Retry interrupted transfer with new URL | implemented |
| F029 | Bulk queue actions | implemented |
| F030 | Atomic batch validation | implemented |
| F031 | Queue capacity limit | implemented |
| F032 | Move job to front | planned |

## Scheduling

| ID | Capability | Status |
| --- | --- | --- |
| F033 | One-time scheduled start | implemented |
| F034 | Local-time schedule input | implemented |
| F035 | Overdue job dispatch after reconnect | implemented |
| F036 | Scheduled jobs respect queue pause | implemented |
| F037 | Scheduled job timestamp display | implemented |
| F038 | Edit scheduled time | planned |
| F039 | Clear scheduled time | planned |
| F040 | Daily recurring transfer | planned |
| F041 | Weekly recurring transfer | planned |
| F042 | Monthly recurring transfer | planned |
| F043 | Weekday-only recurrence | planned |
| F044 | Recurring schedule end date | planned |
| F045 | Skip next scheduled occurrence | planned |
| F046 | Schedule timezone selection | planned |
| F047 | Schedule calendar view | planned |
| F048 | Quiet-hours scheduling | planned |

## Names and metadata

| ID | Capability | Status |
| --- | --- | --- |
| F049 | Custom upload file name | implemented |
| F050 | Source Content-Disposition file name | implemented |
| F051 | UTF-8 source file names | implemented |
| F052 | Rename waiting transfer | implemented |
| F053 | Date token in file names | implemented |
| F054 | Time token in file names | implemented |
| F055 | Source host token in file names | implemented |
| F056 | Original name token in file names | implemented |
| F057 | Base name token in file names | implemented |
| F058 | Extension token in file names | implemented |
| F059 | Path separator sanitization | implemented |
| F060 | Transfer notes | implemented |
| F061 | Drive description from notes | implemented |
| F062 | Sequential file numbering | planned |
| F063 | Name search-and-replace | planned |
| F064 | Case conversion rules | planned |

## Drive destinations

| ID | Capability | Status |
| --- | --- | --- |
| F065 | Upload to My Drive | implemented |
| F066 | List app-created folders | implemented |
| F067 | Create destination folder | implemented |
| F068 | Create nested destination folder | implemented |
| F069 | Select upload destination | implemented |
| F070 | Refresh destination folders | implemented |
| F071 | Folder name search | planned |
| F072 | Favorite destination folders | planned |
| F073 | Recent destination folders | planned |
| F074 | Folder breadcrumbs | planned |
| F075 | Rename app-created folder | planned |
| F076 | Star app-created folder | planned |
| F077 | Open destination in Drive | planned |
| F078 | Create folder path automatically | planned |
| F079 | Destination storage quota check | planned |
| F080 | Shared-drive destination support | planned |

## Google connection

| ID | Capability | Status |
| --- | --- | --- |
| F081 | Desktop OAuth client JSON loading | implemented |
| F082 | Google browser authorization | implemented |
| F083 | PKCE authorization protection | implemented |
| F084 | OAuth callback state verification | implemented |
| F085 | Authorization expiry validation | implemented |
| F086 | Limited drive.file access scope | implemented |
| F087 | Automatic access-token refresh | implemented |
| F088 | Concurrent token refresh deduplication | implemented |
| F089 | Local Google disconnect | implemented |
| F090 | Credential-free queue preparation | implemented |
| F091 | Connection status indicator | implemented |
| F092 | Guided Google client setup | implemented |
| F093 | Account identity display | planned |
| F094 | Drive storage quota display | planned |
| F095 | Google grant revocation | planned |
| F096 | Multiple Google accounts | planned |

## Transfer engine

| ID | Capability | Status |
| --- | --- | --- |
| F097 | Stream without complete disk copy | implemented |
| F098 | Configurable upload chunk size | implemented |
| F099 | Google resumable upload sessions | implemented |
| F100 | Chunk retry with backoff | implemented |
| F101 | Server acknowledgement recovery probe | implemented |
| F102 | Upload progress display | implemented |
| F103 | Transfer speed display | implemented |
| F104 | Remaining-time estimate | implemented |
| F105 | Per-transfer bandwidth limit | implemented |
| F106 | Maximum file-size limit | implemented |
| F107 | HTTP redirect handling | implemented |
| F108 | Unknown source-length streaming | implemented |
| F109 | Empty file uploads | implemented |
| F110 | Automatic MIME detection | implemented |
| F111 | Source inactivity timeout | implemented |
| F112 | Google request timeout | implemented |

## Integrity and recovery

| ID | Capability | Status |
| --- | --- | --- |
| F113 | SHA-256 calculation | implemented |
| F114 | Expected SHA-256 validation | implemented |
| F115 | MD5 calculation | implemented |
| F116 | Drive MD5 comparison | implemented |
| F117 | Source length mismatch detection | implemented |
| F118 | Finalization response validation | implemented |
| F119 | Interrupted job recovery state | implemented |
| F120 | Partially acknowledged chunk detection | implemented |
| F121 | Invalid upload session rejection | implemented |
| F122 | Source ETag capture | planned |
| F123 | Source ETag change detection | planned |
| F124 | Range-based source resume | planned |
| F125 | Cross-restart upload resume | planned |
| F126 | Resume session expiry handling | planned |
| F127 | Source URL renewal for expired links | planned |
| F128 | Integrity report export | planned |

## Transfer history

| ID | Capability | Status |
| --- | --- | --- |
| F129 | Persistent local transfer history | implemented |
| F130 | Newest-first history sorting | implemented |
| F131 | Oldest-first history sorting | implemented |
| F132 | Alphabetical history sorting | implemented |
| F133 | Size-based history sorting | implemented |
| F134 | Priority-based history sorting | implemented |
| F135 | Search transfer names | implemented |
| F136 | Search transfer source hosts | implemented |
| F137 | Search transfer notes | implemented |
| F138 | Search transfer tags | implemented |
| F139 | Filter transfer status | implemented |
| F140 | History pagination | implemented |
| F141 | Archive finished transfer | implemented |
| F142 | Unarchive finished transfer | implemented |
| F143 | Remove local history entry | implemented |
| F144 | Clear unpinned finished history | implemented |

## Organization

| ID | Capability | Status |
| --- | --- | --- |
| F145 | Add transfer tags | implemented |
| F146 | Edit transfer tags | implemented |
| F147 | Deduplicate transfer tags | implemented |
| F148 | Pin transfer | implemented |
| F149 | Unpin transfer | implemented |
| F150 | Pinned-only view | implemented |
| F151 | Include archived transfers view | implemented |
| F152 | Select visible transfers | implemented |
| F153 | Bulk archive transfers | implemented |
| F154 | Bulk remove history entries | implemented |
| F155 | Edit transfer notes | implemented |
| F156 | Edit waiting transfer priority | implemented |
| F157 | Transfer detail view | implemented |
| F158 | Copy completed Drive link | implemented |
| F159 | Open completed file in Drive | implemented |
| F160 | Save filtered views | planned |

## Transfer templates

| ID | Capability | Status |
| --- | --- | --- |
| F161 | Create transfer template | implemented |
| F162 | List transfer templates | implemented |
| F163 | Apply transfer template | implemented |
| F164 | Delete transfer template | implemented |
| F165 | Template name validation | implemented |
| F166 | Template naming pattern | implemented |
| F167 | Template default tags | implemented |
| F168 | Template default priority | implemented |
| F169 | Template destination field | planned |
| F170 | Template HTML preference field | planned |
| F171 | Template notes field | planned |
| F172 | Update existing template | planned |
| F173 | Duplicate template | planned |
| F174 | Export templates | planned |
| F175 | Import templates | planned |
| F176 | Template usage statistics | planned |

## Automation rules

| ID | Capability | Status |
| --- | --- | --- |
| F177 | Create routing rule | planned |
| F178 | Edit routing rule | planned |
| F179 | Delete routing rule | planned |
| F180 | Enable or disable routing rule | planned |
| F181 | Match source hostname | planned |
| F182 | Match file extension | planned |
| F183 | Match file MIME type | planned |
| F184 | Match file name substring | planned |
| F185 | Match file size range | planned |
| F186 | Route matched files to folder | planned |
| F187 | Apply matched naming pattern | planned |
| F188 | Apply matched tags | planned |
| F189 | Apply matched priority | planned |
| F190 | Rule precedence ordering | planned |
| F191 | Preview rule results | planned |
| F192 | Export and import routing rules | planned |

## Notifications and activity

| ID | Capability | Status |
| --- | --- | --- |
| F193 | In-app completion notifications | implemented |
| F194 | In-app failure notifications | implemented |
| F195 | Dismiss status notification | implemented |
| F196 | Persistent queue event journal | implemented |
| F197 | Connection event journal | implemented |
| F198 | Event timestamps | implemented |
| F199 | Offline browser notification | implemented |
| F200 | Online browser notification | implemented |
| F201 | Desktop completion notifications | planned |
| F202 | Desktop failure notifications | planned |
| F203 | Notification permission control | planned |
| F204 | Queue-drained notification | planned |
| F205 | Daily transfer summary | planned |
| F206 | Notification sound toggle | planned |
| F207 | Activity event filtering | planned |
| F208 | Activity JSON export | planned |

## Preferences

| ID | Capability | Status |
| --- | --- | --- |
| F209 | Light appearance | implemented |
| F210 | Dark appearance | implemented |
| F211 | System appearance preference | implemented |
| F212 | Compact row density | implemented |
| F213 | Adjustable status refresh interval | implemented |
| F214 | Default transfer priority | implemented |
| F215 | Default transfer tags | implemented |
| F216 | Default file-name pattern | implemented |
| F217 | Default HTML permission | implemented |
| F218 | Default duplicate policy | implemented |
| F219 | Configurable history retention count | implemented |
| F220 | Confirmation before cancel | implemented |
| F221 | Reset preferences | implemented |
| F222 | Persistent preferences | implemented |
| F223 | Default destination selection | planned |
| F224 | Export and import preferences | planned |

## Privacy and security

| ID | Capability | Status |
| --- | --- | --- |
| F225 | Loopback-only server binding | implemented |
| F226 | Host header validation | implemented |
| F227 | Origin validation for mutations | implemented |
| F228 | Session anti-forgery token | implemented |
| F229 | Content Security Policy | implemented |
| F230 | Private-network URL blocking | implemented |
| F231 | DNS pinning for source requests | implemented |
| F232 | Redirect destination validation | implemented |
| F233 | Memory-only Google tokens | implemented |
| F234 | Opt-in source URL persistence | implemented |
| F235 | Redacted source URLs in history API | implemented |
| F236 | CSV formula injection protection | implemented |
| F237 | Request-body size limit | implemented |
| F238 | Referrer suppression | implemented |
| F239 | Google secrets excluded from Git | implemented |
| F240 | Encrypted source URL storage | planned |

## Accessibility and usability

| ID | Capability | Status |
| --- | --- | --- |
| F241 | Keyboard main navigation | implemented |
| F242 | Keyboard new-transfer shortcut | implemented |
| F243 | Keyboard search shortcut | implemented |
| F244 | Skip-to-content link | implemented |
| F245 | Labelled form inputs | implemented |
| F246 | Accessible upload progress | implemented |
| F247 | Live notification region | implemented |
| F248 | Dialog Escape dismissal | implemented |
| F249 | Responsive mobile layout | implemented |
| F250 | Reduced-motion preference | implemented |
| F251 | Empty-state guidance | implemented |
| F252 | Inline transfer validation errors | implemented |
| F253 | Disabled unavailable Drive actions | implemented |
| F254 | Accessible selection checkboxes | implemented |
| F255 | Keyboard shortcut help | implemented |
| F256 | User-controlled font scale | planned |

## Insights and reporting

| ID | Capability | Status |
| --- | --- | --- |
| F257 | Total transferred bytes | implemented |
| F258 | Active transfer count | implemented |
| F259 | Completed transfer count | implemented |
| F260 | Queued transfer count | implemented |
| F261 | Combined transfer speed | implemented |
| F262 | Recent transfer overview | implemented |
| F263 | Transfer duration record | implemented |
| F264 | Transfer attempt count | implemented |
| F265 | CSV history export | implemented |
| F266 | JSON history export | implemented |
| F267 | Workspace backup export | implemented |
| F268 | Success-rate chart | planned |
| F269 | Transfer volume by day | planned |
| F270 | Bytes by source host | planned |
| F271 | File-type breakdown | planned |
| F272 | Time-range report filters | planned |

## Portability and operations

| ID | Capability | Status |
| --- | --- | --- |
| F273 | Windows launch script | implemented |
| F274 | macOS launch script | planned |
| F275 | Linux launch script | planned |
| F276 | Dependency-free Node runtime | implemented |
| F277 | Configurable server port | implemented |
| F278 | Configurable local data directory | implemented |
| F279 | Atomic workspace writes | implemented |
| F280 | Corrupt-state preservation | implemented |
| F281 | Health endpoint | implemented |
| F282 | Graceful shutdown | implemented |
| F283 | Portable release archive | planned |
| F284 | Windows packaged executable | planned |
| F285 | Docker deployment | planned |
| F286 | Workspace backup restore | planned |
| F287 | Local workspace migration | planned |
| F288 | Versioned data migrations | planned |

## Project quality

| ID | Capability | Status |
| --- | --- | --- |
| F289 | Automated queue lifecycle tests | implemented |
| F290 | Automated upload protocol tests | implemented |
| F291 | Automated local API tests | implemented |
| F292 | Automated source security tests | implemented |
| F293 | Automated import export tests | implemented |
| F294 | Automated preference validation tests | implemented |
| F295 | Continuous integration on Linux | planned |
| F296 | Continuous integration on Windows | planned |
| F297 | Continuous integration on macOS | planned |
| F298 | Dependency vulnerability scanning | planned |
| F299 | Release packaging workflow | planned |
| F300 | Contribution guide | planned |
| F301 | Security reporting guide | planned |
| F302 | Troubleshooting guide | planned |
| F303 | Feature evidence inventory | implemented |
| F304 | Preserved repository license | planned |

## Source intelligence

| ID | Capability | Status |
| --- | --- | --- |
| F305 | Direct URL validation | implemented |
| F306 | Embedded URL credential rejection | implemented |
| F307 | HTML download detection | implemented |
| F308 | Explicit HTML download override | implemented |
| F309 | Source domain display | implemented |
| F310 | Source file extension display | implemented |
| F311 | Preflight source metadata inspection | planned |
| F312 | Source content-length preview | planned |
| F313 | Source MIME preview | planned |
| F314 | Source redirect-chain preview | planned |
| F315 | Source filename preview | planned |
| F316 | HTTP to HTTPS suggestion | planned |
| F317 | Expired-link error guidance | planned |
| F318 | Source host allowlist | planned |
| F319 | Source host blocklist | planned |
| F320 | Per-host concurrency limits | planned |
