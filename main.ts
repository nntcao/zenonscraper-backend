import instantiateWebSocketSubscription from './services/logic/websocket'
import initialize from './services/logic/initialization'

async function main() {
    instantiateWebSocketSubscription()
    await initialize()
}

export default main