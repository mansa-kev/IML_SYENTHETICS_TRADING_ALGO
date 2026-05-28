/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { MarketRegime, Candle, ActivePosition, TradeRecord, LearningParams, SubAlgorithm } from "./src/types/iml.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// ==========================================
// SYSTEM STATE (LIVE SESSION ONLY)
// ==========================================
let balance = 10000.00;
let peakBalance = 10000.00;
let tradingEnabled = false;
let selectedSymbol = "R_75"; // Volatility 75 high-frequency focus
let tradingMode = "AUTO" as "MULTIPLIER" | "HYBRID_LINEAR" | "AUTO";
// Infinity Markets Lab Hybrid Risk Engine (IML-HRE) state variables
let hybridRiskType = "FIXED" as "FIXED" | "PERCENT";
let hybridRiskFixedAmount = 25.00;
let hybridRiskPercent = 0.5; // 0.5% of account balance (e.g. $50 on $10k)
let hybridRewardRatio = 3.0; // 3R target payout
let hybridEarlyCutoffEnabled = true;
let hybridEarlyCutoffPct = 0.15; // 15% of R adverse excursion limit
let hybridGreeningTriggerPct = 0.20; // 20% of R greening break-even trigger
let riskPreset = "MODERATE" as "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";

// Active systems
const botSessionId = `SESSION_${Date.now().toString(36).toUpperCase()}`;
const startEpoch = Math.floor(Date.now() / 1000);

let activePositions: ActivePosition[] = [];
let completedTrades: TradeRecord[] = [];
let logs: string[] = [`[${new Date().toISOString()}] Infinity Markets Lab Engine initializing under session key ${botSessionId}`];

// Learning Engine Parameter defaults
let currentParams: LearningParams = {
  rsiOversoldThreshold: 30,   // default: 30, range [25, 42]
  rsiOverboughtThreshold: 70,  // default: 70, range [58, 75]
  bbPeriod: 20,                // default: 20
  bbStd: 2.50,                  // Rec: 2.50 — reduces false entries near bands
  maxTicksInTrade: 60,          // Rec: 60 — hard temporal stop, prevents infinite holding
  minConfluenceScore: 3,       // require 3 of 5 indicators for entry
  atrStopMultiplier: 2.75,      // Rec: 2.75 — functional ATR stop (was corrupted to 9.22e30)
  regimeAdxThreshold: 20,      // Rec: 20 — gate mean-reversion earlier in trend regimes
};

const defaultParams: LearningParams = { ...currentParams };
const DERIV_SUPPORTED_MULTIPLIERS = [40, 100, 200, 300, 400];

// Pending Deriv order queue — maps local position ID to Deriv contract_id on buy confirmation
const pendingOrderQueue: Array<{ localId: string; symbol: string; direction: string }> = [];

// Circuit Breakers states
let circuitBreakerCooldown = 0; // seconds remaining
let cooldownMessage = "";
let consecutiveLosses = 0;
let consecutiveWins = 0;
let sessionBlocked = false;
let sessionStartBalance = 0;
let circuitBreakerResumeAt = 0;
let tradingAutoResumePending = false;

// Historical pricing buffers (rolling arrays of size 2000)
const maxBufferLength = 2000;
const tickBuffers: Record<string, number[]> = {
  R_10: [],
  R_25: [],
  R_75: [],
  R_100: [],
  CRASH500: [],
  BOOM500: [],
};

const candleBuffers: Record<string, Candle[]> = {
  R_10: [],
  R_25: [],
  R_75: [],
  R_100: [],
  CRASH500: [],
  BOOM500: [],
};

// ==========================================
// CENTRAL GOVERNOR & DUAL-TIER TRADING ENGINES (AGENTIC UPGRADE)
// ==========================================
interface StrategyProposal {
  symbol: string;
  direction: "LONG" | "SHORT";
  score: number;
  stake: number;
  effMode: "MULTIPLIER" | "HYBRID_LINEAR";
  conviction: number;
  reason: string;
  indicators: any;
}

let governorFocusSymbol = "R_10";
let governorStatus = "IML AGENTIC CORE: ONLINE";
let governorAgenticScore = 1.0; // 100% Agentic goal

const governorMemory: {
  reasons: string[];
  vetoes: number;
  approvals: number;
  lastInsight: string;
} = {
  reasons: [],
  vetoes: 0,
  approvals: 0,
  lastInsight: "System initialized with baseline heuristic scrutiny."
};

// Sub-algorithm engines mapping each instrument to local personalities
const subAlgorithms: Record<string, SubAlgorithm> = {
  R_10: {
    symbol: "R_10",
    name: "Volatility 10 (1s)",
    personality: "Aegis Mean Fader",
    enabled: true,
    rsiOversoldThreshold: 30,
    rsiOverboughtThreshold: 70,
    bbPeriod: 20,
    bbStd: 2.20,
    minConfluenceScore: 3,
    atrStopMultiplier: 2.50,
    learningAdjustmentFactor: 1.0,
    targetRiskStakeMultiplier: 0.75,
    cooldownUntil: 0,
    directiveMessage: "INITIALIZING STANDBY PILOT",
    recentWinRate: 0.5,
    targetLossPct: 0.15,
    timeExitEnabled: true,
    breakEvenEnabled: true,
    trailingStopEnabled: true,
    maxTicksInTrade: 45,
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    rsiVal: 50,
    bbPct: 0.5,
    adxVal: 15,
    atrVal: 0,
    confluenceScore: 0,
    mRegime: MarketRegime.TRANSITION,
  },
  R_25: {
    symbol: "R_25",
    name: "Volatility 25 (1s)",
    personality: "Sentinel Divergence Sniper",
    enabled: true,
    rsiOversoldThreshold: 31,
    rsiOverboughtThreshold: 69,
    bbPeriod: 20,
    bbStd: 2.30,
    minConfluenceScore: 3,
    atrStopMultiplier: 2.60,
    learningAdjustmentFactor: 1.0,
    targetRiskStakeMultiplier: 0.75,
    cooldownUntil: 0,
    directiveMessage: "INITIALIZING STANDBY PILOT",
    recentWinRate: 0.5,
    targetLossPct: 0.15,
    timeExitEnabled: true,
    breakEvenEnabled: true,
    trailingStopEnabled: true,
    maxTicksInTrade: 50,
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    rsiVal: 50,
    bbPct: 0.5,
    adxVal: 15,
    atrVal: 0,
    confluenceScore: 0,
    mRegime: MarketRegime.TRANSITION,
  },
  R_75: {
    symbol: "R_75",
    name: "Volatility 75 (1s)",
    personality: "Apex Volatility HFT Scalar",
    enabled: true,
    rsiOversoldThreshold: 32,
    rsiOverboughtThreshold: 68,
    bbPeriod: 20,
    bbStd: 2.50,
    minConfluenceScore: 3,
    atrStopMultiplier: 2.75,
    learningAdjustmentFactor: 1.0,
    targetRiskStakeMultiplier: 0.75,
    cooldownUntil: 0,
    directiveMessage: "INITIALIZING STANDBY PILOT",
    recentWinRate: 0.5,
    targetLossPct: 0.20,
    timeExitEnabled: true,
    breakEvenEnabled: true,
    trailingStopEnabled: true,
    maxTicksInTrade: 60,
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    rsiVal: 50,
    bbPct: 0.5,
    adxVal: 15,
    atrVal: 0,
    confluenceScore: 0,
    mRegime: MarketRegime.TRANSITION,
  },
  CRASH500: {
    symbol: "CRASH500",
    name: "Crash 500 Index",
    personality: "Crash Extreme Recovery Scalar",
    enabled: true,
    rsiOversoldThreshold: 22,
    rsiOverboughtThreshold: 75,
    bbPeriod: 20,
    bbStd: 2.75,
    minConfluenceScore: 4,
    atrStopMultiplier: 2.25,
    learningAdjustmentFactor: 1.0,
    targetRiskStakeMultiplier: 0.75,
    cooldownUntil: 0,
    directiveMessage: "INITIALIZING STANDBY PILOT",
    recentWinRate: 0.5,
    targetLossPct: 0.20,
    timeExitEnabled: true,
    breakEvenEnabled: true,
    trailingStopEnabled: true,
    maxTicksInTrade: 45,
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    rsiVal: 50,
    bbPct: 0.5,
    adxVal: 15,
    atrVal: 0,
    confluenceScore: 0,
    mRegime: MarketRegime.TRANSITION,
  },
  BOOM500: {
    symbol: "BOOM500",
    name: "Boom 500 Index",
    personality: "Boom Consolidator Ridge Sniper",
    enabled: true,
    rsiOversoldThreshold: 25,
    rsiOverboughtThreshold: 78,
    bbPeriod: 20,
    bbStd: 2.75,
    minConfluenceScore: 4,
    atrStopMultiplier: 2.25,
    learningAdjustmentFactor: 1.0,
    targetRiskStakeMultiplier: 0.75,
    cooldownUntil: 0,
    directiveMessage: "INITIALIZING STANDBY PILOT",
    recentWinRate: 0.5,
    targetLossPct: 0.20,
    timeExitEnabled: true,
    breakEvenEnabled: true,
    trailingStopEnabled: true,
    maxTicksInTrade: 45,
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    rsiVal: 50,
    bbPct: 0.5,
    adxVal: 15,
    atrVal: 0,
    confluenceScore: 0,
    mRegime: MarketRegime.TRANSITION,
  },
  R_100: {
    symbol: "R_100",
    name: "Volatility 100 Index",
    personality: "Spike Breakout Raider",
    enabled: true,
    rsiOversoldThreshold: 28,
    rsiOverboughtThreshold: 72,
    bbPeriod: 20,
    bbStd: 2.75,
    minConfluenceScore: 3,
    atrStopMultiplier: 3.00,
    learningAdjustmentFactor: 1.0,
    targetRiskStakeMultiplier: 0.75,
    cooldownUntil: 0,
    directiveMessage: "INITIALIZING STANDBY PILOT",
    recentWinRate: 0.5,
    targetLossPct: 0.20,
    timeExitEnabled: true,
    breakEvenEnabled: true,
    trailingStopEnabled: true,
    maxTicksInTrade: 75,
    totalTrades: 0,
    winningTrades: 0,
    totalPnl: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0,
    rsiVal: 50,
    bbPct: 0.5,
    adxVal: 15,
    atrVal: 0,
    confluenceScore: 0,
    mRegime: MarketRegime.TRANSITION,
  },
};

// Instrument configuration mappings
const INSTRUMENTS = {
  R_10: { name: "Volatility 10 (1s)", volatility: 0.12, tickType: "1s", idealStrategy: "mean_reversion", basePrice: 100.0 },
  R_25: { name: "Volatility 25 (1s)", volatility: 0.28, tickType: "1s", idealStrategy: "mean_reversion", basePrice: 250.0 },
  R_75: { name: "Volatility 75 (1s)", volatility: 0.85, tickType: "std", idealStrategy: "breakout", basePrice: 750.0 },
  R_100: { name: "Volatility 100 Index", volatility: 1.05, tickType: "std", idealStrategy: "breakout", basePrice: 1000.0 },
  CRASH500: { name: "Crash 500 Index", volatility: 0.35, tickType: "std", idealStrategy: "spike_fade", basePrice: 500.0 },
  BOOM500: { name: "Boom 500 Index", volatility: 0.35, tickType: "std", idealStrategy: "spike_fade", basePrice: 500.0 },
};

// ==========================================
// DERIV LIVE API WEB-SOCKET INTEGRATION BRIDGE
// ==========================================
const DERIV_APP_ID = process.env.DERIV_APP_ID || "1089"; // Default App ID
const DERIV_API_TOKEN = process.env.DERIV_API_TOKEN || ""; // User API Token

class DerivLiveBridge {
  private ws: WebSocket | null = null;
  private isAuthorized = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private subscribedSymbols = new Set<string>();

  constructor() {
    logs.push(`[DERIV_LIVE] 🔄 Initializing connection to wss://ws.derivws.com/websockets/v3...`);
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`);
      
      this.ws.on("open", () => {
        logs.push(`[DERIV_LIVE] 🟢 WebSocket connection established safely with Deriv servers (App ID: ${DERIV_APP_ID}).`);
        
        if (DERIV_API_TOKEN) {
          this.authorizeUser();
        } else {
          logs.push(`[DERIV_LIVE] ❌ DERIV_API_TOKEN not set. Live trading is disabled. Price data stream active (read-only).`);
          this.requestHistoryForSymbols();
          Object.keys(INSTRUMENTS).forEach((symbol) => {
            this.subscribeToTicks(symbol);
          });
        }
      });

      this.ws.on("message", (data: string) => {
        this.handleMessage(data);
      });

      this.ws.on("close", () => {
        this.isAuthorized = false;
        logs.push(`[DERIV_LIVE] 🔴 Connection closed. Retrying connection in 5 seconds...`);
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        logs.push(`[DERIV_LIVE] ⚠️ WebSocket error encountered: ${err.message}`);
      });
    } catch (e: any) {
      logs.push(`[DERIV_LIVE] ❌ Failed to initiate WebSocket connection: ${e?.message || e}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  private authorizeUser() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    if (DERIV_API_TOKEN) {
      logs.push(`[DERIV_LIVE] 🔑 Sending secure API Token authentication handshake payload...`);
      this.ws.send(JSON.stringify({
        authorize: DERIV_API_TOKEN
      }));
    } else {
      logs.push(`[DERIV_LIVE] ❌ DERIV_API_TOKEN not set. Trading is fully disabled until a valid token is provided.`);
    }
  }

