import { DataType, Value } from "../types";

export interface ResultColumn {
  name: string;
  type: DataType;
}

export interface ResultSet {
  columns: ResultColumn[];
  rows: Value[][];
  rowCount: number;
}

export interface StatusMessage {
  message: string;
  rowsAffected?: number;
}

export type QueryResult =
  | { type: "resultset"; data: ResultSet }
  | { type: "status"; data: StatusMessage }
  | { type: "error"; message: string; position?: { line: number; column: number } };
