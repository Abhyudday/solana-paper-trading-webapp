export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
  spread: number;
}

const DEFAULT_DEPTH = 15;
const DEFAULT_SPREAD_PCT = 0.002;

export function generateOrderBook(
  midPrice: number,
  depth: number = DEFAULT_DEPTH,
  spreadPct: number = DEFAULT_SPREAD_PCT
): OrderBook {
  const halfSpread = midPrice * spreadPct * 0.5;
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  for (let i = 0; i < depth; i++) {
    const bidOffset = halfSpread + (midPrice * 0.001 * (i + Math.random() * 0.5));
    const askOffset = halfSpread + (midPrice * 0.001 * (i + Math.random() * 0.5));

    bids.push({
      price: parseFloat((midPrice - bidOffset).toFixed(8)),
      qty: parseFloat((100 + Math.random() * 10000).toFixed(2)),
    });

    asks.push({
      price: parseFloat((midPrice + askOffset).toFixed(8)),
      qty: parseFloat((100 + Math.random() * 10000).toFixed(2)),
    });
  }

  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  return {
    bids,
    asks,
    midPrice,
    spread: asks[0].price - bids[0].price,
  };
}
