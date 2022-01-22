import 'dotenv/config'
import axios from 'axios'
import { timeout } from '../utils/time'

const requestsPerSecond: number = 200

// MOMENTUMS

export async function getMomentumByHeight(height: number) {
    const momentums = await sendRequestJsonRpcHTTP('ledger.getMomentumsByHeight', [height, 1])
    if (momentums.result) {
        return momentums.result.list[0]
    } else {
        return undefined
    }
}

export async function getMomentumsByHeightRange(start: number, batchSize: number) {
    const momentums = await sendRequestJsonRpcHTTP('ledger.getMomentumsByHeight', [start, batchSize])
    if (momentums.result) {
        return momentums.result.list
    } else {
        return undefined
    }
}

export async function getMomentumsByPage(page: number, numPerPage: number) {
    const momentums = await sendRequestJsonRpcHTTP('ledger.getMomentumsByPage', [page, numPerPage])
    if (momentums.result) {
        return momentums.result.list
    } else {
        return undefined
    }
}

export async function getFrontierMomentum() {
    const momentum = await sendRequestJsonRpcHTTP('ledger.getFrontierMomentum', [])
    return momentum.result
}

// END MOMENTUMS

// ACCOUNT BLOCKS

export async function getAccountBlockByHash(hash: string) {
    const accountBlock = await sendRequestJsonRpcHTTP('ledger.getAccountBlockByHash', [hash])
    return accountBlock.result
}

export async function getAccountBlocksByPage(address: string, page: number, numPerPage: number) {
    const accountBlockBatch = await sendRequestJsonRpcHTTP('ledger.getAccountBlocksByPage', [address, page, numPerPage])
    if (accountBlockBatch.result) {
        return accountBlockBatch.result.list
    } else {
        return undefined
    }
}

export async function getAccountBlocksByHeight(address: string, height: number, count: number) {
    const accountBlockBatch = await sendRequestJsonRpcHTTP('ledger.getAccountBlocksByPage', [address, height, count])
    if (accountBlockBatch.result) {
        return accountBlockBatch.result.list
    } else {
        return undefined
    }
}

export async function getFrontierAccountBlock(address: string) {
    const frontierAccountBlock = await sendRequestJsonRpcHTTP('ledger.getFrontierAccountBlock', [address])
    return frontierAccountBlock.result
}


// END ACCOUNT BLOCKS

// ACCOUNT INFORMATION

export async function getAccountInfoByAddress(address: string) {
    const accountInfo = await sendRequestJsonRpcHTTP('ledger.getAccountInfoByAddress', [address])
    return accountInfo.result
}

// END ACCOUNT INFORMATION

// TOKENS

export async function getTokenByEntry(entry: number) {
    const token = await sendRequestJsonRpcHTTP('embedded.token.getAll', [entry, 1])
    if (token.result) {
        return token.result.list
    } else {
        return undefined
    }
}

export async function getTokenCount() {
    const token = await sendRequestJsonRpcHTTP('embedded.token.getAll', [0, 1])
    return token.result.count
}

export async function getTokenByPage(page: number, numPerPage: number) {
    const tokens = await sendRequestJsonRpcHTTP('embedded.token.getAll', [page, numPerPage])
    if (tokens.result) {
        return tokens.result.list
    } else {
        return undefined
    }
}

export async function getTokenByZts(zts: string) {
    const token  = await sendRequestJsonRpcHTTP('embedded.token.getByZts', [zts])
    return token.result
}

// END TOKENS

async function sendRequestJsonRpcHTTP(method: string, params: any[]): Promise<any> {
    for (var retries = 0;; retries++) {
        if (requestsPerSecond > 0) {
            await timeout(1000 / requestsPerSecond)
        }
        try {
            const response = await axios.post(String(process.env.ZNND_HTTP_URI), formatRequestJsonRPC(method, params))
            return response.data
        } catch(error) {
            if (retries < 6) {
                await timeout(1000 / requestsPerSecond)
                console.log(`Retrying JsonRPC HTML request... ${retries}`);
                continue
            } else {
                console.log(error);
            }
        }
    }
}

function formatRequestJsonRPC (method: string, params: any[]): Object {
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    }
}
