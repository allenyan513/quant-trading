import { describe, it, expect } from "vitest";
import { firstTicker, stripHtml, normalizeNews, normalizeArticle } from "./news-feed.js";

describe("firstTicker (fmp-articles `tickers` is an exchange-prefixed string)", () => {
  it("strips the exchange prefix", () => {
    expect(firstTicker("NYSE:DOCN")).toBe("DOCN");
    expect(firstTicker("NASDAQ:NVDA")).toBe("NVDA");
  });

  it("takes the first of a comma list", () => {
    expect(firstTicker("NYSE:DOCN,NASDAQ:NVDA")).toBe("DOCN");
  });

  it("upper-cases a bare symbol with no exchange", () => {
    expect(firstTicker("aapl")).toBe("AAPL");
  });

  it("returns null for empty/undefined", () => {
    expect(firstTicker(undefined)).toBeNull();
    expect(firstTicker("")).toBeNull();
    expect(firstTicker(" , ")).toBeNull();
  });
});

describe("stripHtml", () => {
  it("removes tags, decodes entities, collapses whitespace", () => {
    expect(stripHtml("<p>Hello&nbsp;<strong>world</strong> &amp; more</p>")).toBe("Hello world & more");
  });
});

describe("normalizeNews", () => {
  it("maps the news shape and converts ET publishedDate to UTC", () => {
    const row = normalizeNews("stock", {
      symbol: "amtm",
      publishedDate: "2026-06-03 08:05:00",
      title: "Amentum Debuts on the Fortune 500 List",
      text: "body",
      url: "https://example.com/a",
      site: "businesswire.com",
      image: "https://img/x.jpg",
    });
    expect(row).toMatchObject({
      category: "stock",
      external_id: "https://example.com/a",
      symbol: "AMTM",
      url: "https://example.com/a",
      published_at: "2026-06-03T12:05:00.000Z", // EDT -04:00
    });
  });

  it("leaves symbol null when absent (macro/general news)", () => {
    const row = normalizeNews("general", { url: "https://e/x", title: "macro" });
    expect(row.symbol).toBeNull();
    expect(row.external_id).toBe("https://e/x");
  });
});

describe("normalizeArticle", () => {
  it("maps date->published_at, content->text(stripped), link->url, tickers->symbol", () => {
    const row = normalizeArticle("fmp_article", {
      title: "DOCN insights",
      date: "2026-06-02 22:16:27",
      content: "<ul><li>point</li></ul>",
      tickers: "NYSE:DOCN",
      link: "https://fmp/x",
      site: "Financial Modeling Prep",
      image: "https://img/y.png",
    });
    expect(row).toMatchObject({
      category: "fmp_article",
      external_id: "https://fmp/x",
      url: "https://fmp/x",
      symbol: "DOCN",
      text: "point",
      published_at: "2026-06-02T22:16:27.000Z", // fmp-articles date is naive UTC (no ET shift)
    });
  });
});
