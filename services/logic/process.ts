import { Momentum, Token, AccountBlock, Account } from '../../znntypes'
import * as db from '../data_access/db'
import * as znn from '../data_access/znn'

export async function processMomentum(momentum: Momentum) {
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

export async function processAccountBlock(accountBlock: AccountBlock) {

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
085