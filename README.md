# Simple Nostr over Tor

A basic Node.js Nostr client that connects to .onion relays via the Tor network using WebSocket connections with SOCKS5 proxy support.
Its purpose is just as a connectivity checker.

## Features

- ✅ **Tor Integration**: Automatically routes .onion relay connections through Tor SOCKS5 proxy
- ✅ **Real-time Events**: Subscribes to and displays Nostr events from .onion relays
- ✅ **Connection Testing**: Tests Tor connectivity before attempting relay connections
- ✅ **Custom Relay Support**: Test any .onion Nostr relay via command-line parameter
- ✅ **Protocol Compliance**: Full Nostr protocol support (REQ, EVENT, EOSE, CLOSE messages)
- ✅ **Error Handling**: Comprehensive error handling and connection management

## Prerequisites

1. **Tor daemon** running locally on port 9050
   ```bash
   # Install Tor (macOS)
   brew install tor
   
   # Start Tor service
   brew services start tor
   ```

2. **Node.js** (version 16 or higher)

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Default Usage (Example Relays)

Test with pre-configured example .onion relays:

```bash
npm start
```

This will connect to:
- `ws://q6a7m5qkyonzb5fk5yv4jyu3ar44hqedn7wjopg737lit2ckkhx2nyid.onion` (Azzamo Premium)
- `ws://gp5kiwqfw7t2fwb3rfts2aekoph4x7pj5pv65re2y6hzaujsxewanbqd.onion` (Azzamo Group)

### Custom Relay Testing

Test a specific .onion Nostr relay:

```bash
npm start ws://your-relay.onion
```


## How It Works

1. **Tor Connectivity Test**: Verifies connection to Tor SOCKS5 proxy (127.0.0.1:9050)
2. **Relay Connection**: Creates WebSocket connections to .onion relays via SOCKS5 proxy
3. **Event Subscription**: Subscribes to recent notes (kind 1 events) with a limit of 5
4. **Real-time Display**: Shows incoming Nostr events with truncated content preview
5. **Auto-disconnect**: Runs for 30 seconds then gracefully disconnects

## Example Output

```
🧅 Starting Nostr over Tor client...
🔍 Testing Tor connectivity...
✅ Tor connection test passed
🔗 Connecting to ws://q6a7m5qkyonzb5fk5yv4jyu3ar44hqedn7wjopg737lit2ckkhx2nyid.onion...
🧅 Using Tor proxy for .onion relay
✅ Successfully connected to ws://q6a7m5qkyonzb5fk5yv4jyu3ar44hqedn7wjopg737lit2ckkhx2nyid.onion
Connected to 1/1 relays

📡 Subscribing to recent notes...
📝 Event from ws://q6a7m5qkyonzb5fk5yv4jyu3ar44hqedn7wjopg737lit2ckkhx2nyid.onion: {
  id: 'ebdec059',
  pubkey: '306555fe',
  content: 'Ive been thinking that China companys open source AI is soft power in action...',
  created_at: '2025-07-30T22:41:02.000Z'
}
```

## Dependencies

- **nostr-tools**: Not used for WebSocket connections (due to proxy compatibility issues)
- **socks-proxy-agent**: SOCKS5 proxy support for WebSocket connections
- **ws**: WebSocket client library

## Technical Details

This implementation bypasses `nostr-tools`' built-in `Relay.connect()` method because it doesn't properly handle SOCKS5 proxy agents. Instead, it uses:

1. **Custom NostrTorRelay Class**: Direct WebSocket connection management with SOCKS5 proxy
2. **Manual Protocol Handling**: Implements Nostr protocol message parsing and event handling
3. **SOCKS5h Protocol**: Uses `socks5h://` to ensure hostname resolution through Tor proxy

## Troubleshooting

### "Tor connection test failed"
- Ensure Tor is installed and running: `brew services start tor`
- Check if Tor is listening on port 9050: `lsof -i :9050`

### "Failed to connect to relay"
- Verify the .onion relay URL is correct and active
- Some relays may be temporarily offline
- Try different .onion relay addresses

### "getaddrinfo ENOTFOUND"
- This indicates the SOCKS proxy isn't being used correctly
- Make sure you're using `socks5h://` protocol in the proxy URL

## Known Working .onion Relays

- `ws://q6a7m5qkyonzb5fk5yv4jyu3ar44hqedn7wjopg737lit2ckkhx2nyid.onion` - Azzamo Premium
- `ws://gp5kiwqfw7t2fwb3rfts2aekoph4x7pj5pv65re2y6hzaujsxewanbqd.onion` - Azzamo Group  

*Note: .onion relay availability can change. These were working as of the development date.*

## License

MIT
