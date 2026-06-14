import { describe, it, expect } from "vitest";
import { parseList } from "./json";

describe("parseList", () => {
  it("JSON配列文字列を配列にパースする", () => {
    expect(parseList('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("空配列のJSONを空配列にする", () => {
    expect(parseList("[]")).toEqual([]);
  });

  it("不正なJSONは空配列を返す", () => {
    expect(parseList("not json")).toEqual([]);
  });

  it("配列でないJSON（オブジェクト）は空配列を返す", () => {
    expect(parseList('{"a":1}')).toEqual([]);
  });
});
