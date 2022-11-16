import { PeerRPCClient } from "grenache-nodejs-http";
import Link from "grenache-nodejs-link";
import _ from "lodash";


const coins = ["btc", "eth", "sol"];

export const client = async (id) => {
    const link = new Link({
        grape: 'http://127.0.0.1:30001'
    });

    link.start();

    const peer = new PeerRPCClient(link,{});
    peer.init();

    setInterval(submitOrder, 2000);
    // submitOrder()
    // console.log(await genOrder());

    

    function submitOrder(){
        const order = genOrder();
        const req = {
            requestSender:  id,
            requestType: "CLIENT_ORDER_ADD",
            order
        }
        peer.request(
            'rpc_test',
            req,
            {},
            (err, data) => {
                
            //    console.log(data)
            }
        )
    }

    function genOrder(){
        const fromCoin = _.sample(coins);
        return {
            orderId: _.random(2817493170),
            toCoin: _.sample(_.without(coins, fromCoin)),
            toAmount: _.sample(_.range(1,11)),
            fromCoin,
            fromAmount: _.sample(_.range(1,11))
            
            
        }
        
    }

}



