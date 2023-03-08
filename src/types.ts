import { MatchResult, Order, PeersMatchResult } from "./orderBook";

// Enum will all possible events that peers will send
export enum EventType {
  AnnounceOpenOrder = "AnnounceOpenOrder",
  CrossPeerMatch = "CrossPeerMatch",
}

export interface Events {
  [EventType.AnnounceOpenOrder]: {
    payload: {
      order: Order;
    };
    response: PeersMatchResult;
  };

  [EventType.CrossPeerMatch]: {
    payload: {
      match: MatchResult;
      ticker: string;
    };
    response: void;
  };
}

export interface Event {
  rid: string;
  key: string;
  payload: RequestPayload;
  handler: any;
}

export interface RequestPayload {
  type: EventType;
  from: string;

  // Other properties in the payload
  [key: string]: any;
}