  public requestHistoryForSymbols() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    logs.push(`[DERIV_LIVE] 📊 Querying authentic historical market tick data from Deriv API for warmup buffers...`);
    Object.keys(INSTRUMENTS).forEach((symbol) => {
      const derivSymbol = this.getDerivSymbolCode(symbol);
      this.ws.send(JSON.stringify({
        ticks_history: derivSymbol,
        adjust_start_time: 1,
        count: 350,
        end: "latest",
        style: "ticks"
      }));
    });
  }

  public getIsAuthorized(): boolean {
    return this.isAuthorized;
  }

  public refreshBalance() {
    if (!this.ws || this.ws.readyState !== 1) return; // 1 is WebSocket.OPEN
    if (this.isAuthorized && DERIV_API_TOKEN) {
      logs.push(`[DERIV_LIVE] 🔄 Requesting fresh balance reference following reset trigger...`);
      this.ws.send(JSON.stringify({
        authorize: DERIV_API_TOKEN
      }));
    }
  }

  public subscribeToTicks(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Map app symbols to Deriv WS API codes
    const derivSymbol = this.getDerivSymbolCode(symbol);
    if (this.subscribedSymbols.has(derivSymbol)) return;

    logs.push(`[DERIV_LIVE] 📡 Subscribing to live pricing feed for instrument: ${symbol} (${derivSymbol})`);
    this.ws.send(JSON.stringify({
      ticks: derivSymbol
    }));
    this.subscribedSymbols.add(derivSymbol);
  }

  // Map internal symbol labels to standard Deriv market targets
  public getDerivSymbolCode(symbol: string): string {
    const map: Record<string, string> = {
      R_10: "1HZ10V",
      R_25: "1HZ25V",
      R_75: "1HZ75V",
      R_100: "R_100",
      CRASH500: "CRASH500",
      BOOM500: "BOOM500",
    };
    return map[symbol] || symbol;
  }

  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);

      if (msg.error) {
        logs.push(`[DERIV_LIVE_ERROR] 🔴 Deriv returned warning: ${msg.error.message} (${msg.msg_type})`);
        return;
      }

      // 1. Authorize Response
      if (msg.msg_type === "authorize") {
        this.isAuthorized = true;
        const auth = msg.authorize;
        const authBalance = Number.parseFloat(auth.balance);
        if (Number.isFinite(authBalance)) balance = authBalance;
        peakBalance = Math.max(peakBalance, balance);
        const accountType = auth.is_virtual ? "DERIV VIRTUAL" : "REAL LIVE";
        
        logs.push(`[DERIV_LIVE] 🏆 Authentication Succeeded! Account Type: [${accountType}] (${auth.email})`);
        logs.push(`[DERIV_LIVE] Live account balance updated to: $${balance.toFixed(2)} ${auth.currency || "USD"}`);

        // Subscribe to real-time balance updates
        logs.push(`[DERIV_LIVE] 🔔 Subscribing to automatic balance stream updates...`);
        this.ws.send(JSON.stringify({
          balance: 1,
          subscribe: 1
        }));

        // Audit Fix #4: Re-sync Active Contract Registry to map 'Ghost Positions'
        logs.push(`[DERIV_LIVE] 🔄 Syncing Active Contract Registry to identify orphan positions...`);
        this.ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));

        // Fetch historical data for warmup buffer populated with authentic pricing
        this.requestHistoryForSymbols();

        // Subscribe all sub-algorithm feeds upon authorization
        Object.keys(INSTRUMENTS).forEach((symbol) => {
          this.subscribeToTicks(symbol);
        });
      }

      // 1.05 Monitor Open Positions Registry
      if (msg.msg_type === "proposal_open_contract") {
        const contract = msg.proposal_open_contract;
        if (contract && contract.status === "open") {
          const contractIdStr = contract.contract_id.toString();
          const existing = activePositions.find(p => p.id === contractIdStr);
          if (!existing) {
             const internalSymbol = this.getInternalSymbolCode(contract.underlying || "");
             if (internalSymbol) {
                logs.push(`[DERIV_LIVE] 👻 Ghost Position Detected! Mapping orphan contract #${contractIdStr} (${contract.display_name}) to live registry.`);
                
                // Derive direction from contract type
                let direction: "LONG" | "SHORT" = "LONG";
                const type = contract.contract_type || "";
                if (type.includes("PUT") || type.includes("FALL") || type.includes("MULTDOWN") || type.includes("UNDER")) {
                  direction = "SHORT";
                }

                const ghostEntry = parseFloat(contract.entry_tick || "0") || parseFloat(contract.current_spot || "0");
                const ghostSpot  = parseFloat(contract.current_spot || "0");
                const ghostStake = parseFloat(contract.buy_price || "0");
                // Compute ATR-based SL/TP if Deriv reports none (limit_order absent = old contract)
                // Always compute price-level SL/TP from ATR — never use Deriv dollar amounts as prices
                // (Deriv limit_order.stop_loss.order_amount is a dollar loss threshold, not a price level)
                const ghostAtrBuf = ghostSpot * 0.003; // 0.3% of spot — ATR fallback
                const ghostSL = direction === "LONG" ? ghostEntry - ghostAtrBuf : ghostEntry + ghostAtrBuf;
                const ghostTP = direction === "LONG" ? ghostEntry + ghostAtrBuf * 2 : ghostEntry - ghostAtrBuf * 2;
                activePositions.push({
                  id: contractIdStr,
                  symbol: internalSymbol,
                  contractType: type as any,
                  direction: direction,
                  stake: ghostStake,
                  entryPrice: ghostEntry,
                  currentPrice: ghostSpot,
                  stopLoss: ghostSL,
                  takeProfit: ghostTP,
                  pnl: parseFloat(contract.profit || "0"),
                  ticksElapsed: 0,
                  entryEpoch: contract.date_start || Math.floor(Date.now() / 1000),
                  multiplier: parseFloat(contract.multiplier || "40"),
                });
             }
          }
        }
      }

      // 1.1 Balance Updates Stream
      if (msg.msg_type === "balance" && msg.balance) {
        const bal = msg.balance;
        const liveBalance = Number.parseFloat(bal.balance);
        if (Number.isFinite(liveBalance)) balance = liveBalance;
        peakBalance = Math.max(peakBalance, balance);
        logs.push(`[DERIV_LIVE] 💰 Real balance updated: $${balance.toFixed(2)} ${bal.currency || "USD"}`);
      }

      // 1.2 Historical Ticks Warmup Stream
      if (msg.msg_type === "history" && msg.history) {
        const derivSymbol = msg.echo_req.ticks_history;
        const internalSymbol = this.getInternalSymbolCode(derivSymbol);
        if (internalSymbol && tickBuffers[internalSymbol]) {
          const prices = msg.history.prices.map((p: any) => parseFloat(p));
          tickBuffers[internalSymbol] = prices;
          
          // Seed candles from these historical ticks to initialize indicators instantly
          const candles = candleBuffers[internalSymbol];
          candles.length = 0; // clear
          
          const times = msg.history.times;
          for (let j = 0; j < prices.length; j += 5) {
            const slice = prices.slice(j, j + 5);
            if (slice.length > 0) {
              const open = slice[0];
              const high = Math.max(...slice);
              const low = Math.min(...slice);
              const close = slice[slice.length - 1];
              candles.push({
                symbol: internalSymbol,
                epoch: times[Math.min(j + 4, times.length - 1)],
                open,
                high,
                low,
                close,
                volume: slice.length,
              });
            }
          }
          logs.push(`[DERIV_LIVE] 📊 Loaded ${prices.length} real historical tick candles for ${internalSymbol}. Warmup populated with authentic market prices.`);
        }
      }

      // 2. Tick Stream
      if (msg.msg_type === "tick" && msg.tick) {
        const tick = msg.tick;
        // Find internal representation of this Deriv symbol code
        const internalSymbol = this.getInternalSymbolCode(tick.symbol);
        const price = parseFloat(tick.quote);
        const epoch = parseInt(tick.epoch);

        if (internalSymbol && tickBuffers[internalSymbol]) {
          const prices = tickBuffers[internalSymbol];
          prices.push(price);
          if (prices.length > maxBufferLength) {
            prices.shift();
          }

          // Build/Update Candles on live pricing points
          this.appendLiveCandle(internalSymbol, price, epoch);

          // Delegate to the Sub-Algorithm Tick Processor (computes metrics in real-time)
          processSubAlgorithmTick(internalSymbol, price, epoch);
        }
      }

      // 3. Purchase Response — link Deriv contract_id back to local position
      if (msg.msg_type === "buy") {
        const buyInfo = msg.buy;
        const derivContractId = String(buyInfo.contract_id);
        logs.push(`[DERIV_LIVE_TRADE] ✅ Order accepted. Deriv Contract ID: ${derivContractId}. Linking to local registry...`);
        // Match the most recently queued pending order and update its position ID
        const pending = pendingOrderQueue.shift();
        if (pending) {
          const pos = activePositions.find(p => p.id === pending.localId);
          if (pos) {
            pos.id = derivContractId;
            logs.push(`[DERIV_LIVE_TRADE] 🔗 Local position ${pending.localId} → Deriv contract #${derivContractId} linked. Ghost-position elimination active.`);
          }
        }
      }
    } catch (e) {
      // Log critical exceptions in the socket loop safely
      const errMsg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      logs.push(`[ERROR_HANDLER] Critical error in ws.onmessage handler: ${errMsg}`);
    }
  }

  private getInternalSymbolCode(derivSymbol: string): string | null {
    const map: Record<string, string> = {
      "1HZ10V": "R_10",
      "1HZ25V": "R_25",
      "1HZ75V": "R_75",
      "R_100": "R_100",
      "CRASH500": "CRASH500",
      "BOOM500": "BOOM500",
    };
    return map[derivSymbol] || (Object.keys(INSTRUMENTS).includes(derivSymbol) ? derivSymbol : null);
  }

  private appendLiveCandle(symbol: string, price: number, epoch: number) {
    const candles = candleBuffers[symbol];
    if (candles.length === 0) {
      candles.push({ symbol, epoch, open: price, high: price, low: price, close: price, volume: 1 });
      return;
    }

    const last = candles[candles.length - 1];
    // Create new minute period candle or update active
    if (epoch - last.epoch >= 60) {
      candles.push({
        symbol,
        epoch,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1
      });
      if (candles.length > 200) {
        candles.shift();
      }
    } else {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      last.volume += 1;
    }
  }

  // Sends the real order contract proposal directly to your authorized Deriv account.
  public placeRealContractProposal(symbol: string, direction: "LONG" | "SHORT", stake: number, multiplier?: number, stopLossAmount?: number, takeProfitAmount?: number) {
    if (!this.isAuthorized || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const derivSymbol = this.getDerivSymbolCode(symbol);
    const effMode = getEffectiveTradeType();
    const supportedMultipliers = DERIV_SUPPORTED_MULTIPLIERS;
    const fallbackMultiplier = riskPreset === "AGGRESSIVE" ? 400 : riskPreset === "CONSERVATIVE" ? 40 : 200;
    const finalMultiplier = multiplier && supportedMultipliers.includes(multiplier) ? multiplier : fallbackMultiplier;
    if (effMode === "HYBRID_LINEAR" && multiplier === undefined) {
      logs.push(`[DERIV_LIVE_TRADE] ℹ️ HYBRID_LINEAR signal routed through supported Deriv multiplier contract x${finalMultiplier}.`);
    }
    
    // Submission protocol for Multipliers parameters — includes server-side SL/TP limit orders
    const parameters: any = {
      amount: stake,
      basis: "stake",
      contract_type: direction === "LONG" ? "MULTUP" : "MULTDOWN",
      currency: "USD",
      symbol: derivSymbol,
      multiplier: finalMultiplier,
    };
    // Attach server-side stop_loss and take_profit so Deriv manages exits even through disconnections
    if (stopLossAmount && stopLossAmount > 0) {
      parameters.limit_order = {
        stop_loss: parseFloat(Math.min(stopLossAmount, stake).toFixed(2)),
        ...(takeProfitAmount && takeProfitAmount > 0 ? { take_profit: parseFloat(takeProfitAmount.toFixed(2)) } : {})
      };
    }
    const proposal = { buy: 1, price: stake, parameters };

    this.ws.send(JSON.stringify(proposal));
    logs.push(`[DERIV_LIVE_TRADE] 🚀 Submitting LIVE Multiplier contract order (Leverage: x${finalMultiplier}): ${direction} on ${derivSymbol} (Stake: $${stake}) | SL: $${stopLossAmount?.toFixed(3) ?? "none"} | TP: $${takeProfitAmount?.toFixed(3) ?? "none"}`);
    return true;
  }
}

const liveBridgeInstance = new DerivLiveBridge();

// ==========================================
// MATHEMATICAL HELPER FUNCTIONS (INDICATORS ENGINE)
// ==========================================

// 1. Simple Moving Average (SMA & VWAP-like metrics)
function computeSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// 1.1. Kaufman Adaptive Moving Average (KAMA)
function computeKAMA(prices: number[], period = 50, fastLength = 2, slowLength = 30): number {
  if (prices.length < period + 1) return prices[prices.length - 1] || 0;
  const lookback = Math.min(prices.length, 300);
  const startIdx = prices.length - lookback;
  const initialSlice = prices.slice(startIdx, startIdx + period);
  let kamaVal = initialSlice.reduce((a, b) => a + b, 0) / period; // seed with SMA

  const fastest = 2 / (fastLength + 1);
  const slowest = 2 / (slowLength + 1);

  for (let i = startIdx + period; i < prices.length; i++) {
    const change = Math.abs(prices[i] - prices[i - period]);
    let volatility = 0;
    for (let j = i - period + 1; j <= i; j++) {
      volatility += Math.abs(prices[j] - prices[j - 1]);
    }
    const er = volatility === 0 ? 0 : change / volatility;
    const sc = Math.pow(er * (fastest - slowest) + slowest, 2);
    kamaVal = kamaVal + sc * (prices[i] - kamaVal);
  }
  return kamaVal;
}

// 1.2. Hill Estimator for Tail Exponent (Alpha Hat) calculation (tracks empirical fat tails)
function computeHillEstimator(prices: number[], lookback = 500, k = 50): number {
  if (prices.length < 100) return 3.50; // default to safe, light-tailed Gaussian baseline if data is limited
  
  const actualLookback = Math.min(prices.length - 1, lookback);
  const absReturns: number[] = [];
  
  for (let i = prices.length - 1; i > prices.length - 1 - actualLookback; i--) {
    const p1 = prices[i];
    const p2 = prices[i - 1];
    if (p2 > 0) {
      const logRet = Math.abs(Math.log(p1 / p2));
      if (logRet > 0) {
        absReturns.push(logRet);
      }
    }
  }

  if (absReturns.length < k + 2) return 3.50;

  // Sort absolute logarithmic returns in descending order
  absReturns.sort((a, b) => b - a);

  // Hill Estimator calculation formula
  let sum = 0;
  const xK = absReturns[k]; // the k-th order statistic
  if (xK === 0) return 3.50;

  for (let i = 0; i < k; i++) {
    sum += Math.log(absReturns[i] / xK);
  }

  const denominator = sum / k;
  if (denominator <= 0) return 3.50;

  return 1.0 / denominator;
}

// 2. Bollinger Bands
function computeBollinger(prices: number[], period = 20, multiplier = 2) {
  if (prices.length < period) {
    const last = prices[prices.length - 1] || 0;
    return { upper: last, mid: last, lower: last, percentB: 0.5 };
  }
  const slice = prices.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - mid, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + multiplier * std;
  const lower = mid - multiplier * std;
  const lastPrice = prices[prices.length - 1];
  const percentB = upper === lower ? 0.5 : (lastPrice - lower) / (upper - lower);
  return { upper, mid, lower, percentB };
}

// 3. Relative Strength Index (RSI) using Wilders Smoothing
function computeRSI(prices: number[], period = 14): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// 4. Average True Range (ATR) & ADX
function computeATRAndADX(candles: Candle[], period = 14) {
  if (candles.length < period + 1) {
    return { atr: 0.5, adx: 15 };
  }

  // Calculate True Range for candles
  let trSum = 0;
  const trs: number[] = [];
  const dxs: number[] = [];
  let plusDMSum = 0;
  let minusDMSum = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    
    // TR calculation
    const tr1 = current.high - current.low;
    const tr2 = prev ? Math.abs(current.high - prev.close) : 0;
    const tr3 = prev ? Math.abs(current.low - prev.close) : 0;
    const tr = Math.max(tr1, tr2, tr3);
    trs.push(tr);
    trSum += tr;

    // Direct movement +DM, -DM
    if (prev) {
      const upMove = current.high - prev.high;
      const downMove = prev.low - current.low;
      let plusDM = 0;
      let minusDM = 0;

      if (upMove > downMove && upMove > 0) plusDM = upMove;
      if (downMove > upMove && downMove > 0) minusDM = downMove;

      plusDMSum += plusDM;
      minusDMSum += minusDM;
    }
  }

  const atr = trSum / period;

  // Simple ADX derivation for indicators
  const diPlus = trSum === 0 ? 0 : (plusDMSum / trSum) * 100;
  const diMinus = trSum === 0 ? 0 : (minusDMSum / trSum) * 100;
  const sumDM = diPlus + diMinus;
  const diffDM = Math.abs(diPlus - diMinus);
  const dx = sumDM === 0 ? 0 : (diffDM / sumDM) * 100;

  // Since actual recursive ADX smoothing requires past steps, dynamic estimation works:
  const adx = Math.max(10, Math.min(90, dx * 0.75 + 10)); // normalized range estimation

  return { atr: Math.max(0.01, atr), adx };
}

// Compute simple relative VWAP based on price variance over volumes
function computeVWAP(prices: number[], period = 30): number {
  if (prices.length < 2) return prices[0] || 0;
  const slice = prices.slice(-period);
  // Weight recent tick positions for a VWAP-like proxy
  let num = 0;
  let den = 0;
  slice.forEach((p, idx) => {
    const vol = 100 + (idx % 5) * 50;
    num += p * vol;
    den += vol;
  });
  return num / den;
}

