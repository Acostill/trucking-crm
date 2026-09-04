import assert from "node:assert/strict";
import test from "node:test";
import { parseRateCard, rateFormatSignature } from "../src/parser.ts";

test("parses the observed Spot result contract", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "Portland Mkt - Chicago Mkt",
    averageTotal: "$3,729",
    averagePerMile: "($1.75/mi)",
    milesAndTimeframe: "2,131 mi | 7d average",
    range: "$3,197 - $4,092 ($1.50 - $1.92/mi)",
  });
  assert.deepEqual(
    {
      average: result.averageTotalUsd,
      low: result.lowTotalUsd,
      high: result.highTotalUsd,
      miles: result.miles,
      timeframe: result.timeframe,
    },
    { average: 3729, low: 3197, high: 4092, miles: 2131, timeframe: "7d average" },
  );
  assert.equal(result.fuel.value, null);
  assert.equal(result.rangeUnavailableReason, null);
  assert.match(result.fuel.reason || "", /did not display/);
});

test("parses alternate DAT range typography and per-mile wording", () => {
  const result = parseRateCard({
    rateType: "CONTRACT",
    acceptedMarketLane: "A - B",
    averageTotal: "$1,000",
    averagePerMile: "($1.00/mile)",
    milesAndTimeframe: "1,000 mi | 90d average",
    range: "$900.00 – $1,100.00 ($0.90/mile — $1.10/mile)",
  });
  assert.equal(result.lowTotalUsd, 900);
  assert.equal(result.highTotalUsd, 1100);
  assert.equal(result.lowPerMileUsd, 0.9);
  assert.equal(result.highPerMileUsd, 1.1);
  assert.equal(result.rangeUnavailableReason, null);
});

test("parses the current DAT average-per-mile value when the unit is outside the value element", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "Selma Mkt - Los Angeles Mkt",
    averageTotal: "$900",
    averagePerMile: "$3.86",
    milesAndTimeframe: "233 mi | 7d average",
    range: "$800 - $1,000",
  });
  assert.equal(result.averagePerMileUsd, 3.86);
});

test("parses a bounded DAT per-mile expression with spacing and a footnote marker", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "Selma Mkt - Los Angeles Mkt",
    averageTotal: "$900",
    averagePerMile: "( $ 3.86* / mi )",
    milesAndTimeframe: "233 mi | 7d average",
    range: "$800 - $1,000",
  });
  assert.equal(result.averagePerMileUsd, 3.86);
});

test("preserves the market total when DAT displays average per-mile as unavailable", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "Selma Mkt - Los Angeles Mkt",
    averageTotal: "$900",
    averagePerMile: "–",
    milesAndTimeframe: "233 mi | 7d average",
    range: "$800 - $1,000",
  });
  assert.equal(result.averageTotalUsd, 900);
  assert.equal(result.averagePerMileUsd, null);
  assert.match(result.averagePerMileUnavailableReason || "", /unavailable/);
});

test("fails closed on multiple per-mile numbers and reports only a value-free format signature", () => {
  assert.throws(
    () => parseRateCard({
      rateType: "SPOT",
      acceptedMarketLane: "Selma Mkt - Los Angeles Mkt",
      averageTotal: "$900",
      averagePerMile: "$3.86 / mi or $4.10 / mi",
      milesAndTimeframe: "233 mi | 7d average",
      range: "$800 - $1,000",
    }),
    /format \$#\.## \/ A A \$#\.## \/ A/,
  );
  assert.equal(rateFormatSignature("$3.86 RPM"), "$#.## A");
});

test("returns explicit nulls when DAT labels the range unavailable", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "A - B",
    averageTotal: "$1,000",
    averagePerMile: "($1.00/mi)",
    milesAndTimeframe: "1,000 mi | 7d average",
    range: "Insufficient data",
  });
  assert.equal(result.lowTotalUsd, null);
  assert.equal(result.highTotalUsd, null);
  assert.equal(result.lowPerMileUsd, null);
  assert.equal(result.highPerMileUsd, null);
  assert.match(result.rangeUnavailableReason || "", /explicitly displayed/);
});

test("returns explicit nulls when the verified range field is blank", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "A - B",
    averageTotal: "$1,000",
    averagePerMile: "($1.00/mi)",
    milesAndTimeframe: "1,000 mi | 7d average",
    range: "  ",
  });
  assert.equal(result.lowTotalUsd, null);
  assert.equal(result.highTotalUsd, null);
  assert.match(result.rangeUnavailableReason || "", /did not display/);
});

test("preserves a displayed total range when its per-mile range is absent", () => {
  const result = parseRateCard({
    rateType: "SPOT",
    acceptedMarketLane: "A - B",
    averageTotal: "$1,000",
    averagePerMile: "($1.00/mi)",
    milesAndTimeframe: "1,000 mi | 7d average",
    range: "$900 - $1,100",
  });
  assert.equal(result.lowTotalUsd, 900);
  assert.equal(result.highTotalUsd, 1100);
  assert.equal(result.lowPerMileUsd, null);
  assert.equal(result.highPerMileUsd, null);
  assert.match(result.rangeUnavailableReason || "", /per-mile/);
});

test("rejects an ambiguous range instead of guessing", () => {
  assert.throws(
    () =>
      parseRateCard({
        rateType: "CONTRACT",
        acceptedMarketLane: "A - B",
        averageTotal: "$1,000",
        averagePerMile: "($1.00/mi)",
        milesAndTimeframe: "1,000 mi | 90d average",
        range: "Market estimate pending review",
      }),
    /range could not be verified/,
  );
});
