import {PeerRPCServer, PeerRPCClient} from "grenache-nodejs-http";
import Link from "grenache-nodejs-link";
import _ from "lodash";

export class OrderBook{

    constructor(port){
        this.initServer(port);
        this.initClient();
        this.id = port.toString();
        this.orders = [];
    }

    /**
     * Starts RPC server at given port and announces service
     * @param {*} port 
     */
    initServer(port){
        
        const link = new Link({
            grape: "http://127.0.0.1:30001"
        });
        link.start();

        const peer = new PeerRPCServer(link, {});
        peer.init();

        const service = peer.transport("server");
        service.listen(port);
        service.on('request', this.handleRequest.bind(this));

        setInterval(() => {
            link.announce('rpc_test', service.port, {})
        }, 1000);
    }

    /**
     * Starts client for the RPC server announcing service
     */
    initClient(){
        const link = new Link({
            grape: 'http://127.0.0.1:30001'
        })
        link.start();

        this.peer = new PeerRPCClient(link,{});
        this.peer.init();
    }

    handleRequest(rid, key, payload, handler){
        //Don't handle own generated request

        if (payload.requestSender == this.id){
            return;
        }
        

        switch (payload.requestType) {
            case "CLIENT_ORDER_ADD":
                this.handleClientOrderAdd(payload, handler);
                break;
            case "ORDER_ADD":
                this.handleOrderAdd(payload, handler);
                break;
            case "ORDER_LOCK":
                this.handleOrderLock(payload, handler);
                break;
            case "ORDER_EXECUTE":
                this.handleOrderExecute(payload, handler);
                break;
            case "ORDER_CLOSED":
                this.handlerOrderClose(payload, handler);
                break;

            default:
                break;
        }
    }

    /**
     * Marks order completed
     * @param {*} payload 
     * @param {*} handler 
     */
    handlerOrderClose(payload, handler){
        let order = this.orders.find(order => order.orderId === payload.orderId)
        if(order){
            order.closed = true;
            
                handler.reply(null,{
                    closed: true
                })
            
        }
        
    }

    /**
     * Handles Order Complete Request.
     * Funds transfer isn't handled for now.
     * @param {*} payload 
     * @param {*} handler 
     * @returns 
     */
    handleOrderExecute(payload, handler){
        console.log("IN order execute")
        let order = this.orders.find(order => order.orderId === payload.orderId)
        if(!order ){
            return;

        }
        console.log("Sending order close request")
        const request = {
            orderId: payload.orderId,
            requestSender: this.id,
            requestType: "ORDER_CLOSED"
        }
        // Funds Transfer
        this.peer.request(
            'rpc_test',
            request,
            {},
            (err, data) => {
                console.log(data)
            }

        )
    }

    /**
     * Puts a lock to an order
     * @param {*} payload 
     * @param {*} handler 
     * @returns 
     */
    handleOrderLock(payload, handler){
        let idToSend;
        
        for (let order of this.orders){
            if(order.orderId === payload.orderId){
                continue;
            }

            

            if(order.serverId !== this.id){
                console.error('Not owned')
                return;
            }

            
            if(order.remoteLock){
                if(order.remoteLock.serverId !== payload.requestSender){
                    console.error("Order already in lock")
                    return;
                }

                idToSend = order.remoteLock.Id;
            
            }else{
                let id = _.random(454629);
                order.remoteLock = {
                    id,
                    serverId: payload.requestSender
                }
                idToSend = id;

            }
            
                
                // Somehow Grape is throwing write after end 
                // if handler is called immediately.
                    setTimeout(()=>{
                        handler.reply(null,{
                            lockId: idToSend
                        })
                    }, 5)
                
                
            
        }
        
    }

    /**
     * Adds order to OrderBook
     * @param {*} payload 
     * @param {*} handler 
     */

    handleOrderAdd(payload, handler){
        this.orders.push(payload.order)
        handler.reply(null, {
            requestType: "ORDER_ADD",
            serverId: payload.order.serverId
        })
    }

