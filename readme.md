Hi! Welcome to my challenge solution!

I'm happy that I managed to implement a working solution but the code quality is _far_ from what I normally output, I focused on getting the basics done rather than having a state-of-the-art half working prototype

## Architecture

- Peer: A class that encapsulates the server/client aspects of the system.
- Orderbook: Owned by the peer, responsible for the business logic. Has a ref to the peer so it can broadcast and listen to events

## Matching and locking algorithm

1- A new offer comes in, it's checked with the local order book, if there is a full match, finish here. 2- If there is no match or a partial match (no all orders matched), broadcast the event `AnnounceOpenOrder` to check if any peer can match the order 3- If no match happens within the peers, store
that order locally, otherwise: 4- If there are one or more peers that can match the order, pick one¹ to complete the match. Note that when peers receive the event they preemptively lock the candidate orders², this is to prevent race conditions 5- The selected peer receives the event
`CrossPeerMatch`, confirming the match so the orders are matched, locally, in that peer, as well as in the peer that originated the match

1- Could add more logic here, preferring peers that can fully match the order or ones with the least latency. Could also pick one at random to make it fair 2- With my implementation orders get locked forever :), there should be another event sent to the disregarded peers so they can unlock the
orders, also we could store a TTL and automatically expire that lock, more on this below.

## Ideas for a real system

Maybe an event loop system, where matches are queued and then processes one at a time, rolling back (unlocking orders) if it fails

I would also make heavy use of transactions for the same reason.

I'm not sure if my mark and sweep idea is the most correct, I guess it makes sense on a performance level since that task can be delegated to a different thread but I'm unaware of possible side effects

Even though I never built a garbage collector, I was aware of the basic idea of the mark-and-sweep algorithm, and I thought it could be a good addition,

## Improvements

Search the following string `IMPROVE:` to find some places where I left some comment about how to improve the code in a more real world case. The list is not exhaustive, there are definetly more places where things could be improved.

## Why Typescript?

I know that the challenge specified that I should use Javascript but I'm a Typescript developer nowadays, it's objectively a better choice, unless you have some specific requirements such as not adding an extra step in the build process, otherwise, in my mind, there is no reason not to use it.

I was a bit disappointed that the grenache library didn't provide any typing at all, I'm willing to open a PR to add them :)

This is nowhere near my real typescript skills, but time was a big pressure so I had to include a lot more `any`s than I would have liked
