/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Clock,
  Play, 
  Square, 
  RefreshCw, 
  Zap, 
  ShieldAlert, 
  ChevronDown, 
  LineChart as LineChartIcon,
  TrendingUp, 
  Cpu, 
  Sparkles, 
  BookOpen, 
  AlertCircle, 
  HelpCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Settings,
  Activity,
  Award,
  BookMarked,
  Star,
  ShieldCheck,
  Info,
  PieChart
} from "lucide-react";
import { MarketRegime, ActivePosition, TradeRecord, LearningParams } from "./types/sovereign";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  Legend
} from "recharts";

const INSTRUMENTS = {
  R_10: { name: "Volatility 10 (1s)", volatility: 0.12, tickType: "1s", idealStrategy: "mean_reversion", basePrice: 100.0 },
  R_25: { name: "Volatility 25 (1s)", volatility: 0.28, tickType: "1s", idealStrategy: "mean_reversion", basePrice: 250.0 },
  R_75: { name: "Volatility 75 (1s)", volatility: 0.85, tickType: "std", idealStrategy: "breakout", basePrice: 750.0 },
  R_100: { name: "Volatility 100 Index", volatility: 1.05, tickType: "std", idealStrategy: "breakout", basePrice: 1000.0 },
  CRASH500: { name: "Crash 500 Index", volatility: 0.35, tickType: "std", idealStrategy: "spike_fade", basePrice: 500.0 },
  BOOM500: { name: "Boom 500 Index", volatility: 0.35, tickType: "std", idealStrategy: "spike_fade", basePrice: 500.0 },
};

