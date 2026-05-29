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
  maxTicksOverride?: number;
  entrySignalProbability?: number;
  entryExpectedEdge?: number;
  entryExpectedSharpeImpact?: number;
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
  derivedSharpeContribution?: number;
  entrySignalProbability?: number;
  entryExpectedEdge?: number;
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

// ==========================================
// PHASE 1: PROBABILISTIC TRADING CORE TYPES
// ==========================================

export interface RegimeDistribution {
  trendProbability: number;
  meanReversionProbability: number;
  transitionProbability: number;
  volatilityExpansionProbability: number;
  entropyScore: number;
}

export interface RegimeState extends RegimeDistribution {
  volatilityCompressionProbability: number;
  confidence: number;
}

export interface SignalProbability {
  expectedEdge: number;
  confidence: number;
  uncertainty: number;
  regimeCompatibility: number;
  volatilityScore: number;
  executionQuality: number;
  tailRisk: number;
}

export interface ExtendedSignalProbability extends SignalProbability {
  expectedHoldingTime: number;
  expectedRR: number;
  executionSensitivity: number;
}

export enum ConfidenceTier {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  REJECT = "REJECT",
}

export interface OpportunityProfile {
  tier: ConfidenceTier;
  expectedEdge: number;
  confidence: number;
  uncertainty: number;
  volatilityScore: number;
  regimeAlignment: number;
}

export interface RejectionAnalysis {
  symbol: string;
  expectedEdge: number;
  confidence: number;
  regimeAlignment: number;
  volatilityScore: number;
  uncertainty: number;
  correlationPenalty: number;
  transitionPenalty: number;
  executionPenalty: number;
  expectedSharpeImpact: number;
  rejectionReasons: string[];
}

export enum EquityCurveState {
  EXPANSION     = "EXPANSION",
  NORMAL        = "NORMAL",
  SOFT_DRAWDOWN = "SOFT_DRAWDOWN",
  HARD_DRAWDOWN = "HARD_DRAWDOWN",
  RECOVERY      = "RECOVERY",
}

export interface UncertaintyState {
  epistemicUncertainty: number;
  marketUncertainty: number;
  modelConfidence: number;
  regimeStability: number;
}

export interface PortfolioHeatState {
  totalHeat: number;
  correlatedClusterHeat: Record<string, number>;
  maxConcentration: number;
  heatCapExceeded: boolean;
  adjustedLeverageScale: number;
  correlationAdjustedHeat?: number;
  marginalCandidateHeat?: number;
  clusterCapExceeded?: Record<string, boolean>;
}

export interface OpportunityDensityMetrics {
  totalHighQualityOpportunities: number;
  capturedHighQualityTrades: number;
  opportunityDensity: number;
  falsePositiveApprovals: number;
  falseNegativeRejections: number;
  avgExpectedSharpeContribution: number;
  varianceAdjustedExpectancy: number;
}

export interface SpikeHarvestState {
  spikeDetected: boolean;
  spikeEpoch: number;
  spikeDirection?: "UP" | "DOWN";
  spikeMagnitudeAtr?: number;
  spikeExhaustionProbability: number;
  recoveryProbability: number;
  persistenceDecay: number;
  volatilityCollapseProbability: number;
  postSpikeTicksElapsed: number;
}

export interface EquityCurveThrottleConfig {
  state: EquityCurveState;
  leverageScale: number;
  confidenceThreshold: number;
  portfolioHeatCap: number;
  maxPositionDurationScale: number;
  tradeAggressiveness: number;
}

export interface GovernorDecision {
  approved: boolean;
  confidenceTier: ConfidenceTier;
  finalConfidence: number;
  allocatedRisk: number;
  adjustedLeverage: number;
  expectedEdge: number;
  uncertaintyAdjustedEdge: number;
  executionAdjustedEdge: number;
  expectedSharpeImpact: number;
  correlationPenalty: number;
  volatilityPenalty: number;
  executionPenalty: number;
  uncertaintyPenalty: number;
  transitionPenalty: number;
  heatPenalty: number;
  equityCurveState: EquityCurveState;
  rejectionReasons?: string[];
}

export interface PortfolioRiskState {
  totalExposure: number;
  directionalBias: number;
  correlationMatrix: Record<string, Record<string, number>>;
  volatilityCluster: number;
  entropyLevel: number;
  drawdownSeverity: number;
  regimeStability: number;
}

export interface ExecutionHealth {
  fillLatency: number;
  slippageEstimate: number;
  rejectionRate: number;
  desyncDetected: boolean;
  degradedSince: number;
}

export interface LiveMetrics {
  expectancy: number;
  realizedSharpe: number;
  sortinoRatio: number;
  maxDrawdown: number;
  consecutiveLosses: number;
  fillDegradation: number;
  regimeAccuracy: number;
  exposureCorrelation: number;
  avgTradeDuration: number;
  volatilityForecastError: number;
  executionLatency: number;
  realizedVsExpectedPnl: number;
  recoveryFactor: number;
}

// ==========================================
// PHASE 2: PROBABILISTIC INTELLIGENCE TYPES
// ==========================================

export interface TradeQuality {
  expectedEdge: number;
  successProbability: number;
  expectedVolatility: number;
  regimeAlignment: number;
  tailRisk: number;
  confidence: number;
  expectedHoldingTime: number;
  expectedRR: number;
}

export interface VolatilityForecast {
  nextPeriodVolatility: number;
  volatilityTrend: number;
  volatilityShockProbability: number;
  confidence: number;
}

export interface DistributionStats {
  skewness: number;
  kurtosis: number;
  varianceClustering: number;
  avgConsecutiveLosses: number;
  avgDrawdownDuration: number;
  recoveryFactor: number;
  regimeSharpe: Record<string, number>;
  regimeExpectancy: Record<string, number>;
  tailRiskExposure: number;
}

export interface FeatureSnapshot {
  epoch: number;
  symbol: string;
  price: number;
  rsi: number;
  bbPct: number;
  adx: number;
  atr: number;
  hurst: number;
  conviction: number;
  regimeState: RegimeState;
  volatilityForecast: VolatilityForecast;
}

export interface InstrumentStats {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  totalPnl: number;
  expectancy: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  avgHoldingTime: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  recoveryFactor: number;
  regimePerformance: Record<string, { trades: number; wins: number; pnl: number; expectancy: number }>;
  distribution: DistributionStats;
  featureHistory: FeatureSnapshot[];
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
  // Phase 1 probabilistic fields
  regimeState?: RegimeState;
  lastSignalProbability?: ExtendedSignalProbability;
  lastGovernorDecision?: GovernorDecision;
  lastPersistenceProbability?: number;
  specialization?: "V75" | "V50" | "BOOM" | "CRASH";
  // Phase 2 state fields
  spikeHarvestState?: SpikeHarvestState;
  equityCurveState?: EquityCurveState;
  recentPnlWindow?: number[];
  rollingExpectedEdge?: number;
}
