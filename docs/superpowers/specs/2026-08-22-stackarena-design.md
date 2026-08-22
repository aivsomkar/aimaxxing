# Stack Arena — Design Spec

**Product:** Stack Arena
**Domain:** stackarena.lol (meme redirect: aimaxxing.lol)
**Date:** 2026-08-22
**Status:** Design approved, pending spec review

---

## 1. Thesis

A public, competitive ranking of how AI-native a developer actually is — measured from real,
verified usage of AI coding tools rather than self-description.

**One line:** *Link your AI tools. Prove your stack. Climb the arena.*

The product's core loop is that **using AI tools generates the content**. A developer installs a
reporter, their real usage flows in, boards move, and a profile becomes a shareable, durable
artifact. There is no content to write and no listings to curate — the act of doing the work
someone was already doing is the input.

### Why this is not a directory

Every adjacent product we surveyed (OpenAlternative, best-of-Agent-Harnesses, botdirectory.ai,
AlternativeTo) ranks *tools* using public metadata anyone can scrape. Stack Arena ranks *people*
using private telemetry they choose to publish. The data cannot be scraped, cannot be replicated
by a competitor, and grows only through participation. That is the moat.

### Why it is commercially interesting

Because breadth is a ranking factor, adding a new tool to your stack raises your rank. This makes
Stack Arena the only place that can tell a sponsor *"400 developers installed your CLI this week
to climb the board"* — measured installs, not impressions. The advertising product falls out of
the ranking design rather than being bolted onto it.

---

## 2. Non-goals

- Ranking tools. This ranks people. Tool-level aggregates are a byproduct, never the headline.
- Being a directory of AI software.
- Judging code quality or reviewing anyone's work.
- Enterprise/team analytics as a v1 concern.
- Being neutral about participation while secretly favouring any one tool. See §9.

---

## 3. The Index

The single most important design decision. One published line of math, fully reproducible from
data shown on every profile.

```
Index = Σ √(D_t)  for every qualifying tool t   +   O
```

| Term | Meaning | Source |
| --- | --- | --- |
| `D_t` | Depth in tool *t* — **sessions** in that tool | reporter CLI |
| `O` | Account-level output — merged PRs, active repos, commits (capped) | GitHub OAuth |

### Why a square root

Concave per-tool returns, summed across tools, encode the intuition that four tools at 100
sessions each represents more genuine fluency than one tool at 400. Because each curve flattens,
the 901st session in a daily driver is worth less than the 20th session in a newly adopted tool —
so depth is respected while breadth compounds.

Worked examples (sessions as the depth proxy):

| Persona | Stack | Index |
| --- | --- | --- |
| Tourist | 8 tools x 5 sessions | ~0 (below floor) |
| Specialist | 1 tool x 400 | 20.0 |
| Balanced | 2 tools x 200 | 28.3 |
| Polyglot | 4 tools x 100 | 40.0 |
| Wide and deep | 4 tools x 400 | 80.0 |

`log` was rejected as punishing depth too harshly; linear was rejected as eliminating the breadth
incentive entirely.

### Spend is deliberately excluded from the Index

`D_t` is session count alone. Spend is displayed on every profile and drives its own board (The
Burn), but it does **not** enter the Index.

Two reasons. First, blending sessions and dollars requires an arbitrary weight, which contradicts
the reproducibility requirement below — the moment the formula contains a tunable constant nobody
can justify, the ranking becomes an opinion. Second and more important: **if spend raised the
Index, rank would be purchasable.** A well-funded developer could buy their way up simply by
running more expensive models. Keeping the Index session- and output-based makes it unbuyable,
which is the same principle as sponsors never affecting placement (§9).

### Qualifying floor

A tool contributes only at **>= 20 sessions or >= $5 spent**. Published on the methodology page.
This is the primary defence against badge farming — installing many tools to run `hello world` in
each yields approximately nothing.

### Output term

`O` is **additive and capped**, never multiplicative. A developer who works entirely in private
repositories must not be zeroed out. GitHub's contribution API returns private contribution
*counts* without exposing repository names or content; Stack Arena uses those counts so that
professionals shipping in private are not systematically under-ranked.

**Known limitation:** pull requests cannot be attributed to a specific CLI — nothing in any tool's
logs records which agent produced which commit. Output is therefore account-level and enters as a
separate term rather than folding into `D_t`. This limitation is stated publicly on the
methodology page rather than papered over.

### Transparency requirement

Every term is rendered on the profile. The formula is published. The raw per-user data is
downloadable as JSON. A ranking nobody can recompute is an opinion, not evidence — and with real
money in the metric, an unfalsifiable ranking loses credibility fast.

