export interface SessionContext {
  currentDatabase: string;
  currentSchema: string;
  currentWarehouse: string;
  currentRole: string;
  currentUser: string;
  /** In-game "now" — when omitted, date functions fall back to real wall-clock time. */
  gameNow?: Date;
}

export function createDefaultContext(username?: string, gameNow?: Date): SessionContext {
  return {
    currentDatabase: "NEXACORP_PROD",
    currentSchema: "ANALYTICS",
    currentWarehouse: "NEXACORP_WH",
    currentRole: "ANALYST",
    currentUser: (username ?? "PLAYER").toUpperCase(),
    gameNow,
  };
}
