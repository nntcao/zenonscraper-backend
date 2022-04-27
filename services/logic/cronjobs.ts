import { Momentum, Token, AccountBlock, Account } from '../../znntypes'
import { processMomentum, processAccountBlock } from './process'
import * as db from '../data_access/db'
import * as znn from '../data_access/znn'
import { QueryResult } from 'pg'
import { readOrCreateLatestMomentumVerified } from '../data_access/file_storage'

async function verifyOrphanBlocks() {
    const minConfirmations: number = 10000
    const batchSize: number = 1000
    const latestMomentumHeight: number = (await znn.getFrontierMomentum()).height
    let lastMomentumVerified: number = readOrCreateLatestMomentumVerified()
    let momentumCounter: number = lastMomentumVerified
    let momentumHashesQueryResult: QueryResult
    
    do {
        const dbMomentumBatch = await db.getMomentumsByRange(momentumCounter, batchSize)
        const znnMomentumBatch: Momentum[] = await znn.getMomentumsByHeightRange(momentumCounter, batchSize)
        for (const row of momentumHashesQueryResult.rows) {
            const accountBlockHashesQueryResult = await db.query(`
                SELECT * FROM accountblock
                WHERE momentumhash = $1
            `, [row.hash])        
        }
        momentumCounter += batchSize
    } while (momentumHashesQueryResult?.rowCount === batchSize)


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
