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
  id: string;
  symbol: string;
  contractType: "MULTUP" | "MULTDOWN" | "RISE" | "FALL" | "DIFFERS" | "OVER" | "UNDER" | "HYBRID_LINEAR_UP" | "HYBRID_LINEAR_DOWN";
  direction: "LONG" | "SHORT";
  stake: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  ticksElapsed: number;
  entryEpoch: number;
  entryRegime?: MarketRegime;
  entryRsi?: number;
  entryBbPct?: number;
  entryAdx?: number;
  entryAtr?: number;
  entryConditions?: string[];
  multiplier?: number;
  highestPriceSinceEntry?: number;
  lowestPriceSinceEntry?: number;
  breakEvenActive?: boolean;
  isHybridLinear?: boolean;
  targetRiskAmount?: number;
  hybridPositionSize?: number;
  isFractalTrend?: boolean;
  maxAdverseExcursion?: number;
  closeRequestedAt?: number;
  closeRequestedReason?: "stop_loss" | "take_profit" | "time_exit" | "manual" | "circuit_breaker" | "early_cutoff";
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
  rsiAtEntry: number;
  bbPctAtEntry: number;
  adxAtEntry: number;
  atrAtEntry: number;
  conditionsMet: string[];
  isHybridLinear?: boolean;
  targetRiskAmount?: number;
  hybridPositionSize?: number;
  tickStreamSnapshot?: number[];
  maxAdverseExcursion?: number;
  derivCloseConfirmed?: boolean;
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
  rsiOversoldThreshold: number;
  rsiOverboughtThreshold: number;
  bbPeriod: number;
  bbStd: number;
  maxTicksInTrade: number;
  minConfluenceScore: number;
  atrStopMultiplier: number;
  regimeAdxThreshold: number;
}

export interface CircuitBreakerStats {
  sessionStartBalance: number;
  sessionLossLimitPct: number;
  dailyLossLimitPct: number;
  maxConsecutiveLosses: number;
  cooldownRemaining: number;
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
  volatility: number;
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
  rsiOversoldThreshold: number;
  rsiOverboughtThreshold: number;
  bbPeriod: number;
  bbStd: number;
  minConfluenceScore: number;
  atrStopMultiplier: number;
  learningAdjustmentFactor: number;
  targetRiskStakeMultiplier: number;
  cooldownUntil: number;
  directiveMessage: string;
  recentWinRate: number;
  targetLossPct: number;
  timeExitEnabled: boolean;
  maxTicksInTrade: number;
  breakEvenEnabled?: boolean;
  trailingStopEnabled?: boolean;
  totalTrades: number;
  winningTrades: number;
  totalPnl: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  rsiVal: number;
  bbPct: number;
  adxVal: number;
  atrVal: number;
  confluenceScore: number;
  mRegime: MarketRegime;
  hurstVal?: number;
  hurstConfirm?: number;
  hurstRSquared?: number;
  hurstMacro?: number;
  convictionScore?: number;
  kamaValue?: number;
  tailExponent?: number;
}