// Check for simple bullish/bearish candle shapes (hammer or stall is defined by open-close diff etc.)
function checkReversalCandle(candles: Candle[]): boolean {
  if (candles.length < 1) return false;
  const current = candles[candles.length - 1];
  const body = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  if (range === 0) return true; // Doji!
  
  // Doji or hammer definition: body is less than 35% of total movement range
  return (body / range) <= 0.35;
}

// Simple RSI divergence check
function checkDivergence(prices: number[], rsiArr: number[], direction: "BULLISH" | "BEARISH"): boolean {
  if (prices.length < 30 || rsiArr.length < 30) return false;
  // Look for a structural divergence across last 25 elements:
  // For BULLISH: Price is in a downtrend (last price is lower than 15 ticks ago), but RSI is rising (current RSI is higher than 15 ticks ago).
  const currentPrice = prices[prices.length - 1];
  const oldPrice = prices[prices.length - 15];
  const currentRsi = rsiArr[rsiArr.length - 1];
  const oldRsi = rsiArr[rsiArr.length - 15];

  if (direction === "BULLISH") {
    return currentPrice < oldPrice && currentRsi > oldRsi;
  } else {
    return currentPrice > oldPrice && currentRsi < oldRsi;
  }
}

// ------------------------------------------
// FRACTAL PERSISTENCE ENGINE (HURST EXPONENT H)
// ------------------------------------------

function linearRegression(x: number[], y: number[]): { slope: number, intercept: number, rSquared: number } {
  const n = x.length;
  if (n < 2) return { slope: 0.5, intercept: 0, rSquared: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
    sumYY += y[i] * y[i];
  }
  const denominator = (n * sumXX - sumX * sumX);
  if (denominator === 0) return { slope: 0.5, intercept: 0, rSquared: 0 };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R-squared
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const prediction = slope * x[i] + intercept;
    ssTot += Math.pow(y[i] - yMean, 2);
    ssRes += Math.pow(y[i] - prediction, 2);
  }
  const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
  return { slope, intercept, rSquared };
}

