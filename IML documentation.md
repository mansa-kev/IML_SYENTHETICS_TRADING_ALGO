# IML documentation

## Purpose of this document

This document explains the current structure and behavior of **Infinity Markets Lab (IML)** as implemented in this repository.

It is written for a **future AI engineer or agent** whose job is to rebuild, extend, or replicate the system **as it actually exists now**, not as an idealized design. Where the implementation contains strong conventions, hidden invariants, or behavior that is easy to misread from the UI labels, this document makes those explicit.

The most important objective of this document is to explain:

- The **system architecture**
- The **runtime data flow**
- The **algorithmic trading behavior**
- The **risk engine and governor behavior**
- The **Deriv live-trading integration model**
- The **reporting and persistence model**
- The **exact replication constraints** another AI must preserve

---

# 1. High-level identity of Infinity Markets Lab

IML is a **single-repo full-stack trading system** composed of:

- A **Node/TypeScript backend** in `server.ts`
- A **React frontend** in `src/App.tsx`
- A **single shared type layer** in `src/types/iml.ts`
- A **live Deriv WebSocket bridge** for market data, account data, and contract execution
- A **multi-sub-algorithm trading engine** that trades several synthetic Deriv instruments simultaneously
- A **Governor layer** that audits, vetoes, promotes, and adapts sub-algorithms
- A **reporting subsystem** that generates PDF reports and AI summaries
- A **persistence layer** centered on Supabase, with local operation possible when Supabase env vars are absent

The system is not architected as many microservices. It is a **monolithic engine** with most authoritative logic concentrated in `server.ts`.

This matters for replication:

- **The backend is the source of truth** for trading logic, state, regime detection, position management, and reporting.
- **The frontend is a control surface and visualization layer**, not the core logic layer.
- Most important trading behavior is **stateful and event-driven** around live ticks from Deriv.

---

# 2. Repository structure

## 2.1 Root-level files

- `server.ts`
  - The main backend entry point.
  - Contains:
    - Express server
    - Deriv WebSocket bridge
    - In-memory state
    - Persistence routines
    - indicator math
    - regime detection
    - trading engine
    - governor logic
    - risk logic
    - position management
    - trade settlement
    - machine-learning-style adaptation
    - backtest helpers
    - report generation
    - API routes

- `src/App.tsx`
  - Main frontend application.
  - Large single-file React dashboard.
  - Pulls server state via polling and exposes operator controls.

- `src/main.tsx`
  - Standard React bootstrapping.

- `src/index.css`
  - Styling.

- `src/types/iml.ts`
  - Shared type definitions used by the system.

- `package.json`
  - Runtime and build scripts.

- `README.md`
  - Minimal project startup instructions. Not the authoritative design document.

- `reports/`
  - Generated PDF reports.

- `state_persistence.json`
  - Present in repo, but the current implementation explicitly treats Supabase as the active persistence path.

## 2.2 Source layout philosophy

The codebase is intentionally or historically **centralized**, not heavily modularized.

A future AI replicating the system exactly should assume:

- `server.ts` is the main domain model.
- Many responsibilities that would normally be split into services are in one file.
- The architecture is **functional/state-machine-like** rather than object-oriented in a strict sense.

---

# 3. Runtime architecture

## 3.1 Frontend

The frontend is a **single React dashboard** in `src/App.tsx`.

Its primary responsibilities are:

- Poll `/api/state`
- Poll `/api/ticks`
- Show live account and session metrics
- Show active positions and completed trades
- Show sub-algorithm status and tuners
- Allow operator actions:
  - start/stop trading
  - switch symbol focus
  - change mode
  - change risk preset
  - tune sub-algorithms
  - place manual trades
  - request manual position close on Deriv
  - reset session
  - force report generation

The frontend is **not authoritative** for trading decisions.

## 3.2 Backend

The backend is an Express application started from `server.ts`.

It does all of the following:

- Maintains trading state in memory
- Connects to Deriv WS
- Receives live ticks and account updates
- Builds candles from tick data
- Computes indicators and fractal metrics
- Processes one sub-algorithm tick at a time
- Manages risk and governor logic
- Places live orders on Deriv
- Reconciles closed contracts from Deriv
- Produces trade records and stats
- Persists state/trades/logs to Supabase
- Generates PDF reports and AI summaries

## 3.3 Live data loop

The live loop is:

1. Deriv sends historical ticks for warmup.
2. Deriv sends real-time ticks per instrument.
3. Each tick is appended to `tickBuffers`.
4. Candles are updated in `candleBuffers`.
5. `processSubAlgorithmTick(symbol, currentPrice, epoch)` is called.
6. That function:
   - updates existing positions
   - computes indicators
   - computes regime and fractal metrics
   - updates sub-algorithm runtime state
   - lets the governor choose focus/mode
   - optionally generates a signal
   - sizes the trade
   - applies governor scrutiny
   - sends a live Deriv order
7. Deriv later confirms buy/contract linkage.
8. Deriv later confirms contract closure through `proposal_open_contract` updates.
9. The system settles the trade into `completedTrades`.

---

# 4. Core state model

The backend stores most state in global variables.

## 4.1 Account/session state

Important global variables include:

- `balance`
- `peakBalance`
- `tradingEnabled`
- `selectedSymbol`
- `tradingMode`
- `riskPreset`
- `botSessionId`
- `sessionStartBalance`
- `consecutiveLosses`
- `consecutiveWins`
- `sessionBlocked`

