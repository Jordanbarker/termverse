import { describe, it, expect } from "vitest";
import { getConnectionClosure } from "../player";

describe("getConnectionClosure", () => {
  it("home going down takes every machine with it", () => {
    expect(getConnectionClosure("home").sort()).toEqual(
      ["chipinfra", "devcontainer", "erik-pc", "home", "nexacorp"].sort()
    );
  });

  it("nexacorp going down drops everything chained through it", () => {
    expect(getConnectionClosure("nexacorp").sort()).toEqual(
      ["chipinfra", "devcontainer", "erik-pc", "nexacorp"].sort()
    );
  });

  it("chipinfra going down drops the erik-pc pivot", () => {
    expect(getConnectionClosure("chipinfra").sort()).toEqual(["chipinfra", "erik-pc"].sort());
  });

  it("leaf machines only drop themselves", () => {
    expect(getConnectionClosure("devcontainer")).toEqual(["devcontainer"]);
    expect(getConnectionClosure("erik-pc")).toEqual(["erik-pc"]);
  });
});