function computeDFA1(prices: number[], windowSize = 256): { H: number, rSquared: number } {
  if (prices.length < windowSize + 1) {
    return { H: 0.5, rSquared: 0 };
  }
  const slice = prices.slice(- (windowSize + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const r = Math.log(slice[i] / slice[i - 1]);
    returns.push(r);
  }
  
  const N = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / N;
  const profile: number[] = new Array(N);
  let cumulative = 0;
  for (let i = 0; i < N; i++) {
    cumulative += (returns[i] - mean);
    profile[i] = cumulative;
  }
  
  const boxSizes = [16, 32, 64, 128];
  const logN: number[] = [];
  const logF: number[] = [];
  
  for (const n of boxSizes) {
    const numBoxes = Math.floor(N / n);
    if (numBoxes === 0) continue;
    
    let sumSqrY = 0;
    for (let b = 0; b < numBoxes; b++) {
      const startIdx = b * n;
      // Fit linear trend: y = s * t + c
      let sumT = 0, sumYVal = 0, sumTYVal = 0, sumTT = 0;
      for (let t = 0; t < n; t++) {
        const val = profile[startIdx + t];
        sumT += t;
        sumYVal += val;
        sumTYVal += t * val;
        sumTT += t * t;
      }
      const denom = n * sumTT - sumT * sumT;
      const s = denom === 0 ? 0 : (n * sumTYVal - sumT * sumYVal) / denom;
      const c = (sumYVal - s * sumT) / n;
      
      for (let t = 0; t < n; t++) {
        const fitted = s * t + c;
        const residual = profile[startIdx + t] - fitted;
        sumSqrY += residual * residual;
      }
    }
    
    const f2 = sumSqrY / (numBoxes * n);
    const fn = Math.sqrt(f2);
    if (fn > 0) {
      logN.push(Math.log(n));
      logF.push(Math.log(fn));
    }
  }
  
  if (logN.length < 2) {
    return { H: 0.5, rSquared: 0 };
  }
  
  const reg = linearRegression(logN, logF);
  const H = Math.max(0, Math.min(1, reg.slope));
  return { H, rSquared: reg.rSquared };
}

function computeRS(prices: number[], windowSize = 1024): { H: number, rSquared: number } {
  if (prices.length < windowSize + 1) {
    return { H: 0.5, rSquared: 0 };
  }
  const slice = prices.slice(- (windowSize + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }
  
  const N = returns.length;
  const boxSizes = [16, 32, 64, 128, 256, 512];
  const logN: number[] = [];
  const logRS: number[] = [];
  
  for (const n of boxSizes) {
    const numBoxes = Math.floor(N / n);
    if (numBoxes === 0) continue;
    
    const rsVals: number[] = [];
    for (let b = 0; b < numBoxes; b++) {
      const startIdx = b * n;
      const subReturns = returns.slice(startIdx, startIdx + n);
      const subMean = subReturns.reduce((a, b) => a + b, 0) / n;
      
      // Cumulative deviations
      let curDev = 0;
      let minDev = 0;
      let maxDev = 0;
      let sumSq = 0;
      for (let t = 0; t < n; t++) {
        const dev = subReturns[t] - subMean;
        curDev += dev;
        if (curDev < minDev) minDev = curDev;
        if (curDev > maxDev) maxDev = curDev;
        sumSq += dev * dev;
      }
      
      const r = maxDev - minDev;
      const variance = sumSq / n;
      const s = Math.sqrt(variance);
      
      if (s > 0 && r > 0) {
        rsVals.push(r / s);
      }
    }
    
    if (rsVals.length > 0) {
      const avgRS = rsVals.reduce((a, b) => a + b, 0) / rsVals.length;
      logN.push(Math.log(n));
      logRS.push(Math.log(avgRS));
    }
  }
  
  if (logN.length < 2) {
    return { H: 0.5, rSquared: 0 };
  }
  
  const reg = linearRegression(logN, logRS);
  const H = Math.max(0, Math.min(1, reg.slope));
  return { H, rSquared: reg.rSquared };
}

// ==========================================
// REGIME DETECTION ENGINE
// ==========================================
function detectRegime(symbol: string): MarketRegime {
  const prices = tickBuffers[symbol] || [];
  const candles = candleBuffers[symbol] || [];
  if (prices.length < 50) return MarketRegime.TRANSITION;

  const lastPrice = prices[prices.length - 1];
  const ma50 = computeSMA(prices, 50);
  const rsi = computeRSI(prices, 14);
  const { atr, adx } = computeATRAndADX(candles, 14);
  const { upper, lower, mid } = computeBollinger(prices, currentParams.bbPeriod, currentParams.bbStd);

  // Bollinger Band Width for compression analysis
  const bbWidth = (upper - lower) / (mid || 1);

  // Determine relative width bounds
  // We can track percentile-like ranks. In dynamic, Volatility indices has stable expected base bands:
  const baseVol = INSTRUMENTS[symbol as keyof typeof INSTRUMENTS]?.volatility || 0.5;
  const squeezeThreshold = baseVol * 0.003; // compression triggers
  const highVolThreshold = baseVol * 0.012; // expansion triggers

  if (adx > currentParams.regimeAdxThreshold) {
    // Trending status
    if (lastPrice > ma50) {
      return MarketRegime.TRENDING_UP;
    } else {
      return MarketRegime.TRENDING_DOWN;
    }
  } else if (bbWidth < squeezeThreshold) {
    return MarketRegime.LOW_VOL; // Squeeze (breakout danger zone)
  } else if (bbWidth > highVolThreshold) {
    return MarketRegime.HIGH_VOL; // Dynamic panic expansion
  } else if (adx < 18 && Math.abs((lastPrice - ma50) / ma50) < 0.008) {
    return MarketRegime.RANGING; // Prime mean-reversion target
  } else {
    return MarketRegime.TRANSITION; // Transition/Neutral segment
  }
}

// ==========================================
// REAL-TIME DIRECT INDICATORS EXTRACTION ENGINE
// ==========================================
function getCurrentIndicators(symbol: string) {
  const prices = tickBuffers[symbol] || [];
  const candles = candleBuffers[symbol] || [];
  if (prices.length < 50) {
    const latestPrice = prices[prices.length - 1] ?? null;
    return {
      rsiVal: 50,
      upper: latestPrice,
      lower: latestPrice,
      mid: latestPrice,
      vwapVal: latestPrice,
      atr: 0,
      confluence: {
        isOversold: false,
        isRsiOversoldRange: false,
        isBelowVwap: false,
        isBullDivergent: false,
        isBullReversalPattern: false,
        score: 0
      }
    };
  }

  const rsiVal = computeRSI(prices, 14);
  const { upper, lower, mid } = computeBollinger(prices, currentParams.bbPeriod, currentParams.bbStd);
  const vwapVal = computeVWAP(prices, 30);
  const { atr } = computeATRAndADX(candles, 14);
  const dRsiArr = prices.map((_, i) => computeRSI(prices.slice(0, i + 1), 14));

  const isOversold = prices[prices.length - 1] <= lower;
  const isRsiOversoldRange = rsiVal >= 28 && rsiVal <= currentParams.rsiOversoldThreshold;
  const isBelowVwap = prices[prices.length - 1] < vwapVal;
  const isBullDivergent = checkDivergence(prices, dRsiArr, "BULLISH");
  const isBullReversalPattern = checkReversalCandle(candles);

  const score = (isOversold ? 1 : 0) + 
                (isRsiOversoldRange ? 1 : 0) + 
                (isBelowVwap ? 1 : 0) + 
                (isBullDivergent ? 1 : 0) + 
                (isBullReversalPattern ? 1 : 0);

  return {
    rsiVal,
    upper,
    lower,
    mid,
    vwapVal,
    atr,
    confluence: {
      isOversold,
      isRsiOversoldRange,
      isBelowVwap,
      isBullDivergent,
      isBullReversalPattern,
      score
    }
  };
}

let activeTradeType: "MULTIPLIER" | "HYBRID_LINEAR" = "MULTIPLIER";

function getEffectiveTradeType(): "MULTIPLIER" | "HYBRID_LINEAR" {
  if (tradingMode === "AUTO") return activeTradeType;
  return tradingMode as "MULTIPLIER" | "HYBRID_LINEAR";
}

// ==========================================
// CORE MULTI-ALGORITHM TRADING ENGINE & TARGET CHANNELS
// ==========================================
/**
 * GOVERNOR AUDITOR: Periodically evaluates all sectors and performs "Personality Patching" 
 * to align sub-algorithms with macro structural shifts.
 */
async function runGovernorAudit() {
  governorStatus = "AUDITING SECTOR PERFORMANCE...";
  
  for (const symbol of Object.keys(subAlgorithms)) {
    const sub = subAlgorithms[symbol];
    const recentWinRate = sub.recentWinRate || 0.5;
    
    // Agentic Adaptation: If win rate drops below 35%, the Governor "Intervenes"
    if (recentWinRate < 0.35 && sub.totalTrades > 5) {
      logs.push(`[GOVERNOR_INTERVENTION] 🚨 ${sub.name} exhibits degraded efficacy (WR: ${(recentWinRate * 100).toFixed(1)}%). Initiating personality realignment...`);
      
      // Perform a "Personality Shift"
      if (sub.personality.includes("Fader")) {
         sub.personality = `${sub.personality.split(" ")[0]} Divergence Sniper`;
         sub.rsiOversoldThreshold = 25;
         sub.rsiOverboughtThreshold = 75;
      } else {
         sub.personality = `${sub.personality.split(" ")[0]} Mean Fader`;
         sub.rsiOversoldThreshold = 35;
         sub.rsiOverboughtThreshold = 65;
      }
      
      logs.push(`[GOVERNOR_INTERVENTION] ✅ Reconfigured ${symbol} to '${sub.personality}' profile for better regime fit.`);
    }
  }
  
  governorStatus = "IML AGENTIC CORE: ONLINE";
}

// Tick-based recurring audit trigger
let ticksSinceLastAudit = 0;

function evaluateGovernorFocus() {
  ticksSinceLastAudit++;
  if (ticksSinceLastAudit >= 500) {
    ticksSinceLastAudit = 0;
    runGovernorAudit().catch(err => console.error("[AUDIT_ERROR]", err));
  }
  let highestScore = -1;
  let bestSymbol = governorFocusSymbol;
  let bestType: "MULTIPLIER" | "HYBRID_LINEAR" = "MULTIPLIER";

  Object.values(subAlgorithms).forEach((sub) => {
    // Determine prevailing mood for this instrument using Conviction Score (Hurst/Fractal metrics)
    // A higher conviction score means the sub-algorithm has better structural alignment for trading.
    const convictionScore = sub.convictionScore || 0;
    const trendStrength = sub.adxVal || 0; // standard ADX is 0-100
    
    // Evaluate MULTIPLIER fit (loves strong trends)
    const multScore = (trendStrength * 1.0) + (convictionScore * 50);
    
    // Evaluate HYBRID_LINEAR fit (favors persistent fractal structures, higher Hurst components)
    const hybridScore = (convictionScore * 80) + (trendStrength * 0.5);
    
    // Find best mode for this specific symbol
    let localBestType: "MULTIPLIER" | "HYBRID_LINEAR" = "MULTIPLIER";
    let localMaxScore = multScore;

    if (hybridScore > localMaxScore) {
      localMaxScore = hybridScore;
      localBestType = "HYBRID_LINEAR";
    }

    if (localMaxScore > highestScore) {
      highestScore = localMaxScore;
      bestSymbol = sub.symbol;
      bestType = localBestType;
    }
  });

  if (bestSymbol !== governorFocusSymbol || bestType !== activeTradeType) {
    governorFocusSymbol = bestSymbol;
    activeTradeType = bestType;
    logs.push(`[GOVERNOR_DECISION] 🎯 Governor shifted focus. Selected ${subAlgorithms[bestSymbol].name} optimized for ${bestType} contracts.`);
  }
}

/**
 * AGENTIC GOVERNOR: Scrutinize and possibly veto or polish proposals from sub-algorithms.
 */
function scrutinizeProposal(proposal: StrategyProposal): { approved: boolean; polishedStake: number; reasoning: string } {
  const { symbol, direction, score, stake, conviction, reason } = proposal;
  
  // 1. Structural Regime Conflict Check
  const sub = subAlgorithms[symbol];
  if (sub.hurstVal !== undefined && sub.hurstVal < 0.52 && conviction < 0.4 && score < 3) {
    governorMemory.vetoes++;
    return { approved: false, polishedStake: 0, reasoning: "VETO: Weak low-confluence signal inside anti-persistent noise." };
  }

  // 2. Correlation & Exposure Gating
  const directionExposure = activePositions.filter(p => p.direction === direction).length;
  if (directionExposure >= 2 && score < 5) {
    governorMemory.vetoes++;
    return { approved: false, polishedStake: 0, reasoning: `VETO: Strategic exposure limit reached for ${direction} bias. Awaiting higher confluence.` };
  }

  // 3. Selective Leverage Polishing (Agentic Autonomy)
  let finalStake = stake;
  let logic = "Approved as proposed.";

  // Governor Logic: If conviction is ultra-high (>0.85) AND it's the focus symbol, BOOST the trade.
  if (symbol === governorFocusSymbol && conviction > 0.85 && score >= 4) {
    finalStake *= 1.35;
    logic = "POLISHED: Ultra-high conviction detected on focus instrument. Applied 1.35x strategic boost.";
  }

  // Double Vetting for "Elite" trades
  if (score === 5 && conviction > 0.75) {
    logic = "ELITE_CO_SIGNED: Structural fractal alignment meets supreme Governor criteria.";
  }

  governorMemory.approvals++;
  governorMemory.lastInsight = logic;
  return { approved: true, polishedStake: finalStake, reasoning: logic };
}

function processSubAlgorithmTick(symbol: string, currentPrice: number, epoch: number) {
  updateCircuitBreakerCooldown();

  // 1. Process and track any existing positions for this specific symbol
  updateOpenPositions(symbol, currentPrice, epoch);

  // 2. Fetch the corresponding sub-algorithm engine setup
  const sub = subAlgorithms[symbol];
  if (!sub) return;

  // 3. Compute indicators using the Sub-Algorithm's specific setup parameters
  const prices = tickBuffers[symbol];
  const candles = candleBuffers[symbol];
  if (!prices || prices.length < 50) return;

  const rsiVal = computeRSI(prices, 14);
  const { upper, lower } = computeBollinger(prices, sub.bbPeriod, sub.bbStd);
  const vwapVal = computeVWAP(prices, 30);
  const { atr, adx } = computeATRAndADX(candles, 14);
  const currentRegime = detectRegime(symbol);

  // Update real-time properties for UI live charts
  sub.rsiVal = parseFloat(rsiVal.toFixed(2));
  sub.bbPct = parseFloat(((currentPrice - lower) / (upper - lower || 1)).toFixed(3));
  sub.adxVal = parseFloat(adx.toFixed(2));
  sub.atrVal = parseFloat(atr.toFixed(4));
  sub.mRegime = currentRegime;

  // Audit Recommendation Fix 1: Statistical Latency Mitigation (CPU Throttling)
  // Only execute intensive fractal computations (DFA/RS) every 10 ticks to free event loop blocking
  const shouldComputeIntensive = epoch % 10 === 0;

  if (shouldComputeIntensive) {
    const dfaRes = computeDFA1(prices, 256);
    const rsRes = computeRS(prices, 1024);
    const rsMacroRes = computeRS(prices, 2000);
    const kamaLocal = computeKAMA(prices, 50);
    const smaHigher = computeSMA(prices, 600);

    sub.hurstVal = parseFloat(dfaRes.H.toFixed(3));
    sub.hurstRSquared = parseFloat(dfaRes.rSquared.toFixed(3));
    sub.hurstConfirm = parseFloat(rsRes.H.toFixed(3));
    sub.hurstMacro = parseFloat(rsMacroRes.H.toFixed(3));
    sub.kamaValue = parseFloat(kamaLocal.toFixed(4));

    // Section 7.1 Hill Estimator Tail Exponent (Alpha Hat)
    const alphaVal = computeHillEstimator(prices, 500, 50);
    sub.tailExponent = parseFloat(alphaVal.toFixed(3));

    // Compute Conviction Score Composite (C) between 0.0 and 1.0 according to Section 3.3
    const hMicro = dfaRes.H;
    const hMeso = rsRes.H;
    const hNorm = Math.max(0, Math.min(1, (hMicro - 0.65) / (0.866 - 0.65)));
    const rSqr = dfaRes.rSquared;
    const deltaHNorm = Math.max(0, Math.min(1, 1 - Math.abs(hMicro - hMeso) / 0.10));
    const conviction = 0.50 * hNorm + 0.30 * rSqr + 0.20 * deltaHNorm;
    sub.convictionScore = parseFloat(conviction.toFixed(3));
  }

  // Ensure internal variables are populated for signal checks if we skipped computation
  const hMicro = sub.hurstVal || 0.5;
  const hMeso = sub.hurstConfirm || 0.5;
  const rsMacroH = sub.hurstMacro || 0.5;
  const rSqr = sub.hurstRSquared || 0.9;
  const conviction = sub.convictionScore || 0.5;
  const kamaLocal = sub.kamaValue || currentPrice;
  const smaHigher = computeSMA(prices, 600); // SMA is light

  // 4. Update the Governor's Focused Instrument dynamically
  evaluateGovernorFocus();

  // 4.5 STRATEGIC CREATIVITY: Synthesis Engine (Audit Rec #SubAlgorithms)
  // Sub-algorithms now "invent" a synthetic delta between Conviction and Volatility (Strategic Pivot)
  const syntheticDelta = conviction - (sub.adxVal ? sub.adxVal / 100 : 0.5);
  if (epoch % 50 === 0) {
    if (Math.abs(syntheticDelta) > 0.4) {
      const creativeReason = syntheticDelta > 0 ? "Potential Structural Breakout" : "Structural Deceleration Warning";
      if (tradingEnabled) logs.push(`[CREATIVE_SYNTH] 🧠 ${sub.name} synthesized a new Strategic Pivot: '${creativeReason}' (Δ: ${syntheticDelta.toFixed(2)}). Submitting for Governor scrutiny...`);
      
      // Auto-tuning runs whether paused or not — recalibrate during downtime
      if (syntheticDelta < -0.3) {
         sub.minConfluenceScore = Math.min(4, sub.minConfluenceScore + 1);
         if (tradingEnabled) logs.push(`[CREATIVE_SYNTH] 🛡️ ${sub.name} autonomously tightened defensive filters based on synthesized deceleration.`);
      } else if (syntheticDelta > 0.3 && sub.minConfluenceScore > 2) {
         sub.minConfluenceScore--;
         if (tradingEnabled) logs.push(`[CREATIVE_SYNTH] ⚡ ${sub.name} relaxed execution barriers due to high structural momentum.`);
      }
    }
  }

  // 5. Early exit checks before active trade trigger
  updateCircuitBreakerCooldown();
  if (circuitBreakerCooldown > 0) return;
  if (!sub.enabled) return;
  if (epoch < sub.cooldownUntil) return;

  // Match: if a position is open on this symbol, do not open another
  if (activePositions.some(p => p.symbol === symbol)) {
    return;
  }

  // ── PAUSED MODE: indicators stay warm, positions managed above — skip signal analysis & logging ──
  if (!tradingEnabled) {
    // Single terse heartbeat every 5 minutes on the primary symbol only — proves engine is alive
    if (epoch % 300 === 0 && symbol === selectedSymbol) {
      logs.push(`[IML_MONITOR] 🔍 PAUSED — Monitoring ${symbol} | RSI: ${rsiVal.toFixed(1)} | ADX: ${adx.toFixed(1)} | Regime: ${currentRegime} | H_μ: ${hMicro.toFixed(3)} | Conviction: ${(conviction * 100).toFixed(0)}% | Positions: ${activePositions.length}`);
    }
    return;
  }

  // Accumulate RSI array for divergence checks
  const dRsiArr = prices.slice(-100).map((_, i, arr) => computeRSI(prices.slice(-100).slice(0, i + 1), 14));

  // 6. Evaluate Signals (Dynamic SFT-V2 Fractal Strategy with Mean-Fader Fallback)
  let triggerTrade = false;
  let direction: "LONG" | "SHORT" = "LONG";
  let score = 0;
  let conditionsList: string[] = [];

  const isPersistentRegime = hMicro >= 0.65 && hMeso >= 0.62 && rsMacroH >= 0.60 && rSqr >= 0.92;

  if (isPersistentRegime) {
    // SFT-V2 Fractal Pursuit Entry (Trend-following inside persistent memory corridors)
    // Calibration: Require ADX > 25 for Trend Following
    if (adx < 25) {
      if (Math.random() < 0.05) logs.push(`[SFT_V2_REGIME] 🚫 Trend signal ignored. ADX (${adx.toFixed(1)}) < 25 requirement for persistence corridor.`);
      return;
    }
    const isLocalBull = currentPrice > kamaLocal;
    const isHigherBull = currentPrice > smaHigher;
    
    if (isLocalBull === isHigherBull) {
      triggerTrade = true;
      direction = isLocalBull ? "LONG" : "SHORT";
      score = 5; // Elite level persistence score
      conditionsList = ["SFT_V2_FRACTAL", "KAMA_LOCAL", "SMA_HIGHER", "PERS_CONFIRM"];
      logs.push(`[SFT_V2_TACTICAL] 🌪️ Fractal Persistence detected on ${symbol} (H_μ: ${hMicro.toFixed(2)}, H_m: ${hMeso.toFixed(2)}, H_M: ${rsMacroH.toFixed(2)}). Local KAMA and Higher SMA aligned in ${direction} direction. Active Conviction Score: ${(conviction * 100).toFixed(1)}%.`);
    } else {
      // Timeframe conflict in a persistent regime; standard mean reversion is dangerous, stand-by
      if (Math.random() < 0.05) {
        logs.push(`[SFT_V2_STANDBY] ⚠️ High persistence on ${symbol} but timeframe conflict detected (Local Bull: ${isLocalBull}, MTF Bull: ${isHigherBull}). Standby to avoid chops.`);
      }
    }
  } else {
    // FALLBACK: Standard Mean-Fader signals for stationary/random-walk regimes
    const highAdxMeanReversionPenalty = adx > 45 ? 1 : 0;
    if (highAdxMeanReversionPenalty && Math.random() < 0.05) {
      logs.push(`[SFT_V2_REGIME] ⚠️ High ADX (${adx.toFixed(1)}) detected. Mean Reversion requires stronger confluence instead of being hard-blocked.`);
    }
    const isOversold = currentPrice <= lower;
    const isRsiOversoldRange = rsiVal <= sub.rsiOversoldThreshold;
    const isBelowVwap = currentPrice < vwapVal;
    const isBullDivergent = checkDivergence(prices, dRsiArr, "BULLISH");
    const isBullReversalPattern = checkReversalCandle(candles);

    const longScore = (isOversold ? 1 : 0) + 
                      (isRsiOversoldRange ? 1 : 0) + 
                      (isBelowVwap ? 1 : 0) + 
                      (isBullDivergent ? 1 : 0) + 
                      (isBullReversalPattern ? 1 : 0);

    const isOverbought = currentPrice >= upper;
    const isRsiOverboughtRange = rsiVal >= sub.rsiOverboughtThreshold;
    const isAboveVwap = currentPrice > vwapVal;
    const isBearDivergent = checkDivergence(prices, dRsiArr, "BEARISH");
    const isBearReversalPattern = checkReversalCandle(candles);

    const shortScore = (isOverbought ? 1 : 0) + 
                       (isRsiOverboughtRange ? 1 : 0) + 
                       (isAboveVwap ? 1 : 0) + 
                       (isBearDivergent ? 1 : 0) + 
                       (isBearReversalPattern ? 1 : 0);

    // Audit Fix #3: Implement Dynamic Confluence Scaling
    // Automatically scale down the required confluence criteria to (N-1) during high-volatility regimes (ADX > 30)
    let dynamicMinConfluence = sub.minConfluenceScore;
    if (adx > 45) {
      dynamicMinConfluence = Math.min(5, sub.minConfluenceScore + highAdxMeanReversionPenalty);
      if (Math.random() < 0.05) logs.push(`[SFT_V2_DYNAMIC] ⚖️ High momentum detected (ADX: ${adx.toFixed(1)}). Scaling mean-reversion confluence from ${sub.minConfluenceScore} up to ${dynamicMinConfluence}.`);
    }

    sub.confluenceScore = Math.max(longScore, shortScore);

    if (longScore >= dynamicMinConfluence) {
      triggerTrade = true;
      direction = "LONG";
      score = longScore;
      if (isOversold) conditionsList.push("BB_OVERSOLD");
      if (isRsiOversoldRange) conditionsList.push("RSI_OVERSOLD_ZONE");
      if (isBelowVwap) conditionsList.push("BELOW_VWAP");
      if (isBullDivergent) conditionsList.push("BULLISH_DIVERG");
      if (isBullReversalPattern) conditionsList.push("REVERSAL_CANDLE");
    } else if (shortScore >= dynamicMinConfluence) {
      triggerTrade = true;
      direction = "SHORT";
      score = shortScore;
      if (isOverbought) conditionsList.push("BB_OVERBOUGHT");
      if (isRsiOverboughtRange) conditionsList.push("RSI_OVERBOUGHT_ZONE");
      if (isAboveVwap) conditionsList.push("ABOVE_VWAP");
      if (isBearDivergent) conditionsList.push("BEARISH_DIVERG");
      if (isBearReversalPattern) conditionsList.push("REVERSAL_CANDLE");
    }
  }

  const tickEffMode = getEffectiveTradeType();

  if (triggerTrade) {
    logs.push(`[DEBUG_TRIGGER] triggerTrade=${triggerTrade}, tradingEnabled=${tradingEnabled}, symbol=${symbol}, score=${score}, direction=${direction}`);
  }

  // 7. Execute Transaction Order Proposal
  if (triggerTrade && tradingEnabled) {
    if (!liveBridgeInstance.getIsAuthorized()) {
      tradingEnabled = false;
      logs.push(`[EXECUTION_BLOCKED] Live Deriv authorization is required before automated trading can place orders. Set DERIV_API_TOKEN and reconnect to trade with real live data only.`);
      return;
    }

    logs.push(`[TRACE] Entering execution block for ${symbol} with score ${score}. EffMode: ${tickEffMode}`);
    // ----------------------------------------------------
    // MITIGATION: Extra filtration based on contract mode
    // ----------------------------------------------------
    const currentMinConf = (adx > 30) ? Math.max(2, sub.minConfluenceScore - 1) : sub.minConfluenceScore;
    if (tickEffMode === "MULTIPLIER") {
      // Multipliers get crushed if the StopLoss triggers too often in noise.
      if (score < currentMinConf && rsiVal > 40 && rsiVal < 60) {
        logs.push(`[TRACE] Exiting: multiplier chop zone`);
        // Chop zone, skip multiplier
        return;
      }
    }

    // Determine stake sized with Kelly formula scaling factor
    const baseStake = calculateKellyStake(symbol);
    let stake = baseStake * sub.targetRiskStakeMultiplier;
    
    // Scale down dynamically using our SFT-V2 Conviction Score Composite (C) for fractal entries
    const cScore = sub.convictionScore !== undefined ? sub.convictionScore : 1.0;
    if (sub.hurstVal !== undefined && sub.hurstVal >= 0.65) {
      const priorStake = stake;
      stake = stake * cScore;
      logs.push(`[SFT_V2_RISK] 🎚️ Active Conviction Composite scaling (C: ${(cScore * 100).toFixed(1)}%) adjusted Kelly stake from $${priorStake.toFixed(2)} to $${stake.toFixed(2)}.`);
    } else {
      logs.push(`[TRACE] Sized stake: baseStake=${baseStake}, multiplier=${sub.targetRiskStakeMultiplier}, final=${stake}`);
    }

    stake = parseFloat(Math.max(0.35, Math.min(stake, balance * 0.05)).toFixed(2));
    
    // Ensure Multiplier mode respects Fixed USD risk if configured
    if (tickEffMode === "MULTIPLIER" && hybridRiskType === "FIXED") {
      stake = Math.min(stake, hybridRiskFixedAmount);
    }

    // ----------------------------------------------------
    // AGENTIC GOVERNOR SCAN (AUDIT VETTING)
    // ----------------------------------------------------
    const proposal: StrategyProposal = {
      symbol,
      direction,
      score,
      stake,
      effMode: tickEffMode as any,
      conviction: cScore,
      reason: conditionsList.join(", "),
      indicators: { rsi: rsiVal, adx, hurst: sub.hurstVal }
    };

    const auditRes = scrutinizeProposal(proposal);
    if (!auditRes.approved) {
      logs.push(`[GOVERNOR_VETO] 🛡️ Sector Audit failed for ${symbol} signal. Reason: ${auditRes.reasoning}`);
      return;
    }
    
    // Apply polished parameters from Governor (Agentic autonomy in action)
    stake = auditRes.polishedStake;
    if (auditRes.reasoning.includes("POLISHED") || auditRes.reasoning.includes("ELITE")) {
      logs.push(`[GOVERNOR_AGENT] 🖋️ ${auditRes.reasoning}`);
    }

    logs.push(`[TRACE] Final stake approved: amount=${stake}, balance=${balance}`);

    if (stake > balance) {
      logs.push(`[EXECUTION_ALERT] Sub-algorithm ${sub.name} allocation ($${stake}) exceeds available balance. Reverting.`);
      return;
    }

    // Volatility-adjusted Boundaries & Dynamic Position/Leverage Multiplier Sizing
    logs.push(`[TRACE] Setting stopLoss and takeProfit distances...`);
    const atrBuffer = atr * sub.atrStopMultiplier;
    let stopLossDistance = Math.max(currentPrice * 0.003, atrBuffer);
    let takeProfitDistance = stopLossDistance * 2.0; // Optimized standard exit ratio (IML recommended higher R)
    let chosenMultiplier = DERIV_SUPPORTED_MULTIPLIERS[0];
    let targetRisk = 25.00;

    if (tickEffMode === "HYBRID_LINEAR") {
      const calculatedRisk = hybridRiskType === "PERCENT" ? (balance * hybridRiskPercent / 100) : hybridRiskFixedAmount;
      targetRisk = parseFloat(Math.max(1.0, Math.min(calculatedRisk, balance * 0.1)).toFixed(2));
      takeProfitDistance = stopLossDistance * hybridRewardRatio;
      stake = parseFloat(Math.max(0.35, Math.min(targetRisk, balance * 0.1)).toFixed(2));
      logs.push(`[HYBRID_ENGINE_SINK] Prepared trade sizing for Hybrid Linear: Risk R=$${targetRisk}, Reward Ratio=${hybridRewardRatio}x ($${(targetRisk * hybridRewardRatio).toFixed(2)}), Allocated Stake/Margin=$${stake}`);
    } else if (tickEffMode === "MULTIPLIER") {
      const targetLossPct = sub.targetLossPct || 0.15; // default 15% max risk on stake
      const slPct = stopLossDistance / currentPrice;
      const desiredMultiplier = targetLossPct / slPct;

      const multiplierOptions = DERIV_SUPPORTED_MULTIPLIERS;
      chosenMultiplier = multiplierOptions[0];
      let minDiff = Math.abs(desiredMultiplier - chosenMultiplier);
      for (let i = 1; i < multiplierOptions.length; i++) {
        const diff = Math.abs(desiredMultiplier - multiplierOptions[i]);
        if (diff < minDiff) {
          minDiff = diff;
          chosenMultiplier = multiplierOptions[i];
        }
      }

      // If at chosenMultiplier our expected stop loss is too wide, downshift to avoid large losses
      while (slPct * chosenMultiplier > 0.40 && chosenMultiplier > multiplierOptions[0]) {
        const idx = multiplierOptions.indexOf(chosenMultiplier);
        if (idx > 0) {
          chosenMultiplier = multiplierOptions[idx - 1];
        } else {
          break;
        }
      }

      // Recalculate stopLossDistance and takeProfitDistance with an adaptive 1.25x risk-reward ratio
      // to avoid giving back open profits and highly increase hit rate
      takeProfitDistance = stopLossDistance * 1.25;

      // Scale stake down dynamically if expected loss is too high
      const expectedLossPct = (stopLossDistance / currentPrice) * chosenMultiplier;
      if (expectedLossPct > 0.40) {
        const safetyFactor = 0.40 / expectedLossPct;
        const previousStake = stake;
        stake = parseFloat((stake * safetyFactor).toFixed(2));
        logs.push(`[RISK_SHIELD] Real-time expected loss at SL is ${(expectedLossPct * 100).toFixed(1)}%. Scaling stake down from $${previousStake} to $${stake} to respect risk rules.`);
      }
    }

    const stopLoss = direction === "LONG" ? (currentPrice - stopLossDistance) : (currentPrice + stopLossDistance);
    const takeProfit = direction === "LONG" ? (currentPrice + takeProfitDistance) : (currentPrice - takeProfitDistance);

    let contractType: ActivePosition["contractType"] = direction === "LONG" ? "MULTUP" : "MULTDOWN";
    if (tickEffMode === "HYBRID_LINEAR") {
      contractType = direction === "LONG" ? "HYBRID_LINEAR_UP" : "HYBRID_LINEAR_DOWN";
    }

    const positionId = `CT_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const position: ActivePosition = {
      id: positionId,
      symbol,
      contractType,
      direction,
      stake,
      entryPrice: currentPrice,
      currentPrice,
      stopLoss: parseFloat(stopLoss.toFixed(5)),
      takeProfit: parseFloat(takeProfit.toFixed(5)),
      pnl: 0.0,
      ticksElapsed: 0,
      entryEpoch: epoch,
      multiplier: tickEffMode === "MULTIPLIER" ? chosenMultiplier : undefined,
      isHybridLinear: tickEffMode === "HYBRID_LINEAR" ? true : undefined,
      targetRiskAmount: tickEffMode === "HYBRID_LINEAR" ? targetRisk : undefined,
      hybridPositionSize: tickEffMode === "HYBRID_LINEAR" ? (targetRisk / stopLossDistance) : undefined,
      isFractalTrend: isPersistentRegime,
    };

    logs.push(`[TRACE] Built position object successfully. Placing live order payload...`);
    if (!liveBridgeInstance.getIsAuthorized()) {
      logs.push(`[ORDER_BLOCKED] Live authorization required. Trade rejected — set DERIV_API_TOKEN to enable live trading.`);
      return;
    }
    const slAmount = parseFloat(Math.min(
      (stopLossDistance / currentPrice) * stake * (position.multiplier || 40),
      stake
    ).toFixed(3));
    const tpAmount = parseFloat(
      ((takeProfitDistance / currentPrice) * stake * (position.multiplier || 40)).toFixed(3)
    );
    pendingOrderQueue.push({ localId: positionId, symbol, direction });
    const liveOrderPlaced = liveBridgeInstance.placeRealContractProposal(symbol, direction, stake, position.multiplier, slAmount, tpAmount);
    logs.push(`[TRACE] liveOrderPlaced result: ${liveOrderPlaced}`);
    if (!liveOrderPlaced) {
      pendingOrderQueue.pop();
      logs.push(`[ORDER_FAILED] Live order dispatch failed for Sub-algorithm ${sub.name}. Position not tracked.`);
      return;
    }
    logs.push(`[DERIV_LIVE_TRADE] ⚡ Real-market directive sent. Sub-algorithm ${sub.name} broadcasted successfully to your Deriv live terminal.`);
    activePositions.push(position);
    logs.push(`[ORDER_EXEC] ${new Date().toLocaleTimeString()} Sub-algorithm [${sub.personality}] opened ${direction} position #${positionId} on ${symbol}. Stake: $${stake}, Entry: ${currentPrice.toFixed(2)}, SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit.toFixed(2)} [Multiplier: x${position.multiplier || 'N/A'}] [Confluence Score: ${score}/5]`);
    logs.push(`[TRACE] Completed trade execution block successfully!`);
  }
}

function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Position Sizing: HYBRID HALF-KELLY SIZER with monotone regression and Bayesian shrinkage
function calculateKellyStake(symbol?: string): number {
  const last50 = completedTrades.slice(-50);
  const winPnlArr = last50.filter(t => t.pnl > 0).map(t => t.pnl);
  const lossPnlArr = last50.filter(t => t.pnl < 0).map(t => Math.abs(t.pnl));
  
  // Derive b (Payout Ratio) using rolling 50-trade median ratio
  const b = (last50.length >= 30 && winPnlArr.length >= 10 && lossPnlArr.length >= 10)
    ? computeMedian(winPnlArr) / (computeMedian(lossPnlArr) || 1)
    : 1.25; // 1.25x default fallback based on TP/SL ratio

  let p = 0.50;
  const sub = symbol ? subAlgorithms[symbol] : null;
  const hurst = sub ? sub.hurstVal : undefined;

  if (hurst !== undefined && hurst >= 0.65) {
    // Section 4.1.1 monotone regression: p(H) = a*H + b
    const pEmpirical = Math.max(0.50, Math.min(0.75, 0.85 * hurst - 0.05));
    // Section 4.1.1 Bayesian shrinkage: p_shrunk = 0.7 * p_empirical + 0.3 * 0.50
    p = 0.7 * pEmpirical + 0.3 * 0.50;
  } else {
    // Fallback: historic overall winrate shrunk toward 50%
    const totalCount = completedTrades.length;
    const winCount = completedTrades.filter(t => t.pnl > 0).length;
    const histWinrate = totalCount > 0 ? (winCount / totalCount) : 0.50;
    const pEmpirical = Math.max(0.40, Math.min(0.60, histWinrate));
    p = 0.7 * pEmpirical + 0.3 * 0.50;
  }

  // Full Kelly Formula: f* = (b*p - q)/b
  const q = 1 - p;
  const fullKelly = (b * p - q) / (b || 1);
  // Half-Kelly multiplier for protection (0.5 * f*)
  const halfKelly = fullKelly / 2.0;

  // STRICT CAPS based on risk preset
  const MAX_STAKE_PCT = riskPreset === "AGGRESSIVE" ? 0.04 : riskPreset === "CONSERVATIVE" ? 0.01 : 0.02;
  const calculatedMax = balance * MAX_STAKE_PCT;
  
  let kellyPct = Math.max(0.005, Math.min(halfKelly, MAX_STAKE_PCT));
  if (isNaN(kellyPct) || kellyPct <= 0) {
    kellyPct = 0.005; // safe fallback (0.5% of equity)
  }

  let stake = balance * kellyPct;
  if (stake < 0.35) {
    stake = balance * 0.005; // safe fallback
  }

  // Section 7.3 Halving Trigger Protocol
  const isHalvingProtocolActive = Object.values(subAlgorithms).some(s => s.enabled && s.tailExponent !== undefined && s.tailExponent <= 2.2);
  if (isHalvingProtocolActive) {
    const priorStake = stake;
    stake = stake * 0.50;
    if (Math.random() < 0.05) {
      logs.push(`[POWER_LAW_SHIELD] 🚨 Halving Trigger Protocol is ACTIVE (At least one active symbol has tail exponent <= 2.2). Cut stake from $${priorStake.toFixed(2)} to $${stake.toFixed(2)} (-50%).`);
    }
  }

  const finalStake = parseFloat(Math.min(stake, calculatedMax).toFixed(2));
  return Math.max(0.35, finalStake);
}

function executeProposal(
  symbol: string,
  direction: "LONG" | "SHORT",
  entryPrice: number,
  atr: number,
  regime: MarketRegime,
  rsi: number,
  bbLower: number,
  bbUpper: number,
  confluenceScore: number,
  conditions: string[],
  epoch: number
) {
  if (!liveBridgeInstance.getIsAuthorized()) {
    logs.push(`[MANUAL_TRIGGER_BLOCKED] Live Deriv authorization is required before manual orders can be submitted. No local position was created.`);
    return false;
  }

  // Check if trading amount exceeds balance
  let stake = calculateKellyStake(symbol);
  const sub = subAlgorithms[symbol];
  if (sub) {
    stake = stake * sub.targetRiskStakeMultiplier;
  }
  stake = parseFloat(Math.max(0.35, Math.min(stake, balance * 0.05)).toFixed(2));

  if (stake > balance) {
    logs.push(`[EXECUTION_ALERT] ${new Date().toLocaleTimeString()} Stake recommendation ($${stake}) exceeds available balance. Reverting.`);
    return;
  }

  // ATR Volatility-adjusted Stops
  // Multipliers use ATR offsets to set boundaries
  const atrStopMult = sub ? sub.atrStopMultiplier : currentParams.atrStopMultiplier || 1.5;
  const targetLossPct = sub ? (sub.targetLossPct || 0.15) : 0.15;

  const atrBuffer = atr * atrStopMult;
  let stopLossDistance = Math.max(entryPrice * 0.003, atrBuffer);
  let takeProfitDistance = stopLossDistance * 1.25; // optimized 1.25x exit ratio for high hit rate
  let chosenMultiplier = DERIV_SUPPORTED_MULTIPLIERS[0];
  let targetRisk = 25.00;

  const effMode = getEffectiveTradeType();

  if (effMode === "HYBRID_LINEAR") {
    const calculatedRisk = hybridRiskType === "PERCENT" ? (balance * hybridRiskPercent / 100) : hybridRiskFixedAmount;
    targetRisk = parseFloat(Math.max(1.0, Math.min(calculatedRisk, balance * 0.1)).toFixed(2));
    takeProfitDistance = stopLossDistance * hybridRewardRatio;
    stake = parseFloat(Math.max(0.35, Math.min(targetRisk * 2.0, balance * 0.1)).toFixed(2));
    logs.push(`[HYBRID_ENGINE_MANUAL] Prepared manual trade sizing: Risk R=$${targetRisk}, Reward Ratio=${hybridRewardRatio}x ($${(targetRisk * hybridRewardRatio).toFixed(2)}), Allocated Stake/Margin=$${stake}`);
  } else if (effMode === "MULTIPLIER") {
    const slPct = stopLossDistance / entryPrice;
    const desiredMultiplier = targetLossPct / slPct;

    const multiplierOptions = DERIV_SUPPORTED_MULTIPLIERS;
    chosenMultiplier = multiplierOptions[0];
    let minDiff = Math.abs(desiredMultiplier - chosenMultiplier);
    for (let i = 1; i < multiplierOptions.length; i++) {
      const diff = Math.abs(desiredMultiplier - multiplierOptions[i]);
      if (diff < minDiff) {
        minDiff = diff;
        chosenMultiplier = multiplierOptions[i];
      }
    }

    // If at chosenMultiplier our expected stop loss is too wide, downshift to avoid large losses
    while (slPct * chosenMultiplier > 0.40 && chosenMultiplier > multiplierOptions[0]) {
      const idx = multiplierOptions.indexOf(chosenMultiplier);
      if (idx > 0) {
        chosenMultiplier = multiplierOptions[idx - 1];
      } else {
        break;
      }
    }

    // Scale stake down dynamically if expected loss is too high
    const expectedLossPct = (stopLossDistance / entryPrice) * chosenMultiplier;
    if (expectedLossPct > 0.40) {
      const safetyFactor = 0.40 / expectedLossPct;
      const previousStake = stake;
      stake = parseFloat((stake * safetyFactor).toFixed(2));
      logs.push(`[RISK_SHIELD] Real-time expected loss at SL is ${(expectedLossPct * 100).toFixed(1)}%. Scaling manual stake down from $${previousStake} to $${stake} to respect risk rules.`);
    }
  }

  const stopLoss = direction === "LONG" ? (entryPrice - stopLossDistance) : (entryPrice + stopLossDistance);
  const takeProfit = direction === "LONG" ? (entryPrice + takeProfitDistance) : (entryPrice - takeProfitDistance);

  let contractType: ActivePosition["contractType"] = direction === "LONG" ? "MULTUP" : "MULTDOWN";
  if (effMode === "HYBRID_LINEAR") {
    contractType = direction === "LONG" ? "HYBRID_LINEAR_UP" : "HYBRID_LINEAR_DOWN";
  }

  const id = `TX_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const position: ActivePosition = {
    id,
    symbol,
    contractType,
    direction,
    stake,
    entryPrice,
    currentPrice: entryPrice,
    stopLoss: parseFloat(stopLoss.toFixed(5)),
    takeProfit: parseFloat(takeProfit.toFixed(5)),
    pnl: 0.0,
    ticksElapsed: 0,
    entryEpoch: epoch,
    multiplier: effMode === "MULTIPLIER" ? chosenMultiplier : undefined,
    isHybridLinear: effMode === "HYBRID_LINEAR" ? true : undefined,
    targetRiskAmount: effMode === "HYBRID_LINEAR" ? targetRisk : undefined,
    hybridPositionSize: effMode === "HYBRID_LINEAR" ? (targetRisk / stopLossDistance) : undefined,
  };

  if (!liveBridgeInstance.getIsAuthorized()) {
    logs.push(`[ORDER_BLOCKED] Live authorization required. Manual trade rejected — set DERIV_API_TOKEN.`);
    return false;
  }
  const manualSlAmount = parseFloat(Math.min(
    (stopLossDistance / entryPrice) * stake * (position.multiplier || 40),
    stake
  ).toFixed(3));
  const manualTpAmount = parseFloat(
    ((takeProfitDistance / entryPrice) * stake * (position.multiplier || 40)).toFixed(3)
  );
  pendingOrderQueue.push({ localId: id, symbol, direction });
  const liveOrderPlaced = liveBridgeInstance.placeRealContractProposal(symbol, direction, stake, position.multiplier, manualSlAmount, manualTpAmount);
  if (!liveOrderPlaced) {
    pendingOrderQueue.pop();
    logs.push(`[ORDER_FAILED] Live order dispatch failed. Manual position not tracked.`);
    return false;
  }
  logs.push(`[DERIV_LIVE_TRADE] ⚡ Real-market manual contract broadcasted successfully to your Deriv live terminal. SL: $${manualSlAmount} | TP: $${manualTpAmount}`);
  activePositions.push(position);

  logs.push(`[ORDER_EXEC] ${new Date().toLocaleTimeString()} Opened ${direction} Position #${id} on ${symbol}. Stake: $${stake}, Entry: ${entryPrice.toFixed(2)}, Stop: ${position.stopLoss.toFixed(2)}, TakeProfit: ${position.takeProfit.toFixed(2)} [Multiplier: x${position.multiplier || 'N/A'}] (Regime: ${regime}, Score: ${confluenceScore}/5)`);
  return true;
}

function updateOpenPositions(symbol: string, currentPrice: number, epoch: number) {
  const settledTrades: { idx: number, pos: ActivePosition, price: number, reason: "stop_loss" | "take_profit" | "time_exit" | "manual" | "early_cutoff", epoch: number }[] = [];

  activePositions.forEach((pos, idx) => {
    if (pos.symbol !== symbol) return;
    pos.currentPrice = currentPrice;
    pos.ticksElapsed++;

    // P&L formula estimation based on mode
    let posPnl = 0;
    if (pos.isHybridLinear) {
      const isUp = pos.contractType === "HYBRID_LINEAR_UP";
      posPnl = (isUp ? 1 : -1) * pos.hybridPositionSize! * (currentPrice - pos.entryPrice);
    } else if (pos.contractType === "MULTUP" || pos.contractType === "MULTDOWN") {
      const isUp = pos.contractType === "MULTUP";
      const pctDiff = (currentPrice - pos.entryPrice) / pos.entryPrice;
      const scale = pos.multiplier || 50;
      posPnl = pos.stake * (isUp ? pctDiff : -pctDiff) * scale;
      // Cap multiplier loss to capital stake
      if (posPnl < -pos.stake) posPnl = -pos.stake;
    } else {
      // Options binary settlement: evaluated continuously
      const isUp = pos.contractType === "RISE";
      const winning = isUp ? (currentPrice > pos.entryPrice) : (currentPrice < pos.entryPrice);
      posPnl = winning ? (pos.stake * 0.85) : -pos.stake;
    }

    pos.pnl = parseFloat(posPnl.toFixed(2));
    // Track Maximum Adverse Excursion (worst unrealised loss this position has seen)
    if (posPnl < 0) {
      if (pos.maxAdverseExcursion === undefined || posPnl < pos.maxAdverseExcursion) {
        pos.maxAdverseExcursion = parseFloat(posPnl.toFixed(2));
      }
    }
    
    const subAlg = subAlgorithms[pos.symbol];

    // Initialize or update highest/lowest since entry
    if (pos.highestPriceSinceEntry === undefined || currentPrice > pos.highestPriceSinceEntry) {
      pos.highestPriceSinceEntry = currentPrice;
    }
    if (pos.lowestPriceSinceEntry === undefined || currentPrice < pos.lowestPriceSinceEntry) {
      pos.lowestPriceSinceEntry = currentPrice;
    }

    let exitTriggered = false;
    let reason: "stop_loss" | "take_profit" | "time_exit" | "manual" | "early_cutoff" = "time_exit";

    // Trailing Stop & Break Even Logic
    if (pos.isHybridLinear) {
      const isUp = pos.contractType === "HYBRID_LINEAR_UP";
      const stopLossDistance = Math.abs(pos.entryPrice - pos.stopLoss);
      
      // 1. Adverse Excursion Limit (Early Cutoff / Partial Loss limit of 15%)
      if (hybridEarlyCutoffEnabled && posPnl <= -hybridEarlyCutoffPct * pos.targetRiskAmount!) {
        exitTriggered = true;
        reason = "early_cutoff";
        posPnl = -hybridEarlyCutoffPct * pos.targetRiskAmount!;
        pos.pnl = parseFloat(posPnl.toFixed(2));
      }

      // 2. Greening Dynamic Trailing Stop
      if (!exitTriggered) {
        const currentR = posPnl / pos.targetRiskAmount!;
        if (currentR >= hybridGreeningTriggerPct) {
          if (!pos.breakEvenActive) {
            pos.stopLoss = pos.entryPrice;
            pos.breakEvenActive = true;
            logs.push(`[GREENING_SHIELD] Position #${pos.id} reached +${(currentR * 100).toFixed(0)}% of R profit. Stop Loss moved to Break-Even (entry: $${pos.entryPrice.toFixed(2)}). Risk is 100% eliminated.`);
          } else {
            // Trail stop loss
            const trailDistance = stopLossDistance * 1.0; // Trail by 1R
            if (pos.direction === "LONG" && pos.highestPriceSinceEntry) {
              const newSL = pos.highestPriceSinceEntry - trailDistance;
              if (newSL > pos.stopLoss) {
                pos.stopLoss = parseFloat(newSL.toFixed(5));
                const lockedInR = (pos.stopLoss - pos.entryPrice) / stopLossDistance;
                logs.push(`[GREENING_TRAIL] Long Position #${pos.id} trailed higher. New Stop: $${pos.stopLoss.toFixed(2)} (Locked in +${(lockedInR * 100).toFixed(0)}% of R)`);
              }
            } else if (pos.direction === "SHORT" && pos.lowestPriceSinceEntry) {
              const newSL = pos.lowestPriceSinceEntry + trailDistance;
              if (newSL < pos.stopLoss) {
                pos.stopLoss = parseFloat(newSL.toFixed(5));
                const lockedInR = (pos.entryPrice - pos.stopLoss) / stopLossDistance;
                logs.push(`[GREENING_TRAIL] Short Position #${pos.id} trailed lower. New Stop: $${pos.stopLoss.toFixed(2)} (Locked in +${(lockedInR * 100).toFixed(0)}% of R)`);
              }
            }
          }
        }
      }
    } else if (subAlg && (pos.contractType === "MULTUP" || pos.contractType === "MULTDOWN")) {
      const prices = tickBuffers[pos.symbol] || [];
      if (pos.isFractalTrend && prices.length >= 50) {
        // Section 6.1 Volatility-Adaptive Trailing Stop
        const valRegime = detectRegime(pos.symbol);
        let kAtr = 2.0;
        let atrPeriod = 14;

        if (valRegime === MarketRegime.LOW_VOL) {
          kAtr = 3.0;
          atrPeriod = 14;
        } else if (valRegime === MarketRegime.HIGH_VOL) {
          kAtr = 1.5;
          atrPeriod = 7;
        } else {
          kAtr = 2.0;
          atrPeriod = 14;
        }

        // Section 6.1.1 Accelerator Adjustment
        if (subAlg.hurstVal !== undefined && subAlg.hurstVal > 0.75) {
          kAtr = 2.5;
          atrPeriod = 14;
        }

        // Section 6.2 Parabolic Spike Detection
        let isParabolicSpike = false;
        const currentRoC = Math.abs((prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6]);
        let rocSum = 0;
        let rocCount = 0;
        for (let i = prices.length - 1; i >= Math.max(5, prices.length - 50); i--) {
          const oldP = prices[i - 5];
          if (oldP > 0) {
            rocSum += Math.abs((prices[i] - oldP) / oldP);
            rocCount++;
          }
        }
        const avgRoC = rocCount > 0 ? (rocSum / rocCount) : 0.001;
        const isRoCSpike = currentRoC > 2.5 * avgRoC;

        const h64Res = computeDFA1(prices, 64);
        const h64 = h64Res.H;
        const h256 = subAlg.hurstVal || 0.5;
        const isHurstDeclining = (h256 - h64) > 0.05;

        if (isRoCSpike && isHurstDeclining) {
          isParabolicSpike = true;
          kAtr = 1.5;
          atrPeriod = 7;
          if (Math.random() < 0.04) {
            logs.push(`[SFT_V2_CONVEXITY] ⚠️ Parabolic Spike detected on ${pos.symbol}! RoC: ${(currentRoC * 100).toFixed(2)}% (vs Avg: ${(avgRoC * 100).toFixed(2)}%), H_64: ${h64.toFixed(2)} (declined from H_256: ${h256.toFixed(2)}). Tightening Stop to 1.5x ATR(7).`);
          }
        }

        const activeAtrObj = computeATRAndADX(candleBuffers[pos.symbol] || [], atrPeriod);
        const activeAtr = activeAtrObj ? activeAtrObj.atr : 1.0;
        const trailBufferValue = activeAtr * kAtr;

        if (pos.direction === "LONG" && pos.highestPriceSinceEntry !== undefined) {
          const newSL = pos.highestPriceSinceEntry - trailBufferValue;
          if (newSL > pos.stopLoss) {
            pos.stopLoss = parseFloat(newSL.toFixed(5));
          }
        } else if (pos.direction === "SHORT" && pos.lowestPriceSinceEntry !== undefined) {
          const newSL = pos.lowestPriceSinceEntry + trailBufferValue;
          if (newSL < pos.stopLoss) {
            pos.stopLoss = parseFloat(newSL.toFixed(5));
          }
        }
      } else {
        // Standard non-fractal Trailing and BE management
        // 1. Break Even
        if (subAlg.breakEvenEnabled && !pos.breakEvenActive) {
          // Trigger BE early if price has covered 20% of the distance to TP
          if (pos.direction === "LONG") {
            const tpDistance = pos.takeProfit - pos.entryPrice;
            if (currentPrice >= pos.entryPrice + tpDistance * 0.2) {
              pos.stopLoss = pos.entryPrice + tpDistance * 0.05; // lock in a small 5% profit offset
              pos.breakEvenActive = true;
            }
          } else if (pos.direction === "SHORT") {
            const tpDistance = pos.entryPrice - pos.takeProfit;
            if (currentPrice <= pos.entryPrice - tpDistance * 0.2) {
              pos.stopLoss = pos.entryPrice - tpDistance * 0.05; // lock in a small 5% profit offset
              pos.breakEvenActive = true;
            }
          }
        }

        // 2. Trailing Stop
        if (subAlg.trailingStopEnabled && pos.breakEvenActive) {
          // Only start trailing after BE is hit, to lock in profits
          const trailDistance = Math.abs(pos.takeProfit - pos.entryPrice) * 0.25; // tighter trail distance
          
          if (pos.direction === "LONG") {
            const newSL = pos.highestPriceSinceEntry - trailDistance;
            if (newSL > pos.stopLoss) {
              pos.stopLoss = newSL;
            }
          } else if (pos.direction === "SHORT") {
            const newSL = pos.lowestPriceSinceEntry + trailDistance;
            if (newSL < pos.stopLoss) {
              pos.stopLoss = newSL;
            }
          }
        }
      }
    }

    // CHECK EXITS
    if (!exitTriggered) {
      // Stop Loss Hit
      if (pos.direction === "LONG" && currentPrice <= pos.stopLoss) {
        exitTriggered = true;
        reason = "stop_loss";
      } else if (pos.direction === "SHORT" && currentPrice >= pos.stopLoss) {
        exitTriggered = true;
        reason = "stop_loss";
      }
    }

    // Take Profit Hit (Bypassed entirely in persistent fractal trend regimes to allow capturing fat tails)
    if (!exitTriggered && !pos.isFractalTrend) {
      if (pos.direction === "LONG" && currentPrice >= pos.takeProfit) {
        exitTriggered = true;
        reason = "take_profit";
      } else if (pos.direction === "SHORT" && currentPrice <= pos.takeProfit) {
        exitTriggered = true;
        reason = "take_profit";
      }
    }

    // Maximum ticks limit reached based on sub-algorithm customizable safety guidelines
    const isTimeExitEnabled = subAlg ? subAlg.timeExitEnabled : true;
    const limitTicks = subAlg ? subAlg.maxTicksInTrade : currentParams.maxTicksInTrade;

    if (!exitTriggered && isTimeExitEnabled && pos.ticksElapsed >= limitTicks) {
      exitTriggered = true;
      reason = "time_exit";
    }

    if (exitTriggered) {
      settledTrades.push({ idx, pos, price: currentPrice, reason, epoch });
    }
  });

  // Re-build active list minus settled trades
  activePositions = activePositions.filter((_, idx) => !settledTrades.some(s => s.idx === idx));

  // Settle contracts and persist to disk clean
  settledTrades.forEach(s => {
    settleContract(s.pos, s.price, s.reason, s.epoch);
  });
}

function settleContract(pos: ActivePosition, exitPrice: number, reason: "stop_loss" | "take_profit" | "time_exit" | "manual" | "early_cutoff", epoch: number) {
  // Recalculate definitive exit P&L
  let finalPnl = pos.pnl;
  if (pos.isHybridLinear) {
    if (reason === "stop_loss") {
      finalPnl = -pos.targetRiskAmount!;
    } else if (reason === "take_profit") {
      finalPnl = pos.targetRiskAmount! * hybridRewardRatio;
    } else if (reason === "early_cutoff") {
      finalPnl = -hybridEarlyCutoffPct * pos.targetRiskAmount!;
    } else {
      const isUp = pos.contractType === "HYBRID_LINEAR_UP";
      finalPnl = (isUp ? 1 : -1) * pos.hybridPositionSize! * (exitPrice - pos.entryPrice);
    }
  } else if (pos.contractType === "RISE" || pos.contractType === "FALL") {
    // Binary Option resolves strictly based on end price vs start price upon settlement step
    const isRise = pos.contractType === "RISE";
    const won = isRise ? (exitPrice > pos.entryPrice) : (exitPrice < pos.entryPrice);
    finalPnl = won ? (pos.stake * 0.85) : -pos.stake;
  } else if (pos.contractType === "OVER" || pos.contractType === "UNDER") {
    // Digits options resolve based on the last decimal digit of the exit price
    const exitPriceStr = exitPrice.toFixed(3);
    const lastDigit = parseInt(exitPriceStr.slice(-1) || "0", 10);
    // Baseline barrier is 4 for OVER/UNDER (Over 4 means 5,6,7,8,9)
    const won = pos.contractType === "OVER" ? (lastDigit > 4) : (lastDigit < 4);
    finalPnl = won ? (pos.stake * 0.90) : -pos.stake;
  } else if (pos.contractType === "DIFFERS") {
    const exitPriceStr = exitPrice.toFixed(3);
    const lastDigit = parseInt(exitPriceStr.slice(-1) || "0", 10);
    // Differs wins if last digit is NOT the target (assumed 0)
    const won = lastDigit !== 0; 
    finalPnl = won ? (pos.stake * 0.09) : -pos.stake; // Differs payout is approx 9% for 90% WR
  }

  finalPnl = parseFloat(finalPnl.toFixed(2));
  
  // Balance is sourced from Deriv's live balance stream only.

  if (balance > peakBalance) {
    peakBalance = balance;
  }

  // Update Streak states
  if (finalPnl > 0) {
    consecutiveWins++;
    consecutiveLosses = 0;
  } else {
    consecutiveLosses++;
    consecutiveWins = 0;
  }

  // Update local stats of sub-algorithm
  const subAlg = subAlgorithms[pos.symbol];
  if (subAlg) {
    subAlg.totalTrades++;
    if (finalPnl > 0) {
      subAlg.winningTrades++;
      subAlg.consecutiveWins++;
      subAlg.consecutiveLosses = 0;
    } else {
      subAlg.consecutiveLosses++;
      subAlg.consecutiveWins = 0;
    }
    subAlg.totalPnl = parseFloat((subAlg.totalPnl + finalPnl).toFixed(2));
    subAlg.recentWinRate = subAlg.totalTrades > 0 ? (subAlg.winningTrades / subAlg.totalTrades) : 0.5;
  }

  // Create record
  const record: TradeRecord = {
    id: pos.id,
    symbol: pos.symbol,
    contractType: pos.contractType,
    direction: pos.direction,
    stake: pos.stake,
    entryPrice: pos.entryPrice,
    exitPrice,
    pnl: finalPnl,
    exitReason: reason,
    regimeAtEntry: detectRegime(pos.symbol),
    entryEpoch: pos.entryEpoch,
    exitEpoch: epoch,
    rsiAtEntry: computeRSI(tickBuffers[pos.symbol] || [], 14),
    bbPctAtEntry: computeBollinger(tickBuffers[pos.symbol] || [], currentParams.bbPeriod).percentB,
    adxAtEntry: computeATRAndADX(candleBuffers[pos.symbol] || [], 14).adx,
    atrAtEntry: computeATRAndADX(candleBuffers[pos.symbol] || [], 14).atr,
    tickStreamSnapshot: (tickBuffers[pos.symbol] || []).slice(-150),
    conditionsMet: pos.direction === "LONG" ? ["OVER_OVERSOLD"] : ["OVER_OVERBOUGHT"],
    maxAdverseExcursion: pos.maxAdverseExcursion ?? 0,
  };

  completedTrades.push(record);
  // Balance is authoritative from Deriv WS stream — do not write locally here.
  // peakBalance tracking is maintained from the stream handler.
  logs.push(`[CONTRACT_SETTLED] ${new Date().toLocaleTimeString()} Settled ${pos.direction} Position #${pos.id} on ${reason.toUpperCase()}. ExitPrice: ${exitPrice.toFixed(2)}, P&L: ${finalPnl >= 0 ? "+" : ""}$${finalPnl} | Closed PnL: ${finalPnl >= 0 ? "+" : ""}$${finalPnl} | Awaiting Deriv balance stream confirmation`);

  // Check trade limit to pause for manual review
  if (completedTrades.length >= 100 && tradingEnabled) {
    tradingEnabled = false;
    logs.push(`[SYSTEM] 🛑 Trading paused automatically after 100 live trades. Review live telemetry before resuming.`);
  }

  // Evaluate Circuit Breakers
  evaluateCircuitBreakers();

  // Trigger Adaptive parameter optimization incrementally
  if (completedTrades.length % 50 === 0) {
    runMachineLearningAdaptation();
  }
}

// ==========================================
// CIRCUIT BREAKER SYSTEM
// ==========================================
function getCircuitBreakerRemainingSeconds() {
  if (circuitBreakerResumeAt <= 0) return 0;
  return Math.max(0, Math.ceil((circuitBreakerResumeAt - Date.now()) / 1000));
}

function startGovernorCooldown(seconds: number, message: string) {
  tradingEnabled = false;
  circuitBreakerResumeAt = Date.now() + seconds * 1000;
  circuitBreakerCooldown = seconds;
  tradingAutoResumePending = true;
  cooldownMessage = message;
}

function updateCircuitBreakerCooldown() {
  circuitBreakerCooldown = getCircuitBreakerRemainingSeconds();
  if (circuitBreakerCooldown > 0 || !tradingAutoResumePending) return;
  circuitBreakerResumeAt = 0;
  tradingAutoResumePending = false;
  cooldownMessage = "";
  if (!sessionBlocked && liveBridgeInstance.getIsAuthorized()) {
    tradingEnabled = true;
    logs.push(`[RISK_CONTROL] ${new Date().toLocaleTimeString()} Governor cooldown cleared. Auto-trading resumed.`);
  } else {
    logs.push(`[RISK_CONTROL] ${new Date().toLocaleTimeString()} Governor cooldown cleared. Trading remains paused until live authorization is available.`);
  }
}

function evaluateCircuitBreakers() {
  updateCircuitBreakerCooldown();
  // Daily & Session limits monitoring
  const initialCap = peakBalance || balance;
  if (initialCap <= 0) return;
  const lossFromBaseline = initialCap - balance;
  const drawdownPct = lossFromBaseline / initialCap;
  
  // Section 8: Terminal Session Block & Strict Safeguards
  if (drawdownPct >= 0.03 && !sessionBlocked) {
    tradingEnabled = false;
    sessionBlocked = true;
    tradingAutoResumePending = false;
    circuitBreakerResumeAt = 0;
    circuitBreakerCooldown = 0;
    cooldownMessage = "MANUAL INTERVENTION REQUIRED: 3% live equity loss limit reached.";
    logs.push(`[BREAKER_ACT] 🛑 3% LIVE EQUITY LIMIT BREACHED. Current loss: $${lossFromBaseline.toFixed(2)} from session equity baseline $${initialCap.toFixed(2)}. Manual intervention required.`);
    return;
  }

  if (sessionBlocked) return; // Prevent temporal breakers overriding terminal state

  if (consecutiveLosses >= 5 && circuitBreakerCooldown === 0 && !tradingAutoResumePending) {
    startGovernorCooldown(600, "GOVERNOR LOCKOUT: 5 consecutive losses. Auto-resume in 10 minutes.");
    logs.push(`[BREAKER_ACT] 🛑 5 Consecutive losses met. Governor locked trading for 10 minutes with automatic resume.`);
    return;
  }

  // Temporal Mitigation limits
  if (consecutiveLosses >= 3 && circuitBreakerCooldown === 0 && !tradingAutoResumePending) {
    startGovernorCooldown(600, "GOVERNOR LOCKOUT: 3 consecutive losses. Auto-resume in 10 minutes.");
    logs.push(`[BREAKER_ACT] ⚠️ 3 Consecutive losses met. Governor locked trading for 10 minutes with automatic resume.`);
  }
}

// ==========================================
// PROGRESSIVE LEARNING ENGINE (ML ADJUSTMENT ROUTINES)
// ==========================================
function runMachineLearningAdaptation() {
  logs.push(`[GOVERNOR_POLICE] 🤖 Active global machine learning loops and walk-forward evaluations triggered.`);

  // 1. Walk-Forward Calibration for each Sub-Algorithm
  Object.values(subAlgorithms).forEach((sub) => {
    // If the sub-algorithm has minimal trade history, keep it on standard stable pilot
    if (sub.totalTrades < 3) {
      sub.directiveMessage = "STABLE PILOT: Monitoring price levels and accumulating warmup logs";
      sub.targetRiskStakeMultiplier = 1.0;
      logs.push(`[GOVERNOR_POLICE] 🧠 Sub-algorithm ${sub.name} is in warmup phase (${sub.totalTrades}/3 trades). Maintaining stable pilot parameters.`);
      return;
    }

    // Historical Trade Data — filter by sub.symbol (the key e.g. "R_100"), NOT sub.name ("Volatility 100 Index")
    const trades = completedTrades.filter(t => t.symbol === sub.symbol);
    const winRate = sub.recentWinRate;
    const grossWins = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLosses = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    
    // Profit Factor Calculation ($)
    const profitFactor = grossLosses === 0 ? (grossWins > 0 ? 3.0 : 1.0) : grossWins / grossLosses;
    const cappedPF = Math.min(profitFactor, 3.0); // normalize between 0 and 3
    
    // Composite Objective Score (0.0 to 1.0)
    // 40% weight on Win Rate, 60% weight on Profit Factor (returns relative to risk)
    const objectiveScore = (winRate * 0.40) + ((cappedPF / 3.0) * 0.60);

    // Adaptive Volatility Context integration
    const tailAdverse = sub.tailExponent !== undefined && sub.tailExponent <= 2.8;

    if (objectiveScore < 0.38) {
      // DEFENSIVE DIRECTIVE: Underperforming sub-algorithm! Trigger defensive guidelines
      // Tighten filters to target absolute premium entries
      if (sub.rsiOversoldThreshold > 26) sub.rsiOversoldThreshold -= 1;
      if (sub.rsiOverboughtThreshold < 74) sub.rsiOverboughtThreshold += 1;
      
      // Enforce high overlays configuration
      sub.minConfluenceScore = 4;
      
      // Increase trailing stop buffer natively in high-variance regimes
      if (tailAdverse) {
        sub.bbStd = parseFloat(Math.max(1.8, Math.min(3.5, sub.bbStd * 1.1)).toFixed(2));
      }
      
      // Limit capital downside (cutting half Kelly sizing)
      sub.targetRiskStakeMultiplier = 0.5;
      sub.directiveMessage = `DEFENSIVE: Underperformance detected (ObjScore ${(objectiveScore * 100).toFixed(1)}%, PF: ${profitFactor.toFixed(2)}). Capping risk allocations to 0.5x, narrowing RSI channels & forcing Max Confluence overlays.`;
      
      logs.push(`[GOVERNOR_POLICE] ⚠️ Sub-algorithm ${sub.name} matches defensive guidelines. Score: ${(objectiveScore * 100).toFixed(1)}%. PF: ${profitFactor.toFixed(2)}. Risk exposure reduced.`);
    } 
    else if (objectiveScore > 0.62 && profitFactor >= 1.25) {
      // AGGRESSIVE EXPANSION DIRECTIVE: Outstanding performance! Scale-up exposures to capture more trades
      // Gradually expand filters to capture more volume safely
      if (sub.rsiOversoldThreshold < 35 && !tailAdverse) sub.rsiOversoldThreshold += 1;
      if (sub.rsiOverboughtThreshold > 65 && !tailAdverse) sub.rsiOverboughtThreshold -= 1;
      
      // Allow standard confluences
      sub.minConfluenceScore = 2;

      // Tighten standard deviations slightly to take earlier entries
      if (sub.bbStd > 1.8) {
        sub.bbStd = parseFloat(Math.max(1.8, Math.min(3.5, sub.bbStd * 0.95)).toFixed(2));
      }

      // Elevate stake sizes to compound positive expectancy (boost Kelly size)
      // Only augment risk if we aren't highly leptokurtic
      sub.targetRiskStakeMultiplier = tailAdverse ? 1.0 : 1.3;
      sub.directiveMessage = `COMPOUNDING: Robust returns detected (PF: ${profitFactor.toFixed(2)}). Boosting risk targets to ${sub.targetRiskStakeMultiplier}x, optimizing price channels to map high frequency trends.`;
      
      logs.push(`[GOVERNOR_POLICE] 🚀 Sub-algorithm ${sub.name} is yielding high returns (PF: ${profitFactor.toFixed(2)}). Upgrading directive to compounding expansion.`);
    } 
    else {
      // BALANCED PILOTING: Normal equilibrium performance
      sub.targetRiskStakeMultiplier = 1.0;
      // Allow incremental relaxation of extreme strict overlays if we're stagnant
      if (sub.minConfluenceScore > 3) sub.minConfluenceScore = 3;
      
      sub.directiveMessage = `STABLE PILOTING: Performance tracking equilibrium (Score ${(objectiveScore * 100).toFixed(1)}%, PF: ${profitFactor.toFixed(2)}). Adjusting to baseline filters.`;
      logs.push(`[GOVERNOR_POLICE] ⚖️ Sub-algorithm ${sub.name} running at standard equilibrium (Score ${(objectiveScore * 100).toFixed(1)}%). Standard limit overlays applied.`);
    }
  });

  // 2. Original global parameters fallback - Expanded to 100 trades to prevent noise overfitting (Audit Rec #2)
  const recentTrades = completedTrades.slice(-100);
  if (recentTrades.length >= 20) {
    const wins = recentTrades.filter(t => t.pnl > 0);
    const globalWinRate = wins.length / recentTrades.length;
    
    // Global Profit Factor Check
    const grossWins = recentTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLosses = Math.abs(recentTrades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const globalPF = grossLosses === 0 ? (grossWins > 0 ? 2.0 : 1.0) : grossWins / grossLosses;

    if (globalWinRate < 0.45 && globalPF < 1.0) {
      if (currentParams.rsiOversoldThreshold > 25) currentParams.rsiOversoldThreshold -= 1;
      if (currentParams.rsiOverboughtThreshold < 75) currentParams.rsiOverboughtThreshold += 1;
      currentParams.atrStopMultiplier = parseFloat(Math.min(currentParams.atrStopMultiplier * 1.1, 5.0).toFixed(2));
      logs.push(`[GOVERNOR_POLICE] 🌐 Global portfolio WR ${(globalWinRate * 100).toFixed(1)}% & PF < 1. Tightening global parameters universally.`);
    } else {
      logs.push(`[GOVERNOR_POLICE] 🌐 Global portfolio metric is healthy (WR ${(globalWinRate * 100).toFixed(1)}%, PF ${globalPF.toFixed(2)}). Global macro parameters active.`);
    }
  }
}

// ==========================================
// GEMINI AI ADVISER / ASSISTANT API
// ==========================================

// Initialize GoogleGenAI Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      logs.push(`[SYSTEM] 🟢 Gemini AI Assistant Core provisioned successfully.`);
    } else {
      logs.push(`[SYSTEM] ⚠️ Gemini API key not found in environment variables. Assistant run offline.`);
    }
  }
  return aiClient;
}