Important invariant:

- **Balance is authoritative from Deriv WebSocket balance events, not from local settlement math.**

## 4.2 Market buffers

- `tickBuffers: Record<string, number[]>`
- `candleBuffers: Record<string, Candle[]>`
- `maxBufferLength = 2000`

Each supported symbol has its own rolling buffer.

These buffers are used for:

- RSI
- Bollinger Bands
- VWAP
- ATR/ADX
- Hurst/DFA/RS
- KAMA
- tail metrics
- backtesting/reporting snapshots

## 4.3 Trading state

- `activePositions: ActivePosition[]`
- `completedTrades: TradeRecord[]`
- `pendingOrderQueue`

Important invariant:

- `activePositions` contains locally tracked positions that may initially have local temporary IDs before being linked to Deriv contract IDs.
- `completedTrades` is intended to represent **authoritative, closed trade history**.
- After the live-close fix, recovered persisted trades are filtered so only trades with `derivCloseConfirmed === true` are retained from persisted state.

## 4.4 Shared types

The most important types are in `src/types/iml.ts`:

- `MarketRegime`
- `Tick`
- `Candle`
- `ActivePosition`
- `TradeRecord`
- `LearningParams`
- `SubAlgorithm`

Two critical recent invariants:

- `ActivePosition` stores **entry-time analytics snapshots**
- `TradeRecord` stores `derivCloseConfirmed`

This is important because reports and analytics should not be reconstructed from exit-time state if exact replication is required.

---

# 5. Supported markets and sub-algorithm personalities

IML currently supports six instruments.

## 5.1 Instrument metadata

The instrument map is defined in both frontend and backend with matching semantics.

### R_10

- Name: `Volatility 10 (1s)`
- Volatility: `0.12`
- Ideal strategy label: `mean_reversion`

### R_25

- Name: `Volatility 25 (1s)`
- Volatility: `0.28`
- Ideal strategy label: `mean_reversion`

### R_75

- Name: `Volatility 75 (1s)`
- Volatility: `0.85`
- Ideal strategy label: `breakout`

### R_100

- Name: `Volatility 100 Index`
- Volatility: `1.05`
- Ideal strategy label: `breakout`

### CRASH500

- Name: `Crash 500 Index`
- Volatility: `0.35`
- Ideal strategy label: `spike_fade`

### BOOM500

- Name: `Boom 500 Index`
- Volatility: `0.35`
- Ideal strategy label: `spike_fade`

## 5.2 Sub-algorithms

The system uses a **sub-algorithm per instrument**.

This is not six completely different code paths. It is the **same core engine** parameterized per symbol.

Each sub-algorithm has:

- a symbol
- a name
- a personality label
- oscillator thresholds
- Bollinger settings
- confluence threshold
- ATR stop multiplier
- dynamic risk multiplier
- local win/loss/performance counters
- live runtime indicator values
- optional fractal statistics

### R_10

- Personality: `Aegis Mean Fader`
- RSI oversold: `30`
- RSI overbought: `70`
- BB period: `20`
- BB std: `2.20`
- Min confluence: `3`
- ATR stop multiplier: `2.50`
- Target risk stake multiplier: `0.75`
- Target loss pct: `0.15`
- Max ticks in trade: `45`

### R_25

- Personality: `Sentinel Divergence Sniper`
- RSI oversold: `31`
- RSI overbought: `69`
- BB std: `2.30`
- Min confluence: `3`
- ATR stop multiplier: `2.60`
- Target loss pct: `0.15`
- Max ticks in trade: `50`

### R_75

- Personality: `Apex Volatility HFT Scalar`
- RSI oversold: `32`
- RSI overbought: `68`
- BB std: `2.50`
- Min confluence: `3`
- ATR stop multiplier: `2.75`
- Target loss pct: `0.20`
- Max ticks in trade: `60`

### CRASH500

- Personality: `Crash Extreme Recovery Scalar`
- RSI oversold: `22`
- RSI overbought: `75`
- BB std: `2.75`
- Min confluence: `4`
- ATR stop multiplier: `2.25`
- Target loss pct: `0.20`
- Max ticks in trade: `45`

### BOOM500

- Personality: `Boom Consolidator Ridge Sniper`
- RSI oversold: `25`
- RSI overbought: `78`
- BB std: `2.75`
- Min confluence: `4`
- ATR stop multiplier: `2.25`
- Target loss pct: `0.20`
- Max ticks in trade: `45`

### R_100

- Personality: `Spike Breakout Raider`
- RSI oversold: `28`
- RSI overbought: `72`
- BB std: `2.75`
- Min confluence: `3`
- ATR stop multiplier: `3.00`
- Target loss pct: `0.20`
- Max ticks in trade: `75`

---

# 6. The true trading style of IML

This section is the most important part of the document.

IML is **not a pure trend-following system**.
It is **not a pure mean-reversion system**.
It is **not a pure breakout system**.

It is a **dual-regime, multi-symbol, governor-supervised tactical engine** with two dominant styles:

- **Fractal persistence trend capture** when market structure looks persistent
- **Confluence-based mean-reversion fading** when structure is non-persistent

The contract layer then chooses between:

- `MULTIPLIER`
- `HYBRID_LINEAR`

depending on the active mode or governor choice.

## 6.1 Primary style summary

The system’s actual trading style is best described as:

