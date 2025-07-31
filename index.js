import { SocksProxyAgent } from 'socks-proxy-agent'
import WebSocket from 'ws'
import net from 'net'

const TOR_PROXY = 'socks5h://127.0.0.1:9050' // socks5h for hostname resolution through proxy
const TOR_HOST = '127.0.0.1'
const TOR_PORT = 9050

const ONION_RELAYS = [
  'ws://q6a7m5qkyonzb5fk5yv4jyu3ar44hqedn7wjopg737lit2ckkhx2nyid.onion', // Azzamo Premium Nostr relay. (paid) GitHub - 0xtrr/onion-service-nostr-relays
  'ws://gp5kiwqfw7t2fwb3rfts2aekoph4x7pj5pv65re2y6hzaujsxewanbqd.onion' // Azzamo Group and Private message relay. (Freemium) GitHub - 0xtrr/onion-service-nostr-relays
]

async function testTorConnection() {
  return new Promise((resolve) => {
    console.log('🔍 Testing Tor connectivity...')
    const socket = new net.Socket()
    const timeout = setTimeout(() => {
      socket.destroy()
      console.log('❌ Tor connection test failed: timeout')
      resolve(false)
    }, 5000)
    
    socket.connect(TOR_PORT, TOR_HOST, () => {
      clearTimeout(timeout)
      socket.destroy()
      console.log('✅ Tor connection test passed')
      resolve(true)
    })
    
    socket.on('error', (err) => {
      clearTimeout(timeout)
      console.log(`❌ Tor connection test failed: ${err.message}`)
      resolve(false)
    })
  })
}

class NostrTorRelay {
  constructor(url) {
    this.url = url
    this.ws = null
    this.subscriptions = new Map()
    this.connected = false
    this.eventHandlers = new Map()
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event).push(handler)
  }

  emit(event, ...args) {
    const handlers = this.eventHandlers.get(event) || []
    handlers.forEach(handler => handler(...args))
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connecting to ${this.url}...`)
      
      let wsOptions = { rejectUnauthorized: false }
      
      if (this.url.includes('.onion')) {
        console.log('🧅 Using Tor proxy for .onion relay')
        const agent = new SocksProxyAgent(TOR_PROXY)
        wsOptions.agent = agent
      }

      this.ws = new WebSocket(this.url, wsOptions)

      this.ws.on('open', () => {
        console.log(`✅ Successfully connected to ${this.url}`)
        this.connected = true
        this.emit('connect')
        resolve(this)
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error(`❌ Error parsing message from ${this.url}:`, error.message)
        }
      })

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 Disconnected from ${this.url}: ${code} ${reason}`)
        this.connected = false
        this.emit('disconnect')
      })

      this.ws.on('error', (error) => {
        console.error(`❌ Error from ${this.url}:`, error.message)
        this.emit('error', error)
        if (!this.connected) {
          reject(error)
        }
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.connected) {
          this.ws.close()
          reject(new Error('Connection timeout'))
        }
      }, 10000)
    })
  }

  handleMessage(message) {
    const [type, ...rest] = message
    
    switch (type) {
      case 'EVENT':
        const [subId, event] = rest
        this.emit('event', { subId, event })
        break
      case 'EOSE':
        const [endSubId] = rest
        this.emit('eose', endSubId)
        break
      case 'NOTICE':
        const [notice] = rest
        console.log(`📝 Notice from ${this.url}: ${notice}`)
        break
      case 'OK':
        const [eventId, success, message_] = rest
        this.emit('ok', { eventId, success, message: message_ })
        break
      default:
        console.log(`🔍 Unknown message type from ${this.url}:`, message)
    }
  }

  subscribe(filters, handlers = {}) {
    if (!this.connected) {
      console.error(`❌ Cannot subscribe: not connected to ${this.url}`)
      return null
    }

    const subId = Math.random().toString(36).substr(2, 9)
    const reqMessage = JSON.stringify(['REQ', subId, ...filters])
    
    console.log(`📡 Subscribing to ${this.url} with filters:`, filters)
    this.ws.send(reqMessage)

    // Store subscription handlers
    this.subscriptions.set(subId, handlers)

    // Set up event forwarding
    const eventHandler = ({ subId: msgSubId, event }) => {
      if (msgSubId === subId && handlers.onevent) {
        handlers.onevent(event)
      }
    }

    const eoseHandler = (endSubId) => {
      if (endSubId === subId && handlers.oneose) {
        handlers.oneose()
      }
    }

    this.on('event', eventHandler)
    this.on('eose', eoseHandler)

    return {
      subId,
      close: () => {
        const closeMessage = JSON.stringify(['CLOSE', subId])
        this.ws.send(closeMessage)
        this.subscriptions.delete(subId)
        // Clean up handlers
        this.eventHandlers.get('event')?.splice(
          this.eventHandlers.get('event').indexOf(eventHandler), 1
        )
        this.eventHandlers.get('eose')?.splice(
          this.eventHandlers.get('eose').indexOf(eoseHandler), 1
        )
      }
    }
  }

  publish(event) {
    if (!this.connected) {
      console.error(`❌ Cannot publish: not connected to ${this.url}`)
      return Promise.reject(new Error('Not connected'))
    }

    return new Promise((resolve, reject) => {
      const eventMessage = JSON.stringify(['EVENT', event])
      
      const okHandler = ({ eventId, success, message }) => {
        if (eventId === event.id) {
          if (success) {
            resolve()
          } else {
            reject(new Error(message || 'Publish failed'))
          }
        }
      }

      this.on('ok', okHandler)
      this.ws.send(eventMessage)

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Publish timeout'))
      }, 5000)
    })
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

