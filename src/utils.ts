import { IncomingMessage } from "node:http";

export function getValidatedPeerArgs() {
  // Ignore first 2 arguments since they are the node binary and executed file been executed, respectively
  const programArgs = process.argv.slice(2);

  let [serverName, grapeURL, peerPort, serverPort] = programArgs as any;

  peerPort = Number(peerPort);
  serverPort = Number(serverPort || peerPort * 10);

  assert(serverName && typeof serverName === "string", "Invalid server name");
  assert(grapeURL && typeof grapeURL === "string", "Invalid grape url");
  assert(!Number.isNaN(peerPort), "Invalid peer port");
  assert(!Number.isNaN(serverPort), "Invalid server port");

  return { serverName, grapeURL, peerPort, serverPort };
}

function getFormattedDate() {
  const date = new Date();
  let hours = date.getHours().toString().padStart(2, "0");
  let minutes = date.getMinutes().toString().padStart(2, "0");
  let seconds = date.getSeconds().toString().padStart(2, "0");
  let milliseconds = date.getMilliseconds().toString().padStart(3, "0");

  return `${hours}:${minutes}:${seconds}:${milliseconds}`;
}

export function log(message: any) {
  console.log(`${getFormattedDate()} | ${message}`);
}

// For logging proposes
export function getOrderAsString(order: Order) {
  const { status, ticker, type, value, quantity, ownerId } = order;
  return `
    \n
    ------------------------------------
    Status: ${status.toUpperCase()} | Owner ID: ${ownerId}
    ${type.toUpperCase()} | ${ticker} $${value} | Units: ${quantity}
    ------------------------------------
    \n
  `;
}

export function getBody<T = Record<string, any>>(
  req: IncomingMessage,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString();
    });
    req.on("end", () => {
      try {
        const jsonData = JSON.parse(data);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", (error) => {
      reject(error);
    });
  });
}

import crypto from "crypto";
import { Order } from "./orderBook";

export function getRandomID() {
  return crypto.randomBytes(16).toString("hex");
}

export function assert(condition: any, errorMessage?: string) {
  if (!condition) {
    throw new Error(errorMessage || "Assertion failure");
  }
}

// IMPROVE: Read from a real .env file
export function getEnv() {
  return {
    // Timeout porpously long to debug easily, should check if the env is dev otherwise load a real value
    peerRequestTimeout: 600000,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}