> A multi-instrument tactical engine that tries to classify whether a symbol is in a persistent memory/trend corridor or in a more stationary/noisy regime, then switches between a fractal trend-following entry model and a five-factor mean-reversion confluence model, with governor supervision, adaptive stake sizing, dynamic stop management, and Deriv-authoritative settlement.

## 6.2 The two main strategy personalities

### A. Persistent-regime style

When Hurst/fractal conditions are strong, IML behaves like a **trend/persistence follower**.

Characteristics:

- requires strong persistence metrics
- requires ADX > 25
- checks local KAMA direction
- checks higher SMA direction
- only trades when local and higher timeframe direction agree
- classifies signal as elite/high quality
- may bypass take profit on live management if `isFractalTrend` is true
- uses adaptive ATR trailing to stay in fat-tail moves

This is the system’s **trend capture / breakout persistence personality**.

### B. Non-persistent regime style

When persistence is absent, IML behaves like a **mean reversion confluence fader**.

Characteristics:

- uses Bollinger band location
- uses RSI zone
- uses VWAP relation
- uses divergence
- uses reversal candle pattern
- requires a minimum score out of 5
- trades both LONG and SHORT depending on confluence

This is the system’s **oscillator + location + reversal** personality.

## 6.3 Why the system feels hybrid in practice

Because each symbol has its own parameters, and because the governor can adapt those parameters over time, the net effect is:

- some instruments behave more like **faders**
- some behave more like **divergence snipers**
- some behave more like **breakout raiders**
- some are pulled toward defensive high-confluence operation after underperformance

That means the label “personality” is not decorative. It corresponds to a parameter cluster and adaptation tendency.

---

# 7. Signal generation pipeline

The main live trading entry path is `processSubAlgorithmTick(symbol, currentPrice, epoch)`.

This function is the heart of the system.

## 7.1 Step 1: manage existing positions first

Before thinking about a new entry, the engine first calls:

- `updateOpenPositions(symbol, currentPrice, epoch)`

This means IML is **position-first, entry-second**.

A future AI must preserve this order.

## 7.2 Step 2: compute core live indicators

For the current symbol, the engine computes:

- `RSI(14)`
- `Bollinger Bands(sub.bbPeriod, sub.bbStd)`
- `VWAP(30)`
- `ATR/ADX(14)`
- `detectRegime(symbol)`

These values are written back to the sub-algorithm for UI/runtime visibility:

- `sub.rsiVal`
- `sub.bbPct`
- `sub.adxVal`
- `sub.atrVal`
- `sub.mRegime`

## 7.3 Step 3: compute expensive fractal metrics every 10 ticks

To reduce CPU overhead, IML only runs intensive calculations every 10 ticks:

- `computeDFA1(prices, 256)`
- `computeRS(prices, 1024)`
- `computeRS(prices, 2000)`
- `computeKAMA(prices, 50)`
- `computeSMA(prices, 600)`
- `computeHillEstimator(prices, 500, 50)`

These populate:

- `hurstVal`
- `hurstRSquared`
- `hurstConfirm`
- `hurstMacro`
- `kamaValue`
- `tailExponent`
- `convictionScore`

## 7.4 Conviction score

The conviction score is a composite from:

- normalized micro Hurst
- DFA `rSquared`
- agreement between micro and meso Hurst

Formula in code:

- `0.50 * hNorm`
- `0.30 * rSqr`
- `0.20 * deltaHNorm`

This is not merely reporting data. It actively affects:

- governor focus selection
- mode selection
- stake scaling
- creative synthesis logic

## 7.5 Governor focus selection

Every tick, `evaluateGovernorFocus()` runs.

Every 500 ticks, the governor also audits personalities.

The focus system computes, per symbol:

- `multScore = adx + conviction * 50`
- `hybridScore = conviction * 80 + adx * 0.5`

The best scoring symbol becomes:

- `governorFocusSymbol`

The best scoring mode for that symbol becomes:

- `activeTradeType`

When `tradingMode` is `AUTO`, the effective contract mode is the governor-chosen mode.

This is one of the most important replication details.

---

# 8. Regime detection behavior

`detectRegime(symbol)` classifies market state using:

- last price
- SMA 50
- RSI
- ATR/ADX
- Bollinger band width
- symbol-specific base volatility

## 8.1 Regime labels

The available regimes are:

- `TRENDING_UP`
- `TRENDING_DOWN`
- `RANGING`
- `HIGH_VOL`
- `LOW_VOL`
- `TRANSITION`

## 8.2 Logic

The current logic is:

- If `ADX > currentParams.regimeAdxThreshold`
  - above MA50 => `TRENDING_UP`
  - below MA50 => `TRENDING_DOWN`
- Else if Bollinger width is below squeeze threshold => `LOW_VOL`
- Else if Bollinger width is above high-vol threshold => `HIGH_VOL`
- Else if `ADX < 18` and price is close to MA50 => `RANGING`
- Else => `TRANSITION`

## 8.3 Why this matters

Regime affects:

- what the dashboard shows
- how persistence logic is interpreted
- stop adaptation in fractal trend management
- what a future AI should describe as the market context

---

# 9. Entry model A: Fractal persistence / SFT-V2 behavior

This is the engine’s most distinctive style.

## 9.1 Persistent regime definition

A symbol is treated as in a persistent fractal regime if:

- `hMicro >= 0.65`
- `hMeso >= 0.62`
- `rsMacroH >= 0.60`
- `rSqr >= 0.92`

The code calls this `isPersistentRegime`.

## 9.2 Additional ADX gate

