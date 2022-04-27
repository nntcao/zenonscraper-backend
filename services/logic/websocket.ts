import * as db from '../data_access/db'
import * as znn from '../data_access/znn'
import * as WebSocket from 'ws'
import { Momentum, Token, AccountBlock, Account } from '../../znntypes'

import { processMomentum, processAccountBlock } from './process'

async function instantiateWebSocketSubscription() {
    const ws = new WebSocket(String(process.env.ZNND_WS_URI))

    ws.on('open', async (event: any[]) => {
        let momentumSubscription: string | undefined, accountBlockSubscription: string | undefined = undefined
        ws.onmessage = async (message) => {
            const data: any = JSON.parse(String(message?.data))

            if (!momentumSubscription) {
                momentumSubscription = readMomentumSubscription(data)
            }
            if (momentumSubscription && data?.params?.subscription === momentumSubscription) {
                const latestHeight = data?.params?.result[0]?.height
                const momentum: Momentum = await znn.getMomentumByHeight(latestHeight)
                processMomentum(momentum)
            } 
        }
    })
    requestMomentumSubscription(ws)
}

function requestMomentumSubscription(ws) {
    ws.send(JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "ledger.subscribe",
        "params": ["momentums"]
    }))
}

function readMomentumSubscription(data) {
    return readSubscription(data, 1)
}

function readSubscription(data, id) {
    if (data?.id === 1) {
        const momentumSubscription = String(data?.result)
        return momentumSubscription
    }
}

export default instantiateWebSocketSubscription
