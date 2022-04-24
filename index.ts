import { QueryResult } from 'pg'
import * as db from './services/data_access/db'
import * as znn from './services/data_access/znn'
import { Momentum, Token, AccountBlock, Account } from './znntypes'
import * as WebSocket from 'ws'
import { timeout } from './utils/time'

async function main() {
    updateTxsMomentumsByNotification()
    updateMissingAccountBlocks()
    await initialize()
    updatePerDayStatistics()
}

async function initialize() {
    const momentumBatchSize = 1000
    let height = await getStartingHeight()

    let counter = height
    console.log('initializing');
    
    while (true) {
        const momentumBatch: Momentum[] | undefined = await znn.getMomentumsByHeightRange(height, momentumBatchSize)
        if ((typeof momentumBatch === 'undefined') || (momentumBatch.length === 0)) {
            break
        }
        for (const momentum of momentumBatch) {
            console.log(counter++);
            await processMomentum(momentum)
        }
        height += momentumBatchSize
    }
    console.log('finished initialization')
}

async function updateTxsMomentumsByNotification() {
    const ws = new WebSocket(String(process.env.ZNND_WS_URI))

    ws.on('open', async (event: any[]) => {
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

function updateMissingAccountBlocks() {
    const timeoutMinutes = 5
    const updateMissingAccountBlocksInterval = setInterval(async () => {
        console.log("Updating account blocks")

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
    }, timeoutMinutes * 60000)


}

async function updatePerDayStatistics() {
    await update()
    const updateIntervalID = setInterval(update, 21600000)

    async function update() {
        console.log('Updating Plasma Average per Day and Transaction Count per Day');

        const latestDailyTime = await db.query(`
            SELECT MAX(time) AS latesttime FROM plasmaday
        `)
        const latestMomentumTime: any = await db.query(`
            SELECT MAX(timestamp) AS latesttime FROM momentum
        `)

        const mSecondsPerDay: number = 86400000
        const currentTime = latestMomentumTime.rows[0]?.latesttime * 1000
        let timeToAdd: number = latestDailyTime?.rows[0]?.latesttime ? Number(latestDailyTime?.rows[0]?.latesttime) * 1000 + mSecondsPerDay : 1637712000000

        while ((timeToAdd + mSecondsPerDay) < currentTime) {
            const transactionsInTimePeriod = await db.query(`
                SELECT b.usedplasma 
                FROM (
                    SELECT usedplasma, timestamp FROM accountblock
                    INNER JOIN momentum
                    ON momentum.hash = accountblock.momentumhash
                    ) AS b
                WHERE b.timestamp <= $2
                AND b.timestamp >= $1
            `, [Math.floor(timeToAdd / 1000), Math.floor((timeToAdd + mSecondsPerDay) / 1000)])
            
            let usedPlasmaSum = 0
            let transactionCount = 0
            let transactionCountNotFromEmbedded = 0
            for (const transaction of transactionsInTimePeriod.rows) {
                transactionCount++
                if (transaction.usedplasma > 0) {
                    usedPlasmaSum += transaction.usedplasma
                    transactionCountNotFromEmbedded++
                }
            }

            await db.query(`
                INSERT INTO transactionday(time, transactioncount)
                VALUES($1, $2)
            `, [Math.floor(timeToAdd / 1000), transactionCount])

            await db.query(`
                INSERT INTO plasmaday(time, plasmaaverage)
                VALUES($1, $2)
            `, [Math.floor(timeToAdd / 1000), Math.round(usedPlasmaSum / Math.max(1, transactionCountNotFromEmbedded) * 1000) / 1000])

            timeToAdd += mSecondsPerDay
        }
        console.log('Finished updating Plasma Average per Day and Transaction Count per Day');
    }
}

async function processMomentum(momentum: Momentum) {
    try {
        // momentum
        await db.insertAddress(momentum.producer)
        await db.insertMomentum(momentum)

        for (const accountBlockInfo of momentum.content) {
            const accountBlock: AccountBlock = await znn.getAccountBlockByHash(accountBlockInfo.hash)
            await processAccountBlock(accountBlock)
        }

    } catch (e) {
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
    
    let offset = 0
    let previousHeight = 0
    let startingHeight: number = 1
    let batchSize = 60000
    do {
        previousHeight = startingHeight
        const heightResults: QueryResult | undefined = await db.query(`
            SELECT height
            FROM momentum
            ORDER BY height ASC
            LIMIT $2
            OFFSET $1
        `, [offset, batchSize])

        if (typeof heightResults !== 'undefined') {
            for (let row of heightResults.rows) {
                if (row.height === startingHeight) {
                    startingHeight += 1
                } else {
                    const redundantMomentums = await db.query(`
                        SELECT height, timestamp, hash
                        FROM momentum
                        WHERE height = $1
                        ORDER BY timestamp DESC
                    `, [row.height])
                    if (redundantMomentums.rowCount > 1) {
                        await db.query(`
                            DELETE FROM momentum WHERE height = $1
                        `, [row.height])

                        const newMomentum = await znn.getMomentumByHeight(row.height)
                        await db.insertMomentum(newMomentum)
                    } else {
                        break
                    }
                }
            }
        }
        offset += batchSize
        console.log(`The condition: ${startingHeight} >= ${previousHeight + batchSize}`);
        
    } while (startingHeight >= previousHeight + batchSize)

    console.log(`The starting height ${startingHeight}`)
    return startingHeight - 1
}

async function test() {
    const token = await znn.getTokenByZts('zts1qqqqqqqqqqqqqqqqtq587y')
    if (token) {
        console.log('exists');
    } else {
        console.log('null');
        await db.insertNullTokenByStandard('zts1qqqqqqqqqqqqqqqqtq587y')
    }
}


main()
// test()