Even if persistence is true, the system refuses the trade if:

- `adx < 25`

So persistence alone is not enough. Trend strength must confirm.

## 9.3 Direction logic

The engine then computes:

- `isLocalBull = currentPrice > kamaLocal`
- `isHigherBull = currentPrice > smaHigher`

If both agree:

- open trade
- direction is LONG if bullish, SHORT if bearish
- `score = 5`
- conditions:
  - `SFT_V2_FRACTAL`
  - `KAMA_LOCAL`
  - `SMA_HIGHER`
  - `PERS_CONFIRM`

If local and higher timeframe disagree:

- no trade
- engine stands by

## 9.4 True style implication

This means IML’s persistence mode is **not blind momentum chasing**.

It is:

- memory/persistence filtered
- trend-strength filtered
- multi-timescale directional confirmation
- elite-score directional alignment

## 9.5 Exit style implication

When a position is tagged `isFractalTrend`, take-profit exits are bypassed during live management:

- stop loss still applies
- time exit still applies
- trailing logic still applies
- explicit TP exit is skipped

This is an intentional fat-tail capture behavior.

If a future AI rebuilds the strategy and restores conventional take-profit behavior for fractal positions, it will **not** be replicating IML exactly.

---

# 10. Entry model B: Mean-reversion fallback behavior

When persistence is absent, the system switches to a confluence-based fallback.

## 10.1 Long-side factors

The engine evaluates five bullish factors:

- price at or below Bollinger lower band
- RSI below sub-algorithm oversold threshold
- price below VWAP
- bullish divergence
- reversal candle pattern

`longScore` is the count of true conditions.

## 10.2 Short-side factors

The engine evaluates five bearish factors:

- price at or above Bollinger upper band
- RSI above sub-algorithm overbought threshold
- price above VWAP
- bearish divergence
- reversal candle pattern

`shortScore` is the count of true conditions.

## 10.3 Confluence threshold

Baseline threshold is:

- `sub.minConfluenceScore`

Then a dynamic override exists:

- if `adx > 45`, threshold is increased by a penalty

Important replication note:

The comment says dynamic scaling is for high volatility handling, but the current implementation effectively **tightens** mean-reversion during strong momentum by increasing required confluence when ADX is very high.

That is the behavior to preserve.

## 10.4 Trade selection

- If `longScore >= dynamicMinConfluence`, go LONG
- Else if `shortScore >= dynamicMinConfluence`, go SHORT

Conditions are recorded in `conditionsList` using labels like:

- `BB_OVERSOLD`
- `RSI_OVERSOLD_ZONE`
- `BELOW_VWAP`
- `BULLISH_DIVERG`
- `REVERSAL_CANDLE`
- `BB_OVERBOUGHT`
- `RSI_OVERBOUGHT_ZONE`
- `ABOVE_VWAP`
- `BEARISH_DIVERG`

## 10.5 Trading style implication

This fallback model is a **high-confluence location/reversal model**, not just RSI mean reversion.

It wants crowd exhaustion plus location plus confirmation.

---

# 11. Governor behavior

The governor is the meta-layer sitting above raw signal generation.

It has four major responsibilities:

- choose global focus/mode
- veto weak proposals
- polish strong proposals
- adapt sub-algorithm parameters over time

## 11.1 Governor audit every 500 ticks

Every 500 ticks, `runGovernorAudit()` runs.

If a sub-algorithm has:

- recent win rate < 35%
- totalTrades > 5

then the governor performs a **personality shift**.

Behavior:

- If personality includes `Fader`
  - switch to `Divergence Sniper`
  - oversold = 25
  - overbought = 75
- Else
  - switch to `Mean Fader`
  - oversold = 35
  - overbought = 65

This is a crude but real adaptation loop.

## 11.2 Proposal scrutiny

`scrutinizeProposal(proposal)` can veto or polish a trade.

### Veto rule 1: anti-persistent noise

If:

- `hurst < 0.52`
- `conviction < 0.4`
- `score < 3`

then veto.

### Veto rule 2: directional exposure gating

If there are already 2 or more active positions in the same direction and the new score is below 5, veto.

This is a simple portfolio exposure cap.

### Polishing rule: focus-symbol boost

If:

- symbol is current governor focus symbol
- conviction > 0.85
- score >= 4

then stake is multiplied by `1.35`.

### Elite co-signing

If:

- `score === 5`
- `conviction > 0.75`

the proposal gets an elite reasoning label.

## 11.3 Practical implication

The governor does not invent signals from scratch.

It is a **supervisory capital allocator and veto engine** that modifies:

- whether a signal is allowed
- how much capital it gets
- which symbol/mode is globally favored

---

# 12. Creative synthesis behavior

IML contains a lighter-weight pseudo-agentic behavior called `STRATEGIC CREATIVITY`.

It computes:

- `syntheticDelta = conviction - normalized ADX`

Every 50 ticks:

- if `|syntheticDelta| > 0.4`, it logs a strategic pivot
- if `syntheticDelta < -0.3`, it increases `minConfluenceScore`
- if `syntheticDelta > 0.3` and confluence is above 2, it decreases `minConfluenceScore`

This means the system can tighten or relax execution barriers without a full ML cycle.

This should be replicated exactly if fidelity matters, even if the naming sounds more dramatic than the underlying logic.

---

# 13. Contract mode behavior

The system can operate in:

- `MULTIPLIER`
- `HYBRID_LINEAR`
- `AUTO`