class NostrTorClient {
  constructor() {
    this.relays = new Map()
    this.subscriptions = new Map()
  }

  async connectToRelay(relayUrl) {
    try {
      const relay = new NostrTorRelay(relayUrl)
      await relay.connect()
      this.relays.set(relayUrl, relay)
      return relay
    } catch (error) {
      console.error(`❌ Failed to connect to ${relayUrl}:`, error.message || error)
      return null
    }
  }

  async connectToRelays(relayUrls = ONION_RELAYS) {
    const connections = await Promise.allSettled(
      relayUrls.map(url => this.connectToRelay(url))
    )
    
    const successful = connections
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value)
    
    console.log(`Connected to ${successful.length}/${relayUrls.length} relays`)
    return successful
  }

  async subscribeToEvents(filters = [{ kinds: [1], limit: 5 }]) {
    const subId = Math.random().toString(36).substr(2, 9)
    
    for (const [url, relay] of this.relays) {
      try {
        const sub = relay.subscribe(filters, {
          onevent(event) {
            console.log(`📝 Event from ${url}:`, {
              id: event.id.slice(0, 8),
              pubkey: event.pubkey.slice(0, 8),
              content: event.content.slice(0, 100),
              created_at: new Date(event.created_at * 1000).toISOString()
            })
          },
          oneose() {
            console.log(`End of stored events from ${url}`)
          }
        })
        
        this.subscriptions.set(`${url}-${subId}`, sub)
      } catch (error) {
        console.error(`Failed to subscribe to ${url}:`, error.message)
      }
    }
    
    return subId
  }

  async publishEvent(event) {
    const results = []
    
    for (const [url, relay] of this.relays) {
      try {
        await relay.publish(event)
        console.log(`✅ Published to ${url}`)
        results.push({ url, success: true })
      } catch (error) {
        console.error(`❌ Failed to publish to ${url}:`, error.message)
        results.push({ url, success: false, error: error.message })
      }
    }
    
    return results
  }

  closeSubscription(subId) {
    for (const [key, sub] of this.subscriptions) {
      if (key.includes(subId)) {
        sub.close()
        this.subscriptions.delete(key)
      }
    }
  }

  async disconnect() {
    for (const sub of this.subscriptions.values()) {
      if (sub && sub.close) {
        sub.close()
      }
    }
    this.subscriptions.clear()
    
    for (const relay of this.relays.values()) {
      relay.close()
    }
    this.relays.clear()
    
    console.log('Disconnected from all relays')
  }
}

async function main() {
  console.log('🧅 Starting Nostr over Tor client...')
  
  // Parse command line arguments
  const args = process.argv.slice(2)
  let relaysToTest = ONION_RELAYS
  
  if (args.length > 0) {
    const customRelay = args[0]
    if (customRelay.includes('.onion')) {
      console.log(`🎯 Testing custom .onion relay: ${customRelay}`)
      relaysToTest = [customRelay]
    } else {
      console.log('❌ Invalid relay URL. Please provide a .onion relay URL.')
      console.log('Usage: npm start ws://your-relay.onion')
      process.exit(1)
    }
  } else {
    console.log('🔧 Using default example relays. To test a specific relay, use:')
    console.log('   npm start ws://your-relay.onion')
  }
  
  // Test Tor connection first
  const torConnected = await testTorConnection()
  if (!torConnected) {
    console.log('❌ Cannot connect to Tor. Make sure Tor daemon is running on 127.0.0.1:9050')
    console.log('💡 Try: brew services start tor')
    process.exit(1)
  }
  
  const client = new NostrTorClient()
  
  try {
    await client.connectToRelays(relaysToTest)
    
    if (client.relays.size === 0) {
      console.log('❌ No relays connected. Exiting.')
      return
    }
    
    console.log('\n📡 Subscribing to recent notes...')
    await client.subscribeToEvents([
      { kinds: [1], limit: 5 }
    ])
    
    setTimeout(async () => {
      console.log('\n🔌 Disconnecting...')
      await client.disconnect()
      process.exit(0)
    }, 30000)
    
  } catch (error) {
    console.error('❌ Error:', error.message || error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { NostrTorClient }