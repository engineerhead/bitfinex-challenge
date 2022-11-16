import { client } from "./Client.js";
import { OrderBook } from "./OrderBook.js";

startNode(23456);
startNode(54321);
startNode(32754);

/**
 * Starts server and respective client
 */
function startNode(port){
    new OrderBook(port);
    client(port.toString());
}