`AUTO` delegates to the governor-selected `activeTradeType`.

## 13.1 MULTIPLIER mode

This is the main live Deriv multiplier contract path.

Characteristics:

- uses Deriv-supported multipliers only
- uses ATR-based stop distance
- derives a desired multiplier from target loss percentage
- downshifts multiplier if expected SL loss is too high
- computes Deriv SL/TP dollar values
- uses live Deriv order placement

## 13.2 HYBRID_LINEAR mode

This is a synthetic linearized trade model represented internally as:

- `HYBRID_LINEAR_UP`
- `HYBRID_LINEAR_DOWN`

It still routes live contracts through supported Deriv multiplier contracts when necessary, but internally manages the trade in “R” units with:

- fixed or percent risk
- reward ratio in R
- early cutoff
- greening/break-even behavior
- hybrid position sizing

The naming matters.

A future AI should understand that `HYBRID_LINEAR` is a **risk model and PnL interpretation layer**, not a totally separate market feed or venue.

---

# 14. Position sizing behavior

IML uses a **hybrid half-Kelly sizing system** with multiple clamps and overrides.

## 14.1 Kelly foundation

`calculateKellyStake(symbol)` does the following:

- looks at the last 50 completed trades
- estimates payout ratio `b` using median win/loss magnitudes when enough history exists
- otherwise uses fallback `b = 1.25`
- estimates win probability `p`
  - from Hurst if persistence exists
  - otherwise from historical win rate shrunk toward 50%
- computes full Kelly
- halves it for protection

## 14.2 Caps by risk preset

Current cap values are:

- `AGGRESSIVE`: `1.25%` of balance
- `MODERATE`: `0.6%` of balance
- `CONSERVATIVE`: `0.25%` of balance

Minimum Kelly percent fallback is `0.15%`.

## 14.3 Halving protocol

If any enabled sub-algorithm has:

- `tailExponent <= 2.2`

then stake is halved.

This is a tail-risk defense mechanism.

## 14.4 Sub-algorithm multiplier

After Kelly, stake is multiplied by:

- `sub.targetRiskStakeMultiplier`

This becomes the key local risk tuning knob for each sub-algorithm.

## 14.5 Conviction scaling in persistent mode

If Hurst indicates persistence, stake is multiplied again by:

- `convictionScore`

This means even a valid persistent trade may get smaller size if conviction is mediocre.

## 14.6 Hard execution cap

Before order placement, stake is clamped to:

- minimum: `$0.35`
- maximum: `1.5% of balance`

This is one of the important live-risk changes.

## 14.7 Fixed-risk override in multiplier mode

If:

- mode is `MULTIPLIER`
- `hybridRiskType === FIXED`

then stake is capped by `hybridRiskFixedAmount`.

This is slightly non-obvious and should be preserved if reproducing behavior exactly.

---

# 15. Stop loss, target, and leverage behavior

## 15.1 Stop distance

Baseline stop distance is:

- `max(currentPrice * 0.003, atr * atrStopMultiplier)`

This means there is always at least a 0.3% distance floor.

## 15.2 Multiplier take profit

In multiplier mode, take-profit distance is:

- `stopLossDistance * 1.6`

## 15.3 Hybrid take profit

In hybrid mode, take-profit distance is:

- `stopLossDistance * hybridRewardRatio`

Default `hybridRewardRatio` is `3.0`.

## 15.4 Multiplier selection

Desired multiplier is computed from:

- `targetLossPct / slPct`

Then nearest supported multiplier is chosen from:

- `[40, 100, 200, 300, 400]`

Then it is downshifted if expected stop loss becomes too wide.

## 15.5 Expected loss shield

If expected SL loss percentage exceeds `40%`, the engine scales stake down using a safety factor.

This applies in both auto and manual execution paths.

---

# 16. Position lifecycle

## 16.1 Entry creation

A new `ActivePosition` stores:

- symbol
- contract type
- direction
- stake
- entry/current price
- stop loss
- take profit
- pnl
- entry epoch
- entry-time regime snapshot
- entry-time RSI snapshot
- entry-time Bollinger percent snapshot
- entry-time ADX snapshot
- entry-time ATR snapshot
- entry condition list
- optional multiplier
- optional hybrid metadata
- fractal trend flag

This entry snapshot behavior is critical for exact reporting.

## 16.2 Local ID then Deriv ID

Before Deriv confirms the buy, the position has a local ID like:

- `CT_...`
- `TX_...`

After Deriv buy confirmation:

- local ID is replaced with the real numeric Deriv contract ID

## 16.3 One open position per symbol

The engine explicitly refuses new entries if a position is already open on that symbol.

That is an important system invariant.

---

# 17. Exit behavior and trade management

## 17.1 First principle

IML now treats **Deriv as the authoritative closer of live trades**.

This is one of the most important operational changes.

The local engine can decide a position should close, but it now sends a **close request to Deriv** and waits for authoritative contract confirmation.

## 17.2 Open-position PnL estimation

During live management, PnL is estimated locally:

- hybrid positions use linearized price delta and synthetic size
- multiplier positions use leveraged percent move
- losses are capped at stake

This live PnL is for management/display.

Final trade settlement should come from Deriv when available.

## 17.3 Hybrid-linear management

Hybrid positions use special risk behavior:

- early cutoff if loss reaches `hybridEarlyCutoffPct * R`
- break-even activation at `hybridGreeningTriggerPct * R`
- trailing by 1R after break-even

Defaults:

