import { OrderBook, OrderStatus, OrderType } from "./orderBook";
import { Peer } from "./peer";
import { startHTTPServer } from "./server";
import { getRandomID, getValidatedPeerArgs, log, sleep } from "./utils";

const { serverName, grapeURL, peerPort, serverPort } = getValidatedPeerArgs();

const peer = new Peer(serverName, peerPort, grapeURL, new OrderBook());

// Barebone http so it can receive request from the outside, for example a web client where the users create the new orders
startHTTPServer(serverName, serverPort, peer.orderBook);

process.on("uncaughtException", (error: unknown) => {
  log(`Unhandled exception happened`);
  log(error);
});

// To test, paste simulation code bellow
