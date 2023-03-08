import { assert, getOrderAsString, getRandomID, log, sleep } from "./utils";
import { Peer } from "./peer";
import { Events, EventType, RequestPayload } from "./types";

export enum OrderType {
  buy = "buy",
  sell = "sell",
}

export enum OrderStatus {
  open = "open",
  close = "close",
  locked = "locked",
}

const VALID_TICKERS = new Set(["btc-usd", "eth-usd", "xau-usd"]);

export interface Order {
  id: string;
  ticker: string;
  type: OrderType;
  value: number;
  quantity: number;
  ownerId: string;
  status: OrderStatus;
  lockExpiresAt?: number;
}

export interface MatchResult {
  fullyMatched: boolean;
  matchedOrdersIDs: string[];
  quantityMatched: number;
  // Used to know there did the match happen, could be in the local order book or in another peer
  serverName: string;
}

// Peers will return undefined if they didn't get a result or maybe they had an error, we just filter them
export type PeersMatchResult = (undefined | MatchResult)[];

export class OrderBook {
  // Key is the ticker, value a set with all the orders for that given ticker
  orders: Map<string, Order[]> = new Map();

  // A reference to this peer
  peer!: Peer;

  constructor() {
    VALID_TICKERS.forEach((ticker) => {
      this.orders.set(ticker, []);
    });
  }

  async processNewOrder(order: Order) {
    if (!isValidOrder(order)) {
      log(`Invalid order`);
      return;
    }

    log(`Incoming order ${getOrderAsString(order)}`);

    let matchResult = this.searchOrdersLocally(order);

    // We did match either partially or fully the new order locally
    if (matchResult.quantityMatched) {
      this.markOrdersLocally(
        OrderStatus.close,
        order.ticker,
        matchResult,
      );

      const matchType = matchResult.fullyMatched ? "Fully" : "Partially";

      log(`${matchType} matched order ${getOrderAsString(order)} locally. (Peer: ${matchResult.serverName})`);

      if (matchResult.fullyMatched) {
        // Nothing else to do, exit
        return;
      } else {
        // Update remaining quantity for further processing
        order.quantity -= matchResult.quantityMatched;
      }
    }

    log(`Broadcasting order ${getOrderAsString(order)} to peers since it wasn't fully matched locally`);
    matchResult = await this.searchOrdersWithPeers(order);

    if (matchResult.quantityMatched) {
      log(`Found match with peer ${matchResult.serverName}`);
      await this.markOrdersMatchedInPeer(
        matchResult.serverName!,
        order.ticker,
        matchResult,
      );

      const matchType = matchResult.fullyMatched ? "Fully" : "Partially";

      log(`${matchType} matched order ${getOrderAsString(order)} with peer ${matchResult.serverName}`);

      if (matchResult.fullyMatched) {
        // Nothing else to do, exit
        return;
      } else {
        // Update remaining quantity for further processing
        order.quantity -= matchResult.quantityMatched;
      }
    }

    log(`Adding order ${getOrderAsString(order)} locally to server ${this.peer.name} since it wasn't fully matched`);

    this.store(order);
  }

