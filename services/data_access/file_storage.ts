import * as fs from 'fs'

export function readOrCreateLatestMomentumVerified() {
    const lastMomentumVerifiedFilePath = '../../lastMomentumVerified.txt'
    let lastMomentumVerified = 0
    fs.readFile(lastMomentumVerifiedFilePath, 'utf-8', (err, data) => {
        if (err) {
            fs.writeFile(lastMomentumVerifiedFilePath, '', (err) => {})
        }
        else {
            lastMomentumVerified = Number(data)
        }
    })
    return lastMomentumVerified
}

