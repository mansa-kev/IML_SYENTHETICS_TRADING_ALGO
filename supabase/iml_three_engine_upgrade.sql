create table if not exists public.iml_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.iml_trades (
  id text primary key,
  symbol text not null,
  contract_type text,
  direction text not null,
  entry_epoch bigint,
  exit_epoch bigint,
  entry_price numeric,
  exit_price numeric,
  stake numeric,
  pnl numeric,
  exit_reason text,
  rsi_at_entry numeric,
  bb_pct_at_entry numeric,
  adx_at_entry numeric,
  regime_at_entry text,
  is_hybrid_linear boolean default false,
  target_risk_amount numeric,
  hybrid_position_size numeric,
  tick_stream jsonb,
  created_at timestamptz default now()
);

alter table public.iml_trades add column if not exists engine_name text;
alter table public.iml_trades add column if not exists strategy_tag text;
alter table public.iml_trades add column if not exists execution_template text;
alter table public.iml_trades add column if not exists atr_at_entry numeric;
alter table public.iml_trades add column if not exists conditions_met jsonb default '[]'::jsonb;
alter table public.iml_trades add column if not exists max_adverse_excursion numeric;
alter table public.iml_trades add column if not exists deriv_close_confirmed boolean default false;
alter table public.iml_trades add column if not exists derived_sharpe_contribution numeric;
alter table public.iml_trades add column if not exists entry_signal_probability numeric;
alter table public.iml_trades add column if not exists entry_expected_edge numeric;
alter table public.iml_trades add column if not exists entry_expected_sharpe_impact numeric;
alter table public.iml_trades add column if not exists outcome_attribution text;
alter table public.iml_trades add column if not exists proposal_evidence_id text;

create table if not exists public.iml_proposal_evidence (
  id text primary key,
  created_at timestamptz default now(),
  epoch bigint not null,
  symbol text not null,
  engine_name text,
  strategy text not null,
  execution_template text,
  direction text not null,
  eff_mode text not null,
  score numeric,
  conviction numeric,
  confidence numeric,
  expected_edge numeric,
  expected_sharpe_impact numeric,
  ml_quality_score numeric,
  ml_sample_size integer,
  regime_bucket text,
  confidence_bucket text,
  adx_bucket text,
  context_key text,
  price numeric,
  rsi numeric,
  adx numeric,
  atr numeric,
  bb_pct numeric,
  ema_separation numeric,
  trend_dir numeric,
  transition_probability numeric,
  trend_probability numeric,
  mean_reversion_probability numeric,
  governor_approved boolean,
  governor_tier text,
  governor_reasons jsonb default '[]'::jsonb,
  allocated_risk numeric,
  preflight_approved boolean,
  preflight_reasons jsonb default '[]'::jsonb,
  max_loss_amount numeric,
  target_reward_amount numeric,
  reward_to_risk numeric,
  status text not null,
  linked_position_id text,
  outcome text,
  outcome_pnl numeric,
  resolved_at timestamptz,
  shadow_stop_price numeric,
  shadow_target_price numeric,
  shadow_expires_epoch bigint,
  model_version text
);

create index if not exists iml_proposal_evidence_symbol_epoch_idx
  on public.iml_proposal_evidence (symbol, epoch desc);

create index if not exists iml_proposal_evidence_strategy_outcome_idx
  on public.iml_proposal_evidence (strategy, outcome);

create table if not exists public.iml_ml_evidence_buckets (
  key text primary key,
  samples integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  rejected integer not null default 0,
  broker_rejected integer not null default 0,
  net_pnl numeric not null default 0,
  avg_confidence numeric not null default 0,
  avg_edge numeric not null default 0,
  last_updated_epoch bigint,
  updated_at timestamptz default now()
);

create table if not exists public.iml_strategy_history (
  id bigserial primary key,
  epoch_recorded bigint not null,
  global_parameters jsonb,
  sub_algorithms jsonb,
  created_at timestamptz default now()
);

create table if not exists public.iml_logs (
  id bigserial primary key,
  session_id text not null,
  level text,
  category text,
  message text not null,
  raw text not null,
  kenya_day date not null,
  created_at timestamptz default now()
);

alter table public.iml_state disable row level security;
alter table public.iml_trades disable row level security;
alter table public.iml_proposal_evidence disable row level security;
alter table public.iml_ml_evidence_buckets disable row level security;
alter table public.iml_strategy_history disable row level security;
alter table public.iml_logs disable row level security;