- `hybridEarlyCutoffPct = 0.15`
- `hybridGreeningTriggerPct = 0.20` on backend initial state

## 17.4 Multiplier management for fractal trend positions

If a multiplier position is also marked `isFractalTrend`:

- trailing stop becomes volatility-adaptive
- regime changes alter ATR period and ATR multiplier
- very high Hurst can widen trailing settings
- parabolic spike detection tightens stop aggressively

### Parabolic spike logic

The engine detects convex exhaustion using:

- short-term rate-of-change spike
- decline in short-horizon Hurst relative to longer-horizon Hurst

If detected:

- trailing stop tightens to `1.5 x ATR(7)`

This is a subtle but highly important behavior.

## 17.5 Standard multiplier management

If not in fractal trend mode:

- break-even activates after 20% of TP distance is covered
- SL is moved slightly beyond entry
- trailing starts only after break-even
- trailing distance is 25% of TP distance

## 17.6 Exit triggers

A position can request close for these reasons:

- `stop_loss`
- `take_profit`
- `time_exit`
- `manual`
- `circuit_breaker`
- `early_cutoff`

Important nuance:

- fractal trend positions bypass TP exit logic
- all other exits still apply

## 17.7 Close request flow

When an exit condition is hit:

- if close already pending, do nothing
- if the position still has a temporary local ID, do not close yet
- otherwise:
  - set `closeRequestedAt`
  - set `closeRequestedReason`
  - call `liveBridgeInstance.requestContractClose(pos.id, reason)`

This means close handling is **asynchronous**.

## 17.8 Settlement flow

Settlement now happens mainly in `finalizeDerivContractSettlement()` when Deriv sends a closed contract update.

That function:

- resolves exit price
- resolves exit epoch
- reads authoritative PnL if provided
- derives or preserves exit reason
- removes the position from active positions
- calls `settleContract(..., authoritativePnl, true)`

## 17.9 Duplicate protection

`settleContract` ignores duplicate close confirmations by ID.

---

# 18. Deriv integration model

The Deriv integration is central to IML.

## 18.1 Connection behavior

`DerivLiveBridge`:

- connects to `wss://ws.derivws.com/websockets/v3`
- uses `DERIV_APP_ID`
- optionally authorizes with `DERIV_API_TOKEN`
- reconnects after disconnects

## 18.2 On successful authorization

The system:

- marks itself authorized
- updates balance from Deriv
- subscribes to balance stream
- subscribes to `proposal_open_contract`
- requests historical ticks for all instruments
- subscribes to all live ticks

## 18.3 Warmup behavior

It requests 350 historical ticks per symbol, then seeds:

- `tickBuffers`
- `candleBuffers`

This ensures indicators are warm quickly.

## 18.4 Symbol translation

Internal to Deriv mapping:

- `R_10 -> 1HZ10V`
- `R_25 -> 1HZ25V`
- `R_75 -> 1HZ75V`
- `R_100 -> R_100`
- `CRASH500 -> CRASH500`
- `BOOM500 -> BOOM500`

## 18.5 Buy flow

Order flow is:

1. local position is created
2. local ID goes into `pendingOrderQueue`
3. `placeRealContractProposal(...)` sends the order
4. Deriv returns `buy`
5. system replaces local ID with Deriv contract ID
6. system subscribes specifically to that contract with `proposal_open_contract`

## 18.6 Ghost-position handling

One of the system’s important recovery features is ghost position syncing.

If `proposal_open_contract` shows a contract not already in `activePositions`, the system can:

- reconstruct the position locally
- infer direction from contract type
- derive rough stop/target
- create an active position with `DERIV_GHOST_SYNC`

If the contract is already closed and not yet recorded, it can create a synthetic recovered position and settle it with `DERIV_RECOVERY_SYNC`.

This is essential for resilience after restarts or local desynchronization.

## 18.7 Manual close behavior

The UI button no longer means “locally settle now”.

It means:

- send close request to Deriv
- mark position as pending close
- wait for authoritative Deriv confirmation

Another AI must preserve this if replicating current live behavior.

---

# 19. Persistence model

## 19.1 Current persistence truth

Although the repository contains `state_persistence.json`, the current implementation states:

- local disk persistence is removed
- state is synced through Supabase when configured

## 19.2 What is persisted

Supabase stores:

- dashboard/session state in `iml_state`
- trades in `iml_trades`
- strategy history in `iml_strategy_history`
- logs in `iml_logs`

## 19.3 State recovery nuance

On restore:

- `completedTrades` are filtered to retain only trades with `derivCloseConfirmed === true`

This is very important.

The system intentionally avoids rebuilding analytics from legacy non-authoritative trade closures.

## 19.4 Log persistence

Logs are buffered and flushed in batches to Supabase.

This is not incidental. Logs are part of the operating model and act as a structured observability stream.

---

# 20. Circuit breaker and session risk controls

The circuit breaker logic is strict and must be preserved.

## 20.1 Terminal live equity block

If session drawdown from the session baseline reaches `3%`:

- trading is disabled
- session becomes blocked
- auto-resume is disabled
- manual intervention is required

This is the hard terminal breaker.

## 20.2 Consecutive loss lockouts

If consecutive losses reach:

- `3`: 10-minute cooldown
- `5`: 10-minute cooldown with stronger lockout messaging

## 20.3 Session resume behavior

There is an API route to clear session block:

- `/api/resume-session`

But clearing the block does **not** immediately resume trading.