    /**
     * Order from a client is added to local order book
     * Then a broadcast is sent to other peers to add it in respective order books.
     * A response is sent to client indicating order has been handled
     * @param {*} payload 
     * @param {*} handler 
     */
    async handleClientOrderAdd(payload, handler){
        const response = {
            handled: true
        };
        handler.reply(null, response);

        const order = {
            serverId: this.id,
            ...payload.order
        };

        this.orders.push(order);
        await this.broadcastOrder(order)

    }

    /**
     * A broadcast is sent to other peers for an order 
     * which is already handled at the local level.
     * 
     * @param {*} order 
     */
    async broadcastOrder(order){
       // Starts matchEngine for Testing purpose.
        if(this.orders.length > 3){
            await this.matchEngine()
        }

        const reqOrder = {
            order,
            requestSender: this.id,
            requestType: "ORDER_ADD"
        };

        this.peer.request(
            'rpc_test',
            reqOrder,
            {},
            (err, data) => {
                if(data){
                    // console.log("Broadcast sent")
                    
                }
                if(err){
                    console.error(err)
                }
            }
        )

        
    }

    /**
     * The engine matches local orders with peers' orders
     * If matching candidates are found, localLock is enabled
     * Matches are sent to orderMatches routine for further processing
     */
    async matchEngine(){
        // console.log("Match engine fired")

        const localOrders = this.orders.filter(order => order.serverId === this.id && !order.closed);

        for(let order of localOrders){
            
            const eligibles = this.getOrders(order.toCoin, order.fromCoin);
            let toPrice = order.fromAmount / order.toAmount;
            const matches = [];
            let remaining = order.fromAmount;
            
            for (let candidate of eligibles){
                let oppToPrice = candidate.toAmount / candidate.fromAmount;
                if(oppToPrice <= toPrice && remaining >= candidate.toAmount) {
                    matches.push(candidate);
                    remaining -= candidate.toAmount;
                    if(!remaining){
                        
                        for(let match of matches){
                            match.localLock = true;
                        }
                        await this.orderMatched(order, matches);
                        break;
                    }
                }
            }
        
        }
    }

    /**
     * A lock is requested from all peers for the specific order
     * @param {*} order 
     * @returns 
     */
    orderLock(order){
        
        const request = {
            orderId: order.orderId,
            requestReciever: order.serverId,
            requestSender: this.id,
            requestType: "ORDER_LOCK"
        }

        return new Promise((resolve, reject) => {
            this.peer.request(
                'rpc_test',
                request,
                {},
                (err, data) => {
                    if(err){
                        reject(err)
                        
                    }
                    
                    resolve(data.lockId)

                }
            )
        })
    }

    /**
     * Locks are request for all the matches of a given order.
     * Once locks acquired, order is sent for Execution
     * @param {*} order 
     * @param {*} matches 
     */

    async orderMatched(order, matches){
        try {
            console.log(matches.length);
            Promise.all(
                matches.map(match => {
                    this.orderLock(order)
                })
            )
    
            
            
            Promise.all(
                matches.map(match => {
                    this.orderExecute(match)
                })
            )
        } catch (error) {
            for(let match of matches){
                match.localLock = false;
            }
        }
    }

    /**
     * Send the request for order execution to peers.
     * @param {*} match 
     * @returns 
     */
    async orderExecute(match){
        const request = {
            orderId: match.orderId,
            requestSender: this.id,
            requestType: "ORDER_EXECUTE"
        }

        return new Promise((resolve, reject)=> {
            this.peer.request(
                'rpc_test',
                request,
                {},
                (err, data) =>{
                    err ? reject(err) : resolve(data);
                }
            )
        })
    }

    /**
     * Returns orders matching for specific coins.
     * @param {*} from 
     * @param {*} to 
     * @returns 
     */
    getOrders(from, to){
        const filtered = this.orders.filter(order => 
            order.fromCoin === from && order.toCoin === to
        )
        return filtered
    }
}