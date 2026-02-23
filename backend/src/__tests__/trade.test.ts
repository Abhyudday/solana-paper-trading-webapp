import { computeSlippage, applySlippage, computeFee } from "../services/trade";
import { generateOrderBook } from "../services/orderbook";

describe("Trade Service", () => {
  describe("computeSlippage", () => {
    it("returns a value between SLIPPAGE_MIN and SLIPPAGE_MAX", () => {
      for (let i = 0; i < 100; i++) {
        const s = computeSlippage();
        expect(s).toBeGreaterThanOrEqual(0.0005);
        expect(s).toBeLessThanOrEqual(0.003);
      }
    });
  });

  describe("applySlippage", () => {
    it("increases price for buy side", () => {
      const price = 100;
      const slippage = 0.01;
      const result = applySlippage(price, slippage, "buy");
      expect(result).toBe(101);
    });

    it("decreases price for sell side", () => {
      const price = 100;
      const slippage = 0.01;
      const result = applySlippage(price, slippage, "sell");
      expect(result).toBe(99);
    });

    it("returns exact price with zero slippage", () => {
      expect(applySlippage(50, 0, "buy")).toBe(50);
      expect(applySlippage(50, 0, "sell")).toBe(50);
    });
  });

  describe("computeFee", () => {
    it("computes fee correctly", () => {
      const fee = computeFee(1000);
      expect(fee).toBe(1); // 0.1% of 1000
    });

    it("returns 0 for 0 amount", () => {
      expect(computeFee(0)).toBe(0);
    });
  });
});

describe("Order Book", () => {
  describe("generateOrderBook", () => {
    it("generates correct number of levels", () => {
      const book = generateOrderBook(100, 10);
      expect(book.bids).toHaveLength(10);
      expect(book.asks).toHaveLength(10);
    });

    it("bids are sorted descending", () => {
      const book = generateOrderBook(100, 15);
      for (let i = 1; i < book.bids.length; i++) {
        expect(book.bids[i - 1].price).toBeGreaterThanOrEqual(book.bids[i].price);
      }
    });

    it("asks are sorted ascending", () => {
      const book = generateOrderBook(100, 15);
      for (let i = 1; i < book.asks.length; i++) {
        expect(book.asks[i - 1].price).toBeLessThanOrEqual(book.asks[i].price);
      }
    });

    it("all bids below mid price", () => {
      const mid = 50;
      const book = generateOrderBook(mid, 10);
      book.bids.forEach((b) => expect(b.price).toBeLessThan(mid));
    });

    it("all asks above mid price", () => {
      const mid = 50;
      const book = generateOrderBook(mid, 10);
      book.asks.forEach((a) => expect(a.price).toBeGreaterThan(mid));
    });

    it("spread is positive", () => {
      const book = generateOrderBook(100, 10);
      expect(book.spread).toBeGreaterThan(0);
    });

    it("quantities are positive", () => {
      const book = generateOrderBook(100, 10);
      book.bids.forEach((b) => expect(b.qty).toBeGreaterThan(0));
      book.asks.forEach((a) => expect(a.qty).toBeGreaterThan(0));
    });
  });
});
