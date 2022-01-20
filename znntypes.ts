export interface Momentum {
    version: number,
    chainIdentifier: number,
    hash: string,
    previousHash: string,
    height: number,
    timestamp: number,
    data: string,
    content: [{
        address: string,
        hash: string,
        height: number,
    }],
    changesHash: string,
    publicKey: string,
    signature: string,
    producer: string,
}

export interface AccountBlock {
    version: number,
    chainIdentifier: number,
    blockType: number,
    hash: string,
    previousHash: string,
    height: number,
    momentumAcknowledged: {
        hash: string,
        height: number,
    },
    address: string,
    toAddress: string,
    amount: number,
    tokenStandard: string,
    fromBlockHash: string,
    data: string,
    fusedPlasma: number,
    difficulty: number,
    nonce: string,
    basePlasma: number,
    usedPlasma: number,
    changesHash: string,
    publicKey: string,
    signature: string,
    token: Token,
    confirmationDetail: {
        numConfirmations: number,
        momentumHeight: number,
        momentumHash: string,
        momentumTimestamp: number,
    },
    pairedAccountBlock: AccountBlock,
    descendantBlocks: AccountBlock[],
}

export interface Token {
    name: string,
    symbol: string,
    domain: string,
    totalSupply: number,
    decimals: number,
    owner: string,
    tokenStandard: string,
    maxSupply: number,
    isBurnable: boolean,
    isMintable: boolean,
    isUtility: boolean,
}

export interface Account {
    address: string,
    accountHeight: number,
    balanceInfoMap: {
        [tokenStandard: string]: {
            token: Token,
            balance: number,
        }
    },
}