```
@omkar                                        Index 62.4

  claude code    412 sessions   $891    sqrt ->  20.3
  opencode       180 sessions   $142    sqrt ->  13.4
  codex cli       96 sessions   $ 38    sqrt ->   9.8
  aider           41 sessions   $ 12    sqrt ->   6.4
                                               ------
                              stack depth        49.9
                    output  38 merged PRs   +    12.5
```

---

## 4. Homepage and boards

### 4.1 The Collective Burn — the hero

The homepage leads with a single shared number: **everything every developer on the arena has ever
spent, and every token they have ever burned, added together.**

```
        1,412,880,043 TOKENS BURNED
              $ 4 8 , 2 0 1 . 7 7
        by 812 developers · $1,204 in the last 24h
```

This is the US Debt Clock pattern, and it earns the hero slot for reasons the individual boards
cannot match:

- **It is collective, not competitive.** Every participant adds to one number, so joining feels
  like contributing rather than only exposing yourself. That materially softens the confession
  problem identified in §13.
- **It only goes up.** An all-time total that visibly ticks is hypnotic and screenshot-able in a
  way a ranked table is not.
- **It generates milestones for free.** First $10k, $100k, $1M — each crossing is a post, and the
  $1M crossing is a press moment.

**Launch tactic — lead with tokens.** With 20 developers on day one the dollar figure is around
$4,000, which reads as small. The same usage is well over a billion tokens, which reads as
enormous. Both counters are shown; the token counter is sized larger until the dollar figure can
carry the headline on its own.

**Motion requirement.** The counter animates continuously between polls rather than stepping on
ingest. A frozen clock reads as a dead product — worse than no clock at all. "In the last 24h" sits
beneath the all-time figure so there is always visible movement even when growth is slow.

**Sponsored credits are excluded from the collective total** (or shown as a separate tagged line),
per the §9 rule. A credit prize must not inflate the headline number.

### 4.2 Where the money goes — the data asset

Directly beneath the counter, the collective total breaks down live:

- **By model** — Opus vs Sonnet vs GPT vs Gemini, as a share of real dollars
- **By tool** — Claude Code vs OpenCode vs Codex CLI vs Cursor
- **By token type** — input / output / cache read / cache write

The by-model split is the most commercially valuable artifact Stack Arena produces. **Live market
share of AI coding spend, measured in actual dollars, does not exist anywhere else** — not from the
labs, not from the gateways, not from analysts. It is the number journalists cite, and it is the
basis of the monthly report described in §9.

### 4.3 Boards

Rankings sit below the dashboard. Four boards, one profile. The loud board recruits; the profile
retains.

| Board | Metric | Role |
| --- | --- | --- |
| **The Burn** | Raw spend | Front door. Loud, screenshot-able, meme-ready. |
| **Breadth** | Qualifying tools in stack | The adoption engine — drives tool installs. |
| **Efficiency** | Spend per merged PR | The credibility board. |
| **The Index** | The formula above | The identity layer and default sort. |

Time windows on every board: `today / week / month / all-time`.
Filters: by tool, by model.

Rationale for keeping The Burn despite the reframe: a composite index is durable but not viral;
a raw spend number is viral but not durable. Shipping both captures the launch spike *and* the
retention curve.

---

## 5. The reporter

```
npx stackarena link

  scanning...
  Claude Code    412 sessions   $891.40
  OpenCode       180 sessions   $142.10
  Codex CLI       96 sessions   $ 38.20

  post as @omkar? [Y/n]
```

**v1 supports Claude Code, Codex CLI, and OpenCode** — the three terminal agents that write
parseable local usage logs, and precisely the audience being targeted. Cursor has no usable local
usage log and is self-report only in v1.

De-risking note: the npm package `ccusage` already parses Claude Code's JSONL usage format, so
this parsing is proven rather than speculative.

### Privacy contract

**Only aggregates leave the machine.** No prompts, no code, no file paths, no repository names.
Per tool, per model, per day: session count, token counts, computed cost.

This sentence belongs on the homepage in large type. It is the difference between developers
installing the reporter and not, and it is not negotiable for the sake of a richer metric later.

---

## 6. Trust and verification

| Badge | Meaning |
| --- | --- |
| Verified | Signed by the reporter's keypair, generated at `link` time |
| Self-reported | Manual entry, visibly marked, sorted below verified at equal value |

Plus per-account sanity caps and rate limits on ingest. The methodology page publishes exactly how
verification works. Catching fabricated entries in public is content, not embarrassment.

---

## 7. Data model

```
users            github_id, handle, avatar_url, created_at
reporters        user_id, machine_id, public_key, linked_at, last_seen_at
tool_days        user_id, tool, model, day, sessions,
                 tokens_in, tokens_out, cache_read, cache_write,
                 cost_usd, source (reporter|manual), verified
github_stats     user_id, merged_prs, active_repos, contributions, synced_at
index_snapshots  user_id, period, stack_depth, output_term, index, computed_at
collective       day, tokens_in, tokens_out, cache_read, cache_write, cost_usd
                 (rolled up nightly; the live counter reads this plus today's deltas)
sponsors         slot, name, url, blurb, starts_on, ends_on   (JSON-backed in v1)
```

