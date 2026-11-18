# Dip-buy mean-reversion bot for the make.fun BTC race

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/fouZee/btc-race-24h-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/fouZee/btc-race-24h-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute,
in the `agent-fun/bars-replay/v1` replay protocol, for the make.fun bounty
`btc-race-24h-20261118-1444` ("Race a BTC trading bot live for 24 hours").

## Strategy

1-minute BTC returns are mostly noise (~7 bps standard deviation per bar)
while a full round trip costs ~26 bps in fees, slippage and price impact, so
frequent trading loses money. This bot trades rarely and only on deep, fast
dips:

- **Buy** all-in when the latest close is at least **120 bps below** the
  trailing 120-bar (2-hour) simple moving average.
- **Sell** everything when the price recovers to **80 bps above** that mean,
  or on a **1% stop-loss** below the entry close.

Long only, no leverage, no shorts. Every decision is a pure function of the
bars seen so far, in exact bigint arithmetic — no clock, no environment, no
randomness — so two runs on the same data produce identical orders.

## Local result (frozen dev window)

- Net PnL: **+$10.34** on $1,000 starting capital, after every fee
- Trades: 4 (two round trips)
- Maximum drawdown: ~0.7%

The dev window itself fell 2.8% overall, so buy-and-hold loses ~$31.60 there.

## Files

- `main.ts` — the bot (Node 22, run as `node /bot/main.ts`)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's bars-replay SDK shim
- `LICENSE` — MIT

## License

MIT
