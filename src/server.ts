import { createServer } from "node:http";
import { Order, OrderBook } from "./orderBook";
import { getBody, getRandomID, log } from "./utils";

export function startHTTPServer(serverName: string, serverPort: number, orderBook: OrderBook) {
  createServer(async (req, res) => {
    // IMPROVE: Poor's man CORS
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": 2592000,
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const { method, url } = req;

    const payload = await getBody<Order>(req);

    // IMPROVE: Done this way for simplicity sake so that from the http client I don't need to simulate the ID on every request
    payload.id = getRandomID();

    switch (true) {
      case method === "GET" && url === "/getOpenOrders": {
        res.write(JSON.stringify({ orders: orderBook.orders }));
        break;
      }

      case method === "POST" && url === "/createOrder": {
        orderBook.processNewOrder(payload);
        break;
      }

      default: {
        log(`No handler for request ${method} - ${url}`);
        res.statusCode = 404;
        break;
      }
    }

    res.end();
  }).listen(serverPort, () => {
    log(`Server ${serverName} running on port ${serverPort}`);
  });
}