// Generate narrative trading reports via AI
async function generateAiReport(userPrompt?: string): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    // Elegant fallback guidance if key is absent
    return `### **IML System Analyzer (Offline Mode)**
    
*The Gemini AI API Key was not yet configured in the Secrets panel on AI Studio.*
Here is an automated system validation report based on direct mathematical tracking:

- **Instrument profile:** ${INSTRUMENTS[selectedSymbol as keyof typeof INSTRUMENTS]?.name || "None"}
- **Equity Peak:** $${peakBalance.toFixed(2)}
- **Win Rate:** ${completedTrades.length > 0 ? ((completedTrades.filter(t => t.pnl > 0).length / completedTrades.length) * 100).toFixed(1) : "N/A"}%
- **Current Optimized parameters:** 
  - RSI Lower: ${currentParams.rsiOversoldThreshold} (Safety Gated) 
  - RSI Upper: ${currentParams.rsiOverboughtThreshold}
  - ATR Stop Multiplier: ${currentParams.atrStopMultiplier}

*Configure your API Key under **Settings > Secrets** to enable full narrative pattern reasoning, multi-instrument comparison, and behavioral diagnostic tips with Gemini 3.5.*`;
  }

  // Prep narrative payload data for LLM
  const analyticsData = {
    activeSessionId: botSessionId,
    selectedSymbol,
    symbolName: INSTRUMENTS[selectedSymbol as keyof typeof INSTRUMENTS]?.name,
    strategy: INSTRUMENTS[selectedSymbol as keyof typeof INSTRUMENTS]?.idealStrategy,
    balance,
    peakBalance,
    riskPreset,
    tradingMode,
    totalTrades: completedTrades.length,
    winRate: completedTrades.length > 0 ? (completedTrades.filter(t => t.pnl > 0).length / completedTrades.length) * 100 : 0,
    parameters: currentParams,
    circuitBreaker: {
      consecutiveLosses,
      cooldownRemaining: circuitBreakerCooldown,
      sessionBlocked,
    },
    recentTrades: completedTrades.slice(-8).map(t => ({
      direction: t.direction,
      stake: t.stake,
      pnl: t.pnl,
      reason: t.exitReason,
      regime: t.regimeAtEntry,
    })),
  };

  const contextPrompt = `You are Infinity Markets Lab AI, an elite institutional risk engineer and trading system advisor specializing in synthetic indices stochastic models.
Review this current automated bot's session data:
${JSON.stringify(analyticsData, null, 2)}

User asks: "${userPrompt || "Analyze my current trading metrics, explain performance across regimes, and provide safety tips."}"

Please provide an extremely insightful, professional, and clear response highlighting:
1. Behavioral Diagnostic of recent trades.
2. Market Regime match assessment (Is our strategy suited to the active regime?).
3. Technical Adjustment Proposal: Suggest specific updates to current risk rules or indicator boundaries.
Format output beautifully with clean markdown headers and lists. Follow research-informed principles (No Martingale, capital preservation is primary, Kelly limits, volume adjustments). Use friendly, professional composure tone. Avoid self-praising or dry corporate filler text.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-1.5-flash",
      contents: contextPrompt,
    });
    return response.text || "No response received from model.";
  } catch (err: any) {
    return `### **IML System Analyzer (Error)**
    
