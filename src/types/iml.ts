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
  entryExpectedSharpeImpact?: number;
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

export interface CanonicalExposureModel {
  equity: number;
  stake: number;
  effectiveMultiplier: number;
  stopDistancePct: number;
  expectedLossPct: number;
  expectedRewardPct: number;
  maxLossAmount: number;
  targetRewardAmount: number;
  rewardToRisk: number;
  exposurePct: number;
  portfolioHeatContribution: number;
}

export interface OrderEconomics extends CanonicalExposureModel {
  stakeToReward: number;
  approved: boolean;
  rejectionReasons: string[];
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


// ==========================================
// PHASE 3: ADAPTIVE META-INTELLIGENCE TYPES
// ==========================================

export type AdaptiveIntelligenceMode = "OBSERVE" | "SHADOW" | "LIMITED" | "ACTIVE";

export interface MetaLearningState {
  strategyWeights: Record<string, number>;
  regimePerformance: Record<string, number>;
  executionHealthScore: number;
  uncertaintyScore: number;
  adaptationConfidence: number;
  sampleSize: number;
  lastUpdatedEpoch: number;
  updateReason: string;
}

export interface PolicyAdjustment {
  riskMultiplier: number;
  exitAdjustment: number;
  tradeFrequencyAdjustment: number;
  confidenceAdjustment: number;
  uncertaintyPenalty: number;
  sampleSize: number;
  policyConfidence: number;
  updateReason: string;
}

export interface EnsembleDecision {
  selectedStrategies: string[];
  strategyWeights: Record<string, number>;
  correlationPenalty: number;
  ensembleConfidence: number;
  uncertaintyScore: number;
  expectedPortfolioSharpeImpact: number;
}

export interface RegimeEvolution {
  structuralShiftProbability: number;
  volatilityShiftProbability: number;
  persistenceShiftProbability: number;
  tailShiftProbability: number;
  spikeFrequencyShiftProbability: number;
  confidence: number;
}

export interface AnomalyState {
  anomalyProbability: number;
  severity: number;
  recommendedRiskReduction: number;
  systemConfidence: number;
  reasons: string[];
}

export interface LongHorizonMemoryState {
  tradesObserved: number;
  longTermSharpe: number;
  longTermSortino: number;
  longTermExpectancy: number;
  volatilityMemory: number;
  persistenceMemory: number;
  drawdownMemory: number;
  regimeReliability: Record<string, number>;
  lastUpdatedEpoch: number;
}

export interface ExecutionHealthScore {
  latencyScore: number;
  fillQualityScore: number;
  synchronizationScore: number;
  degradationProbability: number;
}

export interface ExecutionStateModel {
  latencyScore: number;
  slippageScore: number;
  rejectionProbability: number;
  websocketHealth: number;
  quoteFreshness: number;
  synchronizationConfidence: number;
  executionReliability: number;
  degradationProbability: number;
  executionRiskMultiplier: number;
}

export interface RegimeTransitionState {
  transitionProbability: number;
  confidenceDecay: number;
  instabilityScore: number;
  volatilityShockRisk: number;
  edgeReliabilityDecay: number;
  adaptiveRiskMultiplier: number;
}

export interface PathDependentRiskState {
  consecutiveLossPressure: number;
  volatilityClusterRisk: number;
  drawdownAcceleration: number;
  confidenceErosion: number;
  recoveryProbability: number;
  adaptiveDefensiveScale: number;
}

export interface ConfidenceCalibration {
  predictedSharpe: number;
  realizedSharpe: number;
  predictionError: number;
  confidenceBias: number;
  calibrationError: number;
  overconfidenceProbability: number;
}

export interface ProbabilityCalibrationState {
  predictedProbability: number;
  realizedFrequency: number;
  calibrationGap: number;
  brierScore: number;
  reliabilityScore: number;
}

export interface StrategyDecayState {
  longHorizonExpectancy: number;
  expectancyDecayRate: number;
  sharpeDecayRate: number;
  edgePersistenceProbability: number;
  structuralBreakProbability: number;
  decayConfidence: number;
}

export interface DynamicCorrelationModel {
  symbols: string[];
  rollingCorrelationMatrix: number[][];
  stressCorrelationMatrix: number[][];
  correlationInstability: number;
  concentrationRisk: number;
  portfolioFragility: number;
}

export interface EpistemicUncertaintyState {
  dataQuality: number;
  modelAgreement: number;
  signalStability: number;
  informationDensity: number;
  uncertaintyScore: number;
  uncertaintyAdjustedRisk: number;
}

export interface SurvivalEquityCurveState {
  drawdownDepth: number;
  drawdownVelocity: number;
  recoverySlope: number;
  equityStability: number;
  survivalModeProbability: number;
  adaptiveAggressionScale: number;
}

export interface AutonomousPortfolioState {
  portfolioSharpe: number;
  portfolioSortino: number;
  portfolioHeat: number;
  correlationStress: number;
  survivabilityScore: number;
  capitalEfficiency: number;
  opportunityCost: number;
  adaptiveExposureScale: number;
}

export interface EmpiricalCalibrationState {
  predictedWinProbability: number;
  realizedWinRate: number;
  predictedSharpe: number;
  realizedSharpe: number;
  predictedExpectancy: number;
  realizedExpectancy: number;
  calibrationError: number;
  confidenceBias: number;
  predictionReliability: number;
}

export interface SelfHealingRiskState {
  adaptiveRiskScale: number;
  survivabilityPriority: number;
  degradationSeverity: number;
  defensiveModeProbability: number;
  recoveryConfidence: number;
  capitalProtectionBias: number;
}

export enum AutonomousState {
  NORMAL = "NORMAL",
  CAUTIOUS = "CAUTIOUS",
  DEFENSIVE = "DEFENSIVE",
  SURVIVAL = "SURVIVAL",
  SHADOW_ONLY = "SHADOW_ONLY",
  EXECUTION_UNSAFE = "EXECUTION_UNSAFE",
  CALIBRATION_UNSTABLE = "CALIBRATION_UNSTABLE",
}

export interface ExecutionForensics {
  averageProposalLatency: number;
  latencyVariance: number;
  websocketStability: number;
  staleQuoteRate: number;
  executionMismatchRate: number;
  synchronizationConfidence: number;
  executionIntegrityScore: number;
}

export interface ProbabilityCalibration {
  predictedProbability: number;
  realizedFrequency: number;
  brierScore: number;
  reliabilityCurveError: number;
  calibrationConfidence: number;
}

export interface StrategyDriftState {
  longHorizonSharpe: number;
  expectancyDecayRate: number;
  confidenceDecayRate: number;
  structuralBreakProbability: number;
  edgePersistenceProbability: number;
  adaptiveWeightScale: number;
}

export interface LongHorizonPortfolioState {
  portfolioSharpe: number;
  portfolioSortino: number;
  capitalEfficiency: number;
  portfolioHeat: number;
  opportunityDensity: number;
  survivabilityScore: number;
  concentrationRisk: number;
  adaptiveExposureScale: number;
}

export interface CapitalPreservationState {
  drawdownDepth: number;
  drawdownVelocity: number;
  recoverySlope: number;
  survivalProbability: number;
  adaptiveAggressionScale: number;
  capitalProtectionPriority: number;
}

export interface DeploymentReadiness {
  executionReady: boolean;
  calibrationStable: boolean;
  survivabilityAcceptable: boolean;
  portfolioRiskAcceptable: boolean;
  edgePersistenceHealthy: boolean;
  uncertaintyAcceptable: boolean;
  liveDeploymentApproved: boolean;
  readinessScore: number;
}

export interface AdaptiveLayerValidationState {
  predictedVsRealizedError: number;
  riskReductionEffectiveness: number;
  drawdownReductionEffectiveness: number;
  calibrationQuality: number;
  sharpeImprovement: number;
  survivabilityImpact: number;
  falseDefensiveActivationRate: number;
  missedOpportunityCost: number;
  validatedInfluenceScale: number;
  sampleSize: number;
}


export interface AdaptiveUncertaintyState extends UncertaintyState {
  recommendedRiskAdjustment: number;
  distributionConfidence: number;
  modelStability: number;
}

export interface MonteCarloEvolutionState {
  scenarios: number;
  survivabilityProbability: number;
  worstCaseDrawdown: number;
  correlatedLossRisk: number;
  executionDegradationRisk: number;
  expectedTerminalDrawdown: number;
  recoveryDuration: number;
  ruinProbability: number;
  capitalExhaustionProbability: number;
  longHorizonSharpeP05: number;
  longHorizonSharpeP50: number;
  longHorizonSharpeP95: number;
  lastRunEpoch: number;
}

export interface AdaptiveIntelligenceState {
  mode: AdaptiveIntelligenceMode;
  metaLearning: MetaLearningState;
  policy: PolicyAdjustment;
  ensemble: EnsembleDecision;
  regimeEvolution: Record<string, RegimeEvolution>;
  anomaly: Record<string, AnomalyState>;
  longHorizonMemory: Record<string, LongHorizonMemoryState>;
  execution: ExecutionHealthScore;
  executionState: ExecutionStateModel;
  transition: RegimeTransitionState;
  pathRisk: PathDependentRiskState;
  confidenceCalibration: ConfidenceCalibration;
  probabilityCalibration: ProbabilityCalibrationState;
  strategyDecay: Record<string, StrategyDecayState>;
  dynamicCorrelation: DynamicCorrelationModel;
  epistemic: EpistemicUncertaintyState;
  survivalEquity: SurvivalEquityCurveState;
  portfolioBrain: AutonomousPortfolioState;
  empiricalCalibration: EmpiricalCalibrationState;
  selfHealingRisk: SelfHealingRiskState;
  autonomousState: AutonomousState;
  executionForensics: ExecutionForensics;
  probabilityCalibrationV2: ProbabilityCalibration;
  strategyDrift: Record<string, StrategyDriftState>;
  longHorizonPortfolio: LongHorizonPortfolioState;
  capitalPreservation: CapitalPreservationState;
  deploymentReadiness: DeploymentReadiness;
  adaptiveLayerValidation: AdaptiveLayerValidationState;
  uncertainty: AdaptiveUncertaintyState;
  monteCarlo: MonteCarloEvolutionState;
  lastShadowComparison: string;
}

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
