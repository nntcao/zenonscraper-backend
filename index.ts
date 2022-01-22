import { QueryResult } from 'pg'
import * as db from './services/db'
import * as znn from './services/znn'
import { Momentum, Token, AccountBlock, Account } from './znntypes'
import * as WebSocket from 'ws'
import { timeout } from './utils/time'

async function main() {
    initialize()
    update()
    updateMissingAccountBlocks()
}

async function initialize() {
    const momentumBatchSize = 1000
    let height = await getStartingHeight()
    // let height = 1
    while (true) {
        const momentumBatch: Momentum[] | undefined = await znn.getMomentumsByHeightRange(height, momentumBatchSize)
        if ((typeof momentumBatch === 'undefined') || (momentumBatch.length === 0)) {
            break
        }
        for (const momentum of momentumBatch) {
            await processMomentum(momentum)
        }
        height += momentumBatchSize
    }
    console.log('finished initialization')
}

async function update() {
    const ws = new WebSocket(String(process.env.ZNND_WS_URI))

    ws.on('open', async (event: any[]) => {
        console.log('Connected to ws://localhost:35998')
        let momentumSubscription: string | undefined, accountBlockSubscription: string | undefined = undefined
        ws.onmessage = async (message) => {
            const data: any = JSON.parse(String(message?.data))

            if (!momentumSubscription) {
                if (data?.id === 1) {
                    momentumSubscription = String(data?.result)
                    console.log(`Saved momentum subscription ${momentumSubscription}`);
                }
            }
            if (!accountBlockSubscription) {
                if (data?.id === 2) {
                    accountBlockSubscription = String(data?.result)
                    console.log(`Saved account block subscription ${accountBlockSubscription}`);
                }
            }

            if (momentumSubscription && data?.params?.subscription === momentumSubscription) {
                const height = data?.params?.result[0].height
                const momentum: Momentum = await znn.getMomentumByHeight(height)
                processMomentum(momentum)
                console.log(`Momentum ${height}`)
            } else if (accountBlockSubscription && data?.params?.subscription === accountBlockSubscription) {
                const hash = data?.params?.result[0].hash
                const accountBlock: AccountBlock = await znn.getAccountBlockByHash(hash)
                processAccountBlock(accountBlock)
                console.log(hash)
            }
        }

        ws.send(JSON.stringify({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "ledger.subscribe",
            "params": ["momentums"]
        }))
        ws.send(JSON.stringify({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "ledger.subscribe",
            "params": ["allAccountBlocks"]
        }))

    })
    
}

async function updateMissingAccountBlocks() {
    const timeoutMinutes = 30
    while (true) {
        const accountBlockMissingQuery = await db.query(`
            SELECT hash FROM accountblock
            WHERE momentumhash IS NULL
            OR momentumacknowledgedhash IS NULL
            OR pairedhash IS NULL
        `)
        
        const accountBlocksMissing = accountBlockMissingQuery?.rows
        if (accountBlocksMissing) {
            for (const accountBlockInfo of accountBlocksMissing) {
                console.log(accountBlockInfo.hash);
                const accountBlock: AccountBlock = await znn.getAccountBlockByHash(accountBlockInfo.hash)
                await processAccountBlock(accountBlock)
            }
        }
        await timeout(timeoutMinutes * 60000)
    }
}

async function processMomentum(momentum: Momentum) {
    try {
        await db.query(`BEGIN`)

        // momentum
        await db.insertAddress(momentum.producer)
        await db.insertMomentum(momentum)

        for (const accountBlockInfo of momentum.content) {
            const accountBlock: AccountBlock = await znn.getAccountBlockByHash(accountBlockInfo.hash)
            await processAccountBlock(accountBlock)
        }
        await db.query(`COMMIT`)
    } catch (e) {
        await db.query(`ROLLBACK`)
        console.log(e);
    }
}

async function processAccountBlock(accountBlock: AccountBlock) {

    // addresses
    await db.insertAddress(accountBlock.address)
    await db.insertAddress(accountBlock.toAddress)

    // token
    const token: Token | undefined = await znn.getTokenByZts(accountBlock.tokenStandard)
    if (token) {
        await db.insertToken(token)
    } else {
        await db.insertNullTokenByStandard(accountBlock.tokenStandard)
    }

    // balances
    const addressAccount: Account = await znn.getAccountInfoByAddress(accountBlock.address)
    const toAddressAccount: Account = await znn.getAccountInfoByAddress(accountBlock.toAddress)
    await db.insertBalance(addressAccount)
    await db.insertBalance(toAddressAccount)

    // account block
    await db.insertAccountBlock(accountBlock)

    // descendant block
    for (const descendantAccountBlock of accountBlock.descendantBlocks) {
        // recursive processing in case the descendant account block also has descendants
        await processAccountBlock(descendantAccountBlock)

        // descendant block hash
        await db.insertDescendentBlockHash(accountBlock.hash, descendantAccountBlock.hash)
    }
}

async function getStartingHeight() {
    const heightResults: QueryResult | undefined = await db.query(`
        SELECT height 
        FROM momentum
        ORDER BY height ASC
    `)

    let startingHeight: number = 1
    if (typeof heightResults !== 'undefined') {
        for (let row of heightResults.rows) {
            if (row.height === startingHeight) {
                startingHeight++
            } else {
                break
            }
        }
    }
    return startingHeight
}

async function test() {
    const token = await znn.getTokenByZts('zts1qqqqqqqqqqqqqqqqtq587y')
    if (token) {
        console.log('exists');
    } else {
        console.log('null');
        db.insertNullTokenByStandard('zts1qqqqqqqqqqqqqqqqtq587y')
    }
}


main()
// test()