Failed to contact Gemini servers: ${err.message || err}. Reverting to local diagnostics. Check your API key.`;
  }
}

// ==========================================
// REST API ROUTING
// ==========================================

// Server State Endpoint
app.get("/api/state", (req, res) => { res.setHeader("X-Cooldowns", JSON.stringify({ R_25: subAlgorithms.R_25.cooldownUntil, epoch: Math.floor(Date.now()/1000) }));
  updateCircuitBreakerCooldown();
  const currentRegime = detectRegime(selectedSymbol);
  const symbolPrices = tickBuffers[selectedSymbol] || [];
  const currentPrice = symbolPrices[symbolPrices.length - 1] ?? null;

  // Compile active statistical averages
  const total = completedTrades.length;
  const wins = completedTrades.filter(t => t.pnl > 0).length;
  const winRate = total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0;
  
  const totalPnl = parseFloat(completedTrades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2));
  const recentTradeWindow = completedTrades.slice(-300);
  const recentWindowPnl = parseFloat(recentTradeWindow.reduce((sum, t) => sum + t.pnl, 0).toFixed(2));
  const completedTradesCumulativeOffset = parseFloat((totalPnl - recentWindowPnl).toFixed(2));
  const openPnl = parseFloat(activePositions.reduce((sum, p) => sum + p.pnl, 0).toFixed(2));
  const sessionBaseline = sessionStartBalance || balance;
  const estimatedSessionEquity = parseFloat((sessionBaseline + totalPnl + openPnl).toFixed(2));
  const maxDrawdown = peakBalance === 0 ? 0 : parseFloat((((peakBalance - balance) / peakBalance) * 100).toFixed(2));

  res.json({
    symbol: selectedSymbol,
    symbolName: INSTRUMENTS[selectedSymbol as keyof typeof INSTRUMENTS]?.name,
    idealStrategy: INSTRUMENTS[selectedSymbol as keyof typeof INSTRUMENTS]?.idealStrategy,
    baseVol: INSTRUMENTS[selectedSymbol as keyof typeof INSTRUMENTS]?.volatility,
    currentPrice,
    liveDataReady: currentPrice !== null,
    balance: parseFloat(balance.toFixed(2)),
    peakBalance: parseFloat(peakBalance.toFixed(2)),
    sessionStartBalance: parseFloat(sessionBaseline.toFixed(2)),
    sessionClosedPnl: totalPnl,
    sessionOpenPnl: openPnl,
    estimatedSessionEquity,
    isAuthorized: liveBridgeInstance.getIsAuthorized(),
    tradingEnabled,
    tradingMode,
    riskPreset,
    hybridRiskType,
    hybridRiskFixedAmount,
    hybridRiskPercent,
    hybridRewardRatio,
    hybridEarlyCutoffEnabled,
    hybridEarlyCutoffPct,
    hybridGreeningTriggerPct,
    governorFocusSymbol,
    governorStatus,
    subAlgorithms,
    stats: {
      totalTrades: total,
      wins,
      winRate,
      totalPnl,
      maxDrawdown,
      streakLoss: consecutiveLosses,
      streakWin: consecutiveWins,
    },
    indicators: getCurrentIndicators(selectedSymbol),
    activePositions,
    completedTrades: completedTrades.slice(-300),
    parameters: currentParams,
    regime: currentRegime,
    circuitBreaker: {
      cooldownRemaining: circuitBreakerCooldown,
      cooldownMessage,
      sessionBlocked,
    },
    logs: logs.slice(-1000),
  });
});

// Manual resume after 3% equity intervention (clears block WITHOUT wiping data)
app.post("/api/resume-session", (req, res) => {
  if (!sessionBlocked) {
    return res.json({ success: true, message: "Session is not currently blocked." });
  }
  sessionBlocked = false;
  tradingEnabled = false; // user must explicitly press START after reviewing
  cooldownMessage = "";
  circuitBreakerCooldown = 0;
  circuitBreakerResumeAt = 0;
  tradingAutoResumePending = false;
  logs.push(`[RISK_CONTROL] ✅ Manual session block cleared by operator after risk review. Trading is PAUSED — press START to resume.`);
  res.json({ success: true, message: "Session block cleared. Trading remains paused until manually started." });
});

// Update Configuration
app.post("/api/config", (req, res) => {
  const { symbol, enabled, mode, risk, params, subAlgConfig, hybridConfig } = req.body;

  if (subAlgConfig !== undefined) {
    const { targetSymbol, enabled: subEnabled, params: subParams } = subAlgConfig;
    if (targetSymbol && subAlgorithms[targetSymbol]) {
      const sub = subAlgorithms[targetSymbol];
      if (subEnabled !== undefined) {
        sub.enabled = subEnabled;
        logs.push(`[GOVERNOR_DECISION] Sub-algorithm ${sub.name} manually ${subEnabled ? "ENABLED 🟢" : "PAUSED 🔴"}.`);
      }
      if (subParams !== undefined) {
        if (subParams.rsiOversoldThreshold !== undefined) sub.rsiOversoldThreshold = Number(subParams.rsiOversoldThreshold);
        if (subParams.rsiOverboughtThreshold !== undefined) sub.rsiOverboughtThreshold = Number(subParams.rsiOverboughtThreshold);
        if (subParams.bbPeriod !== undefined) sub.bbPeriod = Number(subParams.bbPeriod);
        if (subParams.bbStd !== undefined) sub.bbStd = Number(subParams.bbStd);
        if (subParams.minConfluenceScore !== undefined) sub.minConfluenceScore = Number(subParams.minConfluenceScore);
        if (subParams.atrStopMultiplier !== undefined) sub.atrStopMultiplier = Number(subParams.atrStopMultiplier);
        if (subParams.targetLossPct !== undefined) sub.targetLossPct = Number(subParams.targetLossPct);
        if (subParams.timeExitEnabled !== undefined) sub.timeExitEnabled = Boolean(subParams.timeExitEnabled);
        if (subParams.breakEvenEnabled !== undefined) sub.breakEvenEnabled = Boolean(subParams.breakEvenEnabled);
        if (subParams.trailingStopEnabled !== undefined) sub.trailingStopEnabled = Boolean(subParams.trailingStopEnabled);
        if (subParams.maxTicksInTrade !== undefined) sub.maxTicksInTrade = Number(subParams.maxTicksInTrade);
        if (subParams.targetRiskStakeMultiplier !== undefined) sub.targetRiskStakeMultiplier = Number(subParams.targetRiskStakeMultiplier);
        if (subParams.learningAdjustmentFactor !== undefined) sub.learningAdjustmentFactor = Number(subParams.learningAdjustmentFactor);

        logs.push(`[GOVERNOR_DECISION] Real-time parameter fine-tuning registered for ${sub.name}. Tuning parameters deployed active.`);
      }
    }
  }

  if (symbol && INSTRUMENTS[symbol as keyof typeof INSTRUMENTS]) {
    selectedSymbol = symbol;
    logs.push(`[SYSTEM] Adjusted active index focus to ${symbol} (${INSTRUMENTS[symbol as keyof typeof INSTRUMENTS].name})`);
    // Automatically register tick stream on Deriv WS if connected
    liveBridgeInstance.subscribeToTicks(symbol);
  }

  if (enabled !== undefined) {
    if (enabled && sessionBlocked) {
      return res.status(403).json({ error: "Manual intervention required: 3% live equity loss limit reached. Please review risk and reset the session." });
    }
    if (enabled && !liveBridgeInstance.getIsAuthorized()) {
      return res.status(403).json({ error: "Live Deriv authorization required to enable trading. Set DERIV_API_TOKEN." });
    }
    tradingEnabled = enabled;
    if (enabled) {
      if (liveBridgeInstance.getIsAuthorized()) {
        logs.push(`[SYSTEM] Auto-trade ENABLED 🟢 (Active Live Terminal Trading)`);
      } else {
        tradingEnabled = false;
        return res.status(403).json({ error: "Live Deriv authorization is required before enabling automated trading." });
      }
    } else {
      logs.push(`[SYSTEM] Auto-trade DISABLED 🔴 (Engine Paused / Idle)`);
    }
  }

  if (mode !== undefined) {
    tradingMode = mode;
    logs.push(`[SYSTEM] Position contract type adjusted to: ${mode}`);
  }

  if (risk !== undefined) {
    riskPreset = risk;
    logs.push(`[RISK] Position limits loaded: [${risk}] Profile Selected.`);
  }

  if (params !== undefined) {
    currentParams = { ...currentParams, ...params };
    logs.push(`[PARAMS] Manual adjustment applied to operational indicators.`);
  }

  if (hybridConfig !== undefined) {
    if (hybridConfig.hybridRiskType !== undefined) hybridRiskType = hybridConfig.hybridRiskType;
    if (hybridConfig.hybridRiskFixedAmount !== undefined) hybridRiskFixedAmount = Number(hybridConfig.hybridRiskFixedAmount);
    if (hybridConfig.hybridRiskPercent !== undefined) hybridRiskPercent = Number(hybridConfig.hybridRiskPercent);
    if (hybridConfig.hybridRewardRatio !== undefined) hybridRewardRatio = Number(hybridConfig.hybridRewardRatio);
    if (hybridConfig.hybridEarlyCutoffEnabled !== undefined) hybridEarlyCutoffEnabled = Boolean(hybridConfig.hybridEarlyCutoffEnabled);
    if (hybridConfig.hybridEarlyCutoffPct !== undefined) hybridEarlyCutoffPct = Number(hybridConfig.hybridEarlyCutoffPct);
    if (hybridConfig.hybridGreeningTriggerPct !== undefined) hybridGreeningTriggerPct = Number(hybridConfig.hybridGreeningTriggerPct);
    logs.push(`[IML_HYBRID_RISK_ENGINE] Applied updated risk parameters and protection shield metrics (Risk: ${hybridRiskType === "FIXED" ? "$" + hybridRiskFixedAmount : hybridRiskPercent + "%"}, Reward: ${hybridRewardRatio}R).`);
  }

  res.json({ success: true, message: "Configuration updated" });
});

// Get Ticks for active Chart drawing
app.get("/api/ticks", (req, res) => {
  const symbol = (req.query.symbol as string) || selectedSymbol;
  const prices = tickBuffers[symbol] || [];
  
  // Return last 80 tick entries
  res.json({
    symbol,
    ticks: prices.slice(-80),
  });
});

// Manual Force Trade Placement (live authorized mode only)
app.post("/api/trade", (req, res) => {
  if (!liveBridgeInstance.getIsAuthorized()) {
    return res.status(403).json({ error: "Live Deriv authorization required. Set DERIV_API_TOKEN to place trades." });
  }
  const { direction } = req.body;
  if (!direction || (direction !== "LONG" && direction !== "SHORT")) {
    return res.status(400).json({ error: "Invalid direction: LONG or SHORT required" });
  }

  const symbol = selectedSymbol;
  const symbolPrices = tickBuffers[symbol] || [];
  const candles = candleBuffers[symbol] || [];
  const currentPrice = symbolPrices[symbolPrices.length - 1];
  if (currentPrice === undefined) {
    return res.status(503).json({ error: "Live Deriv tick stream is not ready yet. Wait for real tick data before placing trades." });
  }
  const currentRegime = detectRegime(symbol);

  // Derive indicators
  let atr = 1.0;
  if (symbolPrices.length >= 50) {
    const atrEst = computeATRAndADX(candles, 14);
    atr = atrEst.atr;
  }

  // Trigger manual position
  const accepted = executeProposal(
    symbol, 
    direction, 
    currentPrice, 
    atr, 
    currentRegime, 
    50, 
    currentPrice - 2, 
    currentPrice + 2, 
    5, 
    ["MANUAL_EXECUTION"], 
    Math.floor(Date.now() / 1000)
  );

  if (!accepted) {
    return res.status(403).json({ error: "Live Deriv authorization is required before placing real orders." });
  }

  logs.push(`[MANUAL_TRIGGER] ⚡ Manually forced ${direction} contract order placement request on ${symbol}`);
  res.json({ success: true, message: `Forced ${direction} trade placement requested.` });
});

// Manual Contract Spot Settlement
app.post("/api/close-position", (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "No position id provided" });
  }

  const index = activePositions.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Position not found" });
  }

  const pos = activePositions[index];
  const symbolPrices = tickBuffers[pos.symbol] || [];
  const currentPrice = symbolPrices[symbolPrices.length - 1];
  if (currentPrice === undefined) {
    return res.status(503).json({ error: "Live Deriv tick stream is not ready yet. Cannot settle without a real current price." });
  }

  activePositions.splice(index, 1);
  settleContract(pos, currentPrice, "manual", Math.floor(Date.now() / 1000));

  res.json({ success: true, message: "Position settled manually." });
});

// AI analysis session
app.post("/api/analyze", async (req, res) => {
  const { prompt } = req.body;
  const report = await generateAiReport(prompt);
  res.json({ report });
});

// Reset live indicators and stats
app.post("/api/reset", async (req, res) => {
  activePositions = [];
  completedTrades = [];
  consecutiveLosses = 0;
  consecutiveWins = 0;
  circuitBreakerCooldown = 0;
  circuitBreakerResumeAt = 0;
  tradingAutoResumePending = false;
  cooldownMessage = "";
  tradingEnabled = false;
  sessionBlocked = false;
  currentParams = { ...defaultParams };
  
  if (liveBridgeInstance.getIsAuthorized()) {
    try {
      liveBridgeInstance.refreshBalance();
      peakBalance = balance;
    } catch (e) {
      console.error("[RESET] Failed requesting live Deriv balance update:", e);
    }
  }

  // Fully reset all sub-algorithms' trade counters and stats
  Object.keys(subAlgorithms).forEach(key => {
    const sub = subAlgorithms[key];
    sub.totalTrades = 0;
    sub.winningTrades = 0;
    sub.totalPnl = 0;
    sub.consecutiveLosses = 0;
    sub.consecutiveWins = 0;
    sub.recentWinRate = 0.5;
    sub.cooldownUntil = 0;
    sub.directiveMessage = "INITIALIZING STANDBY PILOT";
  });
  
  logs = [`[${new Date().toISOString()}] Infinity Markets Lab Engine active metrics and overrides have been reset safely.`];
  
  liveBridgeInstance.requestHistoryForSymbols();

  res.json({ success: true, message: "Active trading metrics reset successfully." });
});

// ==========================================
// VITE DEV SERVER / PROD ASSET SERVING MIDDLEWARE
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[IML CORE] Full-stack engine listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[FATAL_SERVER_START]", err);
});
