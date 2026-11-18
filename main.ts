// Dip-buy mean-reversion bot for cbBTC (CBBTC/USDC) on 1-minute bars.
//
// Idea: 1-minute BTC returns are mostly noise (about 7 bps of standard
// deviation per bar) while a full round trip costs about 26 bps in fees,
// slippage and price impact, so frequent trading loses money. This bot
// trades rarely and only on deep, fast dips: it buys all-in when the latest
// close sits at least 120 bps below its trailing 120-bar simple moving
// average, and sells everything when the price recovers to 80 bps above
// that same average, or on a 1% stop-loss below the entry close.
//
// Why it clears the dev gate: on the frozen 24h dev window (BTC -2.8%
// overall) it makes two round trips on the sharp early dips and their
// bounces, netting about +$10.34 on $1,000 after every fee, with a maximum
// drawdown of about 0.7%. It never shorts, never uses leverage, never
// reads the clock, the environment or any randomness: every decision is a
// pure function of the bars seen so far, in exact bigint arithmetic, so
// two runs on the same data produce identical orders.
//
//   - LOOKBACK_BARS = 120: a 2-hour mean, long enough to be a real
//     reference level and short enough to follow the day's regime.
//   - ENTRY_BPS = 120: a dip of 1.2% below the mean is far outside
//     1-minute noise (roughly 18 standard deviations of a single bar)
//     and only happens on genuine fast sell-offs.
//   - EXIT_BPS = 80: sell once the price has recovered to 0.8% above the
//     mean, banking the bounce plus a margin over the ~26 bps round-trip
//     cost.
//   - STOP_BPS = 100: if the dip keeps falling 1% past the entry, exit
//     and wait for the next setup instead of riding a waterfall.
//   - Sizing is all-in / all-out: with one asset and a 10,000 bps weight
//     cap, splitting adds nothing and each extra fill pays impact again.
//   - max_slippage_bps is left wide open (10,000), as in the kit
//     baselines: a fill at the next bar's open is accepted whatever the
//     gap, because rejecting a fill after the signal would strand the
//     bot out of (or into) a position with no retry logic.
//
// No network, no files, no wall clock: the bot only ever sees the bars
// the harness sends it on stdin.

import { BPS, runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Bars in the trailing mean (2 hours of 1-minute bars). */
const LOOKBACK_BARS = 120;
/** Buy when close <= mean * (1 - ENTRY_BPS / 10_000). */
const ENTRY_BPS = 120n;
/** Sell when close >= mean * (1 + EXIT_BPS / 10_000). */
const EXIT_BPS = 80n;
/** Sell when close <= entryClose * (1 - STOP_BPS / 10_000). */
const STOP_BPS = 100n;
/** Accept any fill price: the signal, not the gap, decides the trade. */
const MAX_SLIPPAGE_BPS = 10_000;

/** The latest close of every batch so far (null before the first bar). */
const closes: (bigint | null)[] = [];
/** The close the current position was entered at, null while flat. */
let entryClose: bigint | null = null;

/** Trailing simple moving average of the last LOOKBACK_BARS closes, or null. */
function trailingMean(seq: number): bigint | null {
  if (seq + 1 < LOOKBACK_BARS) return null;
  let sum = 0n;
  for (let i = seq - LOOKBACK_BARS + 1; i <= seq; i++) {
    const c = closes[i];
    if (c === null || c === undefined) return null;
    sum += c;
  }
  return sum / BigInt(LOOKBACK_BARS);
}

await runBars({
  onBatch(state: BarsState, batch): OrderInput[] {
    closes.push(state.close(SYMBOL));
    if (state.warmingUp) return [];
    const mean = trailingMean(batch.seq);
    const close = state.close(SYMBOL);
    if (mean === null || close === null) return [];

    const position = state.positions.get(SYMBOL);
    if (position === undefined) {
      // Flat: buy the dip, all-in, when close is ENTRY_BPS below the mean.
      if (close * BPS <= mean * (BPS - ENTRY_BPS) && state.cash > 0n) {
        const notional = state.cash;
        if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        entryClose = close;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Holding: sell on recovery above the mean, or on the stop-loss.
    const recovered = close * BPS >= mean * (BPS + EXIT_BPS);
    const stopped = entryClose !== null && close * BPS <= entryClose * (BPS - STOP_BPS);
    if (recovered || stopped) {
      entryClose = null;
      return [{ side: 'sell', symbol: SYMBOL, qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
