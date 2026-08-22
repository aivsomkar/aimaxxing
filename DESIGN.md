# AI Maxxing — Design System

Reference: **outbid.lol**. We adopt its design *language* and page architecture. We do not
copy its palette identity — see "What we change" below.

---

## What outbid.lol actually does (extracted from its stylesheet)

### Palette — warm neutrals, never gray

The distinctive choice. Nothing is a neutral gray; every surface is warmed toward brown.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#fffdfa` | `#1a1512` |
| `--foreground` | `#282624` | `#f7f5f1` |
| `--card` | `#fffdfa` | `#231e1b` |
| `--muted` | `#f6f3ef` | `#2d2824` |
| `--muted-foreground` | `#67625d` | `#aba39b` |
| `--border` | `#e6e0da` | `#ffffff1a` |
| `--primary` | `#e57255` | `#e57255` (unchanged) |
| `--live` | `#009f31` | `#50c05f` |
| `--destructive` | `#e40014` | `#ff6568` |

Two details worth stealing outright:

1. **The accent does not change between themes.** `--primary` is the same terracotta in light and
   dark, so the brand colour is a constant and only the ground moves.
2. **Liveness has its own semantic token.** `--live` exists solely for the online dot and real-time
   indicators. Giving "this is happening right now" a dedicated colour — rather than reusing
   success-green — is why the page reads as alive.

### Type

- **Sans:** DM Sans
- **Mono:** Geist Mono — used for every number: bids, ranks, counts, timestamps

Numbers in mono against sans body copy is what makes a leaderboard read as a ticker rather than a
list. Use `tabular-nums` everywhere a number can change, so digits do not jitter as values update.

### Shape

- `--radius: 0.875rem` (14px) — noticeably rounder than the typical 6-8px. Soft, friendly, modern.
- shadcn/ui token structure throughout (`card`, `popover`, `muted`, `accent`, `ring`, `chart-1..5`).

### Page architecture

```
┌─────────────────────────────────────────────┐
│ wordmark            Leaderboard About Rules │  header
├─────────────────────────────────────────────┤
│ ● 589 online · 1,149,821 visitors · stats → │  LIVE STAT BAR
├─────────────────────────────────────────────┤
│                                             │
│         the primary action, big             │  HERO ACTION
│         [ − ]  $14,018  [ + ]   [Outbid]    │
│         new spots start at $5               │
│                                             │
├──────────────────────┬──────────────────────┤
│ 🔥 Trending right now│ Latest activity      │  TWO LIVE PANELS
│ aurafry  2845 clicks/h│ bindqr at #631 · $5 │
│ insertchat 790/h     │ 3 minutes ago        │
├──────────────────────┴──────────────────────┤
│ #1  J  joni.ai              $14,013         │
│     description…                            │  RANKED LIST
│     13h ago · 7555 clicks                   │
│                    claim this rank for $X → │
└─────────────────────────────────────────────┘
```

The lesson: **the live proof comes before the leaderboard.** Three separate real-time signals
(online count, trending velocity, activity feed) all appear above the fold, so the page proves it
is alive before asking anyone to participate.

---

## What we change

Copying `#e57255` would make us a visible knockoff, which is explicitly not the goal. We keep the
system and move the identity:

| | outbid.lol | AI Maxxing |
| --- | --- | --- |
| Accent | terracotta `#e57255` | ember `#ff5c1a` — hotter, reads as fire, fits "burn" |
| Ground | warm off-white default | **dark by default** (`#12100e`), light available |
| Mono | Geist Mono | Geist Mono (keep — it is the right face for tickers) |
| Sans | DM Sans | DM Sans (keep) |
| Radius | 0.875rem | 0.875rem (keep) |
| `--live` | green | green (keep — the semantic is correct) |

Dark-by-default is the meaningful divergence. outbid.lol is a marketplace and wants to feel open
and bright; AI Maxxing is an arena about burning money, and a dark ground makes an orange counter
glow. It also differentiates us at a glance from the .lol wave.

### Tokens

```css
:root {
  --background: #faf8f5;  --foreground: #1c1917;
  --card: #ffffff;        --card-foreground: #1c1917;
  --muted: #f2efea;       --muted-foreground: #6b635b;
  --border: #e4ded6;      --input: #e4ded6;
  --primary: #ff5c1a;     --primary-foreground: #ffffff;
  --live: #009f31;        --destructive: #e40014;
  --radius: 0.875rem;
}

:root:not([data-theme="light"]) { /* dark is the default */
  --background: #12100e;  --foreground: #f7f5f1;
  --card: #1c1916;        --card-foreground: #f7f5f1;
  --muted: #24201c;       --muted-foreground: #a8a09a;
  --border: #ffffff14;    --input: #ffffff24;
  --primary: #ff5c1a;     --primary-foreground: #ffffff;
  --live: #50c05f;        --destructive: #ff6568;
}
```

---

## Our page architecture

Same three-live-signals-before-the-board principle, mapped onto our data:

```
┌──────────────────────────────────────────────────────┐
│ aimaxxing.lol        Leaderboard  Methodology  Add me│
├──────────────────────────────────────────────────────┤
│ ● 812 developers · 1.4B tokens · $48,201 burned      │  LIVE STAT BAR
├──────────────────────────────────────────────────────┤
│              1,412,880,043                           │
│              TOKENS BURNED                           │  THE COLLECTIVE
│              $48,201.77                              │  COUNTER (hero)
│        by 812 developers · $1,204 last 24h           │
│        [████████░░░░] where the money went           │
├───────────────────────────┬──────────────────────────┤
│ 🔥 Biggest burners today  │ Latest cards             │  TWO LIVE PANELS
│ @omkar      $412 today    │ @dev added opencode      │
│ @milind     $388 today    │ 3 minutes ago            │
├───────────────────────────┴──────────────────────────┤
│ #1  O  @omkar          Index 62.4  ✅                │
│        4 tools · $891 burned · 38 PRs                │  RANKED LIST
│        claude code · opencode · codex · aider        │
└──────────────────────────────────────────────────────┘
```

Board tabs (Burn / Breadth / Efficiency / Index) sit directly above the ranked list.

## Rules for implementers

1. **Every number is `font-mono` and `tabular-nums`.** No exceptions. Values change live.
2. **Never hardcode a colour.** Use the tokens above. A raw `text-orange-600` is a defect.
3. **The counter animates between polls** — a frozen ticker reads as a dead site.
4. **`--live` is only for real-time indicators** — the online dot, "just now" badges. Never for
   success states or generic green.
5. **Light and dark must both work.** Define the full light palette on bare `:root`; override only
   what changes in the dark block.
6. Verified ✅ and self-reported 🔶 badges appear on every row that carries a value.
