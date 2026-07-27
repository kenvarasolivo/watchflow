/**
 * Ticker → company name.
 *
 * Names reach the UI from two places, in this order of trust:
 *
 *  1. `watchlist_tickers.name`, written when a ticker is added and Yahoo's
 *     search endpoint returned a definitive match. That is the authoritative
 *     name for anything the user actually put on the watchlist.
 *  2. This table, as the fallback.
 *
 * The fallback is not redundancy for its own sake. The Yahoo lookup is
 * best-effort by design (see `lib/yahoo.ts` — from a datacenter IP it returns
 * `unknown` often enough to matter), tickers seeded before the name column
 * existed have no stored name, and `/ticker/[symbol]` renders for symbols that
 * were never on the watchlist at all. Without a local table those all render as
 * a bare four-letter code, which is the exact problem naming was meant to fix.
 *
 * Scope is "what a personal watchlist plausibly contains": US large caps, the
 * major ETFs and indices, the liquid crypto pairs, and the European blue chips
 * a Trade-Republic-shaped portfolio would hold. Anything outside it degrades to
 * the symbol, which is what the app showed before either source existed.
 *
 * Keys are the exact Yahoo Finance symbol, upper-cased.
 */
const COMPANY_NAMES: Record<string, string> = {
  // ── US mega & large cap ──────────────────────────────────────────────────
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  NVDA: "NVIDIA Corp.",
  AMZN: "Amazon.com Inc.",
  GOOGL: "Alphabet Inc. (Class A)",
  GOOG: "Alphabet Inc. (Class C)",
  META: "Meta Platforms Inc.",
  TSLA: "Tesla Inc.",
  "BRK-A": "Berkshire Hathaway Inc. (Class A)",
  "BRK-B": "Berkshire Hathaway Inc. (Class B)",
  AVGO: "Broadcom Inc.",
  LLY: "Eli Lilly & Co.",
  JPM: "JPMorgan Chase & Co.",
  V: "Visa Inc.",
  MA: "Mastercard Inc.",
  UNH: "UnitedHealth Group Inc.",
  XOM: "Exxon Mobil Corp.",
  JNJ: "Johnson & Johnson",
  PG: "Procter & Gamble Co.",
  COST: "Costco Wholesale Corp.",
  HD: "Home Depot Inc.",
  WMT: "Walmart Inc.",
  NFLX: "Netflix Inc.",
  ORCL: "Oracle Corp.",
  CRM: "Salesforce Inc.",
  ADBE: "Adobe Inc.",

  // ── Semiconductors & hardware ────────────────────────────────────────────
  AMD: "Advanced Micro Devices Inc.",
  INTC: "Intel Corp.",
  QCOM: "Qualcomm Inc.",
  TXN: "Texas Instruments Inc.",
  AMAT: "Applied Materials Inc.",
  LRCX: "Lam Research Corp.",
  KLAC: "KLA Corp.",
  MU: "Micron Technology Inc.",
  ARM: "Arm Holdings plc",
  TSM: "Taiwan Semiconductor Manufacturing Co.",
  ASML: "ASML Holding N.V.",
  SMCI: "Super Micro Computer Inc.",
  CSCO: "Cisco Systems Inc.",
  DELL: "Dell Technologies Inc.",
  HPQ: "HP Inc.",
  IBM: "International Business Machines Corp.",

  // ── Software & internet ──────────────────────────────────────────────────
  PLTR: "Palantir Technologies Inc.",
  SNOW: "Snowflake Inc.",
  NOW: "ServiceNow Inc.",
  INTU: "Intuit Inc.",
  PANW: "Palo Alto Networks Inc.",
  CRWD: "CrowdStrike Holdings Inc.",
  ZS: "Zscaler Inc.",
  NET: "Cloudflare Inc.",
  DDOG: "Datadog Inc.",
  MDB: "MongoDB Inc.",
  TEAM: "Atlassian Corp.",
  WDAY: "Workday Inc.",
  ADSK: "Autodesk Inc.",
  DOCU: "Docusign Inc.",
  TWLO: "Twilio Inc.",
  OKTA: "Okta Inc.",
  SHOP: "Shopify Inc.",
  SPOT: "Spotify Technology S.A.",
  UBER: "Uber Technologies Inc.",
  LYFT: "Lyft Inc.",
  ABNB: "Airbnb Inc.",
  DASH: "DoorDash Inc.",
  PINS: "Pinterest Inc.",
  SNAP: "Snap Inc.",
  RBLX: "Roblox Corp.",
  EA: "Electronic Arts Inc.",
  TTWO: "Take-Two Interactive Software Inc.",

  // ── Financials ───────────────────────────────────────────────────────────
  BAC: "Bank of America Corp.",
  WFC: "Wells Fargo & Co.",
  GS: "Goldman Sachs Group Inc.",
  MS: "Morgan Stanley",
  C: "Citigroup Inc.",
  SCHW: "Charles Schwab Corp.",
  BLK: "BlackRock Inc.",
  AXP: "American Express Co.",
  PYPL: "PayPal Holdings Inc.",
  COIN: "Coinbase Global Inc.",
  HOOD: "Robinhood Markets Inc.",
  SPGI: "S&P Global Inc.",
  MCO: "Moody's Corp.",
  CME: "CME Group Inc.",
  ICE: "Intercontinental Exchange Inc.",
  BX: "Blackstone Inc.",
  KKR: "KKR & Co. Inc.",

  // ── Health care ──────────────────────────────────────────────────────────
  PFE: "Pfizer Inc.",
  MRK: "Merck & Co. Inc.",
  ABBV: "AbbVie Inc.",
  ABT: "Abbott Laboratories",
  TMO: "Thermo Fisher Scientific Inc.",
  DHR: "Danaher Corp.",
  BMY: "Bristol-Myers Squibb Co.",
  AMGN: "Amgen Inc.",
  GILD: "Gilead Sciences Inc.",
  ISRG: "Intuitive Surgical Inc.",
  VRTX: "Vertex Pharmaceuticals Inc.",
  REGN: "Regeneron Pharmaceuticals Inc.",
  CVS: "CVS Health Corp.",
  NVO: "Novo Nordisk A/S",

  // ── Consumer ─────────────────────────────────────────────────────────────
  KO: "Coca-Cola Co.",
  PEP: "PepsiCo Inc.",
  MCD: "McDonald's Corp.",
  SBUX: "Starbucks Corp.",
  NKE: "NIKE Inc.",
  DIS: "Walt Disney Co.",
  CMCSA: "Comcast Corp.",
  LOW: "Lowe's Companies Inc.",
  TGT: "Target Corp.",
  MDLZ: "Mondelez International Inc.",
  PM: "Philip Morris International Inc.",
  MO: "Altria Group Inc.",
  CL: "Colgate-Palmolive Co.",
  EL: "Estée Lauder Companies Inc.",
  LULU: "Lululemon Athletica Inc.",

  // ── Telecom, energy, industrials, materials ──────────────────────────────
  T: "AT&T Inc.",
  VZ: "Verizon Communications Inc.",
  TMUS: "T-Mobile US Inc.",
  CVX: "Chevron Corp.",
  COP: "ConocoPhillips",
  SLB: "SLB",
  OXY: "Occidental Petroleum Corp.",
  NEE: "NextEra Energy Inc.",
  BA: "Boeing Co.",
  CAT: "Caterpillar Inc.",
  DE: "Deere & Co.",
  GE: "GE Aerospace",
  HON: "Honeywell International Inc.",
  LMT: "Lockheed Martin Corp.",
  RTX: "RTX Corp.",
  UPS: "United Parcel Service Inc.",
  FDX: "FedEx Corp.",
  F: "Ford Motor Co.",
  GM: "General Motors Co.",
  RIVN: "Rivian Automotive Inc.",
  LCID: "Lucid Group Inc.",
  LIN: "Linde plc",

  // ── Non-US listings on US exchanges ──────────────────────────────────────
  BABA: "Alibaba Group Holding Ltd.",
  JD: "JD.com Inc.",
  PDD: "PDD Holdings Inc.",
  BIDU: "Baidu Inc.",
  NIO: "NIO Inc.",
  SONY: "Sony Group Corp.",
  TM: "Toyota Motor Corp.",
  SHEL: "Shell plc",
  BP: "BP plc",
  HSBC: "HSBC Holdings plc",
  UL: "Unilever plc",
  AZN: "AstraZeneca plc",
  GSK: "GSK plc",
  SAP: "SAP SE",
  RIO: "Rio Tinto Group",
  BHP: "BHP Group Ltd.",

  // ── European listings (Xetra / Euronext / SIX) ───────────────────────────
  "SAP.DE": "SAP SE",
  "SIE.DE": "Siemens AG",
  "ALV.DE": "Allianz SE",
  "BMW.DE": "Bayerische Motoren Werke AG",
  "MBG.DE": "Mercedes-Benz Group AG",
  "VOW3.DE": "Volkswagen AG (Pref.)",
  "BAS.DE": "BASF SE",
  "BAYN.DE": "Bayer AG",
  "DTE.DE": "Deutsche Telekom AG",
  "DBK.DE": "Deutsche Bank AG",
  "CBK.DE": "Commerzbank AG",
  "ADS.DE": "adidas AG",
  "AIR.DE": "Airbus SE",
  "MUV2.DE": "Münchener Rückversicherungs-Gesellschaft AG",
  "RWE.DE": "RWE AG",
  "EOAN.DE": "E.ON SE",
  "IFX.DE": "Infineon Technologies AG",
  "DHL.DE": "DHL Group",
  "HEN3.DE": "Henkel AG & Co. KGaA (Pref.)",
  "MRK.DE": "Merck KGaA",
  "P911.DE": "Dr. Ing. h.c. F. Porsche AG",
  "RHM.DE": "Rheinmetall AG",
  "ZAL.DE": "Zalando SE",
  "SHL.DE": "Siemens Healthineers AG",
  "LHA.DE": "Deutsche Lufthansa AG",
  "MC.PA": "LVMH Moët Hennessy Louis Vuitton SE",
  "OR.PA": "L'Oréal S.A.",
  "ASML.AS": "ASML Holding N.V.",
  "NESN.SW": "Nestlé S.A.",
  "NOVN.SW": "Novartis AG",
  "ROG.SW": "Roche Holding AG",

  // ── Broad-market & sector ETFs ───────────────────────────────────────────
  SPY: "SPDR S&P 500 ETF Trust",
  VOO: "Vanguard S&P 500 ETF",
  IVV: "iShares Core S&P 500 ETF",
  VTI: "Vanguard Total Stock Market ETF",
  VT: "Vanguard Total World Stock ETF",
  QQQ: "Invesco QQQ Trust",
  DIA: "SPDR Dow Jones Industrial Average ETF Trust",
  IWM: "iShares Russell 2000 ETF",
  VEA: "Vanguard FTSE Developed Markets ETF",
  VWO: "Vanguard FTSE Emerging Markets ETF",
  VXUS: "Vanguard Total International Stock ETF",
  EEM: "iShares MSCI Emerging Markets ETF",
  EFA: "iShares MSCI EAFE ETF",
  ARKK: "ARK Innovation ETF",
  SCHD: "Schwab U.S. Dividend Equity ETF",
  VYM: "Vanguard High Dividend Yield ETF",
  VIG: "Vanguard Dividend Appreciation ETF",
  VUG: "Vanguard Growth ETF",
  VTV: "Vanguard Value ETF",
  VNQ: "Vanguard Real Estate ETF",
  SMH: "VanEck Semiconductor ETF",
  SOXX: "iShares Semiconductor ETF",
  XLK: "Technology Select Sector SPDR Fund",
  XLF: "Financial Select Sector SPDR Fund",
  XLE: "Energy Select Sector SPDR Fund",
  XLV: "Health Care Select Sector SPDR Fund",
  XLY: "Consumer Discretionary Select Sector SPDR Fund",
  XLP: "Consumer Staples Select Sector SPDR Fund",
  XLI: "Industrial Select Sector SPDR Fund",
  XLU: "Utilities Select Sector SPDR Fund",
  XLB: "Materials Select Sector SPDR Fund",
  XLC: "Communication Services Select Sector SPDR Fund",
  XLRE: "Real Estate Select Sector SPDR Fund",

  // ── Commodity & bond ETFs ────────────────────────────────────────────────
  GLD: "SPDR Gold Shares",
  IAU: "iShares Gold Trust",
  SLV: "iShares Silver Trust",
  USO: "United States Oil Fund LP",
  UNG: "United States Natural Gas Fund LP",
  TLT: "iShares 20+ Year Treasury Bond ETF",
  IEF: "iShares 7-10 Year Treasury Bond ETF",
  SHY: "iShares 1-3 Year Treasury Bond ETF",
  AGG: "iShares Core U.S. Aggregate Bond ETF",
  BND: "Vanguard Total Bond Market ETF",
  HYG: "iShares iBoxx $ High Yield Corporate Bond ETF",
  LQD: "iShares iBoxx $ Investment Grade Corporate Bond ETF",
  IBIT: "iShares Bitcoin Trust ETF",
  FBTC: "Fidelity Wise Origin Bitcoin Fund",

  // ── UCITS ETFs (Euronext / Xetra / LSE) ──────────────────────────────────
  "VWRL.AS": "Vanguard FTSE All-World UCITS ETF",
  "VWCE.DE": "Vanguard FTSE All-World UCITS ETF (Acc)",
  "IWDA.AS": "iShares Core MSCI World UCITS ETF",
  "EUNL.DE": "iShares Core MSCI World UCITS ETF",
  "VUSA.AS": "Vanguard S&P 500 UCITS ETF",
  "SXR8.DE": "iShares Core S&P 500 UCITS ETF",
  "EMIM.AS": "iShares Core MSCI EM IMI UCITS ETF",

  // ── Indices ──────────────────────────────────────────────────────────────
  "^GSPC": "S&P 500 Index",
  "^DJI": "Dow Jones Industrial Average",
  "^IXIC": "NASDAQ Composite Index",
  "^NDX": "NASDAQ-100 Index",
  "^RUT": "Russell 2000 Index",
  "^VIX": "CBOE Volatility Index",
  "^TNX": "CBOE 10-Year Treasury Note Yield Index",
  "^FTSE": "FTSE 100 Index",
  "^GDAXI": "DAX Performance Index",
  "^FCHI": "CAC 40 Index",
  "^STOXX50E": "EURO STOXX 50 Index",
  "^N225": "Nikkei 225",
  "^HSI": "Hang Seng Index",

  // ── Crypto & FX pairs ────────────────────────────────────────────────────
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  "SOL-USD": "Solana",
  "XRP-USD": "XRP",
  "ADA-USD": "Cardano",
  "DOGE-USD": "Dogecoin",
  "LTC-USD": "Litecoin",
  "AVAX-USD": "Avalanche",
  "DOT-USD": "Polkadot",
  "LINK-USD": "Chainlink",
  "BTC-EUR": "Bitcoin (EUR)",
  "ETH-EUR": "Ethereum (EUR)",
  "EURUSD=X": "Euro / US Dollar",
  "GBPUSD=X": "British Pound / US Dollar",
  "USDJPY=X": "US Dollar / Japanese Yen",
};

/**
 * The name to show beside a symbol, or `null` when neither source knows it.
 *
 * `stored` wins over the local table because it came from the exchange itself.
 * A stored name that is blank or whitespace is treated as absent rather than
 * rendered as an empty string beside the ticker.
 */
export function companyName(ticker: string, stored?: string | null): string | null {
  const fromDb = stored?.trim();
  if (fromDb) return fromDb;
  return COMPANY_NAMES[ticker.trim().toUpperCase()] ?? null;
}

/** `AAPL` → `AAPL — Apple Inc.`, or just `AAPL` when the name is unknown. */
export function tickerWithName(ticker: string, stored?: string | null): string {
  const name = companyName(ticker, stored);
  return name ? `${ticker} — ${name}` : ticker;
}

/*
 * There is deliberately no "short name" helper here.
 *
 * An earlier version stripped the legal suffix so long names would fit a table
 * cell, which turned "Apple Inc." into "Apple" on one page while the watchlist
 * two clicks away still said "Apple Inc." — the same company under two names,
 * which is worse than a name that is merely long. Where space is tight the
 * caller truncates with CSS (`truncate` plus a max width), so the full name
 * stays in the DOM for screen readers, copy-paste and the title attribute.
 */