Trading remains paused until the operator explicitly restarts.

That is an important safety invariant.

---

# 21. Machine-learning-style adaptation behavior

The code calls this `runMachineLearningAdaptation()`, but it is better described as **rule-based adaptive parameter tuning driven by recent performance**.

It is not a full external ML model pipeline.

## 21.1 When it runs

It runs every:

- `50` completed trades

## 21.2 Warmup rule

If a sub-algorithm has fewer than 3 trades:

- directive stays in stable pilot
- `targetRiskStakeMultiplier = 1.0`

## 21.3 Objective score

For each sub-algorithm, the engine computes:

- win rate
- profit factor
- objective score = `0.40 * winRate + 0.60 * normalizedProfitFactor`

## 21.4 Defensive adaptation

If objective score < `0.38`:

- oversold threshold tightens downward
- overbought threshold tightens upward
- `minConfluenceScore = 4`
- BB std may widen if tails are adverse
- `targetRiskStakeMultiplier = 0.5`
- directive becomes defensive

## 21.5 Compounding adaptation

If objective score > `0.62` and profit factor >= `1.25`:

- thresholds may relax
- `minConfluenceScore = 2`
- BB std may tighten
- `targetRiskStakeMultiplier = 1.3` unless tail risk is adverse
- directive becomes compounding

## 21.6 Balanced mode

Otherwise:

- `targetRiskStakeMultiplier = 1.0`
- confluence is normalized toward 3
- directive becomes stable/balanced

## 21.7 Global parameter adaptation

The system also looks at the last 100 trades globally.

If global win rate < `45%` and PF < `1.0`:

- oversold threshold tightens
- overbought threshold widens
- `atrStopMultiplier` is increased

This means there is both:

- per-sub-algorithm adaptation
- global-parameter adaptation

---

# 22. Reporting system

The system contains a large PDF reporting engine in `initiateIntensiveReport()`.

## 22.1 What it uses

The report is built from:

- `completedTrades`
- current sub-algorithm states
- distribution stats
- drawdown/tail-risk views
- governor and adaptation data

## 22.2 Trigger behavior

Reports are triggered:

- manually via `/api/force-report`
- automatically every 100 completed trades

## 22.3 Important reporting invariant

Reports should be built from **authoritative closed-trade records**.

This is one of the reasons entry snapshots and `derivCloseConfirmed` were added.

## 22.4 Pagination nuance

A continuation-page guard was added before the MAE block to prevent page-3 overflow from causing blank/orphan pages before subsequent explicit pages.

If another AI rebuilds the report engine, it should preserve layout guards around overflowing sections.

---

# 23. API surface

The main backend routes are:

## 23.1 Read/state routes

- `GET /api/state`
  - returns dashboard state, active positions, recent completed trades, risk state, indicators, sub-algorithms, logs

- `GET /api/ticks`
  - returns last 80 ticks for a symbol

- `GET /api/report-summary`
  - returns last report summary

- `GET /api/ml-export`
  - exports trade data for ML analysis

- `GET /api/logs/export`
  - exports logs

## 23.2 Control routes

- `POST /api/config`
  - updates selected symbol, trading enabled flag, mode, risk preset, parameters, sub-algorithm config, hybrid config

- `POST /api/trade`
  - manual LONG/SHORT order placement on selected symbol

- `POST /api/close-position`
  - manual close request to Deriv for an active position

- `POST /api/resume-session`
  - clears session block but leaves trading paused

- `POST /api/reset`
  - resets active metrics/state

- `POST /api/force-report`
  - generate report immediately

- `POST /api/analyze`
  - AI analysis session endpoint

A future AI reproducing the dashboard behavior should reproduce these routes or equivalent semantics.

---

# 24. Frontend behavior and UI semantics

The frontend is a monitoring and control terminal.

## 24.1 Fetch model

`App.tsx` polls backend state rather than subscribing to a separate frontend websocket.

Important consequence:

- the UI reflects backend state snapshots
- the UI should not implement independent trading logic

## 24.2 Sub-algorithm tuning UI

The UI exposes real-time tuning for:

- enable/disable per sub-algorithm
- RSI thresholds
- BB period/std
- min confluence
- ATR stop multiplier
- target loss percent
- time exit
- break-even
- trailing stop
- max ticks
- risk multiplier
- learning factor

This means the implementation is designed to be operator-tunable while live.

## 24.3 Close button semantic correction

The current UI label and behavior are aligned to Deriv-authoritative flow:

- label changes to `Close on Deriv`
- pending close disables the button
- pending label becomes `Closing on Deriv...`

This is a critical semantic correction from earlier behavior.

---

# 25. Exact replication invariants

If another AI must rebuild the system **exactly as it is**, the following invariants must be preserved.

## 25.1 Architecture invariants

- Backend owns all trade logic.
- Frontend is a dashboard/control layer.
- `server.ts` is effectively the trading engine kernel.
- State is event-driven from Deriv ticks.

## 25.2 Market-data invariants

- All six instruments are subscribed on live connection.
- 350 historical ticks are requested for warmup.
- `tickBuffers` are capped at 2000 entries.
- candles are synthesized from ticks locally.

## 25.3 Trading invariants

- Existing positions are managed before new entries are evaluated.
- Only one active position per symbol is allowed.
- AUTO mode uses governor-selected active trade type.
- Persistent fractal regime uses trend-following alignment logic.
- Non-persistent regime uses 5-factor mean-reversion confluence.
- Fractal positions bypass normal TP exit logic.

