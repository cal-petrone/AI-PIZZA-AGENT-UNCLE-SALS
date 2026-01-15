# Migration Guide: Old Server → New Modular Server

This guide helps you migrate from the monolithic `server.js` to the new modular `server-new.js`.

## What Changed

### Old Structure (server.js)
- Single 1400+ line file
- All logic in one place
- Hard to test and maintain
- Resource leaks possible

### New Structure (server-new.js)
- Modular architecture
- Separate services and routes
- Testable components
- Better resource management

## File Mapping

| Old (server.js) | New Location |
|----------------|--------------|
| Menu config | `src/config/menu.js` |
| Order logic | `src/services/order-manager.js` |
| OpenAI connection | `src/services/openai-service.js` |
| Zapier logging | `src/services/logger.js` |
| Twilio webhook | `src/routes/incoming-call.js` |
| Media stream | `src/routes/media-stream.js` |
| Health check | `src/routes/health.js` |
| Validation | `src/utils/validation.js` |

## Migration Steps

### 1. Test New Server

```bash
# Start new server
node server-new.js

# In another terminal, test health
curl http://localhost:3000/health
```

### 2. Compare Behavior

Make a test call and verify:
- [ ] AI greets correctly
- [ ] Orders are processed
- [ ] Orders are logged to Zapier
- [ ] No errors in logs

### 3. Switch Over

Once verified, update `package.json`:

```json
{
  "scripts": {
    "start": "node server-new.js"
  }
}
```

### 4. Keep Old Server as Backup

Rename old server:
```bash
mv server.js server-old.js
```

## Key Improvements

### 1. Better Error Handling
- Automatic retries with exponential backoff
- Graceful degradation
- Idempotent logging

### 2. Resource Management
- Proper connection cleanup
- Periodic resource cleanup
- Memory leak prevention

### 3. Testability
- Unit tests for order logic
- Menu configuration tests
- Isolated services

### 4. Maintainability
- Clear separation of concerns
- Easy to extend
- Well-documented

## Breaking Changes

### None!
The new server maintains the same API:
- Same webhook endpoints
- Same WebSocket protocol
- Same order data structure

## Rollback Plan

If issues occur:

```bash
# Revert to old server
mv server-old.js server.js
npm start
```

## Testing Checklist

- [ ] Health endpoint works
- [ ] Incoming calls connect
- [ ] Audio streams correctly
- [ ] Orders are processed
- [ ] Orders are logged
- [ ] No memory leaks
- [ ] Error handling works
- [ ] Resource cleanup works

## Support

If you encounter issues:
1. Check server logs
2. Compare with old server behavior
3. Review error messages
4. Test individual components





