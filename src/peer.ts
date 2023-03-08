// @ts-ignore
import { PeerRPCClient, PeerRPCServer } from "grenache-nodejs-http";
// @ts-ignore
import Link from "grenache-nodejs-link";
import { getEnv, log, sleep } from "./utils";
import { Events, EventType, RequestPayload } from "./types";
import { Order, OrderBook, OrderStatus } from "./orderBook";

const GLOBAL_SERVICE_NAME = "PEER_ORDER_MATCHING_SERVICE";

export class Peer {
  server: any;
  client: any;

  constructor(
    public name: string,
    public port: number,
    public grapeUrl: string,
    public orderBook: OrderBook,
  ) {
    this.port = port;
    this.orderBook = orderBook;

    this.start();

    // The orderbook will internally use it to broadcast orders
    orderBook.peer = this;
  }

  start() {
    // Start the client
    this.client = getClient(this.grapeUrl);

    // Start the server
    const serverLink = getLink(this.grapeUrl);
    const serverPeer = new PeerRPCServer(serverLink, { timeout: 300000 });
    serverPeer.init();

    this.server = serverPeer.transport("server");
    this.server.listen(this.port);

    this.startRequestListener();

    // Start the announce loop
    setInterval(() => {
      // Announces with a shared name so every peer can talk with it
      serverLink.announce(GLOBAL_SERVICE_NAME, this.server.port, {});
      // Announces with a specific name so that it can be targeted alone
      serverLink.announce(this.name, this.server.port, {});
    }, 1000);

    // Start the cleanup loop
    setInterval(() => {
      this.orderBook.sweepAndRelease();
    }, 5000);
  }

  startRequestListener() {
    // Register request listener
    this.server.on("request", (rid: string, key: string, payload: RequestPayload, handler: any) => this.orderBook.webhook(rid, key, payload, handler));
  }

  request<Event extends EventType>(type: EventType, payload: Events[Event]["payload"], peerName?: string) {
    return this._makeRequest<Events[Event]["response"]>({ type, payload }, peerName);
  }

  private _makeRequest<T>(
    payload: any,
    serviceName = GLOBAL_SERVICE_NAME,
  ): Promise<T> {
    // If no service is specified then we make the request to all peers, otherwise we talk directly with the selected peer
    const method = serviceName === GLOBAL_SERVICE_NAME ? "map" : "request";
    payload.from = this.name;

    return new Promise((resolve, reject) => {
      this.client[method](
        serviceName,
        payload,
        { timeout: getEnv().peerRequestTimeout },
        (error: any, data: T) => {
          if (error) {
            // IMPROVE: Definitely not the right thing to do but I'm trying to narrow error into known cases for simplicity
            if (error.message?.includes("ECONNREFUSED") || error.message?.includes("ERR_GRAPE_LOOKUP_EMPTY")) {
              log(`No peers found`);
              resolve(undefined as any);
            } else if (
              error.message?.includes("ERR_TIMEOUT") ||
              error.message?.includes("ESOCKETTIMEDOUT")
            ) {
              log(`Request to peers timeout`);
              resolve(undefined as any);
            } else {
              log(`Unknown error while requesting to peers`);
              log(error);
              reject(error);
            }
          }

          resolve(data);
        },
      );
    });
  }
}

// Utils

function getClient(grapeUrl: string) {
  const link = getLink(grapeUrl);
  const peerClient = new PeerRPCClient(link, {});
  peerClient.init();

  return peerClient;
}

function getLink(grapeUrl: string) {
  const link = new Link({
    grape: grapeUrl,
  });
  link.start();

  return link;
}
