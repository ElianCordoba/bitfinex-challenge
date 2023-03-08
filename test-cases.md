## Setup

```sh
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

Since the project it's in Typescript you need to compile it first

```sh
npm run build-watch
```

_(this could be avoided by using ts-node, tsx, deno, etc. Tools that run ts files directly)_

Add the code of any of the example in the `index.ts` file

## Matching locally

Run `npm run s1` or the `Launch Program` vscode configuration

```ts
(async () => {
  // Expected to add offer locally
  await peer.orderBook.processNewOrder({
    id: getRandomID(),
    "ticker": "btc-usd",
    "type": OrderType.sell,
    "value": 25000,
    "quantity": 10,
    "ownerId": "1",
    status: OrderStatus.open,
  });
  // Expected to add offer locally
  await peer.orderBook.processNewOrder({
    id: getRandomID(),
    "ticker": "btc-usd",
    "type": OrderType.sell,
    "value": 24000,
    "quantity": 10,
    "ownerId": "2",
    status: OrderStatus.open,
  });
  // Expected to match 5, leaving the other 5 open
  await peer.orderBook.processNewOrder({
    id: getRandomID(),
    "ticker": "btc-usd",
    "type": OrderType.buy,
    "value": 25000,
    "quantity": 5,
    "ownerId": "3",
    status: OrderStatus.open,
  });

  // Expected to match the remaining 5 and leave 15 open
  await peer.orderBook.processNewOrder({
    id: getRandomID(),
    "ticker": "btc-usd",
    "type": OrderType.buy,
    "value": 25000,
    "quantity": 30,
    "ownerId": "4",
    status: OrderStatus.open,
  });
})();
```

## Race condition test

1- Run `npm run s2` on one terminal, will create an open order 2- Run `npm run s1` and `npm run s3` on two separete terminals at the same time

```ts
await sleep(3000);

if (serverName === "server_2") {
  await peer.orderBook.processNewOrder({
    id: getRandomID(),
    "ticker": "btc-usd",
    "type": OrderType.sell,
    "value": 25000,
    "quantity": 10,
    "ownerId": "1",
    status: OrderStatus.open,
  });
} else {
  // Expected the first to match to have no open orders, since all the 3 got match
  // And expect the other peer to have 4 remaining
  await peer.orderBook.processNewOrder({
    id: getRandomID(),
    "ticker": "btc-usd",
    "type": OrderType.buy,
    "value": 25000,
    "quantity": 7,
    "ownerId": "2",
    status: OrderStatus.open,
  });
}

await sleep(10000);
log("---------------------FINAL STATE---------------------");
peer.orderBook.printOpenOrders();
```
