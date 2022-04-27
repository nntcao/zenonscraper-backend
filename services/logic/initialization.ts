import * as db from '../data_access/db'
import * as znn from '../data_access/znn'
import { QueryResult } from 'pg'
import { Momentum, Token, AccountBlock, Account } from '../../znntypes'
import { processMomentum, processAccountBlock } from '../logic/process'

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


export default initialize