## 25.4 Risk invariants

- Kelly is half-Kelly with shrinkage/caps.
- Tail-risk halving protocol exists.
- hard live stake cap is 1.5% of balance.
- balance is not updated locally at settlement; Deriv balance stream is authoritative.
- 3% session equity loss causes session block.

## 25.5 Deriv invariants

- Buy confirmation replaces local IDs with Deriv contract IDs.
- Manual close is a Deriv close request, not a local settle.
- Contract closure is reconciled from `proposal_open_contract`.
- Ghost/orphan contract recovery exists.

## 25.6 Reporting invariants

- Reports use authoritative closed-trade records.
- entry-time analytics snapshots are stored and reused.
- recovered legacy non-authoritative trades should not pollute analytics.

---

# 26. Behavioral summary by trading style

To help another AI internalize the trading personality, this is the plain-English summary.

## 26.1 How IML thinks

IML asks, on every symbol tick:

- Is there already a position that needs management?
- Is this symbol structurally persistent enough to trend-follow?
- If not, is there a strong enough exhaustion/reversal confluence to fade?
- Is the governor okay with the trade?
- How much capital should this exact setup get right now?
- Should this symbol be the global focus instrument?
- Is the market tail behavior dangerous enough to reduce size?
- Is account-level or streak-level risk too high to continue?

## 26.2 How IML trades

It trades like a hybrid desk that combines:

- fractal-persistence trend capture
- oscillator/location-based fading
- rule-based adaptive risk scaling
- dynamic trailing and break-even logic
- strict Deriv-linked execution and closure

## 26.3 What kind of system it is not

It is not:

- a pure ML black-box strategy
- a stateless signal generator
- a simple RSI bot
- a pure martingale or grid system
- a pure backtester-first framework

It is best understood as a **stateful live execution engine with adaptive heuristics and strong operator visibility**.

---

# 27. Known implementation quirks to preserve if fidelity matters

A future AI replicator should know these are not mistakes to “clean up” unless intentionally redesigning the product.

- The codebase is highly centralized in `server.ts`.
- Some comments are slightly out of sync with actual logic; replicate actual logic first.
- `HYBRID_LINEAR` is partly a risk/PnL abstraction layered onto Deriv-supported multiplier execution.
- Manual trade placement uses placeholder indicator values for some manual-entry fields.
- The governor and “ML” language is more agentic in naming than in implementation; the actual logic is deterministic and heuristic.
- Fractal trend positions deliberately avoid fixed TP exits to chase extended moves.
- Close requests are asynchronous and can remain pending until Deriv confirms closure.
- On persisted recovery, only Deriv-confirmed trades are kept in completed history.

---

# 28. How to replicate IML faithfully

If another AI were rebuilding this from scratch, the safest order would be:

## 28.1 Rebuild core types

Implement:

- `MarketRegime`
- `ActivePosition`
- `TradeRecord`
- `SubAlgorithm`
- `LearningParams`

## 28.2 Rebuild state model

Create the same global/session state categories:

- balance/session state
- tick/candle buffers
- active/completed trades
- sub-algorithms
- governor state
- hybrid risk config
- circuit breaker state

## 28.3 Rebuild Deriv bridge

Implement:

- auth
- history requests
- live tick subscription
- balance subscription
- proposal_open_contract subscription
- buy/sell handling
- ghost contract reconciliation

## 28.4 Rebuild indicator and regime engine

Implement:

- RSI
- Bollinger
- VWAP
- ATR/ADX
- SMA
- KAMA
- DFA / RS / Hurst
- Hill estimator
- divergence detection
- reversal candle detection
- regime detection

## 28.5 Rebuild entry engine exactly

Implement both branches:

- persistent fractal branch
- fallback mean-reversion branch

## 28.6 Rebuild governor and adaptation layer

Implement:

- governor focus selection
- proposal scrutiny
- personality shifts
- 50-trade adaptation cycle
- global parameter adaptation

## 28.7 Rebuild position management

Implement:

- live PnL estimation
- BE + trailing
- fractal trend trailing
- early cutoff and greening for hybrid
- Deriv-authoritative close requests
- authoritative settlement reconciliation

## 28.8 Rebuild dashboard APIs and frontend

Implement polling dashboard with:

- `/api/state`
- `/api/ticks`
- `/api/config`
- `/api/trade`
- `/api/close-position`
- `/api/force-report`
- `/api/resume-session`

## 28.9 Rebuild persistence and reporting

Implement:

- Supabase persistence
- trade upsert
- state recovery with trade filtering
- report generation based on authoritative trades

---

# 29. Final concise system definition

**Infinity Markets Lab** is a full-stack, Deriv-connected, multi-instrument trading engine that combines:

- sub-algorithm personalities per instrument
- dual-mode execution (`MULTIPLIER` / `HYBRID_LINEAR`)
- fractal persistence trend logic
- mean-reversion confluence fallback logic
- governor-led oversight and adaptive tuning
- strict risk controls and session breakers
- authoritative Deriv close reconciliation
- operator-facing real-time dashboarding and reporting

If another AI must replicate it exactly, it should preserve the following core identity:

> IML is a stateful live trading engine that uses real-time Deriv data, computes both classical and fractal indicators, decides between trend-persistence and mean-reversion behavior per symbol, sizes trades through capped half-Kelly and adaptive overlays, supervises decisions through a governor layer, and records authoritative closed trades only when Deriv confirms them.