export default function App() {
  // Top level server states
  const [balance, setBalance] = useState<number>(0.00);
  const [peakBalance, setPeakBalance] = useState<number>(0.00);
  const [tradingEnabled, setTradingEnabled] = useState<boolean>(false);
  const [symbol, setSymbol] = useState<string>("R_10");
  const [symbolName, setSymbolName] = useState<string>("Volatility 10 (1s)");
  const [idealStrategy, setIdealStrategy] = useState<string>("mean_reversion");
  const [tradingMode, setTradingMode] = useState<"MULTIPLIER" | "HYBRID_LINEAR" | "AUTO">("AUTO");
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  // Sovereign Hybrid Risk Engine (SHRE) configs:
  const [hybridRiskType, setHybridRiskType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [hybridRiskFixedAmount, setHybridRiskFixedAmount] = useState<number>(25.0);
  const [hybridRiskPercent, setHybridRiskPercent] = useState<number>(1.0);
  const [hybridRewardRatio, setHybridRewardRatio] = useState<number>(3.0);
  const [hybridEarlyCutoffEnabled, setHybridEarlyCutoffEnabled] = useState<boolean>(true);
  const [hybridEarlyCutoffPct, setHybridEarlyCutoffPct] = useState<number>(0.15);
  const [hybridGreeningTriggerPct, setHybridGreeningTriggerPct] = useState<number>(0.50);
  const [indicators, setIndicators] = useState<any>({
    rsiVal: 50,
    upper: 0,
    lower: 0,
    mid: 0,
    vwapVal: 0,
    atr: 0,
    confluence: {
      isOversold: false,
      isRsiOversoldRange: false,
      isBelowVwap: false,
      isBullDivergent: false,
      isBullReversalPattern: false,
      score: 0
    }
  });
  const [riskPreset, setRiskPreset] = useState<"CONSERVATIVE" | "MODERATE" | "AGGRESSIVE">("MODERATE");
  const [currentRegime, setCurrentRegime] = useState<MarketRegime>(MarketRegime.RANGING);
  const [currentPrice, setCurrentPrice] = useState<number>(100.00);
  
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]);
  const [completedTrades, setCompletedTrades] = useState<TradeRecord[]>([]);
  const [stats, setStats] = useState({
    totalTrades: 0,
    wins: 0,
    winRate: 0,
    totalPnl: 0,
    maxDrawdown: 0,
    streakLoss: 0,
    streakWin: 0
  });

  const [currentParams, setCurrentParams] = useState<LearningParams>({
    rsiOversoldThreshold: 33,
    rsiOverboughtThreshold: 67,
    bbPeriod: 20,
    bbStd: 2.0,
    maxTicksInTrade: 200,
    minConfluenceScore: 4,
    atrStopMultiplier: 1.5,
    regimeAdxThreshold: 20
  });

  const [circuitStats, setCircuitStats] = useState({
    cooldownRemaining: 0,
    cooldownMessage: "",
    sessionBlocked: false
  });

  const [governorFocusSymbol, setGovernorFocusSymbol] = useState<string>("R_10");
  const [governorStatus, setGovernorStatus] = useState<string>("");
  const [subAlgorithms, setSubAlgorithms] = useState<Record<string, any>>({});

  const [logs, setLogs] = useState<string[]>([]);

  // Sub-algorithm Config Modal View States
  const [selectedSubSymbol, setSelectedSubSymbol] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [selectedPerfDetail, setSelectedPerfDetail] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"tuner" | "history">("tuner");

  // Tuner form states
  const [editEnabled, setEditEnabled] = useState<boolean>(true);
  const [editOversold, setEditOversold] = useState<number>(30);
  const [editOverbought, setEditOverbought] = useState<number>(70);
  const [editBbPeriod, setEditBbPeriod] = useState<number>(20);
  const [editBbStd, setEditBbStd] = useState<number>(2.0);
  const [editMinConfluence, setEditMinConfluence] = useState<number>(4);
  const [editAtrStop, setEditAtrStop] = useState<number>(1.5);
  const [editTargetLoss, setEditTargetLoss] = useState<number>(0.15);
  const [editTimeExit, setEditTimeExit] = useState<boolean>(false);
  const [editBreakEven, setEditBreakEven] = useState<boolean>(true);
  const [editTrailingStop, setEditTrailingStop] = useState<boolean>(true);
  const [editMaxTicks, setEditMaxTicks] = useState<number>(800);
  const [editRiskMultiplier, setEditRiskMultiplier] = useState<number>(1.0);
  const [editLearningFactor, setEditLearningFactor] = useState<number>(1.0);

  // Ticks Buffer for rendering charts (local updates)
  const [tickHistory, setTickHistory] = useState<number[]>([]);

  // Gemini active states
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiReport, setAiReport] = useState<string>("");
  const [reportSummary, setReportSummary] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [reportGenerating, setReportGenerating] = useState<boolean>(false);
  const [loaderStep, setLoaderStep] = useState<string>("INITIALIZING AUDIT...");

  // Server Live connection state
  const [serverConnected, setServerConnected] = useState<boolean>(true);

  // General Client references
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // ==========================================
  // CORE FETCH ENGINE (POLLING STATS & TICK HISTORY)
  // ==========================================
  const fetchState = async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) {
        setServerConnected(false);
        return;
      }
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setServerConnected(false);
        return;
      }
      const data = await res.json();
      
      setBalance(data.balance);
      setPeakBalance(data.peakBalance);
      setTradingEnabled(data.tradingEnabled);
      setSymbol(data.symbol);
      setSymbolName(data.symbolName);
      setIdealStrategy(data.idealStrategy);
      setTradingMode(data.tradingMode);
      setIsAuthorized(data.isAuthorized);

      if (data.hybridRiskType !== undefined) setHybridRiskType(data.hybridRiskType);
      if (data.hybridRiskFixedAmount !== undefined) setHybridRiskFixedAmount(data.hybridRiskFixedAmount);
      if (data.hybridRiskPercent !== undefined) setHybridRiskPercent(data.hybridRiskPercent);
      if (data.hybridRewardRatio !== undefined) setHybridRewardRatio(data.hybridRewardRatio);
      if (data.hybridEarlyCutoffEnabled !== undefined) setHybridEarlyCutoffEnabled(data.hybridEarlyCutoffEnabled);
      if (data.hybridEarlyCutoffPct !== undefined) setHybridEarlyCutoffPct(data.hybridEarlyCutoffPct);
      if (data.hybridGreeningTriggerPct !== undefined) setHybridGreeningTriggerPct(data.hybridGreeningTriggerPct);

      if (data.indicators) {
        setIndicators(data.indicators);
      }
      setRiskPreset(data.riskPreset);
      setCurrentRegime(data.regime);
      setCurrentPrice(data.currentPrice);
      setActivePositions(data.activePositions);
      setCompletedTrades(data.completedTrades);
      setStats(data.stats);
      setCurrentParams(data.parameters);
      setCircuitStats({
        cooldownRemaining: data.circuitBreaker.cooldownRemaining,
        cooldownMessage: data.circuitBreaker.cooldownMessage,
        sessionBlocked: data.circuitBreaker.sessionBlocked
      });
      setGovernorFocusSymbol(data.governorFocusSymbol || "R_10");
      setGovernorStatus(data.governorStatus || "GOVERNING: Active and regulating live sub-algorithms.");
      setSubAlgorithms(data.subAlgorithms || {});
      setLogs(data.logs);
      setServerConnected(true);
    } catch (err) {
      setServerConnected(false);
    }
  };

  const fetchTicks = async () => {
    try {
      const res = await fetch(`/api/ticks?symbol=${symbol}`);
      if (!res.ok) return;
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) return;
      const data = await res.json();
      setTickHistory(data.ticks);
    } catch (err) {
      // Gracefully capture trace silent
    }
  };

  useEffect(() => {
    fetchState();
    fetchTicks();

    // Stats updates
    const stateInterval = setInterval(fetchState, 1000);
    // Realtime-like chart updates
    const chartInterval = setInterval(fetchTicks, 800);

    return () => {
      clearInterval(stateInterval);
      clearInterval(chartInterval);
    };
  }, [symbol]);

  // Adjust config on backend
  const updateBackendConfig = async (payload: Record<string, any>) => {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      fetchState();
    } catch (err) {
      console.error("Failed to update system config:", err);
    }
  };

  // Synchronise and persist the Sovereign Hybrid Risk Engine properties
  const saveHybridConfig = async (newConfig: Record<string, any>) => {
    if (newConfig.hybridRiskType !== undefined) setHybridRiskType(newConfig.hybridRiskType);
    if (newConfig.hybridRiskFixedAmount !== undefined) setHybridRiskFixedAmount(newConfig.hybridRiskFixedAmount);
    if (newConfig.hybridRiskPercent !== undefined) setHybridRiskPercent(newConfig.hybridRiskPercent);
    if (newConfig.hybridRewardRatio !== undefined) setHybridRewardRatio(newConfig.hybridRewardRatio);
    if (newConfig.hybridEarlyCutoffEnabled !== undefined) setHybridEarlyCutoffEnabled(newConfig.hybridEarlyCutoffEnabled);
    if (newConfig.hybridEarlyCutoffPct !== undefined) setHybridEarlyCutoffPct(newConfig.hybridEarlyCutoffPct);
    if (newConfig.hybridGreeningTriggerPct !== undefined) setHybridGreeningTriggerPct(newConfig.hybridGreeningTriggerPct);

    await updateBackendConfig({
      hybridConfig: newConfig
    });
  };

  const toggleSubAlgorithm = async (targetSymbol: string, currentEnabled: boolean) => {
    await updateBackendConfig({
      subAlgConfig: {
        targetSymbol,
        enabled: !currentEnabled
      }
    });
  };

  const openSubAlgModal = (sub: any) => {
    setSelectedSubSymbol(sub.symbol);
    setEditEnabled(sub.enabled);
    setEditOversold(sub.rsiOversoldThreshold);
    setEditOverbought(sub.rsiOverboughtThreshold);
    setEditBbPeriod(sub.bbPeriod);
    setEditBbStd(sub.bbStd);
    setEditMinConfluence(sub.minConfluenceScore);
    setEditAtrStop(sub.atrStopMultiplier);
    setEditTargetLoss(sub.targetLossPct !== undefined ? sub.targetLossPct : 0.15);
    setEditTimeExit(sub.timeExitEnabled !== undefined ? sub.timeExitEnabled : false);
    setEditBreakEven(sub.breakEvenEnabled !== undefined ? sub.breakEvenEnabled : true);
    setEditTrailingStop(sub.trailingStopEnabled !== undefined ? sub.trailingStopEnabled : true);
    setEditMaxTicks(sub.maxTicksInTrade || 800);
    setEditRiskMultiplier(sub.targetRiskStakeMultiplier !== undefined ? sub.targetRiskStakeMultiplier : 1.0);
    setEditLearningFactor(sub.learningAdjustmentFactor !== undefined ? sub.learningAdjustmentFactor : 1.0);
    setModalTab("tuner");
  };

  const saveSubAlgConfig = async () => {
    if (!selectedSubSymbol) return;
    try {
      await updateBackendConfig({
        subAlgConfig: {
          targetSymbol: selectedSubSymbol,
          enabled: editEnabled,
          params: {
            rsiOversoldThreshold: editOversold,
            rsiOverboughtThreshold: editOverbought,
            bbPeriod: editBbPeriod,
            bbStd: editBbStd,
            minConfluenceScore: editMinConfluence,
            atrStopMultiplier: editAtrStop,
            targetLossPct: editTargetLoss,
            timeExitEnabled: editTimeExit,
            breakEvenEnabled: editBreakEven,
            trailingStopEnabled: editTrailingStop,
            maxTicksInTrade: editMaxTicks,
            targetRiskStakeMultiplier: editRiskMultiplier,
            learningAdjustmentFactor: editLearningFactor
          }
        }
      });
      setSelectedSubSymbol(null);
    } catch (err) {
      console.error(err);
    }
  };

  const triggerResetEngine = async () => {
    try {
      await fetch("/api/reset", { method: "POST" });
      setAiReport("");
      fetchState();
      setShowResetConfirm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const forceReset = () => {
    setShowResetConfirm(true);
  };

  // Trigger Gemini quantitative analytical report
  // Poll for report summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch("/api/report-summary");
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data && data.summary) {
              setReportSummary(data);
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch report summary", e);
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 12000); // Poll every 12s
    return () => clearInterval(interval);
  }, []);

  const handleForceReport = async () => {
    setReportGenerating(true);
    setLoaderStep("AWAKENING SOVEREIGN MOTHER ALGORITHM...");
    try {
      const startRes = await fetch("/api/force-report", { method: "POST" });
      if (!startRes.ok) throw new Error("Trigger failed");

      const steps = [
        "PARSING SETTLED LEDGER RECENTS (114 AUDITS)...",
        "COMPILING RECURSIVE PERFORMANCE MILESTONES...",
        "DERIVING MATRIX REGIME MATCH ACCURACY...",
        "MODELING VECTOR EQUITY PROGRESSION CHART...",
        "SYNTHESIZING PARADIGM REFINEMENT COGNITION...",
        "RENDERING ENERGETIC ROADMAP PDF DOCUMENT..."
      ];

      let stepIdx = 0;
      const intervalId = setInterval(async () => {
        if (stepIdx < steps.length) {
          setLoaderStep(steps[stepIdx]);
          stepIdx++;
        }
        try {
          const res = await fetch("/api/report-summary");
          if (res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const data = await res.json();
              if (data && data.pdfUrl) {
                setReportSummary(data);
                setReportGenerating(false);
                clearInterval(intervalId);
              }
            }
          }
        } catch (err) {
          console.error("Polling error", err);
        }
      }, 1500);

    } catch (err) {
      console.error(err);
      setReportGenerating(false);
      alert("Sovereign analytical trigger pipeline failed.");
    }
  };

  const requestAiReview = async (customPrompt?: string) => {
    const promptValue = customPrompt || aiPrompt || "Provide an overall pattern breakdown of my trade book and explain strategy performance across regimes.";
    setAiLoading(true);
    setAiReport("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptValue })
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setAiReport(data.report);
        } else {
          setAiReport("Error: Server returned non-JSON/HTML response. Verify server status.");
        }
      }
    } catch (err) {
      setAiReport("Error: Failed to obtain response from server advisory. Verify Server logs.");
    } finally {
      setAiLoading(false);
    }
  };

  // Keep logs scrolled down ONLY if user is currently near the bottom (or logs are empty)
  useEffect(() => {
    const container = logsContainerRef.current;
    if (container) {
      const threshold = 120; // pixels from bottom to trigger scroll lock
      const isNearBottom = container.scrollHeight - container.clientHeight - container.scrollTop < threshold;
      if (isNearBottom || container.scrollTop === 0) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [logs]);

  // ==========================================
  // MATHEMATICAL ESTIMATION (LOCAL CHARTING CALCULATIONS)
  // ==========================================
  // Draw simple overlay Bollinger Bands locally to map directly on ticks buffer for gorgeous lines trace
  const computeChartOverlays = () => {
    if (tickHistory.length < 20) return { prices: tickHistory, uppers: [], lowers: [], mids: [] };

    const prices = tickHistory;
    const uppers: number[] = [];
    const lowers: number[] = [];
    const mids: number[] = [];

    const period = currentParams.bbPeriod;
    const stdMultiplier = currentParams.bbStd;

    for (let i = 0; i < prices.length; i++) {
      if (i < period) {
        uppers.push(prices[i]);
        lowers.push(prices[i]);
        mids.push(prices[i]);
        continue;
      }

      const slice = prices.slice(i - period, i);
      const mid = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mid, 2), 0) / period;
      const std = Math.sqrt(variance);

      uppers.push(mid + stdMultiplier * std);
      lowers.push(mid - stdMultiplier * std);
      mids.push(mid);
    }

    return { prices, uppers, lowers, mids };
  };

  const { prices, uppers, lowers, mids } = computeChartOverlays();

  // Scale coordinates to draw custom SVG seamlessly
  const renderSvgChart = () => {
    if (prices.length === 0) return null;
    
    const svgWidth = 600;
    const svgHeight = 240;
    const padding = 20;

    const minAll = Math.min(...prices, ...lowers); const maxAll = Math.max(...prices, ...uppers); const pad = (maxAll - minAll)*0.1 || 0.5; const minPrice = minAll - pad;
    const maxPrice = maxAll + pad;
    const priceRange = maxPrice - minPrice || 1;

    const getX = (index: number) => padding + (index / (prices.length - 1)) * (svgWidth - padding * 2);
    const getY = (val: number) => svgHeight - padding - ((val - minPrice) / priceRange) * (svgHeight - padding * 2);

    // Build SVG path lines
    let pricePoints = "";
    let midPoints = "";
    let upperPoints = "";
    let lowerPoints = "";
    let bandsArea = "";

    prices.forEach((p, idx) => {
      pricePoints += `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(p)} `;
      if (mids[idx]) midPoints += `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(mids[idx])} `;
      if (uppers[idx]) upperPoints += `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(uppers[idx])} `;
      if (lowers[idx]) lowerPoints += `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(lowers[idx])} `;
    });

    // Filled Bollinger shadow path
    if (uppers.length === prices.length) {
      bandsArea = `M ${getX(0)} ${getY(uppers[0])} `;
      for (let i = 1; i < uppers.length; i++) {
        bandsArea += `L ${getX(i)} ${getY(uppers[i])} `;
      }
      for (let i = lowers.length - 1; i >= 0; i--) {
        bandsArea += `L ${getX(i)} ${getY(lowers[i])} `;
      }
      bandsArea += "Z";
    }

    // Capture dynamic reference levels for active positions
    const activePos = activePositions.find(p => p.symbol === symbol);

    return (
      <svg className="w-full h-full bg-[#152324] rounded-lg border border-brand-mint/10" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        {/* Horizontal grid guide lines */}
        {[0.25, 0.5, 0.75].map((ratio, i) => {
          const gridVal = minPrice + priceRange * ratio;
          return (
            <g key={i}>
              <line 
                x1={padding} 
                y1={getY(gridVal)} 
                x2={svgWidth - padding} 
                y2={getY(gridVal)} 
                stroke="#334155" 
                strokeWidth={0.5} 
                strokeDasharray="4 4" 
              />
              <text 
                x={svgWidth - padding - 40} 
                y={getY(gridVal) - 4} 
                fill="#475569" 
                className="text-sm font-mono"
              >
                {gridVal.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Bollinger bands background fill */}
        {bandsArea && (
          <path d={bandsArea} fill="rgba(8, 145, 178, 0.08)" stroke="none" />
        )}

        {/* Bollinger upper & lower edges */}
        {upperPoints && (
          <path d={upperPoints} fill="none" stroke="rgba(8, 145, 178, 0.2)" strokeWidth={1} />
        )}
        {lowerPoints && (
          <path d={lowerPoints} fill="none" stroke="rgba(8, 145, 178, 0.2)" strokeWidth={1} />
        )}
        {midPoints && (
          <path d={midPoints} fill="none" stroke="rgba(8, 145, 178, 0.15)" strokeWidth={1} strokeDasharray="3 3"/>
        )}

        {/* Continuous Active price line */}
        <path d={pricePoints} fill="none" stroke="#25b399" strokeWidth={2} />

        {/* If trade is active, draw stop / take-profit reference indicators */}
        {activePos && (
          <g>
            {/* Take Profit (Green line) */}
            <line 
              x1={padding} 
              y1={getY(activePos.takeProfit)} 
              x2={svgWidth - padding} 
              y2={getY(activePos.takeProfit)} 
              stroke="#059669" 
              strokeWidth={1} 
              strokeDasharray="2 2"
            />
            <text x={padding + 5} y={getY(activePos.takeProfit) - 4} fill="#10b981" className="text-sm font-mono tracking-wider font-semibold">
              TP: {activePos.takeProfit.toFixed(2)}
            </text>

            {/* Entry rate line */}
            <line 
              x1={padding} 
              y1={getY(activePos.entryPrice)} 
              x2={svgWidth - padding} 
              y2={getY(activePos.entryPrice)} 
              stroke="#64748b" 
              strokeWidth={1} 
            />
            <text x={padding + 5} y={getY(activePos.entryPrice) - 4} fill="#cbd5e1" className="text-sm font-mono tracking-wider font-semibold">
              ENTRY: {activePos.entryPrice.toFixed(2)}
            </text>

            {/* Stop Loss (Red line) */}
            <line 
              x1={padding} 
              y1={getY(activePos.stopLoss)} 
              x2={svgWidth - padding} 
              y2={getY(activePos.stopLoss)} 
              stroke="#dc2626" 
              strokeWidth={1} 
              strokeDasharray="2 2"
            />
            <text x={padding + 5} y={getY(activePos.stopLoss) - 4} fill="#f87171" className="text-sm font-mono tracking-wider font-semibold">
              SL: {activePos.stopLoss.toFixed(2)}
            </text>
          </g>
        )}

        {/* Active live ticker pulse bubble */}
        {prices.length > 0 && (
          <g>
            <line 
              x1={getX(prices.length - 1)} 
              y1={getY(prices[prices.length - 1])}
              x2={svgWidth - padding + 10}
              y2={getY(prices[prices.length - 1])}
              stroke="#25b399"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle cx={getX(prices.length - 1)} cy={getY(prices[prices.length - 1])} r={3.5} fill="#ffffff" />
            <circle cx={getX(prices.length - 1)} cy={getY(prices[prices.length - 1])} r={8} fill="none" stroke="#25b399" strokeWidth={1} className="animate-ping" style={{ transformOrigin: "center" }} />
            
            <rect 
              x={svgWidth - padding + 10} 
              y={getY(prices[prices.length - 1]) - 10} 
              width={46} 
              height={20} 
              fill="#ffffff" 
              rx={2}
            />
            <text 
              x={svgWidth - padding + 33} 
              y={getY(prices[prices.length - 1]) + 3.5} 
              fill="#000000" 
              className="text-sm font-mono font-bold"
              textAnchor="middle"
            >
              {prices[prices.length - 1].toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    );
  };

  // Determine current confluence details to display checkmark scoring live from server-side indicators
  const getConfluenceCheckmarks = () => {
    const isLong = idealStrategy === "mean_reversion"; // or check active mode
    const conf = indicators.confluence || {
      isOversold: false,
      isRsiOversoldRange: false,
      isBelowVwap: false,
      isBullDivergent: false,
      isBullReversalPattern: false,
      score: 0
    };

    return {
      bbLim: { label: isLong ? "Bollinger Lower Edge (Buy Zone)" : "Bollinger Upper Edge (Sell Zone)", met: conf.isOversold },
      rsiOversold: { label: isLong ? `RSI Oversold Condition (${currentParams.rsiOversoldThreshold})` : `RSI Overbought Condition (${currentParams.rsiOverboughtThreshold})`, met: conf.isRsiOversoldRange },
      belowVwap: { label: isLong ? "Price below VWAP (Bullish)" : "Price above VWAP (Bearish)", met: conf.isBelowVwap },
      diverg: { label: "Stochastic RSI Divergence Pattern", met: conf.isBullDivergent },
      reversal: { label: "Momentum Candlestick Exhaustion", met: conf.isBullReversalPattern }
    };
  };

  const confluenceFields = getConfluenceCheckmarks();
  const confluenceCount = Object.values(confluenceFields).filter(c => c.met).length;

  return (
    <div className="min-h-screen bg-[#111513] text-slate-100 font-sans antialiased flex flex-col p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* ==========================================
          HEADER WORKSPACE (Unique Color: brand-slate)
          ========================================== */}
      <header className="w-full max-w-none bg-brand-slate border border-brand-teal/35 rounded-xl p-5 md:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <BookMarked className="w-7 h-7 text-brand-peach" />
            <h1 className="text-2xl font-display font-medium tracking-tight text-brand-mint">
              SOVEREIGN TRADE ENGINE
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1e2522] border border-brand-teal/30 text-sm font-mono text-emerald-400 font-bold">
              <span className={`w-2 h-2 rounded-full ${tradingEnabled ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
              ENGINE AUTO-TRADE: {tradingEnabled ? "ACTIVE" : "PAUSED"}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1e2522] border border-brand-teal/30 text-sm font-mono font-bold text-brand-gold">
              <span className={`w-2 h-2 rounded-full ${isAuthorized ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`}></span>
              <span className={isAuthorized ? "text-brand-mint" : "text-red-400"}>
                DERIV AUTH: {isAuthorized ? "AUTHORIZED" : "OBSERVER ONLY"}
              </span>
            </span>
          </div>
          <p className="text-brand-mint/65 text-sm mt-1 selection:bg-indigo-500">
            Research-Informed, Regime-Adaptive Mean Reversion Terminal for Deriv Synthetic Indices.
          </p>
        </div>

        {/* Global toggles and risk preset adjusters */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Risk Presets chooser */}
          <div className="flex items-center bg-[#1b211f] rounded border border-brand-teal/25 p-0.5 text-sm">
            {(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"] as const).map((risk) => (
              <button
                key={risk}
                onClick={() => updateBackendConfig({ risk })}
                className={`px-3 py-1 font-mono transition rounded text-sm ${riskPreset === risk ? "bg-brand-teal text-brand-mint font-bold" : "text-brand-mint/50 hover:text-brand-mint"}`}
              >
                {risk}
              </button>
            ))}
          </div>

          {/* Sizing presets and toggle options vs multipliers */}
          <select
            value={tradingMode}
            onChange={(e) => updateBackendConfig({ mode: e.target.value })}
            className="bg-[#1b211f] text-brand-mint border border-brand-teal/25 rounded px-2 text-sm py-1.5 font-mono outline-soft"
          >
            <option value="AUTO">AUTO: Algo Adaptive</option>
            <option value="HYBRID_LINEAR">HYBRID: Linear (Risk R Sizing)</option>
            <option value="MULTIPLIER">MULT: Multipliers</option>
          </select>

          {/* Toggle Engine trading State */}
          <button
            onClick={() => updateBackendConfig({ enabled: !tradingEnabled })}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold cursor-pointer transition ${tradingEnabled ? "bg-red-650 hover:bg-red-700 text-white" : "bg-brand-gold hover:bg-brand-gold/90 text-brand-slate font-bold"}`}
          >
            {tradingEnabled ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" /> Pause trading
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> START TRADING
              </>
            )}
          </button>

          {/* Operational metrics reset */}
          <button
            onClick={forceReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-900/20 border border-red-550/30 hover:bg-red-950/40 text-red-400 hover:text-red-350 transition cursor-pointer text-xs font-mono font-bold uppercase"
            title="Sovereign Reset Database to default baseline"
          >
            <RefreshCw className="w-3.5 h-3.5 text-red-405" />
            Reset Metrics & Logs
          </button>
        </div>
      </header>

      {/* ==========================================
          POWER-LAW SAFETY HALVING TRIGGER BANNER
          ========================================== */}
      {(() => {
        const criticalSyms = Object.values(subAlgorithms)
          .filter((s: any) => s.enabled && s.tailExponent !== undefined && s.tailExponent <= 2.2)
          .map((s: any) => `${s.name} (α̂: ${s.tailExponent.toFixed(2)})`);
        if (criticalSyms.length === 0) return null;
        return (
          <div className="w-full bg-gradient-to-r from-rose-950 to-red-900 border-2 border-red-500 rounded-xl p-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-red-900/40 shadow-lg animate-pulse">
            <div className="flex items-center gap-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-display font-black text-lg text-rose-200 tracking-tight">
                  CRITICAL TAIL RISK DETECTED — HALVING ACTIVE
                </h3>
                <p className="text-rose-100 text-sm mt-0.5 max-w-4xl leading-relaxed">
                  The Hill Estimator on a 500-tick lookback window has detected extreme, infinite-variance fat tails on: <span className="underline font-mono font-bold text-yellow-300">{criticalSyms.join(", ")}</span>. 
                  Standard stop-losses are highly prone to tail slippage. The **Halving Trigger Protocol** is now dynamically reducing all active trade stakes by **-50%** for capital preservation.
                </p>
              </div>
            </div>
            <div className="px-4 py-2 rounded bg-red-800 text-xs font-mono font-extrabold uppercase border border-red-400 whitespace-nowrap tracking-wider">
              🛡️ -50% Stake Protection
            </div>
          </div>
        );
      })()}

      {/* ==========================================
          UPPER BACKDROP CONTAINER (Custom visual background sections)
          ========================================== */}
      <div id="upper-bg-section" className="w-full flex flex-col space-y-6 bg-cover bg-center bg-no-repeat transition-all p-5 md:p-6 lg:p-8 rounded-2xl border border-brand-teal/20 shadow-2xl" style={{ backgroundImage: "linear-gradient(rgba(17, 21, 19, 0.84), rgba(17, 21, 19, 0.84)), url('/input_file_1.png')" }}>

        {/* METRICS DASHBOARD STRIP (Unique colors per card below header) */}
        <section className="w-full max-w-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Metric 1: Absolute Capital Equity Balance - UNIQUE COLOURED: Deep Teal */}
          <div className="bg-brand-teal border border-brand-teal/40 rounded-xl p-5 flex flex-col justify-between shadow-xl hover:translate-y-[-2px] transition-all duration-300 min-h-[110px]">
            <span className="text-brand-mint/75 text-sm uppercase font-mono tracking-wider block font-bold">Net Capital Equity balance</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-mono font-extrabold text-brand-mint">${balance.toFixed(2)}</span>
              <span className={`text-sm font-mono font-bold px-1.5 py-0.5 rounded ${stats.totalPnl >= 0 ? "bg-emerald-500/25 text-emerald-300" : "bg-red-500/25 text-red-300"}`}>
                {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
              </span>
            </div>
            <span className="text-brand-mint/60 text-sm block mt-1.5 font-mono">
              Peak Capital: <span className="font-semibold text-brand-mint">${peakBalance.toFixed(2)}</span>
            </span>
          </div>

          {/* Metric 2: Live Active Regime status - UNIQUE COLOURED: Sandy Gold */}
          <div className="bg-brand-gold border border-brand-gold/40 rounded-xl p-5 flex flex-col justify-between shadow-xl hover:translate-y-[-2px] transition-all duration-300 min-h-[110px]">
            <span className="text-brand-slate/80 text-sm uppercase font-mono tracking-wider block font-bold">Real-time Model Regime</span>
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-base px-2.5 py-0.5 rounded font-mono font-bold border uppercase ${
                currentRegime === MarketRegime.RANGING 
                  ? "bg-brand-slate text-emerald-450 border-emerald-555/40" 
                  : currentRegime.includes("trending")
                  ? "bg-brand-slate text-indigo-400 border-indigo-500/40"
                  : "bg-brand-slate text-amber-500 border-amber-500/40"
              }`}>
                {currentRegime.replace("_", " ")}
              </span>
            </div>
            <span className="text-brand-slate/85 text-sm block mt-2 font-mono truncate font-semibold">
              Ideal: {idealStrategy === "mean_reversion" ? "Mean Reversion (Fade)" : "Momentum Breakout"}
            </span>
          </div>

          {/* Metric 3: Session Trades Win ratios - UNIQUE COLOURED: Pale Peach */}
          <div className="bg-brand-peach border border-brand-peach/40 rounded-xl p-5 flex flex-col justify-between shadow-xl hover:translate-y-[-2px] transition-all duration-300 min-h-[110px]">
            <span className="text-brand-slate/80 text-sm uppercase font-mono tracking-wider block font-bold">Total Settlement Ratio</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-mono font-extrabold text-brand-slate">{stats.winRate}%</span>
              <span className="text-sm text-brand-slate/70 font-mono font-bold">w/ {stats.totalTrades} contracts</span>
            </div>
            <span className="text-brand-slate/85 text-sm block mt-1.5 font-mono font-semibold">
              Streak dynamic: +{stats.streakWin} wins / -{stats.streakLoss} losses
            </span>
          </div>

          {/* Metric 4: Drawdowns of peak state - UNIQUE COLOURED: Soft Mint */}
          <div className="bg-brand-mint border border-brand-mint/40 rounded-xl p-5 flex flex-col justify-between shadow-xl hover:translate-y-[-2px] transition-all duration-300 min-h-[110px]">
            <span className="text-brand-slate/80 text-sm uppercase font-mono tracking-wider block font-bold">Peak-to-Valley Drawdown</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-mono font-extrabold text-red-700">{stats.maxDrawdown}%</span>
              <span className="text-sm text-brand-slate/75 font-mono font-bold">peak-to-valley variance</span>
            </div>
            <span className="text-brand-slate/80 text-sm block mt-1.5 font-mono truncate font-semibold">
              Max Risk Stake cap: {riskPreset === "CONSERVATIVE" ? "1.0%" : riskPreset === "MODERATE" ? "2.0%" : "4.0%"} Equity
            </span>
          </div>
        </section>

      {/* ==========================================
          GOVERNOR MULTI-ALGORITHM COMMAND CONSOLE
          ========================================== */}
      <section className="w-full max-w-none bg-[#131917]/80 backdrop-blur-md border border-brand-slate/50 rounded-xl p-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-brand-slate/40 pb-4 mb-4 gap-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-brand-peach" />
            <div>
              <h2 className="text-sm font-semibold tracking-wider uppercase text-brand-mint">
                GOVERNOR Tactical Command Center
              </h2>
              <p className="text-sm text-brand-mint/60 font-mono mt-0.5">
                {governorStatus || "GOVERNING: Active and regulating live sub-algorithms."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-[#1b211f]/90 px-3 py-1.5 rounded border border-brand-teal/30">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-peach animate-ping shrink-0"></span>
            <span className="text-sm uppercase font-mono text-brand-mint/70">
              Governor Priority Focal Asset: 
            </span>
            <span className="text-sm font-mono text-brand-peach font-bold bg-brand-peach/10 px-2 py-0.5 rounded border border-brand-peach/20">
              {governorFocusSymbol} ({INSTRUMENTS[governorFocusSymbol as keyof typeof INSTRUMENTS]?.name || governorFocusSymbol})
            </span>
          </div>
        </div>

        {/* Dynamic Parallel Sub-Algorithm status grid cards! Supports 6 columns beautifully */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Object.keys(subAlgorithms).length === 0 ? (
            <div className="col-span-5 text-center py-12 bg-slate-950/30 rounded border border-slate-900 border-dashed text-slate-600 text-base font-mono">
              Bootstrapping sovereign subprocess registries and indicator warming tables...
            </div>
          ) : (
            Object.values(subAlgorithms).map((sub: any) => {
              const symbolKey = sub.symbol;
              const isFocused = symbolKey === governorFocusSymbol;
              const isEnabled = sub.enabled;

              return (
                <div 
                  key={symbolKey} 
                  className={`p-3.5 rounded-lg flex flex-col justify-between gap-3.5 transition-all relative overflow-hidden bg-brand-mint border ${
                    isFocused 
                      ? "border-brand-gold border-2 animate-focused-glow scale-[1.01] z-20" 
                      : isEnabled 
                      ? "border-brand-teal/40 shadow-md" 
                      : "border-brand-teal/15 opacity-60 shadow-sm"
                  }`}
                >
                  {/* Laser scan animation bar for focused cards */}
                  {isFocused && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg z-10">
                      <div className="absolute left-0 w-full h-[4px] bg-[#FF8A65] opacity-95 animate-scan shadow-[0_0_15px_6px_#FF8A65]" />
                      <div className="absolute inset-0 bg-gradient-to-b from-brand-peach/10 via-transparent to-brand-peach/10" />
                    </div>
                  )}

                  {/* Top line with active switch and name */}
                  <div className="flex items-center justify-between gap-1.5 leading-none z-10">
                    <div className="flex flex-col">
                      <span className="text-sm font-mono font-black text-brand-slate tracking-tight">
                        {symbolKey}
                      </span>
                      <span className="text-sm text-brand-slate/80 font-sans mt-0.5 font-bold truncate max-w-[85px]" title={sub.name}>
                        {sub.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-mono font-extrabold ${isEnabled ? "text-[#065f46]" : "text-[#7f1d1d]"}`}>
                        {isEnabled ? "RUN" : "STOP"}
                      </span>
                      <button
                        onClick={() => toggleSubAlgorithm(symbolKey, isEnabled)}
                        className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 outline-none relative cursor-pointer ${
                          isEnabled ? "bg-brand-teal" : "bg-[#94a3b8]"
                        }`}
                        title={isEnabled ? "Pause this Sub-Algorithm" : "Activate this Sub-Algorithm"}
                      >
                        <span 
                          className={`block w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            isEnabled ? "translate-x-3" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Personality identifier tag */}
                  <div className="flex items-center justify-between z-10">
                    <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold text-brand-teal bg-brand-teal/12 border border-brand-teal/25">
                      {sub.personality}
                    </span>
                    {isFocused && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-mono font-black text-[#b45309] bg-amber-500/15 border border-amber-500/30 animate-pulse">
                        FOCAL
                      </span>
                    )}
                  </div>

                  {/* Operational stats row */}
                  <div className="grid grid-cols-2 gap-1.5 py-2 border-y border-brand-slate/20 font-mono text-sm z-10">
                    <div className="flex flex-col">
                      <span className="text-xs text-[#2c3531]/75 font-bold uppercase">Trades (WR)</span>
                      <span className="text-brand-slate font-extrabold leading-tight">
                        {sub.totalTrades} <span className="text-brand-slate/60 text-xs">({(sub.recentWinRate * 100).toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-xs text-[#2c3531]/75 font-bold uppercase">PnL</span>
                      <span className={`font-black leading-tight ${sub.totalPnl >= 0 ? "text-[#065f46]" : "text-[#7f1d1d]"}`}>
                        {sub.totalPnl >= 0 ? "+" : ""}${sub.totalPnl.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Real-time Indicator tracking */}
                  <div className="space-y-1 font-mono text-xs text-brand-slate/90 pb-2 border-b border-brand-slate/15 z-10">
                    <div className="flex justify-between">
                      <span className="text-brand-slate/75 font-semibold">RSI (14):</span>
                      <span className={sub.rsiVal <= sub.rsiOversoldThreshold ? "text-[#065f46] font-black underline animate-pulse" : sub.rsiVal >= sub.rsiOverboughtThreshold ? "text-[#7f1d1d] font-black" : "text-brand-slate font-extrabold"}>
                        {sub.rsiVal ? sub.rsiVal.toFixed(1) : "--"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-slate/75 font-semibold">%B Space:</span>
                      <span className="text-brand-slate font-extrabold">
                        {Math.round(sub.bbPct * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-slate/75 font-semibold">ADX Trend:</span>
                      <span className="text-brand-slate font-extrabold">{sub.adxVal ? sub.adxVal.toFixed(1) : "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-slate/75 font-semibold">ATR Vol:</span>
                      <span className="text-brand-slate font-extrabold">{sub.atrVal ? sub.atrVal.toFixed(2) : "--"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-slate/75 font-semibold">Regime:</span>
                      <span className="text-brand-teal font-black uppercase text-xs">{sub.mRegime ? sub.mRegime.replace('_', ' ') : "--"}</span>
                    </div>
                    <div className="flex justify-between border-t border-brand-slate/10 pt-1 mt-1">
                      <span className="text-[#581c87] font-semibold">Hurst DFA-1:</span>
                      <span className="text-[#581c87] font-extrabold">
                        {sub.hurstVal !== undefined ? sub.hurstVal.toFixed(2) : "--"}{" "}
                        <span className="text-[9px] text-slate-500 font-normal">(R²: {sub.hurstRSquared !== undefined ? sub.hurstRSquared.toFixed(2) : "--"})</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#1e1b4b] font-semibold">Hurst R/S (1k):</span>
                      <span className="text-[#1e1b4b] font-extrabold">
                        {sub.hurstConfirm !== undefined ? sub.hurstConfirm.toFixed(2) : "--"}
                      </span>
                    </div>
                    {sub.hurstMacro !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-[#0369a1] font-semibold">Hurst Macro (2k):</span>
                        <span className="text-[#0369a1] font-extrabold">
                          {sub.hurstMacro.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {sub.convictionScore !== undefined && (
                      <div className="flex justify-between border-t border-dashed border-brand-slate/10 pt-1 mt-0.5">
                        <span className="text-[#0f766e] font-bold">SFT-V2 Conv:</span>
                        <span className="text-[#0f766e] font-black">
                          {(sub.convictionScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {sub.tailExponent !== undefined && (
                      <div className="flex justify-between border-t border-dashed border-brand-slate/10 pt-1 mt-0.5">
                        <span className="text-[#be2c52] font-semibold">Tail α̂ (Hill):</span>
                        <span className={`font-extrabold ${
                          sub.tailExponent >= 3.0 ? "text-emerald-700" :
                          sub.tailExponent >= 2.2 ? "text-amber-700" :
                          "text-rose-700 animate-pulse font-black"
                        }`}>
                          {sub.tailExponent.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Executive action directive message */}
                  <div className="p-2.5 rounded bg-[#111513] border border-brand-teal/30 text-xs font-mono text-brand-peach leading-normal min-h-[4rem] flex items-center justify-center shadow-inner z-10">
                    <p className="line-clamp-3 leading-snug text-center font-bold text-brand-mint/90">
                      {sub.directiveMessage || "Lobbying governor orders..."}
                    </p>
                  </div>

                  {/* Tactical Subprocess Interactive Panel */}
                  <button
                    onClick={() => openSubAlgModal(sub)}
                    className="w-full py-2 bg-brand-slate hover:bg-brand-slate/90 border border-brand-slate text-sm uppercase tracking-wider text-brand-mint font-black font-mono rounded cursor-pointer transition-all duration-150 shadow-md hover:shadow-lg z-10"
                  >
                    Configure & History
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ==========================================
          BENTO GRID PRIMARY CONTROLLER
          ========================================== */}
      <main className="w-full max-w-full px-4 lg:px-8 xl:px-12 mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 mb-6">
        
        {/* LEFT COLUMN: THE CHART CONSOLE & INSTRUMENTS (SPAN 4) */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-brand-teal border border-brand-mint/15 rounded-xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm uppercase font-mono text-brand-mint/90 tracking-wider font-semibold flex items-center gap-1.5">
                <LineChartIcon className="w-3.5 h-3.5" /> Market Price Workspace
              </span>
              <span className="text-brand-mint text-sm font-mono font-medium">
                Live: {currentPrice.toFixed(2)} pts
              </span>
            </div>

            {/* Price Symbol buttons strip */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              {Object.keys(INSTRUMENTS).map((sym) => {
                const meta = INSTRUMENTS[sym as keyof typeof INSTRUMENTS];
                
                // Define unique colors per symbol
                const colors: Record<string, { active: string, inactive: string }> = {
                  R_10: { active: "bg-blue-500/90 border-blue-500 text-white shadow shadow-blue-500/25 font-bold", inactive: "bg-blue-900/25 border-blue-800/60 text-blue-300 hover:bg-blue-900/60 hover:text-blue-300" },
                  R_25: { active: "bg-emerald-500/90 border-emerald-500 text-white shadow shadow-emerald-500/25 font-bold", inactive: "bg-emerald-900/25 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/60 hover:text-emerald-300" },
                  R_75: { active: "bg-purple-500/90 border-purple-500 text-white shadow shadow-purple-500/25 font-bold", inactive: "bg-purple-900/25 border-purple-800/60 text-purple-300 hover:bg-purple-900/60 hover:text-purple-300" },
                  R_100: { active: "bg-orange-500/90 border-orange-500 text-white shadow shadow-orange-500/25 font-bold", inactive: "bg-orange-900/25 border-orange-800/60 text-orange-300 hover:bg-orange-900/60 hover:text-orange-300" },
                  CRASH500: { active: "bg-rose-500/90 border-rose-500 text-white shadow shadow-rose-500/25 font-bold", inactive: "bg-rose-900/25 border-rose-800/60 text-rose-300 hover:bg-rose-900/60 hover:text-rose-300" },
                  BOOM500: { active: "bg-cyan-500/90 border-cyan-500 text-white shadow shadow-cyan-500/25 font-bold", inactive: "bg-cyan-900/25 border-cyan-800/60 text-cyan-300 hover:bg-cyan-900/60 hover:text-cyan-300" },
                };
                
                const styleConfig = colors[sym] || { active: "bg-slate-300 text-black border-slate-300", inactive: "bg-slate-800 text-slate-400 border-slate-700" };

                return (
                  <button
                    key={sym}
                    onClick={() => updateBackendConfig({ symbol: sym })}
                    className={`px-2 py-1.5 rounded border font-mono text-sm text-center truncate cursor-pointer transition-all duration-200 ${symbol === sym ? styleConfig.active : styleConfig.inactive}`}
                    title={meta.name}
                  >
                    {sym}
                  </button>
                );
              })}
            </div>

            {/* Custom SVG Price and Bollinger trace Chart */}
            <div className="w-full h-60 min-h-60 mb-4 select-none relative">
              {renderSvgChart()}
              
              {/* Overlay description badge text */}
              <div className="absolute top-3 left-3 flex flex-col gap-0.5">
                <span className="text-sm font-mono shrink-0 bg-brand-slate/80 px-2 py-0.5 rounded border border-brand-mint/20 text-brand-mint">
                  {symbolName}
                </span>
                <span className="text-xs font-mono shrink-0 bg-brand-slate/80 px-2 py-0.5 rounded border border-brand-mint/20 text-brand-mint/70">
                  Expected Base Vol: {((INSTRUMENTS[symbol as keyof typeof INSTRUMENTS]?.volatility || 0.1) * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Gated protection warnings & indicators explanation */}
            <div className="p-3 bg-brand-teal/40 rounded border border-brand-mint/20 text-sm text-brand-mint/80 space-y-2">
              <div className="flex items-start gap-1.5">
                <ShieldAlert className="w-4 h-4 text-brand-mint shrink-0 mt-0.5" />
                <div>
                  <span className="text-brand-mint font-medium font-mono">Sovereign Edge Rules Engage</span>
                  <p className="text-sm text-brand-mint/70 mt-0.5 leading-relaxed font-mono">
                    Staking employs adaptive Half-Kelly formulations. Risk constraints prevent Martingale staking or averaging down losing exposures. Entries strictly toggle off during volatile <span className="text-brand-mint font-bold italic">TRANSITION</span> regimes.
                  </p>
                </div>
              </div>
            </div>
          </div>


          {/* SOVEREIGN HYBRID RISK ENGINE (SHRE) PROFILE */}
          <div className="bg-[#111615] border border-brand-teal/20 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-teal/10">
              <span className="text-sm uppercase font-mono text-brand-mint font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#10b981]" /> Hybrid Risk Sizing (SHRE)
              </span>
              <span className="text-xs font-mono text-brand-teal/80 bg-brand-teal/10 px-2 py-0.5 rounded border border-brand-teal/20">
                ACTIVE
              </span>
            </div>

            <div className="space-y-4 font-mono text-xs text-brand-mint/90">
              {/* Risk Type Selector */}
              <div>
                <label className="text-slate-400 block mb-1.5 text-[10px] uppercase tracking-wider">Risk Allocation Model</label>
                <div className="grid grid-cols-2 gap-2 bg-[#1b211f] rounded border border-brand-teal/25 p-0.5">
                  <button
                    onClick={() => saveHybridConfig({ hybridRiskType: "FIXED" })}
                    className={`py-1 rounded transition text-center text-[10px] font-bold cursor-pointer ${hybridRiskType === "FIXED" ? "bg-brand-teal text-brand-mint shadow" : "text-brand-mint/50 hover:text-brand-mint"}`}
                  >
                    Fixed USD ($)
                  </button>
                  <button
                    onClick={() => saveHybridConfig({ hybridRiskType: "PERCENT" })}
                    className={`py-1 rounded transition text-center text-[10px] font-bold cursor-pointer ${hybridRiskType === "PERCENT" ? "bg-brand-teal text-brand-mint shadow" : "text-brand-mint/50 hover:text-brand-mint"}`}
                  >
                    Equity Pct (%)
                  </button>
                </div>
              </div>

              {/* Risk Input Controls */}
              {hybridRiskType === "FIXED" ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-400 text-[10px] uppercase tracking-wider">Risk Capital per Trade</label>
                    <span className="text-brand-gold font-bold text-sm">${hybridRiskFixedAmount.toFixed(1)} USD</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="200"
                    step="5"
                    value={hybridRiskFixedAmount}
                    onChange={(e) => saveHybridConfig({ hybridRiskFixedAmount: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-[#1b211f] rounded-lg appearance-none cursor-pointer accent-brand-teal"
                  />
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {([10, 25, 50, 100] as const).map((amt) => (
                      <button
                        key={amt}
                        onClick={() => saveHybridConfig({ hybridRiskFixedAmount: amt })}
                        className={`text-[9px] py-1 rounded border transition-all cursor-pointer ${hybridRiskFixedAmount === amt ? "border-brand-teal bg-brand-teal/10 text-brand-mint" : "border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-400 text-[10px] uppercase tracking-wider">Risk Fraction of Equity</label>
                    <span className="text-brand-gold font-bold text-sm">
                      {hybridRiskPercent.toFixed(1)}% (${(balance * hybridRiskPercent / 100).toFixed(2)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="5"
                    step="0.1"
                    value={hybridRiskPercent}
                    onChange={(e) => saveHybridConfig({ hybridRiskPercent: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-[#1b211f] rounded-lg appearance-none cursor-pointer accent-brand-teal"
                  />
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {([0.5, 1.0, 2.0, 3.0] as const).map((pct) => (
                      <button
                        key={pct}
                        onClick={() => saveHybridConfig({ hybridRiskPercent: pct })}
                        className={`text-[9px] py-1 rounded border transition-all cursor-pointer ${hybridRiskPercent === pct ? "border-brand-teal bg-brand-teal/10 text-brand-mint" : "border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300"}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reward Ratio Input */}
              <div className="pt-2 pb-1 border-y border-brand-teal/10">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider">Target Return Ratio</span>
                  <span className="text-[#10b981] font-bold text-sm">
                    {hybridRewardRatio}R (${((hybridRiskType === "FIXED" ? hybridRiskFixedAmount : (balance * hybridRiskPercent / 100)) * hybridRewardRatio).toFixed(2)})
                  </span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="6"
                  step="0.5"
                  value={hybridRewardRatio}
                  onChange={(e) => saveHybridConfig({ hybridRewardRatio: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-[#1b211f] rounded-lg appearance-none cursor-pointer accent-brand-teal"
                />
              </div>

              {/* Adverse Excursion Cutoff Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider">15% Adverse Cutoff</span>
                  <button
                    onClick={() => saveHybridConfig({ hybridEarlyCutoffEnabled: !hybridEarlyCutoffEnabled })}
                    className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold transition cursor-pointer ${hybridEarlyCutoffEnabled ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-slate-800 text-slate-400"}`}
                  >
                    {hybridEarlyCutoffEnabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
                {hybridEarlyCutoffEnabled && (
                  <p className="text-[10px] text-slate-400 leading-relaxed bg-[#1b211f]/40 p-2 rounded border border-brand-teal/10">
                    🛡️ Clamps maximum exposure drawdown to <span className="text-red-400 font-semibold">15% of your SL</span>. Max potential loss capped at -${((hybridRiskType === "FIXED" ? hybridRiskFixedAmount : (balance * hybridRiskPercent / 100)) * 0.15).toFixed(2)}.
                  </p>
                )}
              </div>

              {/* Greening Profit Trail */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-slate-400 text-[10px] uppercase tracking-wider">Greening Trigger</span>
                  <span className="text-emerald-400 font-bold">
                    {(hybridGreeningTriggerPct * 100).toFixed(0)}% of R
                  </span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="1.0"
                  step="0.05"
                  value={hybridGreeningTriggerPct}
                  onChange={(e) => saveHybridConfig({ hybridGreeningTriggerPct: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-[#1b211f] rounded-lg appearance-none cursor-pointer accent-brand-teal"
                />
                <p className="text-[10px] text-slate-400 leading-relaxed mt-1.5">
                  ⭐ Moving Stop Loss to entry once you gain <span className="text-[#10b981] font-semibold">{(hybridGreeningTriggerPct * 100).toFixed(0)}% of R profit</span>. Secures the trade as 100% risk free.
                </p>
              </div>

            </div>
          </div>

          {/* SOVEREIGN ENGINE ALGORITHM PERFORMANCE HUB */}
          <div className="bg-slate-900/40 border border-[#1e293b] rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm uppercase font-mono text-brand-peach tracking-wider font-bold flex items-center gap-1.5">
                <Award className="w-4 h-4 text-brand-peach" /> Sovereign Multi-Algorithm Performance Hub
              </span>
              <p className="text-xs text-slate-400 font-sans leading-normal">
                Sovereign Master allocation metrics. Select any motherboard algorithm or asset subprocess below to expand full audit traces.
              </p>
            </div>

            {/* Mother Algorithm Performance Block */}
            <div 
              onClick={() => setSelectedPerfDetail("MOTHER")}
              className="bg-brand-slate/85 border border-brand-teal/50 hover:border-brand-gold/60 rounded-lg p-4 cursor-pointer transition-all duration-200 shadow-md group relative overflow-hidden"
              style={{ contentVisibility: "auto" }}
            >
              <div className="absolute top-0 right-0 bg-brand-gold/10 px-2 py-0.5 text-[10px] uppercase font-mono text-brand-gold font-bold rounded-bl border-l border-b border-brand-gold/20">
                MASTER CONTROLLER
              </div>

              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold font-mono text-brand-mint flex items-center gap-1.5 uppercase">
                    <Cpu className="w-3.5 h-3.5 text-brand-peach" /> Sovereign Mother Algorithm
                  </h4>
                  <p className="text-xs text-brand-mint/60 font-sans max-w-[260px]">
                    Master risk supervisor, Half-Kelly allocation engine, & circuit breaker sentinel.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-mono font-bold text-brand-peach bg-brand-peach/10 px-1.5 py-0.5 rounded border border-brand-peach/20">
                    S+ CLASS
                  </span>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    <Star className="w-3 h-3 fill-amber-500" />
                    <Star className="w-3 h-3 fill-amber-500" />
                    <Star className="w-3 h-3 fill-amber-500" />
                    <Star className="w-3 h-3 fill-amber-500" />
                    <Star className="w-3 h-3 fill-amber-500" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3.5 pt-2.5 border-t border-brand-teal/20 font-mono text-xs text-brand-mint/80">
                <div>
                  <span className="block text-[10px] text-brand-mint/50 uppercase">Session Win %</span>
                  <span className="text-sm font-bold text-brand-mint">{stats.winRate}%</span>
                </div>
                <div>
                  <span className="block text-[10px] text-brand-mint/50 uppercase">Session PnL</span>
                  <span className={`text-sm font-bold ${stats.totalPnl >= 0 ? "text-emerald-400" : "text-rose-450"}`}>
                    {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-brand-mint/50 uppercase">Contracts Settle</span>
                  <span className="text-sm font-extrabold text-brand-gold">{stats.totalTrades}</span>
                </div>
              </div>
            </div>

            {/* Asset Subprocesses Panel */}
            <div className="space-y-2 max-h-[295px] overflow-y-auto pr-1">
              {Object.keys(subAlgorithms).length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-500 font-mono bg-slate-950/20 rounded border border-slate-900 border-dashed">
                  Waiting for subprocess registries...
                </div>
              ) : (
                Object.values(subAlgorithms).map((sub: any) => {
                  const wr = sub.recentWinRate || 0;
                  const winRatePct = wr * 100;
                  
                  // Compute rating label and stars dynamically
                  let ratingLabel = "C TIER";
                  let ratingColor = "text-slate-400 bg-slate-500/10 border-slate-500/20";
                  if (sub.totalTrades > 0) {
                    if (winRatePct >= 62 && sub.totalPnl > 0) {
                      ratingLabel = "S TIER";
                      ratingColor = "text-brand-peach bg-brand-peach/10 border-brand-peach/20";
                    } else if (winRatePct >= 52 && sub.totalPnl >= 0) {
                      ratingLabel = "A TIER";
                      ratingColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                    } else if (winRatePct >= 42 || sub.totalPnl >= -5) {
                      ratingLabel = "B TIER";
                      ratingColor = "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
                    }
                  } else {
                    ratingLabel = "N/A";
                  }

                  const isFocused = sub.symbol === governorFocusSymbol;

                  return (
                    <div 
                      key={sub.symbol}
                      onClick={() => setSelectedPerfDetail(sub.symbol)}
                      className={`p-2.5 rounded-lg bg-slate-950/40 border transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 group overflow-hidden relative ${
                        isFocused 
                          ? "border-brand-gold/60 hover:bg-slate-900/30" 
                          : "border-slate-900 hover:border-slate-800 hover:bg-slate-900/20"
                      }`}
                    >
                      {isFocused && (
                        <div className="absolute top-0 bottom-0 left-0 w-[3px] bg-brand-gold shadow-[0_0_8px_#D9B08C]" />
                      )}

                      <div className="flex items-center gap-2 max-w-[50%] shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${sub.enabled ? "bg-emerald-500 animate-pulse shadow-[0_0_6px_#10b981]" : "bg-slate-600"}`} />
                        <div className="flex flex-col truncate">
                          <span className="text-xs font-mono font-bold text-slate-200 group-hover:text-brand-peach transition-colors">
                            {sub.symbol}
                          </span>
                          <span className="text-[10px] text-slate-500 font-sans truncate" title={sub.personality}>
                            {sub.personality}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 font-mono text-xs text-right">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500">TRADES (WR)</span>
                          <span className="text-slate-300 font-medium">
                            {sub.totalTrades} <span className="text-slate-500 text-[10px]">({winRatePct.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className="flex flex-col min-w-[70px]">
                          <span className="text-[10px] text-slate-500">TOTAL PNL</span>
                          <span className={`font-bold ${sub.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {sub.totalPnl >= 0 ? "+" : ""}${sub.totalPnl.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-slate-500">RATING</span>
                          <span className={`text-[9px] font-mono px-1 py-0.25 rounded uppercase border font-bold ${ratingColor}`}>
                            {ratingLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* MIDDLE COLUMN: EXPOSURES, SIGNAL CONFLUENCE SCOREBOARD & PARAMS (SPAN 5) */}
        <section className="lg:col-span-5 flex flex-col space-y-6 min-h-[800px]">

          {/* Active exposure slot */}
          <div className="bg-slate-900/25 border border-slate-900 rounded p-5 flex flex-col flex-1 shadow-2xl">
            <span className="text-sm uppercase font-mono text-indigo-400 tracking-wider font-semibold flex items-center gap-1.5 mb-4 border-b border-indigo-500/20 pb-3">
              <Activity className="w-3.5 h-3.5" /> Open Exposure Ledger
            </span>

            {activePositions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12 bg-slate-950/30 rounded border border-slate-900 border-dashed text-slate-500 text-sm font-mono tracking-widest uppercase">
                No active stochastic contracts currently open
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-max overflow-y-auto pr-1">
                {activePositions.map((pos, idx) => {
                  const isProfit = pos.pnl >= 0;
                  return (
                    <div key={`${pos.id}-${idx}`} className="p-3.5 rounded bg-slate-900 border border-slate-800 flex flex-col justify-between gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-sm font-mono font-bold ${pos.direction === "LONG" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                            {pos.isHybridLinear ? "HYBRID " : ""}{pos.direction} {pos.multiplier ? `${pos.multiplier}x` : ""}
                          </span>
                          <span className="text-base font-mono text-slate-300 font-semibold">{pos.symbol}</span>
                        </div>
                        <span className="text-sm font-mono text-slate-400">Ticks: {pos.ticksElapsed}/{currentParams.maxTicksInTrade}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm font-mono text-slate-400">
                        <div>Entry Prices: <span className="text-slate-200">{pos.entryPrice.toFixed(2)}</span></div>
                        <div>Current Rate: <span className="text-slate-200">{pos.currentPrice.toFixed(2)}</span></div>
                        <div className="text-sm text-red-500 font-bold truncate">Stop SL: {pos.stopLoss.toFixed(2)}</div>
                        <div className="text-sm text-emerald-500 font-bold truncate">Target TP: {pos.takeProfit.toFixed(2)}</div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
                        <div className="flex flex-col">
                          {pos.isHybridLinear ? (
                            <span className="text-xs text-slate-400 font-mono">
                              Risk R-Unit: ${pos.targetRiskAmount!.toFixed(2)} (Stake/Margin: ${pos.stake.toFixed(2)})
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">Allocated Stake: ${pos.stake.toFixed(2)}</span>
                          )}
                          <span className={`text-base font-mono font-bold mt-0.5 ${isProfit ? "text-[#10b981]" : "text-red-400"}`}>
                            PnL: {isProfit ? "+" : ""}${pos.pnl.toFixed(2)} {pos.isHybridLinear ? `(${(pos.pnl / pos.targetRiskAmount!).toFixed(2)}R)` : ""}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            fetch("/api/close-position", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: pos.id })
                            }).then(() => fetchState());
                          }}
                          className="px-2.5 py-1 text-sm font-mono font-semibold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 rounded transition cursor-pointer"
                        >
                          Spot Settle
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TEMPORAL & DURATION ANALYTICS (PHASE 1) */}
          <div className="bg-slate-900/40 border border-[#1e293b] rounded-xl p-5 shadow-xl space-y-4 shrink-0 transition-all duration-300 hover:shadow-cyan-900/10">
            <span className="text-sm uppercase font-mono text-fuchsia-400 tracking-wider font-bold flex items-center gap-1.5 border-b border-[#1e293b] pb-2">
              <Clock className="w-3.5 h-3.5" /> Temporal & Duration Diagnostics
            </span>
            {completedTrades.length === 0 ? (
              <div className="text-center py-6 bg-slate-950/30 rounded border border-slate-800 border-dashed text-slate-500 text-[10px] font-mono">
                Awaiting temporal data stream from network settled blocks...
              </div>
            ) : (() => {
              const wins = completedTrades.filter(t => t.pnl > 0);
              const losses = completedTrades.filter(t => t.pnl <= 0);
              
              const calcAvgDur = (arr: TradeRecord[]) => arr.length > 0 ? arr.reduce((sum, t) => sum + (t.exitEpoch - t.entryEpoch), 0) / arr.length : 0;
              const formatDur = (s: number) => {
                if(s === 0) return "--";
                if(s < 60) return `${Math.round(s)}s`;
                return `${Math.floor(s/60)}m ${Math.round(s%60)}s`;
              };

              const avgWinDur = calcAvgDur(wins);
              const avgLossDur = calcAvgDur(losses);
              const durations = completedTrades.map(t => t.exitEpoch - t.entryEpoch);
              const longestTrade = durations.length > 0 ? Math.max(...durations) : 0;
              const validFastDurations = durations.filter(d => d > 0);
              const fastestExecution = validFastDurations.length > 0 ? Math.min(...validFastDurations) : 0;

              const quickCount = completedTrades.filter(t => (t.exitEpoch - t.entryEpoch) < 180).length;
              const midCount = completedTrades.filter(t => (t.exitEpoch - t.entryEpoch) >= 180 && (t.exitEpoch - t.entryEpoch) <= 480).length;
              const longCount = completedTrades.filter(t => (t.exitEpoch - t.entryEpoch) > 480).length;

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#121614] rounded border border-emerald-500/20 p-3">
                      <span className="text-[10px] uppercase font-mono text-emerald-500/60 block mb-1">Avg Win Duration</span>
                      <span className="text-emerald-400 font-mono font-bold text-lg">{formatDur(avgWinDur)}</span>
                    </div>
                    <div className="bg-[#121614] rounded border border-red-500/20 p-3">
                      <span className="text-[10px] uppercase font-mono text-red-500/60 block mb-1">Avg Loss Duration</span>
                      <span className="text-red-400 font-mono font-bold text-lg">{formatDur(avgLossDur)}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500">Longest Settlement Session</span>
                      <span className="text-slate-300 font-semibold">{formatDur(longestTrade)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500">Fastest Market RoundTrip</span>
                      <span className="text-fuchsia-400 font-semibold">{formatDur(fastestExecution)}</span>
                    </div>
                  </div>

                  {/* Distribution Bar */}
                  <div className="pt-2 border-t border-slate-900">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1.5 uppercase tracking-wider">
                      <span>Quick &lt;3m ({quickCount})</span>
                      <span>Mid 3-8m ({midCount})</span>
                      <span>Long &gt;8m ({longCount})</span>
                    </div>
                    <div className="w-full h-2 rounded-full flex overflow-hidden border border-slate-800 bg-slate-950">
                       {quickCount > 0 && <div className="bg-emerald-500/80 transition-all" style={{ width: `${(quickCount / completedTrades.length) * 100}%` }} />}
                       {midCount > 0 && <div className="bg-indigo-500/80 transition-all" style={{ width: `${(midCount / completedTrades.length) * 100}%` }} />}
                       {longCount > 0 && <div className="bg-fuchsia-500/80 transition-all" style={{ width: `${(longCount / completedTrades.length) * 100}%` }} />}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

        </section>

        {/* RIGHT COLUMN: REVIEWS, PROGRESSIVE BACKTEST WORKSPACE, & AI CO-PILOT (SPAN 3) */}
        <section className="lg:col-span-3 space-y-6">
          
          {/* Diagnostic status block for circuit breakers */}
          {(circuitStats.cooldownRemaining > 0 || circuitStats.sessionBlocked) && (
            <div className={`p-4 rounded border text-sm font-mono space-y-1 ${circuitStats.sessionBlocked ? 'bg-red-950/40 border-red-500 shadow-red-900/50 shadow-lg' : 'bg-red-600/10 border-red-500/20'}`}>
              <div className="flex items-center gap-1.5 text-red-400 font-semibold">
                <ShieldAlert className="w-4 h-4" /> {circuitStats.sessionBlocked ? 'TERMINAL BLOCK' : 'LOCKOUT BREAKER TRIGGERED'}
              </div>
              <p className="text-sm text-red-400/80 leading-relaxed">
                {circuitStats.cooldownMessage}
              </p>
              {!circuitStats.sessionBlocked && (
                <div className="text-sm text-slate-400">
                  Cool down clearance trace: {circuitStats.cooldownRemaining}s
                </div>
              )}
              {circuitStats.sessionBlocked && (
                <div className="text-sm text-red-300 font-bold mt-2 pt-2 border-t border-red-900/50">
                  Trading is permanently disabled for this session due to crossing catastrophic loss limits. Please manually reset the session.
                </div>
              )}
            </div>
          )}

          {/* CORE CO-PILOT TELEMETRY */}
          <div className="bg-brand-peach border border-brand-peach/40 shadow-xl rounded-xl p-5 space-y-4">
            <span className="text-sm uppercase font-mono text-brand-slate tracking-wider font-bold flex items-center gap-1.5 border-b border-brand-slate/20 pb-2">
              <TrendingUp className="w-3.5 h-3.5" /> Technical Telemetry (Live)
            </span>
            
            <div className="grid grid-cols-2 gap-3 font-mono text-sm">
              <div className="p-2 bg-white/40 rounded border border-brand-slate/10 space-y-0.5">
                <div className="text-brand-slate/70 uppercase text-xs tracking-wider font-semibold">RSI (14 Period)</div>
                <div className="text-brand-slate font-extrabold text-sm">{indicators.rsiVal ? indicators.rsiVal.toFixed(2) : "--"}</div>
              </div>
              
              <div className="p-2 bg-white/40 rounded border border-brand-slate/10 space-y-0.5">
                <div className="text-brand-slate/70 uppercase text-xs tracking-wider font-semibold">Market Regime</div>
                <div className="text-brand-slate font-extrabold text-sm">{currentRegime}</div>
              </div>

              <div className="p-2 bg-white/40 rounded border border-brand-slate/10 space-y-0.5 col-span-2">
                <div className="text-brand-slate/70 uppercase text-xs tracking-wider font-semibold">Bollinger Bands (20, 2)</div>
                <div className="text-brand-slate flex justify-between font-bold text-sm mt-0.5">
                  <span>Lower Limit: {indicators.lower ? indicators.lower.toFixed(2) : "--"}</span>
                  <span>Upper Limit: {indicators.upper ? indicators.upper.toFixed(2) : "--"}</span>
                </div>
              </div>

              <div className="p-2 bg-white/40 rounded border border-brand-slate/10 space-y-0.5">
                <div className="text-brand-slate/70 uppercase text-xs tracking-wider font-semibold">VWAP Midpoint</div>
                <div className="text-brand-slate font-extrabold text-sm">{indicators.vwapVal ? indicators.vwapVal.toFixed(2) : "--"}</div>
              </div>

              <div className="p-2 bg-white/40 rounded border border-brand-slate/10 space-y-0.5">
                <div className="text-brand-slate/70 uppercase text-xs tracking-wider font-semibold">ATR (14 Candles)</div>
                <div className="text-brand-slate font-extrabold text-sm">{indicators.atr ? indicators.atr.toFixed(4) : "--"}</div>
              </div>
            </div>

            <div className="p-3 bg-brand-slate/5 rounded border border-brand-slate/10 text-sm text-brand-slate/85 leading-relaxed font-sans">
              <span className="text-brand-slate font-bold font-mono text-sm block uppercase mb-1">Execution Status</span>
              {isAuthorized ? (
                <p>The engine is streaming live market data and waiting for Bollinger/RSI overextension confluence limits to place trades directly using your authorized credentials.</p>
              ) : (
                <p className="text-brand-slate/90 font-medium">Please specify a valid <code className="bg-brand-slate/10 border border-brand-slate/20 px-1 py-0.5 rounded font-bold text-brand-slate">DERIV_API_TOKEN</code> in your environment parameters to authorize actual live contracts and automatic risk limits.</p>
              )}
            </div>
          </div>

          {/* QUANTITATIVE MODEL ADVISER - GEMINI TERMINAL */}
          <div className="bg-slate-900/25 border border-slate-900 rounded p-5">
            <span className="text-sm uppercase font-mono text-indigo-400 tracking-wider font-semibold flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-purple-400" /> Sovereign AI Analyst
            </span>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Prompt server-side Gemini 3.5-flash to diagnostics pattern drift in volatility indices:
            </p>

            <div className="space-y-3">
              {/* Presets suggestions select panel */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => requestAiReview("Analyze standard Vol volatility profiles Vol 10 vs Vol 75.")}
                  className="w-full text-left p-1.5 rounded bg-slate-950/50 border border-slate-900 text-sm font-mono text-slate-400 hover:text-emerald-400 transition hover:border-emerald-500/20 truncate"
                >
                  💡 Analyze Vol 10 vs Vol 75 profiles
                </button>
                <button
                  onClick={() => requestAiReview("Audit risk rules: Kelly sizing, SL bounds, Martingale failure math.")}
                  className="w-full text-left p-1.5 rounded bg-slate-950/50 border border-slate-900 text-sm font-mono text-slate-400 hover:text-emerald-400 transition hover:border-emerald-500/20 truncate mt-1"
                >
                  💡 Quantitative Risk Audit rules
                </button>
              </div>

              {/* Free-form box prompt */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ask Sovereign AI..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 bg-slate-950 text-slate-200 border border-slate-800 rounded px-2.5 py-1.5 text-sm font-mono outline-none"
                />
                <button
                  onClick={() => requestAiReview()}
                  disabled={aiLoading}
                  className="px-3 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Styled report response block */}
              {aiLoading && (
                <div className="flex items-center justify-center p-6 bg-slate-950/50 border border-slate-900 rounded">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span className="text-sm font-mono text-slate-400 ml-2">Assembling quantitative report...</span>
                </div>
              )}

              {aiReport && (
                <div className="space-y-2">
                  <div className="p-3 bg-slate-950/80 rounded border border-indigo-900/30 text-sm font-mono text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-line selection:bg-indigo-500/40" id="ai-report-content">
                    {aiReport}
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="w-full text-center px-3 py-1.5 bg-indigo-900/50 hover:bg-indigo-800 text-indigo-200 rounded text-xs font-mono transition"
                  >
                    Download / Save as PDF
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Confluence criteria widget panel - Moved here below Sovereign AI Analyst */}
          <div className="bg-slate-900/25 border border-slate-900 rounded p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm uppercase font-mono text-indigo-400 tracking-wider font-semibold">
                Stochastic Filtering Matrix
              </span>
              <span className="text-sm font-mono font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                {confluenceCount}/5 MET
              </span>
            </div>

            <div className="space-y-2.5">
              {Object.keys(confluenceFields).map((key) => {
                const item = confluenceFields[key as keyof typeof confluenceFields];
                return (
                  <div key={key} className="flex items-center justify-between p-2 rounded bg-slate-950/40 text-sm font-mono border border-slate-900/50">
                    <span className="text-slate-300">{item.label}</span>
                    <span className={`font-semibold ${item.met ? "text-emerald-400" : "text-slate-500"}`}>
                      {item.met ? "✓ CONFIRMED" : "• FILTERED"}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Warning comment about absolute values */}
            <div className="mt-3.5 text-xs font-mono text-amber-500 leading-relaxed bg-amber-500/5 p-2 rounded border border-amber-500/10">
              *Warning: RSI boundaries beneath 28 trigger standard stochastic breakdown blocks. Mean reversion fade requires bounded ranges.
            </div>
          </div>

          {/* Sovereign System Report Telemetry Card */}
          <div className="bg-[#0b0f19] border border-cyan-500/30 rounded-xl p-5 shadow-2xl space-y-5 relative overflow-hidden font-mono text-xs">
            {/* Background cyan/indigo ambient light effects */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

            {/* Title / Telemetry Header */}
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-cyan-400 font-bold tracking-widest text-xs uppercase">
                  SOVEREIGN III • ANALYTICAL DIODE
                </span>
              </div>
              <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                MD_ENG_v3.2
              </span>
            </div>

            {reportGenerating ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <div className="text-center space-y-1">
                  <p className="text-[11px] text-cyan-300 tracking-wider animate-pulse">{loaderStep}</p>
                  <p className="text-[9px] text-slate-500 uppercase">DO NOT TERMINATE CLIENT CONNECTION</p>
                </div>
                {/* Simulated digital bar */}
                <div className="w-full bg-slate-950 h-1.5 rounded overflow-hidden border border-slate-800 max-w-[240px]">
                  <div className="bg-cyan-400 h-full animate-[shimmer_1.5s_infinite] w-4/5 rounded" />
                </div>
              </div>
            ) : reportSummary ? (
              <div className="space-y-4">
                {/* Summary narrative */}
                <div className="p-3 bg-slate-950/60 rounded border border-cyan-500/10 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-900 pb-1.5">
                    <span>NARRATIVE INTER-CRITIQUE</span>
                    <span className="text-emerald-400">STATUS: VERIFIED</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px] font-sans">
                    {reportSummary.summary}
                  </p>
                </div>

                {/* Performance stats bento grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                  <div className="p-2 rounded bg-slate-950 border border-slate-900">
                    <span className="block text-slate-500 text-[9px] uppercase">Yields</span>
                    <span className={`block font-bold mt-0.5 ${parseFloat(reportSummary.totalPnl) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      ${reportSummary.totalPnl}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-900">
                    <span className="block text-slate-500 text-[9px] uppercase">Accuracy</span>
                    <span className="block font-bold text-cyan-400 mt-0.5">
                      {reportSummary.winRate}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[#0f172a] border border-cyan-500/15">
                    <span className="block text-slate-400 text-[9px] uppercase">Max Drawdown</span>
                    <span className="block font-bold text-amber-500 mt-0.5">
                      -{reportSummary.maxDrawdown}%
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-900">
                    <span className="block text-slate-500 text-[9px] uppercase">Factor</span>
                    <span className="block font-bold text-[#6366f1] mt-0.5">
                      {reportSummary.profitFactor}
                    </span>
                  </div>
                </div>

                {/* 100-Trade Refinement Milestones */}
                <div className="space-y-2">
                  <span className="text-[10px] uppercase text-cyan-400 font-bold tracking-wider block">
                    100-TRADE SEGMENT REFINEMENT LOG
                  </span>
                  <div className="space-y-1.5">
                    {(reportSummary.milestones || []).map((milestone: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-950/70 border border-slate-900 text-[10px] leading-tight hover:border-cyan-500/20 transition-all">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">#{i + 1}</span>
                          <span className="text-slate-300 font-semibold">Epoch {milestone.batch}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">Win: <b className="text-cyan-400 font-semibold">{milestone.winRate}%</b></span>
                          <span className="text-slate-400">PnL: <b className="text-emerald-400 font-semibold">${milestone.pnl}</b></span>
                          <span className="text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-[9px]">
                            EFF: +{milestone.efficiency}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action panel */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <a
                    href={reportSummary.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-2.5 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 border border-cyan-400/40 hover:border-cyan-400 text-cyan-200 rounded text-[11px] font-bold tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/10 flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> Open Detailed Report PDF
                  </a>
                  <button
                    onClick={handleForceReport}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-400 rounded text-[11px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" /> Re-Diagnose Engine
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-10 h-10 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 text-slate-600">
                  <Cpu className="w-5 h-5 text-cyan-500/50 animate-pulse" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Sovereign Diagnostics Inert</p>
                  <p className="text-slate-500 text-[10px]">Settled trade volume logged: {completedTrades.length || 114} trades</p>
                </div>
                <button
                  onClick={handleForceReport}
                  className="px-5 py-2.5 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-400/30 hover:border-cyan-400 text-cyan-300 rounded text-[10px] uppercase tracking-wider font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> Force Generate Report Summary
                </button>
              </div>
            )}
          </div>

        </section>
      </main>

      </div> {/* end of upper-bg-section */}

      {/* ==========================================
          LOWER SECTION: SYSTEM LOGS & HISTORICAL trade ledger (Custom background sections)
          ========================================== */}
      <div id="lower-bg-section" className="w-full bg-[#121614]/85 backdrop-blur-md border border-brand-slate/45 rounded-2xl p-5 md:p-6 lg:p-8 bg-cover bg-center bg-no-repeat transition-all shadow-xl" style={{ backgroundImage: "linear-gradient(rgba(17, 21, 19, 0.88), rgba(17, 21, 19, 0.88)), url('/input_file_0.png')" }}>
        <footer className="w-full max-w-none grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LOGS TERMINAL & SELF-IMPROVEMENT STACKS (SPAN 4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Logs Terminal Card */}
            <section className="bg-slate-900/25 border border-slate-900 rounded p-5 flex flex-col h-[520px]">
              <div className="flex justify-between items-center mb-3.5">
                <span className="text-sm uppercase font-mono text-indigo-400 tracking-wider font-semibold flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5" /> Engine System log streams
                </span>
                <button
                  onClick={forceReset}
                  className="text-[10px] font-mono font-bold text-red-400 bg-red-950/20 hover:bg-red-950/50 px-2.5 py-1 rounded border border-red-550/30 transition cursor-pointer"
                  title="Wipe current metrics from engine, reset balance, and purge database logs"
                >
                  RESET METRICS & WIPE LOGS
                </button>
              </div>

              <div ref={logsContainerRef} className="w-full flex-1 bg-slate-950 rounded border border-slate-900 p-3 overflow-y-auto font-mono text-xs text-slate-400 space-y-1 scroll-smooth">
                {logs.map((log, idx) => {
                  // Highlight based on log severity
                  let color = "text-slate-400";
                  if (log.includes("[ORDER_EXEC]")) color = "text-indigo-400 font-semibold";
                  if (log.includes("[CONTRACT_SETTLED]") && log.includes("+")) color = "text-emerald-400";
                  if (log.includes("[CONTRACT_SETTLED]") && log.includes("-")) color = "text-rose-400 font-medium";
                  if (log.includes("[BREAKER_ACT]")) color = "text-yellow-400 font-bold";
                  if (log.includes("[ADAPTIVE_ENGINE]")) color = "text-purple-400";

                  return (
                    <div key={idx} className={`${color} leading-relaxed border-b border-slate-950/20 pb-0.5 last:border-0`}>
                      {log}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Self-Improving Brain & Tuning Lab */}
            <section className="bg-slate-900/25 border border-slate-900 rounded p-5 space-y-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm uppercase font-mono text-brand-peach tracking-wider font-bold flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-brand-peach animate-pulse" /> Self-Improving Process Lab
                </span>
                <p className="text-xs text-slate-400 font-sans leading-relaxed">
                  Active walk-forward calibrations, dynamic strategy tuning, and parameter optimization done automatically to sub-algorithms.
                </p>
              </div>

              {/* Active Sub Algos State Table */}
              <div className="bg-slate-950/50 border border-slate-900 rounded-lg p-3 space-y-2.5 max-h-56 overflow-y-auto">
                <span className="text-[10px] uppercase font-mono text-slate-500 font-bold block pb-1 border-b border-slate-900/50">
                  Active Strategy Directives
                </span>
                {Object.values(subAlgorithms).length === 0 ? (
                  <div className="text-xs text-slate-600 font-mono py-2 text-center">Waiting for motherboard...</div>
                ) : (
                  Object.values(subAlgorithms).map((sub: any) => {
                    let bulletColor = "bg-amber-500 shadow-[0_0_6px_#f59e0b]";
                    let statusColor = "text-indigo-400";
                    let textStyle = "text-slate-300";
                    const msg = sub.directiveMessage || "STABLE PILOT: Monitoring price levels and accumulating warmup logs";

                    if (msg.includes("DEFENSIVE")) {
                      bulletColor = "bg-rose-500 shadow-[0_0_6px_#f43f5e]";
                      statusColor = "text-rose-400";
                      textStyle = "text-rose-200/90";
                    } else if (msg.includes("COMPOUNDING")) {
                      bulletColor = "bg-emerald-500 shadow-[0_0_6px_#10b981]";
                      statusColor = "text-emerald-400";
                      textStyle = "text-emerald-200/90";
                    } else if (msg.includes("STABLE")) {
                      bulletColor = "bg-indigo-400 shadow-[0_0_6px_#818cf8]";
                      statusColor = "text-indigo-400";
                      textStyle = "text-slate-300";
                    }

                    return (
                      <div key={sub.symbol} className="flex gap-2 items-start border-b border-slate-900/40 pb-2 last:border-0 last:pb-0">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${bulletColor}`} />
                        <div className="flex flex-col text-xs font-mono">
                          <span className="font-bold text-slate-200 flex items-center gap-1.5">
                            {sub.symbol} <span className="text-[9px] font-normal text-slate-500">({sub.personality})</span>
                          </span>
                          <span className={`text-[11px] leading-relaxed font-sans ${textStyle} mt-0.5`}>
                            {msg}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Governor Police Logs */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-mono text-slate-500 font-bold block">
                  Motherboard Optimization Stream
                </span>
                <div className="w-full h-44 bg-slate-950 rounded border border-slate-900 p-3 overflow-y-auto font-mono text-xs text-slate-400 space-y-1.5 scroll-smooth border-dashed">
                  {(() => {
                    const mlLogs = logs.filter(log => log.includes("[GOVERNOR_POLICE]") || log.includes("[ADAPTIVE_ENGINE]"));
                    if (mlLogs.length === 0) {
                      return <div className="text-slate-600 text-center py-10 font-mono text-[11px]">No walk-forward calibrations registered in this session yet. Adjustments will trigger after a set of filled contracts.</div>;
                    }
                    return mlLogs.slice(-100).map((log, idx) => {
                      let color = "text-purple-400";
                      if (log.includes("⚠️") || log.includes("reduced")) color = "text-amber-400";
                      if (log.includes("🚀") || log.includes("Upgrading") || log.includes("boosting")) color = "text-emerald-400";
                      if (log.includes("⚖️")) color = "text-indigo-300";
                      if (log.includes("🤖")) color = "text-sky-300 font-semibold";
                      return (
                        <div key={idx} className={`${color} leading-relaxed border-b border-slate-950/40 pb-1 last:border-0 last:pb-0`}>
                          {log}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </section>

          </div>

        {/* LEDGER SETTLED TABLE (SPAN 8) */}
        <section className="lg:col-span-8 bg-slate-900/25 border border-slate-900 rounded p-5 flex flex-col justify-between">
          <div>
            <span className="text-sm uppercase font-mono text-indigo-400 tracking-wider font-semibold flex items-center gap-1.5 mb-3.5">
              <Award className="w-3.5 h-3.5" /> Live Settlement Ledger & Trade History
            </span>

            <div className="w-full h-[520px] overflow-y-auto overflow-x-auto border border-slate-900/60 rounded bg-slate-950/40">
              <table className="w-full border-collapse font-mono text-sm text-slate-400 min-w-[700px]">
                <thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Instrument & Type</th>
                    <th className="px-3 py-2 text-left font-semibold">Direction</th>
                    <th className="px-3 py-2 text-left font-semibold">Entry / Exit Times</th>
                    <th className="px-3 py-2 text-left font-semibold">Execution Prices</th>
                    <th className="px-3 py-2 text-right font-semibold">Stake</th>
                    <th className="px-3 py-2 text-left font-semibold">Indicators @ Entry</th>
                    <th className="px-3 py-2 text-left font-semibold">Regime / Reason</th>
                    <th className="px-3 py-2 text-right font-semibold">PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60">
                  {completedTrades.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-24 text-slate-500 text-sm">
                        Lobbying settled trade histories first...
                      </td>
                    </tr>
                  ) : (
                    completedTrades.slice().reverse().map((t, idx) => {
                      const isWin = t.pnl >= 0;
                      
                      // Instrument Name mapper helper
                      const instName = INSTRUMENTS[t.symbol as keyof typeof INSTRUMENTS]?.name || t.symbol;

                      // Format epoch times
                      const entryTime = new Date(t.entryEpoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      const exitTime = new Date(t.exitEpoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      const entryDate = new Date(t.entryEpoch * 1000).toLocaleDateString([], { month: '2-digit', day: '2-digit' });

                      return (
                        <tr key={`${t.id}-${idx}`} className="hover:bg-slate-900/30 transition-colors">
                          {/* Instrument */}
                          <td className="px-3 py-2 text-left align-middle">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-200">{t.symbol}</span>
                              <span className="text-xs text-slate-500 font-light truncate max-w-[110px]" title={instName}>
                                {instName}
                              </span>
                            </div>
                          </td>

                          {/* Direction */}
                          <td className="px-3 py-2 text-left align-middle">
                            <span className={`px-2 py-0.5 rounded text-xs font-extrabold ${
                              t.direction === "LONG" 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" 
                                : "bg-red-500/10 text-red-400 border border-red-500/15"
                            }`}>
                              {t.direction}
                            </span>
                          </td>

                          {/* Entry/Exit Times */}
                          <td className="px-3 py-2 text-left align-middle text-slate-400 font-light">
                            <div className="flex flex-col leading-tight">
                              <span>In: <span className="text-slate-300">{entryDate} {entryTime}</span></span>
                              <span>Out: <span className="text-slate-500">{exitTime}</span></span>
                            </div>
                          </td>

                          {/* Execution Prices */}
                          <td className="px-3 py-2 text-left align-middle">
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span>{t.entryPrice.toFixed(2)}</span>
                              <span className="text-slate-600">→</span>
                              <span className={isWin ? "text-emerald-400/90 font-medium" : "text-red-400/90 font-medium"}>
                                {t.exitPrice.toFixed(2)}
                              </span>
                            </div>
                          </td>

                          {/* Stake */}
                          <td className="px-3 py-2 text-right align-middle text-slate-300 font-semibold">
                            ${t.stake.toFixed(2)}
                          </td>

                          {/* Indicator specs */}
                          <td className="px-3 py-2 text-left align-middle text-slate-400 font-light">
                            <div className="flex flex-col leading-tight text-xs">
                              <span>RSI: <span className="font-mono text-slate-300 font-medium">{t.rsiAtEntry ? t.rsiAtEntry.toFixed(1) : "N/A"}</span></span>
                              <span>%B: <span className="font-mono text-slate-300 font-medium">{t.bbPctAtEntry ? (t.bbPctAtEntry * 100).toFixed(0) : "0"}%</span></span>
                              <span>ADX: <span className="font-mono text-slate-300 font-medium">{t.adxAtEntry ? t.adxAtEntry.toFixed(0) : "0"}</span></span>
                            </div>
                          </td>

                          {/* Regime / Exit Reason */}
                          <td className="px-3 py-2 text-left align-middle">
                            <div className="flex flex-col gap-0.5 leading-tight">
                              <span className="text-xs text-indigo-400 font-semibold uppercase">{t.regimeAtEntry ? t.regimeAtEntry.replace('_', ' ') : "NORMAL"}</span>
                              <span className="text-slate-500 lowercase text-xs italic">{t.exitReason ? t.exitReason.replace('_', ' ') : "settled"}</span>
                            </div>
                          </td>

                          {/* PNL Result */}
                          <td className="px-3 py-2 text-right align-middle">
                            <span className={`px-2 py-0.5 rounded text-sm font-bold ${
                              isWin 
                                ? "bg-emerald-500/10 text-emerald-400 font-bold" 
                                : "bg-red-500/10 text-red-500"
                            }`}>
                              {isWin ? "+" : ""}${t.pnl.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Cumulative Algorithm Performance Curve */}
            <div className="mt-6 pt-5 border-t border-slate-950/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex flex-col">
                  <span className="text-sm uppercase font-mono text-indigo-400 tracking-wider font-bold">
                    📈 Algorithmic Equity Growth & Cumulative PnL Curve
                  </span>
                  <span className="text-sm text-slate-500 font-sans mt-0.5">
                    Real-time consolidated yield metrics tracking governor executions.
                  </span>
                </div>
                
                {completedTrades.length > 0 && (
                  <div className="flex items-center gap-4 text-sm font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Gross Return:</span>
                      <span className={`font-bold ${completedTrades.reduce((sum, t) => sum + t.pnl, 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {completedTrades.reduce((sum, t) => sum + t.pnl, 0) >= 0 ? "+" : ""}${completedTrades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500">Total Runs:</span>
                      <span className="text-slate-200 font-bold">{completedTrades.length} Trades</span>
                    </div>
                  </div>
                )}
              </div>

              {completedTrades.length === 0 ? (
                <div className="h-[420px] flex items-center justify-center border border-dashed border-slate-900 rounded bg-slate-950/20">
                  <span className="text-slate-600 text-sm font-mono uppercase tracking-widest animate-pulse">
                    Awaiting trade settlement streams for performance curve mapping...
                  </span>
                </div>
              ) : (
                <div className="h-[420px] w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={(() => {
                        let total = 0;
                        return [
                          { name: "INIT", cumulative: 0, pnl: 0, label: "Start" },
                          ...completedTrades.map((t, index) => {
                            total = parseFloat((total + t.pnl).toFixed(2));
                            return {
                              name: `#${index + 1}`,
                              cumulative: total,
                              pnl: t.pnl,
                              label: `${t.symbol} (${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(1)})`
                            };
                          })
                        ];
                      })()}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#475569" 
                        fontSize={8} 
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#475569" 
                        fontSize={8} 
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "#1e1b4b",
                          fontSize: "9px",
                          fontFamily: "monospace",
                          borderRadius: "4px",
                          color: "#cbd5e1"
                        }}
                        itemStyle={{ color: "#a5b4fc" }}
                        labelStyle={{ color: "#818cf8", fontWeight: "bold" }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="cumulative" 
                        stroke="#6366f1" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorPnL)" 
                        name="Cumulative Balance Growth ($)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ==========================================
            PHASE 2: ANALYTICS, DISTRIBUTIONS & MACRO RISK
            ========================================== */}
        <section className="lg:col-span-12 w-full grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6 min-w-0">
          
          {/* LEFT SIDE: Leaderboards & Distributions */}
          <div className="flex flex-col gap-6 min-w-0">
            {/* LEADERBOARDS & EFFICACY */}
            <div className="bg-slate-900/25 border border-slate-900 rounded p-5 flex flex-col">
              <span className="text-sm uppercase font-mono text-fuchsia-400 tracking-wider font-semibold flex items-center gap-1.5 mb-4 border-b border-slate-800 pb-2">
                <Award className="w-3.5 h-3.5" /> Sub-Algorithm Leaderboards & Efficacy
              </span>
              
              {completedTrades.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-slate-500 font-mono text-xs uppercase animate-pulse">
                  Awaiting algorithmic trade executions...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm font-mono text-slate-400">
                    <thead className="bg-[#121614] text-slate-500 text-[10px] uppercase border-y border-slate-900/60 shadow-lg">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Sub-Model (Asset)</th>
                        <th className="px-3 py-2 text-center font-semibold">Trades</th>
                        <th className="px-3 py-2 text-center font-semibold">Efficacy %</th>
                        <th className="px-3 py-2 text-right font-semibold">Net Yield</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {(() => {
                        const map: Record<string, { trades: number, wins: number, pnl: number }> = {};
                        completedTrades.forEach(t => {
                          if (!map[t.symbol]) map[t.symbol] = { trades: 0, wins: 0, pnl: 0 };
                          map[t.symbol].trades++;
                          if (t.pnl > 0) map[t.symbol].wins++;
                          map[t.symbol].pnl += t.pnl;
                        });
                        const rows = Object.entries(map).sort((a,b) => b[1].pnl - a[1].pnl);
                        return rows.map(([sym, d], i) => (
                          <tr key={sym} className="hover:bg-slate-950/40 transition-colors">
                            <td className="px-3 py-2">
                              <span className="text-slate-300 font-bold">{sym}</span>
                              <span className="text-[10px] text-slate-500 hidden sm:block truncate max-w-[120px]">
                                {INSTRUMENTS[sym as keyof typeof INSTRUMENTS]?.name || sym}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-indigo-300">{d.trades}</td>
                            <td className="px-3 py-2 text-center font-bold">
                              {(d.trades > 0 ? (d.wins / d.trades) * 100 : 0).toFixed(1)}%
                            </td>
                            <td className={`px-3 py-2 text-right font-bold ${d.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {d.pnl >= 0 ? "+" : ""}${d.pnl.toFixed(2)}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* OUTCOME & EXECUTION DISTRIBUTION */}
            <div className="bg-slate-900/25 border border-slate-900 rounded p-5 flex flex-col flex-1">
              <span className="text-sm uppercase font-mono text-cyan-400 tracking-wider font-semibold flex items-center gap-1.5 mb-4 border-b border-slate-800 pb-2">
                <PieChart className="w-3.5 h-3.5" /> Outcome & Execution Distribution
              </span>
              
              {completedTrades.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs uppercase animate-pulse mt-4">
                  No distributions processed.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  {/* Long vs Short PnL breakdown */}
                  <div className="bg-slate-950/30 border border-slate-900 rounded p-3">
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-3 text-center border-b border-slate-900 pb-1">Directional Bias</span>
                    <div className="h-[120px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(() => {
                            const longWins = completedTrades.filter(t => t.direction === "LONG" && t.pnl > 0).length;
                            const longLoss = completedTrades.filter(t => t.direction === "LONG" && t.pnl <= 0).length;
                            const shortWins = completedTrades.filter(t => t.direction === "SHORT" && t.pnl > 0).length;
                            const shortLoss = completedTrades.filter(t => t.direction === "SHORT" && t.pnl <= 0).length;
                            return [
                              { name: 'LONG', Wins: longWins, Loss: longLoss },
                              { name: 'SHORT', Wins: shortWins, Loss: shortLoss }
                            ];
                          })()}
                          margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                        >
                          <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} stroke="#64748b" />
                          <RechartsTooltip contentStyle={{ backgroundColor:"#020617", fontSize: '10px', borderColor:"#1e293b", color: "#cbd5e1" }} itemStyle={{color: "#38bdf8"}}/>
                          <Bar dataKey="Wins" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                          <Bar dataKey="Loss" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Exit Reason breakdown */}
                  <div className="bg-slate-950/30 border border-slate-900 rounded p-3">
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-3 text-center border-b border-slate-900 pb-1">Settlement Catalyst</span>
                    <div className="h-[120px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={(() => {
                            const reasons: Record<string, number> = {};
                            completedTrades.forEach(t => {
                              reasons[t.exitReason] = (reasons[t.exitReason] || 0) + 1;
                            });
                            return Object.entries(reasons).map(([k, v]) => ({ name: k.replace('_', ' '), count: v }));
                          })()}
                          margin={{ top: 0, right: 10, left: -10, bottom: 0 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={75} fontSize={8} tickLine={false} axisLine={false} stroke="#64748b" />
                          <RechartsTooltip contentStyle={{ backgroundColor:"#020617", fontSize: '10px', borderColor:"#1e293b", color: "#cbd5e1" }} itemStyle={{color: "#c084fc"}}/>
                          <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]}>
                            {completedTrades.length > 0 && (() => {
                              const reasons: Record<string, number> = {};
                              completedTrades.forEach(t => reasons[t.exitReason] = (reasons[t.exitReason] || 0) + 1);
                              return Object.entries(reasons).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={["#a855f7", "#3b82f6", "#14b8a6", "#f59e0b"][index % 4]} />
                              ));
                            })()}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE: MACRO RISK FOCUS & VOLATILITY EQUITY CURVE */}
          <div className="bg-slate-900/40 border border-indigo-900/30 rounded p-5 flex flex-col justify-between overflow-hidden shadow-2xl relative min-w-0">
            <div className="absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-t from-indigo-950/20 to-transparent pointer-events-none" />
            <div className="flex flex-col xl:flex-row items-center justify-between z-10 space-y-4 xl:space-y-0">
              <div className="text-center xl:text-left">
                <span className="text-sm uppercase font-mono text-indigo-400 tracking-widest font-bold flex items-center justify-center xl:justify-start gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" /> Macro Risk & Volatility Dispersion
                </span>
                <span className="text-xs text-slate-500 font-sans block mt-1">
                  Absolute capital variance and Sharpe-weighted distribution profiling across the session.
                </span>
              </div>
              
              {completedTrades.length > 0 && (() => {
                const wins = completedTrades.filter(t => t.pnl > 0);
                const losses = completedTrades.filter(t => t.pnl <= 0);
                const grossWins = wins.reduce((sum, t) => sum + t.pnl, 0);
                const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
                const pf = grossLosses === 0 ? (grossWins > 0 ? "3.00+" : "0.00") : (grossWins / grossLosses).toFixed(2);
                
                return (
                  <div className="flex bg-[#0f1411] border border-slate-800 rounded-lg shadow-inner shadow-black/50 p-2 gap-2 sm:gap-4 shrink-0">
                    <div className="flex flex-col items-center justify-center px-2 sm:px-4">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Profit Factor</span>
                      <span className={`text-sm font-bold font-mono ${parseFloat(pf) >= 1.5 ? "text-emerald-400" : (parseFloat(pf) >= 1.0 ? "text-indigo-300" : "text-rose-400")}`}>{pf}</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-px h-6 bg-slate-800" />
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 sm:px-4">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Drawdown Risk</span>
                      <span className="text-sm font-bold font-mono text-rose-500">{stats.maxDrawdown}%</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-px h-6 bg-slate-800" />
                    </div>
                    <div className="flex flex-col items-center justify-center px-2 sm:px-4">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Max Return</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">
                        +${wins.length > 0 ? Math.max(...wins.map(w => w.pnl)).toFixed(2) : "0.00"}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Drawdown relative map */}
            <div className="flex-1 w-full pt-8 z-10 min-h-[350px]">
              {completedTrades.length < 2 ? (
                <div className="w-full h-full flex items-center justify-center border border-dashed border-slate-900 rounded bg-slate-950/20">
                  <span className="text-slate-600 text-xs font-mono uppercase tracking-widest animate-pulse">Waiting for sufficient population...</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={completedTrades.map((t, idx) => ({
                      name: `T${idx+1}`,
                      value: t.pnl,
                      fill: t.pnl > 0 ? "#10b981" : "#ef4444"
                    }))}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" vertical={false} />
                    <XAxis dataKey="name" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <RechartsTooltip 
                       contentStyle={{ backgroundColor:"#020617", fontSize: '10px', borderColor:"#1e293b", color: "#cbd5e1" }}
                       cursor={{fill: "#1e293b", opacity: 0.4}}
                    />
                    <Bar dataKey="value" name="Tick Settlement Return">
                      {completedTrades.map((t, index) => (
                        <Cell key={`cell-${index}`} fill={t.pnl >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </section>

      </footer>

      </div> {/* end of lower-bg-section */}

      {/* ==========================================
          TACTICAL SUBPROCESS DETAILED CONTROL PANEL
          ========================================== */}
      {selectedSubSymbol && subAlgorithms[selectedSubSymbol] && (() => {
        const sub = subAlgorithms[selectedSubSymbol];
        const titleName = INSTRUMENTS[selectedSubSymbol as keyof typeof INSTRUMENTS]?.name || selectedSubSymbol;
        
        // Filter trades specifically taken by this symbol
        const subTrades = completedTrades.filter(t => t.symbol === selectedSubSymbol);
        const subActive = activePositions.filter(p => p.symbol === selectedSubSymbol);
        
        return (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-950 border border-slate-900 rounded-xl max-w-4xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden">
              
              {/* HEADER */}
              <div className="flex items-center justify-between border-b border-slate-900 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wide">
                      {selectedSubSymbol} — {sub.personality} (Subprocess {sub.enabled ? "RUNNING" : "PAUSED"})
                    </h3>
                    <p className="text-sm text-slate-500 font-sans">
                      Tactical engine mapping to asset: <span className="text-slate-300 font-medium">{titleName}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSubSymbol(null)}
                  className="p-1 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm font-mono border border-slate-900/80 hover:border-slate-800 transition-colors pointer-events-auto"
                >
                  X CLOSE
                </button>
              </div>

              {/* DYNAMIC TELEMETRY KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-900/10 p-5 border-b border-slate-900/80">
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900">
                  <span className="text-sm uppercase text-slate-500 font-mono">Win Rate</span>
                  <div className="text-emerald-400 font-bold font-mono text-base mt-0.5">
                    {(sub.recentWinRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900">
                  <span className="text-sm uppercase text-slate-500 font-mono">Total P&L</span>
                  <div className={`font-bold font-mono text-base mt-0.5 ${sub.totalPnl >= 0 ? "text-emerald-400" : "text-red-500"}`}>
                    {sub.totalPnl >= 0 ? "+" : ""}${sub.totalPnl.toFixed(2)}
                  </div>
                </div>
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900">
                  <span className="text-sm uppercase text-slate-500 font-mono">Completed Trades</span>
                  <div className="text-slate-200 font-mono font-medium text-base mt-0.5">
                    {sub.totalTrades}
                  </div>
                </div>
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900">
                  <span className="text-sm uppercase text-slate-500 font-mono">Active Handlers</span>
                  <div className="text-slate-200 font-mono font-medium text-base mt-0.5">
                    {subActive.length} positions
                  </div>
                </div>
                <div className="bg-slate-900/30 p-2.5 rounded border border-slate-900 col-span-2 md:col-span-1">
                  <span className="text-sm uppercase text-slate-500 font-mono">Market Regime</span>
                  <div className="text-indigo-400 font-bold font-mono text-sm uppercase mt-1">
                    {sub.mRegime ? sub.mRegime.replace('_', ' ') : "NORMAL CONSOLIDATION"}
                  </div>
                </div>
              </div>

              {/* TAB SELECTOR */}
              <div className="flex border-b border-slate-900 px-6">
                <button
                  onClick={() => setModalTab("tuner")}
                  className={`py-3 px-4 text-sm font-mono tracking-wider border-b-2 font-semibold transition-all cursor-pointer ${
                    modalTab === "tuner" 
                      ? "border-indigo-500 text-indigo-400 font-bold" 
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Indicator Tuner & Parameters
                </button>
                <button
                  onClick={() => setModalTab("history")}
                  className={`py-3 px-4 text-sm font-mono tracking-wider border-b-2 font-semibold transition-all cursor-pointer ${
                    modalTab === "history" 
                      ? "border-indigo-500 text-indigo-400" 
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Subprocess Trade History ({subTrades.length + subActive.length})
                </button>
              </div>

              {/* MAIN CONTENT AREA */}
              <div className="flex-1 overflow-y-auto p-6">
                {modalTab === "tuner" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* TUNING FORM */}
                    <div className="lg:col-span-7 bg-slate-900/10 border border-slate-900 p-5 rounded-lg space-y-4">
                      <h4 className="text-base font-bold font-mono uppercase text-slate-300 tracking-wider pb-2 border-b border-slate-900/80">
                        Operational Boundaries Parameters
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                        <div>
                          <label className="text-slate-500 block mb-1">RSI Oversold Boundary ({editOversold})</label>
                          <input 
                            type="range" 
                            min="20" 
                            max="45" 
                            value={editOversold}
                            onChange={(e) => setEditOversold(Number(e.target.value))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 block mb-1">RSI Overbought Boundary ({editOverbought})</label>
                          <input 
                            type="range" 
                            min="55" 
                            max="80" 
                            value={editOverbought}
                            onChange={(e) => setEditOverbought(Number(e.target.value))}
                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                        <div>
                          <label className="text-slate-500 block mb-1.5">Bollinger Bands Period</label>
                          <input 
                            type="number" 
                            min="10" 
                            max="50" 
                            value={editBbPeriod}
                            onChange={(e) => setEditBbPeriod(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-900 px-2.5 py-1.5 text-slate-300 rounded outline-none focus:border-indigo-500 text-base"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 block mb-1.5">Standard Deviation multiplier</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            min="1.0" 
                            max="3.5" 
                            value={editBbStd}
                            onChange={(e) => setEditBbStd(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-900 px-2.5 py-1.5 text-slate-300 rounded outline-none focus:border-indigo-500 text-base"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 font-mono text-sm">
                        <div>
                          <label className="text-slate-500 block mb-1.5">Min Signal Confluence</label>
                          <select
                            value={editMinConfluence}
                            onChange={(e) => setEditMinConfluence(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-900 px-2.5 py-1.5 text-slate-300 rounded outline-none focus:border-indigo-500 text-base h-[34px]"
                          >
                            <option value="2">2 of 5 signals</option>
                            <option value="3">3 of 5 signals</option>
                            <option value="4">4 of 5 signals</option>
                            <option value="5">5 of 5 signals</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-500 block mb-1.5">ATR Volatility Stop Mult</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            min="1.0" 
                            max="4.0" 
                            value={editAtrStop}
                            onChange={(e) => setEditAtrStop(Number(e.target.value))}
                            className="w-full bg-slate-950 border border-slate-900 px-2.5 py-1.5 text-slate-300 rounded outline-none focus:border-indigo-500 text-base"
                          />
                        </div>
                      </div>

                      {/* NEW INTEGRATIVE POSITION SIZING CONTROLS */}
                      <div className="p-3.5 bg-slate-950 border border-indigo-500/10 rounded-md font-mono space-y-3">
                        <span className="text-sm font-bold text-indigo-400 block uppercase tracking-wider">
                          🛠️ Adjustive Position Risk Management Override
                        </span>

                        <div className="flex items-center justify-between p-2.5 bg-indigo-500/5 hover:bg-indigo-500/10 rounded border border-indigo-500/15 transition-all mb-1 select-none">
                          <span className="text-sm text-zinc-300 font-bold uppercase tracking-wider">Subprocess Engine Operational State</span>
                          <button
                            type="button"
                            onClick={() => setEditEnabled(!editEnabled)}
                            className={`px-3 py-1 font-bold text-sm uppercase tracking-wide rounded cursor-pointer transition-all border ${
                              editEnabled 
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium hover:bg-emerald-500/25" 
                                : "bg-red-500/15 text-red-400 border-red-500/30 font-medium hover:bg-red-500/25"
                            }`}
                          >
                            {editEnabled ? "🟢 ACTIVE (RUNNING)" : "🔴 PAUSED (STANDBY)"}
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <label className="text-slate-500 block mb-1">
                              Max Loss Budget (% of Stake)
                            </label>
                            <select
                              value={editTargetLoss}
                              onChange={(e) => setEditTargetLoss(Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-800 px-2 py-1 text-slate-300 rounded outline-none text-base h-[32px]"
                            >
                              <option value="0.05">5% Max Risk (Ultra Conservative)</option>
                              <option value="0.10">10% Max Risk (Conservative)</option>
                              <option value="0.15">15% Max Risk (Moderate Aegis)</option>
                              <option value="0.20">20% Max Risk (Robust Compounder)</option>
                              <option value="0.30">30% Max Risk (Balanced Volatility)</option>
                              <option value="0.40">40% Max Risk (Maximum Allocation)</option>
                            </select>
                            <span className="text-xs text-slate-600 mt-1 block leading-snug font-sans">
                              Determines exact multiplier / leverage sizer dynamically at entry.
                            </span>
                          </div>

                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox"
                                id="chkTimeExit"
                                checked={editTimeExit}
                                onChange={(e) => setEditTimeExit(e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-805 accent-brand-mint text-brand-mint cursor-pointer"
                              />
                              <label htmlFor="chkTimeExit" className="text-brand-slate text-sm font-semibold cursor-pointer select-none">
                                Enable Time-out Exits
                              </label>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox"
                                id="chkBreakEven"
                                checked={editBreakEven}
                                onChange={(e) => setEditBreakEven(e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-805 accent-brand-mint text-brand-mint cursor-pointer"
                              />
                              <label htmlFor="chkBreakEven" className="text-brand-slate text-sm font-semibold cursor-pointer select-none">
                                Enable Break Even (40% to TP)
                              </label>
                            </div>

                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox"
                                id="chkTrailingStop"
                                checked={editTrailingStop}
                                onChange={(e) => setEditTrailingStop(e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-805 accent-brand-mint text-brand-mint cursor-pointer"
                              />
                              <label htmlFor="chkTrailingStop" className="text-brand-slate text-sm font-semibold cursor-pointer select-none">
                                Enable Trailing Stop (Activates post-BE)
                              </label>
                            </div>

                            <div className="mt-2 text-left">
                              <label className="text-brand-slate/80 text-sm block mb-1">Max Traded Time ticks limit</label>
                              <input 
                                type="number" 
                                min="100" 
                                max="3000" 
                                step="50"
                                disabled={!editTimeExit}
                                value={editMaxTicks}
                                onChange={(e) => setEditMaxTicks(Number(e.target.value))}
                                className="w-full bg-[#1A201C] border border-[#2c3531]/60 px-2 py-1 text-slate-300 rounded outline-none text-base disabled:opacity-40"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm border-t border-slate-900/60 pt-3">
                          <div>
                            <label className="text-slate-500 block mb-1">
                              Stake Factor Multiplier ({editRiskMultiplier.toFixed(1)}x)
                            </label>
                            <input 
                              type="range" 
                              min="0.1" 
                              max="3.0" 
                              step="0.1"
                              value={editRiskMultiplier}
                              onChange={(e) => setEditRiskMultiplier(Number(e.target.value))}
                              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <span className="text-xs text-slate-600 mt-1 block leading-snug font-sans">
                              Scales Kelly formula allocations for this asset.
                            </span>
                          </div>

                          <div>
                            <label className="text-slate-500 block mb-1">
                              Self-Optimization Intensity ({editLearningFactor.toFixed(1)}x)
                            </label>
                            <input 
                              type="range" 
                              min="0.5" 
                              max="2.0" 
                              step="0.1"
                              value={editLearningFactor}
                              onChange={(e) => setEditLearningFactor(Number(e.target.value))}
                              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <span className="text-xs text-slate-600 mt-1 block leading-snug font-sans">
                              Overrides parameter adjustments shift aggression rate.
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => setSelectedSubSymbol(null)}
                          className="px-4 py-2 bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-850 hover:bg-slate-800 text-base font-mono rounded font-medium cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveSubAlgConfig}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-base font-mono rounded font-bold cursor-pointer transition-colors border border-indigo-500"
                        >
                          Commit Recalibrated Parameters
                        </button>
                      </div>

                    </div>

                    {/* DYNAMIC TELEMETRY ANALYTICS */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-4 font-mono">
                      
                      {/* REAL-TIME OVERVIEW STATUS */}
                      <div className="border border-slate-900 bg-slate-950/45 p-4 rounded-lg">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-slate-900">
                          Live Sensor Feed Telemetry
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-slate-500">Asset Spot Value:</span>
                            <span className="text-slate-200 font-bold">
                              {sub.rsiVal ? (INSTRUMENTS[selectedSubSymbol as keyof typeof INSTRUMENTS]?.basePrice || 100).toFixed(2) : "Calculating..."}
                            </span>
                          </div>
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-slate-500">RSI Indicator:</span>
                            <span className={`font-bold ${sub.rsiVal <= sub.rsiOversoldThreshold ? "text-emerald-400" : sub.rsiVal >= sub.rsiOverboughtThreshold ? "text-red-400" : "text-indigo-400"}`}>
                              {sub.rsiVal ? sub.rsiVal.toFixed(2) : "Calculating..."}
                            </span>
                          </div>
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-slate-500">BB %B Coordinate:</span>
                            <span className="text-slate-200 font-bold">
                              {(sub.bbPct * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-slate-500">Index Wave Direction (ADX):</span>
                            <span className="text-slate-200 font-bold">
                              {sub.adxVal ? sub.adxVal.toFixed(2) : "N/A"} (Trend: {sub.adxVal > 25 ? "STRONG" : "NORMAL"})
                            </span>
                          </div>
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-slate-500">ATR Volatility Index value:</span>
                            <span className="text-slate-200 font-semibold">{sub.atrVal ? sub.atrVal.toFixed(4) : "N/A"}</span>
                          </div>
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-[#c084fc]">Hurst DFA-1 (Rolling):</span>
                            <span className="text-purple-400 font-bold">
                              {sub.hurstVal !== undefined ? sub.hurstVal.toFixed(3) : "N/A"}{" "}
                              <span className="text-slate-500 text-xs font-normal">(R²: {sub.hurstRSquared !== undefined ? sub.hurstRSquared.toFixed(4) : "N/A"})</span>
                            </span>
                          </div>
                          <div className="flex justify-between pb-1 border-b border-slate-900/40">
                            <span className="text-indigo-400">Hurst R/S (Confirmation):</span>
                            <span className="text-indigo-300 font-bold">{sub.hurstConfirm !== undefined ? sub.hurstConfirm.toFixed(3) : "N/A"}</span>
                          </div>
                          {sub.hurstMacro !== undefined && (
                            <div className="flex justify-between pb-1 border-b border-slate-900/40">
                              <span className="text-sky-400">Hurst Macro (2k-tick):</span>
                              <span className="text-sky-300 font-bold">{sub.hurstMacro.toFixed(3)}</span>
                            </div>
                          )}
                          {sub.convictionScore !== undefined && (
                            <div className="flex justify-between pb-1 border-b border-slate-900/40">
                              <span className="text-emerald-400 font-semibold">SFT-V2 Convición Score:</span>
                              <span className="text-emerald-300 font-black">{(sub.convictionScore * 100).toFixed(1)}%</span>
                            </div>
                          )}
                          {sub.tailExponent !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-rose-400 font-semibold">Tail α̂ (Hill Exponent):</span>
                              <span className={`font-black ${
                                sub.tailExponent >= 3.0 ? "text-emerald-400" :
                                sub.tailExponent >= 2.2 ? "text-amber-400" :
                                "text-rose-500 animate-pulse"
                              }`}>
                                {sub.tailExponent.toFixed(3)}{" "}
                                <span className="text-[10px] font-normal opacity-80">
                                  ({
                                    sub.tailExponent >= 3.0 ? "Moderate" :
                                    sub.tailExponent >= 2.2 ? "Heavy" :
                                    "Critical (Extreme)"
                                  })
                                </span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ADAPTIVE RISK MATHEMATICS SHEET */}
                      {(() => {
                        const spotPrice = INSTRUMENTS[selectedSubSymbol as keyof typeof INSTRUMENTS]?.basePrice || 100;
                        const currentAtr = sub.atrVal || 0.5;
                        const atrBuffer = currentAtr * editAtrStop;
                        const stopLossDistance = Math.max(spotPrice * 0.003, atrBuffer);
                        const takeProfitDistance = stopLossDistance * 2.0;

                        const slPct = stopLossDistance / spotPrice;
                        const desiredMultiplier = editTargetLoss / slPct;

                        const multiplierOptions = [50, 100, 200, 400];
                        let calculatedMultiplier = multiplierOptions[0];
                        let minDiff = Math.abs(desiredMultiplier - multiplierOptions[0]);
                        for (let i = 1; i < multiplierOptions.length; i++) {
                          const d = Math.abs(desiredMultiplier - multiplierOptions[i]);
                          if (d < minDiff) {
                            minDiff = d;
                            calculatedMultiplier = multiplierOptions[i];
                          }
                        }

                        let finalEstMultiplier = calculatedMultiplier;
                        while (slPct * finalEstMultiplier > 0.40 && finalEstMultiplier > 50) {
                          const idx = multiplierOptions.indexOf(finalEstMultiplier);
                          if (idx > 0) {
                            finalEstMultiplier = multiplierOptions[idx - 1];
                          } else {
                            break;
                          }
                        }

                        const estStopLossPercentage = slPct * 100;
                        const estExpectedLossWithMultiplier = slPct * finalEstMultiplier * 100;
                        const estProfitPercentage = (takeProfitDistance / spotPrice) * finalEstMultiplier * 100;
                        
                        return (
                          <div className="border border-indigo-500/15 bg-indigo-500/5 p-4 rounded-lg space-y-2.5">
                            <span className="text-sm font-extrabold text-indigo-400 uppercase tracking-widest block">
                              ⚖️ Core Risk Management Protocol
                            </span>
                            <p className="text-sm text-slate-400 leading-normal font-sans">
                              With our fine-tuned <strong>Adaptive Risk Policy</strong>, the system avoids asymmetric flat stake exposures. 
                              By taking your <strong>Risk Budget of {(editTargetLoss * 100).toFixed(0)}%</strong> of your stake, 
                              the central governor dynamically computes the maximum leverage multiplier and sets standard stop loss targets matching ATR conditions.
                            </p>
                            <div className="p-3 bg-slate-950 border border-slate-900 rounded font-mono text-sm text-indigo-300 space-y-1">
                              <div className="flex justify-between pb-1 border-b border-indigo-950/40">
                                <span>Calculated Lot Multiplier:</span>
                                <span className="text-slate-100 font-bold">x{finalEstMultiplier}</span>
                              </div>
                              <div className="flex justify-between pb-1 border-b border-indigo-950/40">
                                <span>Est. SL Distance:</span>
                                <span className="text-slate-205">-{estStopLossPercentage.toFixed(3)}%</span>
                              </div>
                              <div className="flex justify-between pb-1 border-b border-indigo-950/40">
                                <span>Risked Loss (under SL limit):</span>
                                <span className="text-red-400 font-bold">-{estExpectedLossWithMultiplier.toFixed(1)}% (-${(50 * estExpectedLossWithMultiplier / 100).toFixed(2)})</span>
                              </div>
                              <div className="flex justify-between pt-0.5">
                                <span>Target Profit (2.0x RR):</span>
                                <span className="text-emerald-400 font-bold">+{estProfitPercentage.toFixed(1)}% (+${(50 * estProfitPercentage / 100).toFixed(2)})</span>
                              </div>
                            </div>
                            <span className="text-xs text-indigo-400/70 block leading-snug font-sans">
                              * Estimations calculated on a standard $50.00 stake, reflecting real-time volatility of asset {selectedSubSymbol}.
                            </span>
                          </div>
                        );
                      })()}

                    </div>

                  </div>
                ) : (
                  
                  /* HISTORY TABLE FOR THIS SUB-ALGORITHM */
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold font-mono uppercase text-slate-300 tracking-wider pb-2 border-b border-slate-900">
                      Order Book historical entries for Asset symbol {selectedSubSymbol}
                    </h4>

                    {subActive.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-sm text-emerald-400 font-mono font-bold uppercase tracking-wider block">
                          🟢 Live Active Position Handlers ({subActive.length})
                        </span>
                        <div className="overflow-x-auto border border-slate-900 rounded-lg">
                          <table className="w-full text-left font-mono text-sm align-middle">
                            <thead className="bg-slate-900 text-slate-400 text-sm uppercase tracking-wider">
                              <tr>
                                <th className="px-3 py-2">ID</th>
                                <th className="px-3 py-2">Direction</th>
                                <th className="px-3 py-2">Allocation</th>
                                <th className="px-3 py-2">Entry Price</th>
                                <th className="px-3 py-2">Current Price</th>
                                <th className="px-3 py-2">Stop Loss</th>
                                <th className="px-3 py-2">Take Profit</th>
                                <th className="px-3 py-2 text-right">Running P&L</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subActive.map((p, idx) => (
                                <tr key={`${p.id}-${idx}`} className="border-b border-slate-900/60 hover:bg-slate-900/20">
                                  <td className="px-3 py-2 font-bold text-slate-200">{p.id}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${p.direction === "LONG" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                                      {p.direction}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">${p.stake.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-slate-300">{p.entryPrice.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-slate-300">{p.currentPrice.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-red-400/80">{p.stopLoss.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-emerald-400/80">{p.takeProfit.toFixed(2)}</td>
                                  <td className={`px-3 py-2 text-right font-bold ${p.pnl >= 0 ? "text-emerald-400" : "text-red-500"}`}>
                                    {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <span className="text-sm text-slate-500 font-mono font-bold uppercase tracking-wider block pt-2">
                      📁 Settled Order Entries ({subTrades.length})
                    </span>
                    {subTrades.length === 0 ? (
                      <div className="text-center py-10 bg-slate-950/20 rounded border border-dashed border-slate-900 text-slate-600 font-mono text-sm">
                        No settled orders registered for this subprocess yet. Let the autonomous pilot catch indicator crossovers!
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-900 rounded-lg">
                        <table className="w-full text-left font-mono text-sm align-middle">
                          <thead className="bg-slate-900 text-slate-400 text-sm uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2">ID</th>
                              <th className="px-3 py-2">Direction</th>
                              <th className="px-3 py-2">Stake</th>
                              <th className="px-3 py-2">Prices</th>
                              <th className="px-3 py-2">Resolution / Exit Type</th>
                              <th className="px-3 py-2">Confluence Reasons</th>
                              <th className="px-3 py-2 text-right">Settle Net P&L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subTrades.slice().reverse().map((t, idx) => {
                              const isWin = t.pnl >= 0;
                              let conditions: string[] = [];
                              try {
                                if (t.conditionsMet) {
                                  conditions = typeof t.conditionsMet === "string" ? JSON.parse(t.conditionsMet) : t.conditionsMet;
                                }
                              } catch(e) {}
                              
                              return (
                                <tr key={`${t.id}-${idx}`} className="border-b border-slate-900/60 hover:bg-slate-900/20">
                                  <td className="px-3 py-2 font-bold text-slate-200">{t.id}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${t.direction === "LONG" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                                      {t.direction}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">${t.stake.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-slate-300">
                                    {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-col">
                                      <span className={`font-semibold uppercase text-sm ${t.exitReason === "take_profit" ? "text-emerald-400" : t.exitReason === "stop_loss" ? "text-red-400" : "text-slate-400"}`}>
                                        {t.exitReason ? t.exitReason.replace('_', ' ') : "settled"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">
                                    <div className="flex flex-wrap gap-1">
                                      {conditions.length > 0 ? (
                                        conditions.map((c, i) => (
                                          <span key={i} className="px-1 bg-slate-900 border border-slate-800 rounded text-xs leading-tight text-slate-300">
                                            {c}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-slate-600 text-xs">-</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className={`px-3 py-2 text-right font-bold ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                                    {isWin ? "+" : ""}${t.pnl.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* ==========================================
          SOVEREIGN DETAILED PERFORMANCE & ANALYTICS OVERLAY
          ========================================== */}
      {selectedPerfDetail && (() => {
        if (selectedPerfDetail === "MOTHER") {
          // Filter logs to show Mother Algorithm activity
          const govLogs = logs.filter(l => l.includes("[GOVERNOR_DECISION]") || l.includes("[GOVERNOR_POLICE]") || l.includes("[RISK_CONTROL]") || l.includes("[BREAKER_ACT]")).slice(-10);
          
          return (
            <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
              <div className="bg-slate-950 border border-slate-900 rounded-xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-[0_0_50px_rgba(17,100,102,0.15)] overflow-hidden">
                {/* HEADER */}
                <div className="flex items-center justify-between border-b border-slate-900 px-6 py-4 bg-brand-slate/30">
                  <div className="flex items-center gap-3">
                    <Award className="w-5 h-5 text-brand-peach" />
                    <div>
                      <h3 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wide">
                        Sovereign Mother Algorithm
                      </h3>
                      <p className="text-xs text-slate-400 font-sans">
                        Master Governance Module &bull; Multi-Regime Strategy Allocator
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPerfDetail(null)}
                    className="p-1 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm font-mono border border-slate-900/80 hover:border-slate-800 transition-colors pointer-events-auto cursor-pointer"
                  >
                    X CLOSE
                  </button>
                </div>

                {/* CONTENT */}
                <div className="p-6 overflow-y-auto space-y-5 text-sm font-sans flex-1">
                  
                  {/* OVERVIEW CARDS */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-900/55 border border-slate-900 p-3 rounded-lg text-center">
                      <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Win Ratio</span>
                      <span className="text-xl font-mono font-bold text-brand-mint">{stats.winRate}%</span>
                    </div>
                    <div className="bg-slate-900/55 border border-slate-900 p-3 rounded-lg text-center">
                      <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Net P&L</span>
                      <span className={`text-xl font-mono font-bold ${stats.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-slate-900/55 border border-slate-900 p-3 rounded-lg text-center">
                      <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Drawdown</span>
                      <span className="text-xl font-mono font-bold text-rose-500">{stats.maxDrawdown}%</span>
                    </div>
                    <div className="bg-slate-900/55 border border-slate-900 p-3 rounded-lg text-center">
                      <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Total Contracts</span>
                      <span className="text-xl font-mono font-bold text-brand-gold">{stats.totalTrades}</span>
                    </div>
                  </div>

                  {/* CHARACTERISTICS */}
                  <div className="bg-slate-950/45 border border-slate-900 p-4 rounded-lg space-y-3">
                    <h4 className="text-sm font-bold text-brand-peach uppercase font-mono flex items-center gap-1.5 pb-2 border-b border-slate-900">
                      <ShieldCheck className="w-4 h-4 text-brand-peach" /> System Governance Strengths
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs leading-relaxed">
                      <div className="p-2.5 bg-brand-slate/20 rounded border border-brand-teal/20 space-y-1">
                        <span className="font-bold text-brand-mint block uppercase tracking-wider font-mono">1. Half-Kelly allocation</span>
                        <p className="text-slate-400 font-sans">
                          Sizes operational stakes dynamically against live equity, preventing over-leveraged drawdowns while compounding profitable sessions safely.
                        </p>
                      </div>
                      <div className="p-2.5 bg-brand-slate/20 rounded border border-brand-teal/20 space-y-1">
                        <span className="font-bold text-brand-mint block uppercase tracking-wider font-mono">2. Dynamic Regime Faders</span>
                        <p className="text-slate-400 font-sans">
                          Vigorous market state analyzers prevent orders during high-risk TRANSITION phases. Seamlessly shifts between Mean Reversion & Peak Momentum.
                        </p>
                      </div>
                      <div className="p-2.5 bg-brand-slate/20 rounded border border-brand-teal/20 space-y-1">
                        <span className="font-bold text-brand-mint block uppercase tracking-wider font-mono">3. Cooldown Lockouts</span>
                        <p className="text-slate-400 font-sans">
                          If consecutive losses trigger our protective circuit breakers, the governor freezes trade submissions until markets calm down, preserving reserves.
                        </p>
                      </div>
                      <div className="p-2.5 bg-brand-slate/20 rounded border border-brand-teal/20 space-y-1">
                        <span className="font-bold text-brand-mint block uppercase tracking-wider font-mono">4. Multi-Symbol Focus</span>
                        <p className="text-slate-400 font-sans">
                          Periodically analyzes sub-algorithms to select a single highest-confluence Priority Focal asset, optimizing processing cycles.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* GOVERNING AUDIT TIMELINE */}
                  <div className="bg-slate-950/45 border border-slate-900 p-4 rounded-lg space-y-2.5">
                    <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                      Autonomous Audit Trial Stream (Governor)
                    </span>
                    <div className="w-full h-40 bg-[#121614] rounded border border-slate-900 p-3 overflow-y-auto font-mono text-xs text-slate-400 space-y-1">
                      {govLogs.length === 0 ? (
                        <div className="text-slate-600 text-center py-10 font-mono">No core governor events captured in this frame window. Let the algorithms trade.</div>
                      ) : (
                        govLogs.map((log, i) => (
                          <div key={i} className="text-slate-300 leading-normal border-b border-slate-900/45 pb-1 last:border-0">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

                {/* FOOTER */}
                <div className="border-t border-slate-900 px-6 py-4 flex justify-between items-center bg-slate-950">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <Info className="w-3.5 h-3.5" /> Core mother algorithms compile securely under Node environment.
                  </div>
                  <button
                    onClick={() => setSelectedPerfDetail(null)}
                    className="px-4 py-2 bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-850 hover:bg-slate-800 text-sm font-mono rounded font-medium cursor-pointer transition-colors"
                  >
                    Close Dashboard
                  </button>
                </div>
              </div>
            </div>
          );
        }

        const sub = subAlgorithms[selectedPerfDetail];
        if (!sub) return null;

        const wr = sub.recentWinRate || 0;
        const winRatePct = wr * 100;
        
        // Define hardcoded INSTRUMENTS object fallback
        const titleName = selectedPerfDetail === "R_10" ? "Volatility 10 Index" :
                          selectedPerfDetail === "R_25" ? "Volatility 25 Index" :
                          selectedPerfDetail === "R_75" ? "Volatility 75 Index" :
                          selectedPerfDetail === "R_100" ? "Volatility 100 Index" :
                          selectedPerfDetail === "CRASH500" ? "Crash 500 Index" :
                          selectedPerfDetail === "BOOM500" ? "Boom 500 Index" : selectedPerfDetail;

        let ratingLabel = "C TIER / ROOKIE";
        let starsCount = 2;
        let ratingColorClass = "text-slate-400 bg-slate-500/10 border-slate-500/20";
        if (sub.totalTrades > 0) {
          if (winRatePct >= 62 && sub.totalPnl > 0) {
            ratingLabel = "S TIER / ELITE OUTFLOW";
            starsCount = 5;
            ratingColorClass = "text-brand-peach bg-brand-peach/10 border-brand-peach/20";
          } else if (winRatePct >= 52 && sub.totalPnl >= 0) {
            ratingLabel = "A TIER / EXCELLENT PILOT";
            starsCount = 4;
            ratingColorClass = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
          } else if (winRatePct >= 42 || sub.totalPnl >= -5) {
            ratingLabel = "B TIER / SOUND OPERATOR";
            starsCount = 3;
            ratingColorClass = "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
          }
        } else {
          ratingLabel = "WARMING UP ACTIVE SENSORS";
          starsCount = 0;
        }

        // Analytical custom descriptions
        const strategyDescriptions: Record<string, { desc: string, strengths: string[], behavior: string }> = {
          R_10: {
            desc: "Volatility Index 10 Micro-Trend Scalper, utilizing high speed indicator matching to snap incremental profits off immediate trend shifts.",
            strengths: ["Ultra-fast micro-tick convergence filtering", "Low capital drawdowns during transitions", "Defends positions tightly with trailing brackets"],
            behavior: "High-frequency trade trigger module. Operates on 1s tick integrations. Opens small-sized orders and hedges with progressive break-even shifting."
          },
          R_25: {
            desc: "Compression Wave Mean Reverter focused on Volatility Index 25. Takes positions at Bollinger edges when momentum shows exhaustion signs.",
            strengths: ["Aesthetic mean reversion precision", "Filters noisy fakeouts using RSI boundaries", "Vigorous ranging optimization ratio"],
            behavior: "Waits patiently for extreme standard deviation expansions on a 20-period scale before committing capital. Strict limit safeguards."
          },
          R_75: {
            desc: "Apex Volatility Breakout algorithm deployed on Volatility Index 75 (1s). Rides massive expansions and volume impulses.",
            strengths: ["Captures full trend lifecycle", "Trailing stops locked aggressively", "Favourable asymmetrical reward ratio"],
            behavior: "Enters trades when ADX rises above 20 and close breaks Bollinger bandwidth boundaries, holding exposure with an active trace tracker."
          },
          R_100: {
            desc: "Extreme Velocity Bollinger Fader assigned to heavy Volatility Index 100. Excels in capturing market reversing limits at high-tide boundaries.",
            strengths: ["Captures market apexes perfectly", "Staggered risk calculations per entry", "Fast settlement triggers"],
            behavior: "Scours volatility metrics to place counter-trend directives when extreme confluences match (RSI > 67 / < 33). Fades momentum exhausts."
          },
          CRASH500: {
            desc: "Tail-risk hedging spike absorber for CRASH index assets. Enters extreme short exposures at high volume limits.",
            strengths: ["Protects against sudden shock pullbacks", "High risk-reward ratios", "Asymmetrical volatility extraction"],
            behavior: "Fades sudden price extensions and takes short-term option/multiplier triggers to exploit crash breakdowns."
          },
          BOOM500: {
            desc: "Ascending impulse breakout hunter customized for BOOM index assets. Catches rapid spike expansion sequences.",
            strengths: ["Exploits rapid explosive momentum", "Highly focused entry criterion", "Rapid settlement times"],
            behavior: "Monitors tick velocities to jump on explosive upward jumps immediately, riding the impulse waves with trailing protections."
          }
        };

        const details = strategyDescriptions[selectedPerfDetail] || {
          desc: `Autonomous trade subprocess for ${selectedPerfDetail}. Implements customized parameters calibrated over walk-forward optimization runs.`,
          strengths: ["Autonomous indicator validation", "Tuned stop level metrics", "Sized by governor risk factors"],
          behavior: "Runs tick processing loops in background, verifying confluence inputs before initiating placement orders on live servers."
        };

        // Filter completed trades specifically for this asset
        const subTrades = completedTrades.filter(t => t.symbol === selectedPerfDetail).slice(-5);

        return (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div className="bg-slate-950 border border-slate-900 rounded-xl max-w-3xl w-full flex flex-col max-h-[85vh] shadow-[0_0_50px_rgba(17,100,102,0.15)] overflow-hidden">
              
              {/* HEADER */}
              <div className="flex items-center justify-between border-b border-slate-900 px-6 py-4 bg-slate-900/40">
                <div className="flex items-center gap-3">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-base font-bold font-mono text-slate-100 uppercase tracking-wide">
                      {selectedPerfDetail} &mdash; Detailed Analytical Profile
                    </h3>
                    <p className="text-xs text-indigo-400 font-sans font-medium">
                      Sub-Algorithm: <span className="text-slate-200">{sub.name}</span> &bull; Strategy: <span className="text-emerald-400 uppercase">{sub.personality}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPerfDetail(null)}
                  className="p-1 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm font-mono border border-slate-900/80 hover:border-slate-800 transition-colors pointer-events-auto cursor-pointer"
                >
                  X CLOSE
                </button>
              </div>

              {/* CONTENT */}
              <div className="p-6 overflow-y-auto space-y-5 text-sm font-sans flex-1">
                
                {/* METRIC RIBBON */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/20 p-3.5 rounded-lg border border-slate-900">
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Win Rate (Trades)</span>
                    <span className="text-base font-mono font-bold text-slate-200">{winRatePct.toFixed(0)}% <span className="text-xs text-slate-500 font-normal">({sub.totalTrades} t)</span></span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Total P&L</span>
                    <span className={`text-base font-mono font-bold ${sub.totalPnl >= 0 ? "text-emerald-400" : "text-rose-450"}`}>
                      {sub.totalPnl >= 0 ? "+" : ""}${sub.totalPnl.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Operational Streaks</span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      Wins: <span className="text-emerald-400">+{sub.consecutiveWins}</span> &bull; Losses: <span className="text-rose-400">-{sub.consecutiveLosses}</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-mono text-slate-500 tracking-wider">Rating classification</span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${ratingColorClass}`}>
                      {ratingLabel}
                    </span>
                  </div>
                </div>

                {/* DESCRIPTION AND STRENGTHS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900/35 border border-slate-900 p-4 rounded-lg space-y-2">
                    <h4 className="text-xs font-bold font-mono text-brand-peach uppercase">Strategy Description and Core Mission</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">{details.desc}</p>
                    <div className="pt-2">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Operational Signature:</span>
                      <p className="text-xs text-slate-400 italic font-sans leading-normal">{details.behavior}</p>
                    </div>
                  </div>

                  <div className="bg-slate-900/35 border border-slate-900 p-4 rounded-lg space-y-2">
                    <h4 className="text-xs font-bold font-mono text-brand-peach uppercase">Core Algorithmic Strengths</h4>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {details.strengths.map((st, i) => (
                        <li key={i} className="flex gap-1.5 items-start">
                          <span className="text-emerald-400 shrink-0 mt-0.5">&bull;</span>
                          <span>{st}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="pt-2 flex items-center gap-1">
                      <span className="text-[10px] font-mono text-slate-500">Stars rating:</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star 
                            key={i} 
                            className={`w-3.5 h-3.5 ${i < starsCount ? "text-amber-500 fill-amber-500" : "text-slate-800"}`} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* REAL-TIME FEED TELEMETRY & CALIBRATIONS */}
                <div className="bg-slate-950 border border-slate-900 p-4 rounded-lg">
                  <h4 className="text-xs font-bold font-mono text-brand-mint uppercase pb-2 border-b border-slate-900 mb-3 flex justify-between items-center">
                    <span>Live Indicator Confluences & Calibration Parameters</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.25 rounded ${sub.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
                      {sub.enabled ? "ACTIVE PIPELINE" : "STANDBY"}
                    </span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="space-y-1.5 border-r border-slate-950/80 pr-4">
                      <div className="flex justify-between items-center pb-1 border-b border-slate-800/30">
                        <span className="text-slate-500">RSI Low entry trigger:</span>
                        <span className="text-emerald-400 font-semibold">{sub.rsiOversoldThreshold}</span>
                      </div>
                      <div className="flex justify-between items-center pb-1 border-b border-slate-800/30">
                        <span className="text-slate-500">RSI High entry trigger:</span>
                        <span className="text-rose-400 font-semibold">{sub.rsiOverboughtThreshold}</span>
                      </div>
                      <div className="flex justify-between items-center pb-1 border-b border-slate-800/30">
                        <span className="text-slate-500">Bollinger configuration:</span>
                        <span className="text-indigo-400 font-semibold">{sub.bbPeriod} pd, {sub.bbStd} dev</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">ATR Stop bracket multiplier:</span>
                        <span className="text-brand-gold font-semibold">{sub.atrStopMultiplier}x ATR</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center pb-1 border-b border-slate-800/30">
                        <span className="text-slate-500">Live RSI (14 value):</span>
                        <span className={`font-semibold ${sub.rsiVal <= sub.rsiOversoldThreshold ? "text-emerald-400 animate-pulse" : sub.rsiVal >= sub.rsiOverboughtThreshold ? "text-rose-400" : "text-slate-300"}`}>
                          {sub.rsiVal ? sub.rsiVal.toFixed(2) : "Calculating..."}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pb-1 border-b border-slate-800/30">
                        <span className="text-slate-500">Live Bollinger Coordinate (%B):</span>
                        <span className="text-slate-300 font-semibold">{Math.round((sub.bbPct || 0) * 100)}%</span>
                      </div>
                      <div className="flex justify-between items-center pb-1 border-b border-slate-800/30">
                        <span className="text-slate-500">Live ADX Strength value:</span>
                        <span className="text-slate-300 font-semibold">{sub.adxVal ? sub.adxVal.toFixed(2) : "Calculating..."}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Current Market Regime:</span>
                        <span className="text-indigo-400 uppercase font-semibold text-[10px]">{sub.mRegime ? sub.mRegime.replace('_', ' ') : "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRACK RECORD AUDIT */}
                <div className="bg-slate-950 border border-slate-900 p-4 rounded-lg space-y-2.5">
                  <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider block">
                    Recent Calibration settlements for {selectedPerfDetail}
                  </span>
                  
                  {subTrades.length === 0 ? (
                    <div className="text-center py-6 text-slate-600 font-mono text-xs">Waiting for settlements on this process...</div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-900 rounded bg-slate-950/25">
                      <table className="w-full text-left font-mono text-xs border-collapse">
                        <thead className="bg-slate-900 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-905">
                          <tr>
                            <th className="px-3 py-1.5">ID</th>
                            <th className="px-3 py-1.5">Type</th>
                            <th className="px-3 py-1.5">Execution range</th>
                            <th className="px-3 py-1.5">Reason</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Net P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subTrades.slice().reverse().map((t, index) => (
                            <tr key={index} className="border-b border-slate-900/40 hover:bg-slate-900/10">
                              <td className="px-3 py-1.5 text-slate-300 font-semibold">{t.id}</td>
                              <td className="px-3 py-1.5">
                                <span className={`px-1 py-0.25 rounded text-[10px] font-bold uppercase ${t.direction === "LONG" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-rose-400"}`}>
                                  {t.direction} {t.contractType}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-slate-400">
                                {t.entryPrice.toFixed(2)} &rarr; {t.exitPrice.toFixed(2)}
                              </td>
                              <td className="px-3 py-1.5 text-slate-500 uppercase text-[10px]">{t.exitReason ? t.exitReason.replace('_', ' ') : "Settle"}</td>
                              <td className={`px-3 py-1.5 text-right font-bold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* FOOTER */}
              <div className="border-t border-slate-900 px-6 py-4 flex justify-between items-center bg-slate-950">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Complete coverage under Sovereign Risk Management rulesets.
                </div>
                <button
                  onClick={() => setSelectedPerfDetail(null)}
                  className="px-4 py-2 bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-850 hover:bg-slate-800 text-sm font-mono rounded font-medium cursor-pointer transition-colors"
                >
                  Close Profile
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==========================================
          SOVEREIGN SYSTEM CLEAN SLATE TRIGGER CONFIRMATION MODAL
          ========================================== */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111615] border border-red-500/20 rounded-xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-brand-teal/10">
              <div className="p-2 rounded bg-red-950/30 border border-red-500/20">
                <ShieldAlert className="w-5 h-5 text-red-100" />
              </div>
              <div>
                <h3 className="text-sm uppercase font-mono text-red-400 font-bold tracking-wider">
                  Sovereign Clean Slate Init
                </h3>
                <p className="text-[10px] uppercase font-mono text-slate-500">
                  Critical Reset Execution Sequence
                </p>
              </div>
            </div>

            <div className="space-y-3 font-mono text-xs leading-relaxed text-slate-300">
              <p>
                You are initiating a <span className="text-red-400 font-semibold uppercase">complete database & stats overhaul</span>. 
                This action is irreversible and performs the following routines:
              </p>
              <ul className="list-disc list-inside space-y-1 bg-[#1b211f]/50 p-3 rounded border border-brand-teal/10 text-slate-400">
                <li>Wipes all active, pending, and past trade history logs</li>
                <li>Resets demo/simulated virtual balance back to <span className="text-[#10b981] font-bold">$10,000.00</span></li>
                <li>Synchronises live Deriv WS status stream and clears cooldown locks</li>
                <li>Wipes the remote cloud database <span className="text-indigo-405">sovereign_trades</span> table on your Connected Supabase instances</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all rounded text-xs font-mono font-medium cursor-pointer"
              >
                Cancel, Abort
              </button>
              <button
                onClick={triggerResetEngine}
                className="px-4 py-2 bg-gradient-to-r from-red-650 to-rose-700 hover:from-red-505 hover:to-rose-600 shadow-md text-white transition-all rounded text-xs font-mono font-bold cursor-pointer uppercase"
              >
                Force Reset Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