Boards are computed queries over `tool_days` and `github_stats`; `index_snapshots` exists for
history and rank-delta arrows.

---

## 8. Architecture

- **Web:** Next.js (App Router) + Tailwind, deployed on Vercel
- **DB:** Postgres via Drizzle
- **Auth:** GitHub OAuth via Auth.js — identity and the output term come from the same token
- **CLI:** small Node package published to npm as `stackarena`
- **Share cards:** Next.js `ImageResponse` at `/@handle/card`
- **Ticker:** polling, no websockets in v1

Same stack as linkdbots so there is no new learning curve, but a **separate repository with no
shared code**.

---

## 9. Sponsorship

Space is reserved in v1; **no billing is built**. One slot component driven by a JSON file, plus a
`/sponsor` page stating a flat monthly price and a contact address. Nobody buys space on an empty
arena, and hand-invoicing the first three sponsors costs less than building checkout.

### Rules, published on the methodology page before anything is sold

1. **Sponsors fund boards and prizes. Sponsors never affect placement.** The first time a bought
   rank is suspected, both the audience and the advertising product are gone.
2. **Breadth counts every tool identically, sponsored or not.** No exceptions.
3. **Sponsored credits are tagged separately in the burn metric.** Otherwise a credit prize
   inflates the recipient's numbers and the board becomes fiction.

### Neutrality regarding OpenMausBot

Stack Arena is a neutral arena. OpenMausBot receives no ranking advantage, no default placement,
and no featured position it did not earn. This is a commercial requirement, not only an ethical
one: a board engineered to favour one harness cannot sell sponsorship to any competing harness,
which reduces the addressable advertiser pool to one.

The accepted consequence is that Stack Arena may publish data unflattering to OpenMausBot. That is
treated as product feedback.

---

## 10. Content engine

- **Live ticker** — `$8,412 burned in the last hour across 812 developers`
- **Share card** — auto-generated OG image: *"@omkar · Index 62.4 · 4 tools · top 4%"*, one click to X
- **Milestones** — crossing an Index threshold or a spend threshold fires a public event
- **Rank deltas** — up/down arrows against the previous period on every board

These exist specifically to make posting effortless, because posting is the only distribution.

---

## 11. v1 scope

**In:** GitHub sign-in · reporter CLI for Claude Code / Codex CLI / OpenCode · manual entry with
self-reported badge · four boards with time windows · public profiles with the full Index
breakdown · share cards · live ticker · methodology page · sponsor page (no billing) ·
downloadable per-user JSON.

**Out:** teams and orgs · duels · prize pools · payments · MCP server · Cursor auto-detection ·
historical charts · notifications · comments.

Each item in the "out" list is a real idea. None of them is why someone posts a screenshot in
week one.

---

## 12. Launch

Seed the board with Omkar's and Milind's real numbers before anyone else sees it — an arena with
two honest entries reads better than one with zero.

The launch post is the transparency itself: *"Here's exactly what I spend on AI and every tool I
run. Public board. Add yours."* One post, same on X (Milind's audience) and Instagram (~4k).
Radical transparency and the product-as-marketing in a single artifact.

---

## 13. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Novelty decay — spikes and dies | High | The Index and profiles provide durability the Burn board alone cannot |
| Collective counter stalls and reads dead | Medium | Always pair all-time with a 24h figure; animate between polls (§4.1) |
| Cold start — an empty arena is fatal | High | Seed with founders; ship only when the board looks alive |
| Badge farming via shallow installs | Medium | Qualifying floor, published and enforced |
| Fabricated entries | Medium | Verified badge from day one, not as a follow-up |
| Privacy scare kills installs | Medium | Aggregates-only contract, stated on the homepage, never weakened |
| Confession problem — spend is embarrassing | Medium | Index is the hero; Burn is opt-in visible, not the only identity |
| Private-repo workers under-ranked | Medium | GitHub private contribution counts; output capped and additive |

---

## 14. Open questions

1. ~~Homepage default~~ — **resolved: The Burn is the homepage default**, led by the
   Collective Burn counter (§4.1), with rankings below and the Index one click away.
2. Does manual self-reported entry exist at launch at all, or only after the reporter proves out?
   *Recommendation: include it — it lets Cursor users participate, and the badge keeps it honest.*
3. Public leaderboard opt-in or opt-out at link time?
   *Recommendation: explicit opt-in. A privacy accident at launch is unrecoverable.*

---

**End of spec**
