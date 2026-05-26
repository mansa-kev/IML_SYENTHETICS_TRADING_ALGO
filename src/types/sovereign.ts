/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum MarketRegime {
  TRENDING_UP = "trending_up",
  TRENDING_DOWN = "trending_down",
  RANGING = "ranging",
  HIGH_VOL = "high_volatility",
  LOW_VOL = "low_volatility",
  TRANSITION = "transition",
}

export interface Tick {
  symbol: string;
  price: number;
  epoch: number;
  tickIndex: number;
}

export interface Candle {
  symbol: string;
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ActivePosition {
  id: string; // contract_id
  symbol: string;
  contractType: "MULTUP" | "MULTDOWN" | "RISE" | "FALL" | "DIFFERS" | "OVER" | "UNDER" | "HYBRID_LINEAR_UP" | "HYBRID_LINEAR_DOWN"; // Extended contract types
  direction: "LONG" | "SHORT";
  stake: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  ticksElapsed: number;
  entryEpoch: number;
  multiplier?: number;
  highestPriceSinceEntry?: number;
  lowestPriceSinceEntry?: number;
  breakEvenActive?: boolean;
  isHybridLinear?: boolean;
  targetRiskAmount?: number;
  hybridPositionSize?: number;
  isFractalTrend?: boolean;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  contractType: string;
  direction: "LONG" | "SHORT";
  stake: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  exitReason: "stop_loss" | "take_profit" | "time_exit" | "manual" | "circuit_breaker" | "early_cutoff";
  regimeAtEntry: MarketRegime;
  entryEpoch: number;
  exitEpoch: number;
  // Indicators at entry for adaptive adjustments
  rsiAtEntry: number;
  bbPctAtEntry: number;
  adxAtEntry: number;
  atrAtEntry: number;
  conditionsMet: string[]; // JSON representation
  isHybridLinear?: boolean;
  targetRiskAmount?: number;
  hybridPositionSize?: number;
  tickStreamSnapshot?: number[]; // To store raw price data for ML off-platform
}

export interface SessionStats {
  sessionId: string;
  symbol: string;
  startEpoch: number;
  tradingEnabled: boolean;
  totalTrades: number;
  winningTrades: number;
  winningPnl: number;
  losingPnl: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  avgStake: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  regimeStats: Record<string, { trades: number; wins: number; pnl: number }>;
}

export interface LearningParams {
  rsiOversoldThreshold: number;   // default: 33, range: [25, 42]
  rsiOverboughtThreshold: number;  // default: 67, range: [58, 75]
  bbPeriod: number;                // default: 20
  bbStd: number;                   // default: 2.0
  maxTicksInTrade: number;         // default: 200
  minConfluenceScore: number;       // default: 4 (require 4 of 5 signals)
  atrStopMultiplier: number;        // default: 1.5
  regimeAdxThreshold: number;       // default: 20
}

export interface CircuitBreakerStats {
  sessionStartBalance: number;
  sessionLossLimitPct: number;    // default 0.03 (3%)
  dailyLossLimitPct: number;      // default 0.05 (5%)
  maxConsecutiveLosses: number;   // default 5
  cooldownRemaining: number;      // in seconds. 0 if ok
  cooldownMessage: string;
  peakBalance: number;
  sessionBlocked?: boolean;
}

export interface BacktestResult {
  symbol: string;
  tickCount: number;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  trades: TradeRecord[];
}

export interface InstrumentConfig {
  id: string;
  name: string;
  volatility: number; // custom base volatility level
  tickType: "1s" | "std";
  idealStrategy: "mean_reversion" | "breakout" | "trend" | "spike_fade" | "range_fade" | "hybrid";
  multiplierOptions: number[];
  basePrice: number;
}

export interface SubAlgorithm {
  symbol: string;
  name: string;
  personality: string;
  enabled: boolean;
  
  // Specific base indicators setup
  rsiOversoldThreshold: number;
  rsiOverboughtThreshold: number;
  bbPeriod: number;
  bbStd: number;
  minConfluenceScore: number;
  atrStopMultiplier: number;
  
  // Dynamic directives from Governor (ML-adjusted value mapping)
  learningAdjustmentFactor: number; // multiplier on thresholds (e.g. 1.0)
  targetRiskStakeMultiplier: number; // Kelly scaling factor
  cooldownUntil: number; // block trading if epoch < cooldownUntil
  directiveMessage: string; // Dynamic message describing Governor's active posture
  recentWinRate: number;

  // Performance Adjustments (Solves miniaturized wins and large losses)
  targetLossPct: number; // Max percentage of stake to risk at Stop Loss. E.g. 0.25 is 25%.
  timeExitEnabled: boolean; // Toggle timed-out exits
  maxTicksInTrade: number; // Custom tick limit before forced resolution
  breakEvenEnabled?: boolean;
  trailingStopEnabled?: boolean;

  // Stats
  totalTrades: number;
  winningTrades: number;
  totalPnl: number;
  consecutiveLosses: number;
  consecutiveWins: number;

  // Live setups/indicators
  rsiVal: number;
  bbPct: number;
  adxVal: number;
  atrVal: number;
  confluenceScore: number;
  mRegime: MarketRegime;
  hurstVal?: number; // DFA-1 256-tick rolling estimate
  hurstConfirm?: number; // R/S 1024-tick confirmation
  hurstRSquared?: number; // DFA fit quality (R2)
  hurstMacro?: number; // R/S 2000-tick macro structural persistence
  convictionScore?: number; // SFT-V2 Conviction Composite Score (0.00 to 1.00)
  kamaValue?: number; // Kaufman Adaptive Moving Average
  tailExponent?: number; // Hill Estimator tail exponent (alpha hat)
}

