import 'dotenv/config'
import { Pool, PoolClient } from 'pg'
import { Momentum, Token, AccountBlock, Account } from '../znntypes'


const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
    port: Number(process.env.PORT),
})


interface IClientHandler {
    (client: PoolClient): any
}

export async function query(text: string, params?: any[]) {
    try {
        if (typeof params === 'undefined') {
            return await pool.query(text)
        } else {
            return await pool.query(text, params)
        }
    } catch(e) {
        console.log(e)
    }
}

export async function checkoutClient(clientHandler: IClientHandler) {
    var client: PoolClient = await pool.connect()
    try {
        var response: any = await clientHandler(client)
    } finally {
        client.release()
        return response
    }
}

export async function insertMomentum(momentum: Momentum) {
    await query(`
        INSERT INTO momentum(hash, version, height, timestamp, previoushash, data, changeshash, publickey, 
            signature, producer, chainidentifier)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (hash) DO NOTHING
    `, [
        momentum.hash, 
        momentum.version, 
        momentum.height, 
        momentum.timestamp, 
        momentum.previousHash, 
        momentum.data, 
        momentum.changesHash, 
        momentum.publicKey, 
        momentum.signature, 
        momentum.producer, 
        momentum.chainIdentifier
    ]
    )
}

export async function insertAccountBlock(accountBlock: AccountBlock) {
    if (accountBlock.token) {
        await insertToken(accountBlock.token)
    } else {
        await insertNullTokenByStandard(accountBlock.tokenStandard)
    }

    const momentumHash = accountBlock?.confirmationDetail?.momentumHash
    const momentumAcknowledgedHash = accountBlock?.momentumAcknowledged?.hash
    if (!momentumHash) {
        // console.log(momentumHash, accountBlock.hash)
    }
    const pairedAccountBlockHash = accountBlock?.pairedAccountBlock?.hash
    if (pairedAccountBlockHash) {
        await query(`
            UPDATE accountblock 
            SET pairedhash = $1
            WHERE hash = $2
        `, [
            accountBlock.hash,
            pairedAccountBlockHash
        ])
    }
    await query(`
        INSERT INTO accountblock(hash, version, chainidentifier, blocktype, previoushash, momentumhash, 
            address, toaddress, amount, tokenstandard, fromblockhash, data, fusedplasma, difficulty,
            nonce, baseplasma, usedplasma, changeshash, publickey, signature, momentumacknowledgedhash,
            pairedhash, height)                
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
        ON CONFLICT (hash) DO UPDATE
            SET momentumhash = $6, momentumacknowledgedhash = $21, pairedhash = $22, height = $23
    `, [
        accountBlock.hash, 
        accountBlock.version, 
        accountBlock.chainIdentifier, 
        accountBlock.blockType, 
        accountBlock.previousHash,
        momentumHash,
        accountBlock.address,
        accountBlock.toAddress,
        accountBlock.amount,
        accountBlock.tokenStandard,
        accountBlock.fromBlockHash,
        accountBlock.data,
        accountBlock.fusedPlasma,
        accountBlock.difficulty,
        accountBlock.nonce,
        accountBlock.basePlasma,
        accountBlock.usedPlasma,
        accountBlock.changesHash,
        accountBlock.publicKey,
        accountBlock.signature,
        momentumAcknowledgedHash,
        pairedAccountBlockHash,
        accountBlock.height
    ]
    )
}

export async function insertDescendentBlockHash(accountBlockHash: string, descendantBlockHash: string) {
    await query(`
        INSERT INTO descendantblock(hash, descendanthash)
        VALUES($1, $2)
        ON CONFLICT ON CONSTRAINT descendantblock_pkey DO NOTHING
        `, [
            accountBlockHash, 
            descendantBlockHash
        ]
    )
}

export async function insertAddress(address: string) {
    await query(`
        INSERT INTO address(address)
        VALUES($1)
        ON CONFLICT (address) DO NOTHING
    `, [
        address
    ]
    )
}

export async function insertBalance(account: Account) {
    for (const tokenStandard in account.balanceInfoMap) {
        const token = account.balanceInfoMap[tokenStandard].token
        await insertToken(token)
        await insertAddress(account.address)
        await query(`
            INSERT INTO balance(address, tokenstandard, balance)
            VALUES($1, $2, $3)
            ON CONFLICT ON CONSTRAINT balance_pkey DO UPDATE
                SET balance = $3
        `, [
            account.address,
            tokenStandard,
            account.balanceInfoMap[tokenStandard].balance
        ])
    }
}

export async function insertToken(token: Token) {
    await insertAddress(token.owner)
    await query(`
            INSERT INTO token(tokenstandard, name, symbol, domain, totalsupply, 
                decimals, owner, maxsupply, isburnable, ismintable, isutility)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tokenstandard) DO UPDATE
                SET totalsupply = $5
    `, [
        token.tokenStandard,
        token.name,
        token.symbol,
        token.domain,
        token.totalSupply,
        token.decimals,
        token.owner,
        token.maxSupply,
        token.isBurnable,
        token.isMintable,
        token.isUtility
    ]
    )
}

export async function insertNullTokenByStandard(tokenStandard: string) {
    await query(`
            INSERT INTO token(tokenstandard, name, symbol, domain, totalsupply, 
                decimals, owner, maxsupply, isburnable, ismintable, isutility)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tokenstandard) DO UPDATE
                SET totalsupply = $5
    `, [
        tokenStandard,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null
    ]
    )
}