  // IMPROVE: Maybe a way to compact orders, if they are from the same owner, same ticker, same price. We can fuse them. Also, should use a binary search
  // Store a new order locally
  store(order: Order) {
    const tickerOrders = this.orders.get(order.ticker)!;

    let inserted = false;
    for (let i = 0; i < tickerOrders.length; i++) {
      if (order.value < tickerOrders[i].value) {
        tickerOrders.splice(i, 0, order);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      tickerOrders.push(order);
    }
  }

  markOrdersLocally(markAs: OrderStatus, ticker: string, match: MatchResult) {
    const { matchedOrdersIDs, quantityMatched } = match;

    loop:
    for (const id of matchedOrdersIDs) {
      const order = this.orders.get(ticker)!.find((x) => x.id === id);

      if (!order) {
        log(`Tried to match order ${id} but it wasn't found`);
        continue;
      }

      if (order.quantity > quantityMatched) {
        // Given that we have more orders that we need, first we mark the existing order, only the quantity we need
        this.update(order, { status: markAs, quantity: quantityMatched });

        // And then create a new order with the remaining orders
        const surplusOrders = order.quantity - quantityMatched;
        const newOrder: Order = { ...order, id: getRandomID(), quantity: surplusOrders, status: OrderStatus.open };
        this.store(newOrder);

        break loop;
      }

      // Otherwise mark everything and keep iterating because we have finished yet
      this.update(order, { status: markAs });
    }
  }

  markOrdersMatchedInPeer(
    peerName: string,
    ticker: string,
    match: MatchResult,
  ) {
    return this.peer.request(EventType.CrossPeerMatch, {
      match,
      ticker,
    }, peerName);
  }

  /**
   * Update a given order, supports partial update
   */
  update(currentOrder: Order, updatedOrder: Partial<Order>) {
    const { ticker, id } = currentOrder;
    // IMPROVE: Validate new order data

    // IMPROVE: Lock everything otherwise a new order could come in and change the index, this could be solved with a transaction or an assertion at the end that the index is still the same
    const currentOrderIndex = this.orders.get(ticker)!.findIndex((x) => x.id === id);

    assert(currentOrderIndex !== -1, `Tried to update order ${id} of ticker ${ticker} but it wasn't found`);

    this.orders.get(ticker)![currentOrderIndex] = {
      ...currentOrder,
      ...updatedOrder,
    };
  }

  // IMPROVE: Instead of mutating an in-memory array I would batch all updates in a single transaction to update the DB
  sweepAndRelease() {
    for (const ticker of VALID_TICKERS) {
      let removedOrders = 0;
      let orders = this.orders.get(ticker)!;

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];

        if (order.status === OrderStatus.close) {
          removedOrders++;

          orders.splice(i, 1);
        }

        // IMPROVE: Implement check to release locked orders after some time. This could easily be done in redis
      }

      if (removedOrders) {
        log(`Removed ${removedOrders} orders from ticker ${ticker}`);
        this.orders.set(ticker, orders);
      }
    }
  }

  searchOrdersLocally(order: Order): MatchResult {
    // Return the IDs of the orders for perf a data integrity reasons.
    const matchedOrdersIDs: string[] = [];

    let ordersNeeded = order.quantity;
    const openOrders = this.orders.get(order.ticker)!;
    const wantedOrderType = oppositeType(order.type);

    // IMPROVE: Maybe use a binary search
    loop:
    for (let i = 0; i < openOrders.length; i++) {
      // We have the quantity we were looking for, we can exit
      if (ordersNeeded === 0) {
        break loop;
      }

      const candidateOrder = openOrders[i];

      if (
        candidateOrder.ownerId === order.ownerId || // No self-match
        candidateOrder.type !== wantedOrderType || // Not the right
        candidateOrder.status !== OrderStatus.open || // This is the mechanism to mitigate race conditions
        // IMPROVE: The price matching logic can be expanded to, for example, include a buy/sell at market price option, or maybe to specify the spread the user accepts
        candidateOrder.value > order.value // No price match.
      ) {
        continue;
      }

      // Fast path, amount found exactly matches what we are looking for
      if (candidateOrder.quantity >= ordersNeeded) {
        matchedOrdersIDs.push(candidateOrder.id);
        ordersNeeded = 0;
        break;
      }

      // We found some orders but we need more, will try again next iteration
      matchedOrdersIDs.push(candidateOrder.id);
      ordersNeeded -= candidateOrder.quantity;
    }

    return {
      fullyMatched: ordersNeeded === 0,
      matchedOrdersIDs,
      quantityMatched: order.quantity - ordersNeeded,
      serverName: this.peer.name,
    };
  }

  async searchOrdersWithPeers(order: Order): Promise<MatchResult> {
    const peersResult = await this.peer.request(
      EventType.AnnounceOpenOrder,
      { order },
    ) || [];

    // Remove undefined
    const actualResults = peersResult.filter(Boolean) as MatchResult[];

    if (actualResults.length === 0) {
      return {
        fullyMatched: false,
        matchedOrdersIDs: [],
        quantityMatched: 0,
        serverName: this.peer.name,
      };
    }

    // IMPROVE: Now we take the first peer to respond, but this could be unfair, maybe a random take would be best
    return actualResults[0];
  }

  printOpenOrders() {
    // console.log(`Status | Type | Ticker | Value | Quantity | Owner ID |`)

    for (const openOrders of this.orders.values()) {
      for (const order of openOrders) {
        console.log(getOrderAsString(order));
      }
    }
  }

  async webhook(rid: string, key: string, payload: RequestPayload, handler: any) {
    const { type, from, ...requestPayload } = payload;

    const data = requestPayload.payload as Events[typeof type]["payload"];

    // I extracted this function so that I don't have to call handler.reply on every branch
    const process = async () => {
      // IMPROVE: This shouldn't be needed, for some reason event's are being self-listened
      if (from === this.peer.name) {
        return;
      }

      log(
        `Incoming request to server ${this.peer.name} from ${from}, event ${type}`,
      );

      // IMPROVE: User real validation, maybe Zod
      if (!requestPayload || !type || typeof type !== "string") {
        log(`Ignoring empty or malformed payload`);
        return;
      }

      switch (type) {
        case EventType.AnnounceOpenOrder: {
          const { order } = data as Events[typeof type]["payload"];
          const localMatch = this.searchOrdersLocally(
            order,
          );

          if (localMatch.quantityMatched) {
            // Preemptively lock orders
            this.markOrdersLocally(
              OrderStatus.locked,
              order.ticker,
              localMatch,
            );

            log(`Cross match between ${this.peer.name} and ${from}. Found ${localMatch.quantityMatched} orders. Now locked`);
            return localMatch;
          } else {
            log(`Peer ${this.peer.name} couldn't fullfil order from ${from}`);
            return;
          }
        }

        case EventType.CrossPeerMatch: {
          const { ticker, match } = data as Events[typeof type]["payload"];

          this.markOrdersLocally(
            OrderStatus.close,
            ticker,
            match,
          );

          log(`Cross peer match confirmed with ${from}`);
          return;
        }

        default: {
          // Small TS trick, forces exhausted check of all the values of the enum
          const assertType: never = type;
          log(`Unknown even type ${assertType}`);
          return;
        }
      }
    };

    handler.reply(null, await process());
    return;
  }
}

// Utils

// IMPROVE: Validate valid ticker, valid amounts and quantity, etc
function isValidOrder(order: Order) {
  return true;
}

function oppositeType(orderType: OrderType) {
  if (orderType === OrderType.buy) {
    return OrderType.sell;
  } else {
    return OrderType.buy;
  }
}
